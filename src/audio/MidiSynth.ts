/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAudioContext } from './AudioDecoder.ts';
import { pitchToFrequency } from '../music/NoteEvent.ts';

export type SynthSound = 'epiano' | 'synth' | 'pluck' | 'bass';

interface ActiveVoice {
  oscillators: (OscillatorNode | AudioNode)[];
  gainNode: GainNode;
  stopVoice: () => void;
  stopTime: number;
}

/**
 * Creates a studio acoustic room impulse response for natural ambience
 */
function createStudioReverbBuffer(ctx: AudioContext, durationSec = 1.6, decay = 2.4): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-decay * t);
    // Filtered white noise with stereo decorrelation
    const noiseL = (Math.random() * 2 - 1) * env;
    const noiseR = (Math.random() * 2 - 1) * env;
    left[i] = noiseL;
    right[i] = noiseR;
  }
  return buffer;
}

export class MidiSynth {
  private sound: SynthSound = 'epiano';
  private masterGain: GainNode;
  private reverbNode: ConvolverNode | null = null;
  private reverbWetGain: GainNode;
  private reverbDryGain: GainNode;
  private activeVoices = new Map<string, ActiveVoice>();

  constructor() {
    const ctx = getAudioContext();
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, ctx.currentTime);

    // Studio Reverb Send & Return bus
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.setValueAtTime(0.18, ctx.currentTime); // 18% wet room send

    this.reverbDryGain = ctx.createGain();
    this.reverbDryGain.gain.setValueAtTime(0.9, ctx.currentTime);

    try {
      this.reverbNode = ctx.createConvolver();
      this.reverbNode.buffer = createStudioReverbBuffer(ctx, 1.4, 2.8);
      this.masterGain.connect(this.reverbDryGain);
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbWetGain);

