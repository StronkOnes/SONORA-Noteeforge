/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NOTE_NAMES, NoteEvent } from './NoteEvent.ts';

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

export type ChordInversion = 'root' | 'first' | 'second' | 'third' | 'slash';
export type ChordDetectionMode = 'strict' | 'loose';

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
  { quality: 'dim7', symbol: 'dim7', fullName: 'Diminished 7th', intervals: [0, 3, 6, 9], weight: 0.65 },
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
  inversion?: ChordInversion;
  voicingNotes?: number[]; // Actual voiced MIDI pitch numbers
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

export interface VoicingOptions {
  baseOctave?: number; // Default 3 (MIDI 48-59)
  bassOctave?: number; // Default 2 (MIDI 36-47)
  targetRegister?: number; // Average MIDI pitch of source audio (e.g. 60)
  spread?: 'closed' | 'open';
}

/**
 * Builds musical, production-grade chord voicings:
 * - Keeps the true bass note strictly as the lowest note in octave 2 (MIDI 36-47)
 * - Orders notes by pitch ascending
 * - Prevents muddy low-register clashes (no minor seconds or tight clusters below MIDI 55)
 * - Assigns role-based musical velocities (grounded bass, singing top melody, gentle inner harmony)
 * - Honors inversions (root, 1st, 2nd, 3rd, slash)
 */
export function buildProChordVoicing(
  rootPc: number,
  quality: ChordQuality,
  bassPc?: number,
  inversion: ChordInversion = 'root',
  options?: VoicingOptions
): number[] {
  const template = CHORD_TEMPLATES.find((t) => t.quality === quality) || CHORD_TEMPLATES[0];
  const intervals = template.intervals;

  const effectiveBassPc = bassPc !== undefined ? bassPc : rootPc;
  const bassOctave = options?.bassOctave ?? 2;
  // Bass pitch in octave 2: MIDI 36 + bassPc
  let bassPitch = bassOctave * 12 + 12 + effectiveBassPc;
  if (bassPitch < 36) bassPitch += 12;
  if (bassPitch > 47) bassPitch -= 12;

  // Upper voices: anchor around targetRegister or octave 3-4 (MIDI 52 - 76)
  const baseMidOctave = options?.baseOctave ?? 3; // e.g. Octave 3 (MIDI 48)
  const baseAnchor = baseMidOctave * 12 + 12; // 48

  const upperPitches: number[] = [];

  // Generate pitches for chord tones
  intervals.forEach((interval) => {
    const pc = (rootPc + interval) % 12;
    // For 1st inversion (3rd in bass), don't double the 3rd closely in the mid register if avoidable
    if (inversion === 'first' && pc === effectiveBassPc && intervals.length > 3) {
      return;
    }

    // Place pitch between MIDI 52 and 72
    let p = baseAnchor + pc;
    while (p < 52) p += 12;
    while (p > 76) p -= 12;

    upperPitches.push(p);
  });

  // Ensure unique pitches and sort ascending
  const uniqueUpper = Array.from(new Set(upperPitches)).sort((a, b) => a - b);

  // If upper register is too clustered or narrow, open the top note by an octave
  if (options?.spread === 'open' && uniqueUpper.length >= 3) {
    uniqueUpper[uniqueUpper.length - 1] += 12;
    uniqueUpper.sort((a, b) => a - b);
  }

  // Assemble full voicing: bass note strictly below all upper voices
  const finalPitches = [bassPitch];
  for (const p of uniqueUpper) {
    if (p > bassPitch + 4) {
      finalPitches.push(p);
    } else {
      finalPitches.push(p + 12);
    }
  }

  return Array.from(new Set(finalPitches)).sort((a, b) => a - b);
}

/**
 * Generate MIDI pitch numbers for auditioning
 */
export function getChordAuditionNotes(
  rootPc: number,
  quality: ChordQuality,
  bassPc?: number,
  inversion?: ChordInversion
): number[] {
  return buildProChordVoicing(rootPc, quality, bassPc, inversion ?? (bassPc !== undefined && bassPc !== rootPc ? 'slash' : 'root'));
}

/**
 * Converts a ChordEvent into humanized, voiced NoteEvent[] ready for Piano Roll insertion or MIDI export.
 */
export function chordEventToNoteEvents(
  chord: ChordEvent,
  options?: VoicingOptions & { defaultVelocity?: number }
): NoteEvent[] {
  const pitches =
    chord.voicingNotes && chord.voicingNotes.length > 0
      ? chord.voicingNotes
      : buildProChordVoicing(
          chord.rootPitchClass,
          chord.quality,
          chord.bassPitchClass,
          chord.inversion ?? 'root',
          options
        );

  const duration = Math.max(0.18, chord.endSeconds - chord.startSeconds);
  const baseVel = options?.defaultVelocity ?? 84;

  return pitches.map((pitch, idx) => {
    // Role-based musical velocity distribution:
    // Bass note: firm foundation
    // Top melody note: singing tone
    // Inner voices: slightly softer for rich acoustic blend
    let velocity = baseVel;
    if (idx === 0) {
      velocity = Math.min(115, baseVel + 8); // Bass note
    } else if (idx === pitches.length - 1) {
      velocity = Math.min(112, baseVel + 5); // Top voice / soprano
    } else {
      velocity = Math.max(55, baseVel - 6); // Inner harmony
    }

    // Micro-humanization (±2 velocity)
    velocity = Math.max(40, Math.min(127, velocity + ((idx % 3) - 1) * 2));

    return {
      id: `chord_note_${chord.id}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
      pitch,
      startSeconds: Number(chord.startSeconds.toFixed(3)),
      durationSeconds: Number(Math.max(0.1, duration - 0.02).toFixed(3)), // Natural 20ms legato breath
      velocity,
      confidence: chord.confidence,
      source: 'user',
    };
  });
}
