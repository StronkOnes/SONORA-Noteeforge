/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAudioContext } from './AudioDecoder.ts';
import { pitchToFrequency } from '../music/NoteEvent.ts';

export type SynthSound = 'epiano' | 'synth' | 'pluck' | 'bass';

interface ActiveVoice {
  oscillators: OscillatorNode[];
  gainNode: GainNode;
  filterNode?: BiquadFilterNode;
  stopTime: number;
}

export class MidiSynth {
  private sound: SynthSound = 'epiano';
  private masterGain: GainNode;
  private activeVoices = new Map<string, ActiveVoice>();

  constructor() {
    const ctx = getAudioContext();
    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.5, ctx.currentTime);
    this.masterGain.connect(ctx.destination);
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
   * Play a note immediately or at a specific audio context time
   */
  public triggerNote(
    pitch: number,
    velocity: number = 80,
    durationSeconds: number = 0.5,
    startTime?: number,
    voiceKey?: string
  ): void {
    const ctx = getAudioContext();
    const now = startTime !== undefined ? startTime : ctx.currentTime;
    const freq = pitchToFrequency(pitch);
    const velFraction = Math.max(0.1, Math.min(1.0, velocity / 127));

    const key = voiceKey || `${pitch}_${now}`;

    // Clean any prior voice on same key
    this.stopVoice(key);

    const voiceGain = ctx.createGain();
    voiceGain.connect(this.masterGain);

    const oscs: OscillatorNode[] = [];

    switch (this.sound) {
      case 'epiano': {
        // FM / dual sine + triangle with percussive bell decay
        const osc1 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 2, now); // 1st harmonic chime

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.25 * velFraction, now);
        osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(0.3, durationSeconds));

        const mainEnv = voiceGain.gain;
        mainEnv.setValueAtTime(0.001, now);
        mainEnv.linearRampToValueAtTime(0.6 * velFraction, now + 0.008);
        mainEnv.exponentialRampToValueAtTime(0.25 * velFraction, now + 0.2);
        mainEnv.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.05);

        osc1.connect(voiceGain);
        osc2.connect(osc2Gain);
        osc2Gain.connect(voiceGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durationSeconds + 0.1);
        osc2.stop(now + durationSeconds + 0.1);
        oscs.push(osc1, osc2);
        break;
      }

      case 'synth': {
        // Warm saw + sub with resonant low pass
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(freq / 2, now); // Sub octave

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(8000, freq * 4), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.5), now + durationSeconds);
        filter.Q.setValueAtTime(3.0, now);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.3, now);

        osc1.connect(filter);
        osc2.connect(subGain);
        subGain.connect(filter);
        filter.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.001, now);
        env.linearRampToValueAtTime(0.5 * velFraction, now + 0.02);
        env.setValueAtTime(0.4 * velFraction, now + durationSeconds * 0.8);
        env.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.08);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durationSeconds + 0.1);
        osc2.stop(now + durationSeconds + 0.1);
        oscs.push(osc1, osc2);
        break;
      }

      case 'pluck': {
        // Pluck string attack
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(10000, freq * 6), now);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.8, now + Math.min(0.4, durationSeconds));

        osc1.connect(filter);
        filter.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.001, now);
        env.linearRampToValueAtTime(0.7 * velFraction, now + 0.005);
        env.exponentialRampToValueAtTime(0.0001, now + Math.min(1.2, durationSeconds + 0.1));

        osc1.start(now);
        osc1.stop(now + durationSeconds + 0.15);
        oscs.push(osc1);
        break;
      }

      case 'bass': {
        // Deep sine + saturated triangle sub
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, now); // Upper harmonic for audibility

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.2, now);

        osc1.connect(voiceGain);
        osc2.connect(osc2Gain);
        osc2Gain.connect(voiceGain);

        const env = voiceGain.gain;
        env.setValueAtTime(0.001, now);
        env.linearRampToValueAtTime(0.8 * velFraction, now + 0.015);
        env.setValueAtTime(0.7 * velFraction, now + durationSeconds * 0.85);
        env.exponentialRampToValueAtTime(0.0001, now + durationSeconds + 0.06);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durationSeconds + 0.1);
        osc2.stop(now + durationSeconds + 0.1);
        oscs.push(osc1, osc2);
        break;
      }
    }

    this.activeVoices.set(key, {
      oscillators: oscs,
      gainNode: voiceGain,
      stopTime: now + durationSeconds + 0.15,
    });
  }

  public auditionChord(pitches: number[], durationSeconds: number = 0.8): void {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    pitches.forEach((pitch, idx) => {
      // Micro-strum offset: 12ms per note
      this.triggerNote(pitch, 85, durationSeconds, now + idx * 0.015, `chord_${pitch}_${idx}`);
    });
  }

  public stopVoice(key: string): void {
    const voice = this.activeVoices.get(key);
    if (voice) {
      const ctx = getAudioContext();
      voice.gainNode.gain.cancelScheduledValues(ctx.currentTime);
      voice.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      for (const osc of voice.oscillators) {
        try {
          osc.stop(ctx.currentTime + 0.01);
        } catch {
          // already stopped
        }
      }
      this.activeVoices.delete(key);
    }
  }

  public stopAll(): void {
    const ctx = getAudioContext();
    for (const [, voice] of this.activeVoices) {
      try {
        voice.gainNode.gain.cancelScheduledValues(ctx.currentTime);
        voice.gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
        for (const osc of voice.oscillators) {
          osc.stop(ctx.currentTime + 0.01);
        }
      } catch {
        // ignore
      }
    }
    this.activeVoices.clear();
  }
}

export const sharedMidiSynth = new MidiSynth();