      this.reverbDryGain.connect(ctx.destination);
      this.reverbWetGain.connect(ctx.destination);
    } catch {
      // Fallback direct connection
      this.masterGain.connect(ctx.destination);
    }
  }

  public setSound(sound: SynthSound) {
    this.sound = sound;
  }

  public setVolume(volume: number) {
    const ctx = getAudioContext();
    const clamped = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.02);
  }

  /**
   * Studio-grade physical & FM synthesis voice trigger
   */
  public triggerNote(
    pitch: number,
    velocity: number = 85,
    durationSeconds: number = 0.5,
    startTime?: number,
    voiceKey?: string
  ): void {
    const ctx = getAudioContext();
    const now = startTime !== undefined ? Math.max(ctx.currentTime, startTime) : ctx.currentTime;
    const freq = pitchToFrequency(pitch);
    const velFraction = Math.max(0.15, Math.min(1.0, velocity / 127));

    const key = voiceKey || `${pitch}_${now}`;
    this.stopVoice(key);

    const voiceGain = ctx.createGain();
    voiceGain.connect(this.masterGain);

    const nodesToStop: (OscillatorNode | AudioNode)[] = [];
    let stopFn = () => {};

    switch (this.sound) {
      case 'epiano': {
        // Studio Rhodes MK1:
        // Fundamental body (Triangle) + 2nd harmonic bell chime (Sine) + velocity tine hammer
        const bodyOsc = ctx.createOscillator();
        bodyOsc.type = 'triangle';
        bodyOsc.frequency.setValueAtTime(freq, now);

        const bellOsc = ctx.createOscillator();
        bellOsc.type = 'sine';
        bellOsc.frequency.setValueAtTime(freq * 2.002, now); // subtle beating

        const tineOsc = ctx.createOscillator();
        tineOsc.type = 'sine';
        tineOsc.frequency.setValueAtTime(freq * 3.998, now);

        const bellGain = ctx.createGain();
        bellGain.gain.setValueAtTime(0.35 * Math.pow(velFraction, 1.2), now);
        bellGain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(0.4, durationSeconds));

        const tineGain = ctx.createGain();
        tineGain.gain.setValueAtTime(0.25 * Math.pow(velFraction, 1.5), now);
        tineGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08); // sharp percussive tine bite

        // Warm lowpass filter to emulate magnetic pickup
        const pickupFilter = ctx.createBiquadFilter();
        pickupFilter.type = 'lowpass';
        const cutoff = Math.min(8500, freq * (3 + velFraction * 4));
        pickupFilter.frequency.setValueAtTime(cutoff, now);
        pickupFilter.frequency.exponentialRampToValueAtTime(freq * 2, now + durationSeconds);

        bodyOsc.connect(pickupFilter);
        bellOsc.connect(bellGain);
        bellGain.connect(pickupFilter);
        tineOsc.connect(tineGain);
        tineGain.connect(pickupFilter);
        pickupFilter.connect(voiceGain);

        // Natural Rhodes amplitude envelope: quick attack, initial decay, sustained ring, soft release
        const env = voiceGain.gain;
        env.setValueAtTime(0.0001, now);
        env.linearRampToValueAtTime(0.65 * velFraction, now + 0.006);
        env.exponentialRampToValueAtTime(0.35 * velFraction, now + 0.18);
        env.setValueAtTime(0.28 * velFraction, now + durationSeconds);
        env.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.12);

        bodyOsc.start(now);
        bellOsc.start(now);
        tineOsc.start(now);

        const stopAt = now + durationSeconds + 0.15;
        bodyOsc.stop(stopAt);
        bellOsc.stop(stopAt);
        tineOsc.stop(stopAt);

        nodesToStop.push(bodyOsc, bellOsc, tineOsc);
        stopFn = () => {
          try {
            bodyOsc.stop();
            bellOsc.stop();
            tineOsc.stop();
          } catch {}
        };
        break;
      }

      case 'synth': {
        // Lush Analog Poly Synth (Juno-106 style detuned saws + resonant low-pass):
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);
        osc1.detune.setValueAtTime(-6, now); // -6 cents

        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, now);
        osc2.detune.setValueAtTime(6, now); // +6 cents spread

        const subOsc = ctx.createOscillator();
        subOsc.type = 'square';
        subOsc.frequency.setValueAtTime(freq * 0.5, now); // Sub-octave body

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.22, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(4.0, now); // warm analog resonance
        const startCutoff = Math.min(11000, freq * (2 + velFraction * 5));
        filter.frequency.setValueAtTime(startCutoff, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.4), now + durationSeconds);

        osc1.connect(filter);
        osc2.connect(filter);
        subOsc.connect(subGain);
        subGain.connect(filter);
        filter.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.0001, now);
        env.linearRampToValueAtTime(0.48 * velFraction, now + 0.015);
        env.setValueAtTime(0.40 * velFraction, now + durationSeconds);
        env.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.12);

        osc1.start(now);
        osc2.start(now);
        subOsc.start(now);

        const stopAt = now + durationSeconds + 0.15;
        osc1.stop(stopAt);
        osc2.stop(stopAt);
        subOsc.stop(stopAt);

        nodesToStop.push(osc1, osc2, subOsc);
        stopFn = () => {
          try {
            osc1.stop();
            osc2.stop();
            subOsc.stop();
          } catch {}
        };
        break;
      }

      case 'pluck': {
        // Acoustic Plucked String (Multi-harmonic Karplus/additive string with dynamic dampening):
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.setValueAtTime(2.5, now);
        filter.frequency.setValueAtTime(Math.min(12000, freq * 8), now);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.9, now + Math.min(0.35, durationSeconds));

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.0001, now);
        env.linearRampToValueAtTime(0.7 * velFraction, now + 0.004); // crisp finger pluck transient
        env.exponentialRampToValueAtTime(0.0001, now + Math.min(1.8, durationSeconds + 0.15));

        osc1.start(now);
        osc2.start(now);

        const stopAt = now + durationSeconds + 0.18;
        osc1.stop(stopAt);
        osc2.stop(stopAt);

        nodesToStop.push(osc1, osc2);
        stopFn = () => {
          try {
            osc1.stop();
            osc2.stop();
          } catch {}
        };
        break;
      }

      case 'bass': {
        // Analog 808 Sub-Bass:
        // Deep sine with transient pitch punch (+12 semitones initial drop) and subtle tape saturation
        const osc = ctx.createOscillator();
        osc.type = 'sine';

        // Pitch punch on attack: drops rapidly into fundamental for classic punchy 808 transient
        osc.frequency.setValueAtTime(freq * 1.5, now);
        osc.frequency.exponentialRampToValueAtTime(freq, now + 0.025);

        const harmonicOsc = ctx.createOscillator();
        harmonicOsc.type = 'triangle';
        harmonicOsc.frequency.setValueAtTime(freq * 2, now); // 2nd harmonic for phone/laptop audibility

        const harmGain = ctx.createGain();
        harmGain.gain.setValueAtTime(0.18 * velFraction, now);

        // Gentle soft clipper / waveshaper for warm sub saturation
        const waveshaper = ctx.createWaveShaper();
        const curve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          const x = (i / 256) - 1;
          curve[i] = Math.tanh(x * 1.6); // smooth tube drive
        }
        waveshaper.curve = curve;

        osc.connect(waveshaper);
        harmonicOsc.connect(harmGain);
        harmGain.connect(waveshaper);
        waveshaper.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.0001, now);
        env.linearRampToValueAtTime(0.85 * velFraction, now + 0.012);
        env.setValueAtTime(0.75 * velFraction, now + durationSeconds * 0.85);
        env.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.08);

        osc.start(now);
        harmonicOsc.start(now);

        const stopAt = now + durationSeconds + 0.1;
        osc.stop(stopAt);
        harmonicOsc.stop(stopAt);

        nodesToStop.push(osc, harmonicOsc);
        stopFn = () => {
          try {
            osc.stop();
            harmonicOsc.stop();
          } catch {}
        };
        break;
      }
    }

    this.activeVoices.set(key, {
      oscillators: nodesToStop,
      gainNode: voiceGain,
      stopVoice: stopFn,
      stopTime: now + durationSeconds + 0.2,
    });
  }

  public auditionChord(pitches: number[], durationSeconds: number = 1.0): void {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // Play all chord notes simultaneously as a solid block chord ("on chord")
    pitches.forEach((pitch, idx) => {
      // Natural harmonic balance across voicing: firm bass, clear top note, warm inner voices
      let vel = 84;
      if (idx === 0) {
        vel = 88; // Bass root
      } else if (idx === pitches.length - 1) {
        vel = 86; // Soprano melody
      } else {
        vel = 78; // Inner voice
      }
      this.triggerNote(pitch, vel, durationSeconds, now, `chord_${pitch}_${idx}_${Date.now()}`);
    });
  }

  public stopVoice(key: string): void {
    const voice = this.activeVoices.get(key);
    if (voice) {
      const ctx = getAudioContext();
      voice.gainNode.gain.cancelScheduledValues(ctx.currentTime);
      voice.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      voice.stopVoice();
      this.activeVoices.delete(key);
    }
  }

  public stopAll(): void {
    const ctx = getAudioContext();
    for (const [, voice] of this.activeVoices) {
      try {
        voice.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        voice.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
        voice.stopVoice();
      } catch {}
    }
    this.activeVoices.clear();
  }
}

export const sharedMidiSynth = new MidiSynth();
