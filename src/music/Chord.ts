/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NOTE_NAMES, pitchToPitchClass } from './NoteEvent.ts';

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | '7'
  | 'maj7'
  | 'min7'
  | 'sus2'
  | 'sus4'
  | 'add9'
  | 'dim7'
  | 'm7b5';

export interface ChordTemplate {
  quality: ChordQuality;
  symbol: string;
  fullName: string;
  intervals: number[]; // semitones from root
  weight: number;
}

export const CHORD_TEMPLATES: ChordTemplate[] = [
  { quality: 'maj', symbol: '', fullName: 'Major', intervals: [0, 4, 7], weight: 1.0 },
  { quality: 'min', symbol: 'm', fullName: 'Minor', intervals: [0, 3, 7], weight: 1.0 },
  { quality: '7', symbol: '7', fullName: 'Dominant 7th', intervals: [0, 4, 7, 10], weight: 0.9 },
  { quality: 'maj7', symbol: 'maj7', fullName: 'Major 7th', intervals: [0, 4, 7, 11], weight: 0.9 },
  { quality: 'min7', symbol: 'm7', fullName: 'Minor 7th', intervals: [0, 3, 7, 10], weight: 0.9 },
  { quality: 'sus4', symbol: 'sus4', fullName: 'Suspended 4th', intervals: [0, 5, 7], weight: 0.8 },
  { quality: 'sus2', symbol: 'sus2', fullName: 'Suspended 2nd', intervals: [0, 2, 7], weight: 0.8 },
  { quality: 'dim', symbol: 'dim', fullName: 'Diminished', intervals: [0, 3, 6], weight: 0.7 },
  { quality: 'aug', symbol: 'aug', fullName: 'Augmented', intervals: [0, 4, 8], weight: 0.7 },
  { quality: 'add9', symbol: 'add9', fullName: 'Add 9', intervals: [0, 4, 7, 14 % 12], weight: 0.75 },
  { quality: 'm7b5', symbol: 'm7b5', fullName: 'Half-Diminished', intervals: [0, 3, 6, 10], weight: 0.7 },
];

export interface ChordEvent {
  id: string;
  rootPitchClass: number; // 0-11
  quality: ChordQuality;
  label: string; // e.g. "Am7", "C", "G/B"
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  chordTones: number[]; // Pitch classes in chord
  bassPitchClass?: number;
  alternativeLabels?: string[];
}

export function buildChordLabel(rootPc: number, quality: ChordQuality, bassPc?: number): string {
  const rootName = NOTE_NAMES[rootPc];
  const template = CHORD_TEMPLATES.find((t) => t.quality === quality);
  const symbol = template ? template.symbol : quality;
  let label = `${rootName}${symbol}`;
  if (bassPc !== undefined && bassPc !== rootPc) {
    label += `/${NOTE_NAMES[bassPc]}`;
  }
  return label;
}

export function getChordPitchClasses(rootPc: number, quality: ChordQuality): number[] {
  const template = CHORD_TEMPLATES.find((t) => t.quality === quality) || CHORD_TEMPLATES[0];
  return template.intervals.map((i) => (rootPc + i) % 12);
}

/**
 * Generate MIDI pitch numbers for a chord around octave 3-4 suitable for auditioning
 */
export function getChordAuditionNotes(rootPc: number, quality: ChordQuality, bassPc?: number): number[] {
  const template = CHORD_TEMPLATES.find((t) => t.quality === quality) || CHORD_TEMPLATES[0];
  // Base octave around MIDI 48 (C3) - 60 (C4)
  const baseMidi = 48 + rootPc;
  const notes = template.intervals.map((i) => baseMidi + i);
  if (bassPc !== undefined && bassPc !== rootPc) {
    // Add low bass note in octave 2 (MIDI 36-47)
    const bassMidi = 36 + bassPc;
    return [bassMidi, ...notes];
  }
  return notes;
}
