/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAudioContext } from './AudioDecoder.ts';
import { AnalysisMode, InstrumentProfile } from '../music/MusicalProject.ts';

export interface DemoSampleItem {
  id: string;
  title: string;
  category: string;
  recommendedMode: AnalysisMode;
  recommendedProfile: InstrumentProfile;
  bpm: number;
  durationSeconds: number;
  keyHint: string;
  description: string;
  generateBuffer: () => AudioBuffer;
}

/**
 * Procedurally generates authentic audio buffers with rich harmonic timbre
 */
function createSyntheticAudio(
  sampleRate: number,
  duration: number,
  notes: Array<{ start: number; dur: number; freq: number; type: 'sine' | 'saw' | 'triangle' | 'vocal'; vel?: number }>
): AudioBuffer {
  const ctx = getAudioContext();
  const totalSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (const n of notes) {
    const startSample = Math.floor(n.start * sampleRate);
    const endSample = Math.min(totalSamples, Math.floor((n.start + n.dur) * sampleRate));
    const vel = n.vel ?? 0.7;

    for (let i = startSample; i < endSample; i++) {
      const t = (i - startSample) / sampleRate;
      const noteProgress = t / n.dur;

      // ADSR envelope
      let env = 0;
      const attack = 0.02;
      const release = 0.08;
      if (t < attack) {
        env = t / attack;
      } else if (noteProgress > (1 - release / n.dur)) {
        env = (1 - noteProgress) / (release / n.dur);
      } else {
        env = 0.85;
      }
      env = Math.max(0, env) * vel;

      // Vibrato / slight pitch fluctuation
      const vibrato = n.type === 'vocal' ? 1 + 0.015 * Math.sin(2 * Math.PI * 5.5 * t) : 1;
      const freq = n.freq * vibrato;

      let sample = 0;
      if (n.type === 'vocal') {
        // Formant-filtered voice approximation (fundamental + formants F1 ~ 700Hz, F2 ~ 1200Hz, F3 ~ 2600Hz)
        sample = Math.sin(2 * Math.PI * freq * t) * 0.5 +
                 Math.sin(2 * Math.PI * freq * 2 * t) * 0.3 +
                 Math.sin(2 * Math.PI * freq * 3 * t) * 0.15 +
                 Math.sin(2 * Math.PI * freq * 4 * t) * 0.05;
      } else if (n.type === 'saw') {
        // Bandlimited-ish saw
        for (let h = 1; h <= 8; h++) {
          sample += (Math.sin(2 * Math.PI * freq * h * t) / h) * 0.4;
        }
      } else if (n.type === 'triangle') {
        sample = Math.sin(2 * Math.PI * freq * t) * 0.6 +
                 Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
      } else {
        // sine
        sample = Math.sin(2 * Math.PI * freq * t) * 0.8;
      }

      const val = sample * env * 0.35;
      left[i] += val;
      // Slight stereo spread
      right[i] += val * (1 + 0.05 * Math.sin(2 * Math.PI * 2 * t));
    }
  }

  // Soft peak normalize
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (peak > 0.85) {
    const scale = 0.85 / peak;
    for (let i = 0; i < totalSamples; i++) {
      left[i] *= scale;
      right[i] *= scale;
    }
  }

  return buffer;
}

