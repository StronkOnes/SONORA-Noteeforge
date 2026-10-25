/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PitchBendEvent {
  /** Offset in seconds from note start */
  timeOffset: number;
  /** Bend in cents (-200 to +200 cents typically, or normalized -8192 to 8191) */
  bendCents: number;
}

export interface NoteEvent {
  id: string;
  pitch: number; // MIDI pitch number (e.g. 60 = C4, 69 = A4)
  startSeconds: number;
  durationSeconds: number;
  velocity: number; // 1 - 127
  confidence?: number; // 0.0 - 1.0
  source: 'transcription' | 'user';
  pitchBends?: PitchBendEvent[];
  selected?: boolean;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function pitchToNoteName(pitch: number): string {
  const noteIndex = ((pitch % 12) + 12) % 12;
  const octave = Math.floor(pitch / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

export function pitchToPitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function frequencyToPitch(freq: number): number {
  if (freq <= 0) return 0;
  // A4 = 440Hz = MIDI 69
  return 69 + 12 * Math.log2(freq / 440);
}

export function pitchToFrequency(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  return `${mins}:${secs.padStart(5, '0')}`;
}
