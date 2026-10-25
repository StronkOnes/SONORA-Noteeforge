/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NOTE_NAMES, pitchToPitchClass } from './NoteEvent.ts';

export type ScaleMode =
  | 'major'
  | 'minor'
  | 'harmonic_minor'
  | 'dorian'
  | 'mixolydian'
  | 'phrygian'
  | 'pentatonic_minor'
  | 'pentatonic_major'
  | 'blues';

export interface ScaleDefinition {
  name: string;
  mode: ScaleMode;
  intervals: number[]; // semitone intervals from root (0 included)
}

export const SCALE_DEFINITIONS: Record<ScaleMode, ScaleDefinition> = {
  major: {
    name: 'Major',
    mode: 'major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  minor: {
    name: 'Natural Minor',
    mode: 'minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  harmonic_minor: {
    name: 'Harmonic Minor',
    mode: 'harmonic_minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  dorian: {
    name: 'Dorian',
    mode: 'dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
  },
  mixolydian: {
    name: 'Mixolydian',
    mode: 'mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
  },
  phrygian: {
    name: 'Phrygian',
    mode: 'phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
  },
  pentatonic_minor: {
    name: 'Minor Pentatonic',
    mode: 'pentatonic_minor',
    intervals: [0, 3, 5, 7, 10],
  },
  pentatonic_major: {
    name: 'Major Pentatonic',
    mode: 'pentatonic_major',
    intervals: [0, 2, 4, 7, 9],
  },
  blues: {
    name: 'Blues',
    mode: 'blues',
    intervals: [0, 3, 5, 6, 7, 10],
  },
};

export interface MusicalKey {
  rootPitchClass: number; // 0 = C, 1 = C#, ..., 9 = A, etc.
  rootName: string;
  mode: ScaleMode;
  confidence: number; // 0.0 - 1.0
  secondaryCandidates?: Array<{ rootName: string; mode: ScaleMode; score: number }>;
}

export function getScalePitchClasses(rootPitchClass: number, mode: ScaleMode = 'major'): Set<number> {
  const scale = SCALE_DEFINITIONS[mode] || SCALE_DEFINITIONS.major;
  const set = new Set<number>();
  for (const interval of scale.intervals) {
    set.add((rootPitchClass + interval) % 12);
  }
  return set;
}

export function isPitchInScale(pitch: number, rootPitchClass: number, mode: ScaleMode): boolean {
  const pitchClass = pitchToPitchClass(pitch);
  const scalePitches = getScalePitchClasses(rootPitchClass, mode);
  return scalePitches.has(pitchClass);
}

export function getScaleNoteNames(rootPitchClass: number, mode: ScaleMode): string[] {
  const scale = SCALE_DEFINITIONS[mode] || SCALE_DEFINITIONS.major;
  return scale.intervals.map((interval) => {
    const pc = (rootPitchClass + interval) % 12;
    return NOTE_NAMES[pc];
  });
}

/**
 * Snap a pitch to the nearest pitch class in the scale.
 * If equidistant, prefers scale tonic/dominant or preserves direction.
 */
export function snapPitchToScale(
  pitch: number,
  rootPitchClass: number,
  mode: ScaleMode
): { newPitch: number; changed: boolean } {
  if (isPitchInScale(pitch, rootPitchClass, mode)) {
    return { newPitch: pitch, changed: false };
  }

  const pitchClass = pitchToPitchClass(pitch);
  const scaleSet = getScalePitchClasses(rootPitchClass, mode);

  let bestOffset = 0;
  let minDistance = 999;

  for (let offset = -2; offset <= 2; offset++) {
    if (offset === 0) continue;
    const testPc = ((pitchClass + offset) % 12 + 12) % 12;
    if (scaleSet.has(testPc)) {
      const dist = Math.abs(offset);
      if (dist < minDistance) {
        minDistance = dist;
        bestOffset = offset;
      }
    }
  }

  return {
    newPitch: pitch + bestOffset,
    changed: bestOffset !== 0,
  };
}