export const DEMO_SAMPLES: DemoSampleItem[] = [
  {
    id: 'demo_soul_piano',
    title: 'Soul Rhodes Progression',
    category: 'Harmony / Chords',
    recommendedMode: 'chords',
    recommendedProfile: 'piano',
    bpm: 90,
    durationSeconds: 4.8,
    keyHint: 'C Major / A Minor',
    description: 'Lush neo-soul chords: Dm9 -> G13 -> Cmaj9 -> A7alt.',
    generateBuffer: () => {
      const sr = 44100;
      // Dm9: D3 (146.8), F3 (174.6), A3 (220), C4 (261.6), E4 (329.6)
      // G13: G2 (98), F3 (174.6), B3 (246.9), E4 (329.6)
      // Cmaj9: C3 (130.8), E3 (164.8), G3 (196), B3 (246.9), D4 (293.6)
      // A7alt: A2 (110), G3 (196), C#4 (277.2), F4 (349.2)
      const notes = [
        // Chord 1 (Dm9) @ 0.0s
        { start: 0.0, dur: 1.1, freq: 146.83, type: 'triangle' as const, vel: 0.8 },
        { start: 0.0, dur: 1.1, freq: 174.61, type: 'triangle' as const, vel: 0.7 },
        { start: 0.0, dur: 1.1, freq: 220.00, type: 'triangle' as const, vel: 0.75 },
        { start: 0.0, dur: 1.1, freq: 261.63, type: 'triangle' as const, vel: 0.7 },
        { start: 0.0, dur: 1.1, freq: 329.63, type: 'triangle' as const, vel: 0.65 },

        // Chord 2 (G13) @ 1.2s
        { start: 1.2, dur: 1.1, freq: 98.00, type: 'triangle' as const, vel: 0.85 },
        { start: 1.2, dur: 1.1, freq: 174.61, type: 'triangle' as const, vel: 0.7 },
        { start: 1.2, dur: 1.1, freq: 246.94, type: 'triangle' as const, vel: 0.7 },
        { start: 1.2, dur: 1.1, freq: 329.63, type: 'triangle' as const, vel: 0.65 },

        // Chord 3 (Cmaj9) @ 2.4s
        { start: 2.4, dur: 1.1, freq: 130.81, type: 'triangle' as const, vel: 0.8 },
        { start: 2.4, dur: 1.1, freq: 164.81, type: 'triangle' as const, vel: 0.7 },
        { start: 2.4, dur: 1.1, freq: 196.00, type: 'triangle' as const, vel: 0.75 },
        { start: 2.4, dur: 1.1, freq: 246.94, type: 'triangle' as const, vel: 0.7 },
        { start: 2.4, dur: 1.1, freq: 293.66, type: 'triangle' as const, vel: 0.65 },

        // Chord 4 (A7alt) @ 3.6s
        { start: 3.6, dur: 1.1, freq: 110.00, type: 'triangle' as const, vel: 0.8 },
        { start: 3.6, dur: 1.1, freq: 196.00, type: 'triangle' as const, vel: 0.7 },
        { start: 3.6, dur: 1.1, freq: 277.18, type: 'triangle' as const, vel: 0.75 },
        { start: 3.6, dur: 1.1, freq: 349.23, type: 'triangle' as const, vel: 0.65 },
      ];
      return createSyntheticAudio(sr, 4.8, notes);
    },
  },
  {
    id: 'demo_vocal_lead',
    title: 'Vocal Hook Melody',
    category: 'Vocal',
    recommendedMode: 'vocal',
    recommendedProfile: 'other',
    bpm: 110,
    durationSeconds: 4.2,
    keyHint: 'A Minor',
    description: 'Expressive sung vocal line with pitch vibrato and melodic phrasing in A Minor.',
    generateBuffer: () => {
      const sr = 44100;
      // Notes in A minor: A4 (440), C5 (523.25), D5 (587.33), E5 (659.25), C5, A4
      const notes = [
        { start: 0.1, dur: 0.45, freq: 440.0, type: 'vocal' as const, vel: 0.8 },
        { start: 0.6, dur: 0.45, freq: 523.25, type: 'vocal' as const, vel: 0.85 },
        { start: 1.1, dur: 0.6, freq: 587.33, type: 'vocal' as const, vel: 0.9 },
        { start: 1.75, dur: 0.85, freq: 659.25, type: 'vocal' as const, vel: 0.95 },
        { start: 2.7, dur: 0.5, freq: 523.25, type: 'vocal' as const, vel: 0.8 },
        { start: 3.25, dur: 0.85, freq: 440.0, type: 'vocal' as const, vel: 0.85 },
      ];
      return createSyntheticAudio(sr, 4.2, notes);
    },
  },
  {
    id: 'demo_808_bass',
    title: 'Trap 808 Sub-Bass',
    category: 'Bass',
    recommendedMode: 'melody',
    recommendedProfile: 'bass',
    bpm: 140,
    durationSeconds: 3.6,
    keyHint: 'F Minor',
    description: 'Heavy sub-bass riff in F Minor (F1, G#1, D#1, C#1) with low-end fundamentals.',
    generateBuffer: () => {
      const sr = 44100;
      // F1 = 43.65Hz, G#1 = 51.91Hz, D#1 = 38.89Hz, C#1 = 34.65Hz
      const notes = [
        { start: 0.05, dur: 0.8, freq: 43.65, type: 'sine' as const, vel: 0.95 },
        { start: 0.9, dur: 0.75, freq: 51.91, type: 'sine' as const, vel: 0.9 },
        { start: 1.75, dur: 0.8, freq: 38.89, type: 'sine' as const, vel: 0.92 },
        { start: 2.6, dur: 0.9, freq: 34.65, type: 'sine' as const, vel: 0.95 },
      ];
      return createSyntheticAudio(sr, 3.6, notes);
    },
  },
  {
    id: 'demo_synth_lead',
    title: 'Synthwave Pluck Lead',
    category: 'Lead / Synth',
    recommendedMode: 'melody',
    recommendedProfile: 'synth',
    bpm: 124,
    durationSeconds: 3.8,
    keyHint: 'D Minor',
    description: 'Punchy 16th-note arpeggiated melodic hook with sharp onsets in D Minor.',
    generateBuffer: () => {
      const sr = 44100;
      // D4 (293.66), F4 (349.23), A4 (440.0), C5 (523.25), D5 (587.33)
      const notes = [
        { start: 0.0, dur: 0.22, freq: 293.66, type: 'saw' as const, vel: 0.85 },
        { start: 0.25, dur: 0.22, freq: 349.23, type: 'saw' as const, vel: 0.8 },
        { start: 0.5, dur: 0.22, freq: 440.00, type: 'saw' as const, vel: 0.9 },
        { start: 0.75, dur: 0.45, freq: 523.25, type: 'saw' as const, vel: 0.95 },

        { start: 1.25, dur: 0.22, freq: 587.33, type: 'saw' as const, vel: 0.85 },
        { start: 1.5, dur: 0.22, freq: 523.25, type: 'saw' as const, vel: 0.8 },
        { start: 1.75, dur: 0.22, freq: 440.00, type: 'saw' as const, vel: 0.85 },
        { start: 2.0, dur: 0.65, freq: 349.23, type: 'saw' as const, vel: 0.9 },

        { start: 2.75, dur: 0.22, freq: 440.00, type: 'saw' as const, vel: 0.8 },
        { start: 3.0, dur: 0.7, freq: 293.66, type: 'saw' as const, vel: 0.9 },
      ];
      return createSyntheticAudio(sr, 3.8, notes);
    },
  },
];
