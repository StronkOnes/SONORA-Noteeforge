/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent, pitchToPitchClass } from '../music/NoteEvent.ts';
import {
  ChordEvent,
  ChordQuality,
  CHORD_TEMPLATES,
  buildChordLabel,
  getChordPitchClasses,
} from '../music/Chord.ts';

interface SliceChroma {
  startSeconds: number;
  endSeconds: number;
  chroma: number[]; // 12 pitch classes
  bassPitchClass?: number;
}

/**
 * Recognizes chords across time slices based on simultaneous notes and harmonic evidence.
 */
export function estimateChordsFromNotes(
  notes: NoteEvent[],
  totalDuration: number,
  sliceDuration: number = 0.5
): ChordEvent[] {
  if (notes.length === 0 || totalDuration <= 0) {
    return [];
  }

  // 1. Create uniform time slices
  const numSlices = Math.max(1, Math.ceil(totalDuration / sliceDuration));
  const slices: SliceChroma[] = [];

  for (let s = 0; s < numSlices; s++) {
    const tStart = s * sliceDuration;
    const tEnd = Math.min(totalDuration, (s + 1) * sliceDuration);
    const chroma = new Array<number>(12).fill(0);
    let minPitch = 999;
    let lowestPc: number | undefined;

    // Find all notes sounding in this slice
    for (const note of notes) {
      const noteEnd = note.startSeconds + note.durationSeconds;
      if (note.startSeconds < tEnd && noteEnd > tStart) {
        const overlapStart = Math.max(tStart, note.startSeconds);
        const overlapEnd = Math.min(tEnd, noteEnd);
        const weight = (overlapEnd - overlapStart) * (note.velocity / 100);
        const pc = pitchToPitchClass(note.pitch);
        chroma[pc] += weight;

        if (note.pitch < minPitch) {
          minPitch = note.pitch;
          lowestPc = pc;
        }
      }
    }

    slices.push({
      startSeconds: tStart,
      endSeconds: tEnd,
      chroma,
      bassPitchClass: lowestPc,
    });
  }

  // 2. Identify best chord candidate for each slice
  const rawChords: Array<{
    start: number;
    end: number;
    rootPc: number;
    quality: ChordQuality;
    bassPc?: number;
    score: number;
    alternatives: string[];
  }> = [];

  for (const slice of slices) {
    const chromaTotal = slice.chroma.reduce((a, b) => a + b, 0);
    if (chromaTotal < 0.05) {
      // Silence or no notes
      continue;
    }

    // Match chroma with chord templates
    let bestScore = -1;
    let bestRoot = 0;
    let bestQuality: ChordQuality = 'maj';
    const candidateList: Array<{ label: string; score: number }> = [];

    for (let root = 0; root < 12; root++) {
      for (const tpl of CHORD_TEMPLATES) {
        let matchWeight = 0;
        let penaltyWeight = 0;
        const chordPcs = new Set(tpl.intervals.map((i) => (root + i) % 12));

        for (let pc = 0; pc < 12; pc++) {
          if (chordPcs.has(pc)) {
            matchWeight += slice.chroma[pc];
          } else {
            penaltyWeight += slice.chroma[pc] * 0.4;
          }
        }

        // Give slight boost if bass matches root or chord tone
        let bassBoost = 1.0;
        if (slice.bassPitchClass !== undefined) {
          if (slice.bassPitchClass === root) {
            bassBoost = 1.2;
          } else if (chordPcs.has(slice.bassPitchClass)) {
            bassBoost = 1.05;
          }
        }

        const score = ((matchWeight - penaltyWeight) / (chordPcs.size * 0.6)) * tpl.weight * bassBoost;
        if (score > 0) {
          const label = buildChordLabel(root, tpl.quality, slice.bassPitchClass);
          candidateList.push({ label, score });
        }

        if (score > bestScore) {
          bestScore = score;
          bestRoot = root;
          bestQuality = tpl.quality;
        }
      }
    }

    if (bestScore > 0.1) {
      candidateList.sort((a, b) => b.score - a.score);
      const alts = candidateList.slice(1, 4).map((c) => c.label);
      rawChords.push({
        start: slice.startSeconds,
        end: slice.endSeconds,
        rootPc: bestRoot,
        quality: bestQuality,
        bassPc: slice.bassPitchClass,
        score: Math.min(0.98, bestScore),
        alternatives: alts,
      });
    }
  }

  // 3. Merge contiguous slices that have the same chord
  const merged: ChordEvent[] = [];
  let currentGroup: (typeof rawChords)[0] | null = null;

  for (const c of rawChords) {
    if (
      currentGroup &&
      currentGroup.rootPc === c.rootPc &&
      currentGroup.quality === c.quality &&
      Math.abs(currentGroup.end - c.start) < 0.05
    ) {
      // Extend end time
      currentGroup.end = c.end;
      currentGroup.score = Math.max(currentGroup.score, c.score);
    } else {
      if (currentGroup) {
        const tones = getChordPitchClasses(currentGroup.rootPc, currentGroup.quality);
        merged.push({
          id: `chord_${Date.now()}_${merged.length}`,
          rootPitchClass: currentGroup.rootPc,
          quality: currentGroup.quality,
          label: buildChordLabel(currentGroup.rootPc, currentGroup.quality, currentGroup.bassPc),
          startSeconds: Number(currentGroup.start.toFixed(2)),
          endSeconds: Number(currentGroup.end.toFixed(2)),
          confidence: Number(currentGroup.score.toFixed(2)),
          chordTones: tones,
          bassPitchClass: currentGroup.bassPc,
          alternativeLabels: currentGroup.alternatives,
        });
      }
      currentGroup = { ...c };
    }
  }

  if (currentGroup) {
    const tones = getChordPitchClasses(currentGroup.rootPc, currentGroup.quality);
    merged.push({
      id: `chord_${Date.now()}_${merged.length}`,
      rootPitchClass: currentGroup.rootPc,
      quality: currentGroup.quality,
      label: buildChordLabel(currentGroup.rootPc, currentGroup.quality, currentGroup.bassPc),
      startSeconds: Number(currentGroup.start.toFixed(2)),
      endSeconds: Number(currentGroup.end.toFixed(2)),
      confidence: Number(currentGroup.score.toFixed(2)),
      chordTones: tones,
      bassPitchClass: currentGroup.bassPc,
      alternativeLabels: currentGroup.alternatives,
    });
  }

  return merged;
}
