/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NOTE_NAMES, pitchToPitchClass } from '../music/NoteEvent.ts';
import { MusicalKey, ScaleMode } from '../music/Scale.ts';
import { NoteEvent } from '../music/NoteEvent.ts';

// Standard Krumhansl-Schmuckler cognitive key profiles (12 pitch classes)
const KRUMHANSL_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KRUMHANSL_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/**
 * Pearson correlation coefficient between two 12-element vectors
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

export interface KeyCandidate {
  rootPitchClass: number;
  rootName: string;
  mode: ScaleMode;
  correlation: number;
}

export function estimateKeyFromNotes(notes: NoteEvent[]): MusicalKey {
  // Duration-weighted pitch-class histogram
  const chroma = new Array<number>(12).fill(0);

  if (notes.length === 0) {
    return {
      rootPitchClass: 0,
      rootName: 'C',
      mode: 'major',
      confidence: 0.1,
      secondaryCandidates: [],
    };
  }

  for (const note of notes) {
    const pc = pitchToPitchClass(note.pitch);
    const weight = Math.max(0.05, note.durationSeconds) * (note.velocity / 100);
    chroma[pc] += weight;
  }

  return estimateKeyFromChroma(chroma);
}

export function estimateKeyFromChroma(chroma: number[]): MusicalKey {
  // Normalize chroma
  const maxChroma = Math.max(...chroma);
  const normalized = maxChroma > 0 ? chroma.map((v) => v / maxChroma) : chroma;

  const candidates: KeyCandidate[] = [];

  // Test 12 Major keys
  for (let root = 0; root < 12; root++) {
    // Rotate profile so root aligns with index 0
    const profile = new Array<number>(12);
    for (let i = 0; i < 12; i++) {
      profile[i] = KRUMHANSL_MAJOR[(i - root + 12) % 12];
    }
    const r = pearsonCorrelation(normalized, profile);
    candidates.push({
      rootPitchClass: root,
      rootName: NOTE_NAMES[root],
      mode: 'major',
      correlation: r,
    });
  }

  // Test 12 Minor keys
  for (let root = 0; root < 12; root++) {
    const profile = new Array<number>(12);
    for (let i = 0; i < 12; i++) {
      profile[i] = KRUMHANSL_MINOR[(i - root + 12) % 12];
    }
    const r = pearsonCorrelation(normalized, profile);
    candidates.push({
      rootPitchClass: root,
      rootName: NOTE_NAMES[root],
      mode: 'minor',
      correlation: r,
    });
  }

  // Sort candidates by correlation descending
  candidates.sort((a, b) => b.correlation - a.correlation);

  const best = candidates[0];
  const second = candidates[1];

  // Calculate confidence based on separation between #1 and #2
  const separation = best.correlation - (second ? second.correlation : 0);
  let confidence = Math.max(0.15, Math.min(0.98, best.correlation * 0.6 + separation * 1.5));

  // If top candidates are relative major/minor (e.g. C major and A minor)
  const isRelative =
    second &&
    ((best.mode === 'major' && second.mode === 'minor' && (best.rootPitchClass - second.rootPitchClass + 12) % 12 === 3) ||
      (best.mode === 'minor' && second.mode === 'major' && (second.rootPitchClass - best.rootPitchClass + 12) % 12 === 3));

  if (isRelative && separation < 0.08) {
    // Slight ambiguity between relative keys
    confidence *= 0.85;
  }

  const secondary = candidates.slice(1, 4).map((c) => ({
    rootName: c.rootName,
    mode: c.mode,
    score: Number(Math.max(0, c.correlation).toFixed(3)),
  }));

  return {
    rootPitchClass: best.rootPitchClass,
    rootName: best.rootName,
    mode: best.mode,
    confidence: Number(confidence.toFixed(2)),
    secondaryCandidates: secondary,
  };
}
