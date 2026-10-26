/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent, pitchToPitchClass, NOTE_NAMES } from '../music/NoteEvent.ts';
import {
  ChordEvent,
  ChordQuality,
  ChordInversion,
  ChordDetectionMode,
  CHORD_TEMPLATES,
  buildChordLabel,
  getChordPitchClasses,
  buildProChordVoicing,
} from '../music/Chord.ts';
import { MusicalKey } from '../music/Scale.ts';

export interface ChordEstimationOptions {
  mode?: ChordDetectionMode; // 'strict' | 'loose' (default: 'strict')
  minEventDuration?: number; // Minimum duration for a chord slice in seconds (default: 0.20s)
  targetRegister?: number; // Average pitch of region (e.g. 60)
}

interface HarmonicWindow {
  startSeconds: number;
  endSeconds: number;
  chroma: number[]; // 12 pitch classes
  bassPitchClass?: number;
  bassPitch?: number;
  bassCertainty: number; // 0.0 to 1.0
  activeNoteCount: number;
}

/**
 * Returns diatonic chord qualities for a given scale degree (0-11 semitones from key root)
 */
function getDiatonicExpectation(
  rootPc: number,
  key: MusicalKey
): { isDiatonic: boolean; preferredQualities: ChordQuality[]; isDominantCandidate: boolean } {
  const degree = (rootPc - key.rootPitchClass + 12) % 12;

  if (key.mode === 'major') {
    switch (degree) {
      case 0: // I
        return { isDiatonic: true, preferredQualities: ['maj', 'maj7'], isDominantCandidate: false };
      case 2: // ii
        return { isDiatonic: true, preferredQualities: ['min', 'min7'], isDominantCandidate: false };
      case 4: // iii
        return { isDiatonic: true, preferredQualities: ['min', 'min7'], isDominantCandidate: false };
      case 5: // IV
        return { isDiatonic: true, preferredQualities: ['maj', 'maj7'], isDominantCandidate: false };
      case 7: // V
        return { isDiatonic: true, preferredQualities: ['maj', '7'], isDominantCandidate: true };
      case 9: // vi
        return { isDiatonic: true, preferredQualities: ['min', 'min7'], isDominantCandidate: false };
      case 11: // vii°
        return { isDiatonic: true, preferredQualities: ['dim', 'm7b5'], isDominantCandidate: false };
      // Secondary dominants (e.g. V/V = II7, V/vi = VI7, V/ii = VI7)
      case 1:
      case 3:
      case 6:
      case 8:
      case 10:
        return { isDiatonic: false, preferredQualities: ['maj', '7'], isDominantCandidate: true };
    }
  } else {
    // Minor key (Natural / Harmonic)
    switch (degree) {
      case 0: // i
        return { isDiatonic: true, preferredQualities: ['min', 'min7'], isDominantCandidate: false };
      case 2: // ii°
        return { isDiatonic: true, preferredQualities: ['dim', 'm7b5'], isDominantCandidate: false };
      case 3: // III (relative major)
        return { isDiatonic: true, preferredQualities: ['maj', 'maj7'], isDominantCandidate: false };
      case 5: // iv
        return { isDiatonic: true, preferredQualities: ['min', 'min7'], isDominantCandidate: false };
      case 7: // v / V
        return { isDiatonic: true, preferredQualities: ['min', 'min7', 'maj', '7'], isDominantCandidate: true };
      case 8: // VI
        return { isDiatonic: true, preferredQualities: ['maj', 'maj7'], isDominantCandidate: false };
      case 10: // VII (Subtonic)
        return { isDiatonic: true, preferredQualities: ['maj', '7'], isDominantCandidate: true };
      case 11: // vii° (Leading tone in harmonic minor)
        return { isDiatonic: true, preferredQualities: ['dim', 'dim7'], isDominantCandidate: false };
      default:
        return { isDiatonic: false, preferredQualities: ['maj', 'min'], isDominantCandidate: false };
    }
  }

  return { isDiatonic: false, preferredQualities: ['maj', 'min'], isDominantCandidate: false };
}

/**
 * Calculates cosine similarity between two 12-element chroma vectors
 */
function chromaSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Recognizes chords across the exact selected region using event-based harmonic grouping,
 * key-aware probabilistic inference, and robust bass/inversion tracking.
 */
export function estimateChordsFromNotes(
  notes: NoteEvent[],
  regionStartSeconds: number,
  regionEndSeconds?: number,
  key?: MusicalKey,
  options?: ChordEstimationOptions
): ChordEvent[] {
  // Backward compatibility handling:
  // If called as estimateChordsFromNotes(notes, totalDuration, sliceDuration)
  let tStart = regionStartSeconds;
  let tEnd = regionEndSeconds ?? regionStartSeconds;
  if (regionEndSeconds === undefined || regionEndSeconds <= regionStartSeconds) {
    if (notes.length > 0) {
      tStart = Math.max(0, Math.min(...notes.map((n) => n.startSeconds)));
      tEnd = Math.max(tStart + 0.5, ...notes.map((n) => n.startSeconds + n.durationSeconds));
    } else {
      return [];
    }
  }

  const regionDuration = tEnd - tStart;
  if (notes.length === 0 || regionDuration <= 0.1) {
    return [];
  }

  const mode = options?.mode ?? 'strict';
  const minWindowSec = options?.minEventDuration ?? 0.20;

  // 1. Filter notes that intersect with the selected region
  const regionNotes = notes.filter((n) => {
    const nEnd = n.startSeconds + n.durationSeconds;
    return n.startSeconds < tEnd && nEnd > tStart;
  });

  if (regionNotes.length === 0) {
    return [];
  }

  // 2. Event-Based Harmonic Grouping:
  // Collect all note onsets and significant release boundaries within the region
  const boundaryPoints = new Set<number>();
  boundaryPoints.add(tStart);
  boundaryPoints.add(tEnd);

  for (const n of regionNotes) {
    if (n.startSeconds >= tStart && n.startSeconds <= tEnd) {
      boundaryPoints.add(n.startSeconds);
    }
    const nEnd = n.startSeconds + n.durationSeconds;
    // Only add note release boundaries for long sustained notes (>= 0.3s)
    if (n.durationSeconds >= 0.3 && nEnd >= tStart && nEnd <= tEnd) {
      boundaryPoints.add(nEnd);
    }
  }

  // Sort and filter boundary points to respect minimum harmonic window
  const sortedRaw = Array.from(boundaryPoints).sort((a, b) => a - b);
  const clusteredBoundaries: number[] = [sortedRaw[0]];

  for (let i = 1; i < sortedRaw.length; i++) {
    const last = clusteredBoundaries[clusteredBoundaries.length - 1];
    const cur = sortedRaw[i];
    if (cur - last >= minWindowSec || i === sortedRaw.length - 1) {
      clusteredBoundaries.push(cur);
    }
  }

  // Ensure last boundary matches region end
  if (clusteredBoundaries[clusteredBoundaries.length - 1] < tEnd) {
    clusteredBoundaries.push(tEnd);
  }

  // 3. Compute Harmonic Windows (weighted chroma & bass certainty)
  const windows: HarmonicWindow[] = [];

  for (let i = 0; i < clusteredBoundaries.length - 1; i++) {
    const wStart = clusteredBoundaries[i];
    const wEnd = clusteredBoundaries[i + 1];
    const wDur = wEnd - wStart;
    if (wDur <= 0.05) continue;

    const chroma = new Array<number>(12).fill(0);
    let minPitch = 999;
    let lowestPc: number | undefined;
    let lowestNoteDuration = 0;
    let activeNotes = 0;

    for (const note of regionNotes) {
      const nEnd = note.startSeconds + note.durationSeconds;
      if (note.startSeconds < wEnd && nEnd > wStart) {
        const overlapStart = Math.max(wStart, note.startSeconds);
        const overlapEnd = Math.min(wEnd, nEnd);
        const overlap = overlapEnd - overlapStart;

        if (overlap > 0.03) {
          activeNotes++;
          const pc = pitchToPitchClass(note.pitch);
          // Duration and velocity weighting
          const weight = overlap * (note.velocity / 100) * (note.confidence ?? 1.0);
          chroma[pc] += weight;

          // Track lowest sounding pitch
          if (note.pitch < minPitch) {
            minPitch = note.pitch;
            lowestPc = pc;
            lowestNoteDuration = overlap;
          }
        }
      }
    }

    const bassCertainty = lowestNoteDuration >= wDur * 0.45 && minPitch < 62 ? 0.9 : 0.35;

    windows.push({
      startSeconds: wStart,
      endSeconds: wEnd,
      chroma,
      bassPitchClass: lowestPc,
      bassPitch: minPitch < 999 ? minPitch : undefined,
      bassCertainty,
      activeNoteCount: activeNotes,
    });
  }

  // 4. Harmonic Event Merging:
  // Merge adjacent windows if they have identical/very close chroma profiles to eliminate jitter
  const mergedWindows: HarmonicWindow[] = [];
  let curWin: HarmonicWindow | null = null;

  for (const win of windows) {
    if (!curWin) {
      curWin = { ...win };
      continue;
    }

    const sim = chromaSimilarity(curWin.chroma, win.chroma);
    const sameBass = curWin.bassPitchClass === win.bassPitchClass;

    // Merge if similarity is high or if one slice is very short with low activity
    if (sim > 0.86 || (win.endSeconds - win.startSeconds < 0.18 && sim > 0.65)) {
      curWin.endSeconds = win.endSeconds;
      for (let p = 0; p < 12; p++) {
        curWin.chroma[p] += win.chroma[p];
      }
      curWin.activeNoteCount = Math.max(curWin.activeNoteCount, win.activeNoteCount);
      if (win.bassCertainty > curWin.bassCertainty) {
        curWin.bassPitchClass = win.bassPitchClass;
        curWin.bassPitch = win.bassPitch;
        curWin.bassCertainty = win.bassCertainty;
      }
    } else {
      mergedWindows.push(curWin);
      curWin = { ...win };
    }
  }
  if (curWin) {
    mergedWindows.push(curWin);
  }

  // 5. Realistic Weighted Matching & Key-Aware Inference
  interface RawCandidate {
    start: number;
    end: number;
    rootPc: number;
    quality: ChordQuality;
    bassPc?: number;
    inversion: ChordInversion;
    score: number;
    alternatives: string[];
    voicingNotes: number[];
  }

  const rawChords: RawCandidate[] = [];

  for (const win of mergedWindows) {
    const chromaTotal = win.chroma.reduce((a, b) => a + b, 0);
    if (chromaTotal < 0.04 || win.activeNoteCount === 0) {
      continue;
    }

    // Normalize chroma
    const maxChroma = Math.max(...win.chroma);
    const normChroma = win.chroma.map((v) => (maxChroma > 0 ? v / maxChroma : 0));

    let bestScore = -1;
    let bestRoot = 0;
    let bestQuality: ChordQuality = 'maj';
    let bestInversion: ChordInversion = 'root';
    let bestBassPc: number | undefined = win.bassPitchClass;
    const candidatesList: Array<{ label: string; score: number }> = [];

    const penaltyFactor = mode === 'strict' ? 0.85 : 0.40;
    const minAcceptScore = mode === 'strict' ? 0.38 : 0.18;

    for (let root = 0; root < 12; root++) {
      for (const tpl of CHORD_TEMPLATES) {
        const chordPcs = new Set(tpl.intervals.map((i) => (root + i) % 12));

        let matchWeight = 0;
        let penaltyWeight = 0;

        for (let pc = 0; pc < 12; pc++) {
          if (chordPcs.has(pc)) {
            // Give extra weight to the Root and Third
            let weightMultiplier = 1.0;
            if (pc === root) weightMultiplier = 1.35; // Root clarity
            else if (pc === (root + tpl.intervals[1]) % 12) weightMultiplier = 1.25; // Third (defines quality)
            else if (tpl.intervals.length > 3 && pc === (root + tpl.intervals[3]) % 12) weightMultiplier = 1.15; // 7th

            matchWeight += normChroma[pc] * weightMultiplier;
          } else {
            // Penalize notes present in audio that are NOT part of this candidate chord
            penaltyWeight += normChroma[pc] * penaltyFactor;
          }
        }

        // Specificity bonus / penalty:
        // E.g., if candidate is Cmaj7 and B is sustained, reward maj7 over plain Cmaj.
        // If candidate is a 7th chord but the 7th tone is missing in the audio, penalize it heavily.
        let specificityMultiplier = 1.0;
        if (tpl.intervals.length >= 4) {
          const seventhPc = (root + tpl.intervals[3]) % 12;
          if (normChroma[seventhPc] > 0.35) {
            specificityMultiplier = 1.28; // Definite 7th chord!
          } else {
            specificityMultiplier = 0.55; // Missing 7th, prefer triad
          }
        }

        // Bass & Inversion Inference
        let bassMultiplier = 1.0;
        let detectedInversion: ChordInversion = 'root';

        if (win.bassCertainty >= 0.5 && win.bassPitchClass !== undefined) {
          const bass = win.bassPitchClass;
          if (bass === root) {
            // Root position
            detectedInversion = 'root';
            bassMultiplier = 1.30;
          } else if (bass === (root + tpl.intervals[1]) % 12) {
            // First inversion (3rd in bass)
            detectedInversion = 'first';
            bassMultiplier = 1.22;
          } else if (tpl.intervals.length >= 3 && bass === (root + tpl.intervals[2]) % 12) {
            // Second inversion (5th in bass)
            detectedInversion = 'second';
            bassMultiplier = 1.18;
          } else if (tpl.intervals.length >= 4 && bass === (root + tpl.intervals[3]) % 12) {
            // Third inversion (7th in bass)
            detectedInversion = 'third';
            bassMultiplier = 1.14;
          } else {
            // Slash chord / pedal point
            detectedInversion = 'slash';
            bassMultiplier = 0.95;
          }
        }

        // Key-Aware Chord Inference Bias
        let keyBiasMultiplier = 1.0;
        if (key) {
          const diatonicInfo = getDiatonicExpectation(root, key);
          if (diatonicInfo.isDiatonic) {
            if (diatonicInfo.preferredQualities.includes(tpl.quality)) {
              keyBiasMultiplier = 1.24; // High probability diatonic chord
            } else {
              keyBiasMultiplier = 1.05;
            }
          } else if (diatonicInfo.isDominantCandidate) {
            keyBiasMultiplier = 1.08; // Secondary dominant (e.g. V/V)
          } else {
            // Chromatic / non-diatonic: requires stronger proof
            keyBiasMultiplier = mode === 'strict' ? 0.72 : 0.88;
          }

          // Guard against false dominant 7th chords without 7th tone
          if (tpl.quality === '7') {
            const dom7Pc = (root + 10) % 12;
            if (normChroma[dom7Pc] < 0.25) {
              keyBiasMultiplier *= 0.5; // Do not guess dominant 7th unless flat-7 is sounding
            }
          }
        }

        const rawScore =
          ((matchWeight - penaltyWeight) / (tpl.intervals.length * 0.8)) *
          tpl.weight *
          bassMultiplier *
          keyBiasMultiplier *
          specificityMultiplier;

        if (rawScore > 0) {
          const candLabel = buildChordLabel(root, tpl.quality, win.bassCertainty >= 0.5 ? win.bassPitchClass : undefined);
          candidatesList.push({ label: candLabel, score: rawScore });
        }

        if (rawScore > bestScore) {
          bestScore = rawScore;
          bestRoot = root;
          bestQuality = tpl.quality;
          bestInversion = detectedInversion;
          bestBassPc = win.bassCertainty >= 0.5 ? win.bassPitchClass : undefined;
        }
      }
    }

    if (bestScore >= minAcceptScore) {
      candidatesList.sort((a, b) => b.score - a.score);
      const alts = candidatesList.slice(1, 4).map((c) => c.label);

      // Construct pro voicing
      const voicingNotes = buildProChordVoicing(
        bestRoot,
        bestQuality,
        bestBassPc,
        bestInversion,
        {
          bassOctave: 2,
          baseOctave: 3,
          targetRegister: options?.targetRegister ?? 60,
        }
      );

      rawChords.push({
        start: win.startSeconds,
        end: win.endSeconds,
        rootPc: bestRoot,
        quality: bestQuality,
        bassPc: bestBassPc,
        inversion: bestInversion,
        score: Math.min(0.98, bestScore),
        alternatives: alts,
        voicingNotes,
      });
    }
  }

  // 6. Post-Analysis Correction Pass:
  // - Filter out tiny false detections (< 0.20s)
  // - De-glitch chord sandwiches (A -> tiny B -> A => A)
  // - Merge contiguous identical chords
  const corrected: RawCandidate[] = [];

  for (let i = 0; i < rawChords.length; i++) {
    const cur = rawChords[i];
    const prev = corrected.length > 0 ? corrected[corrected.length - 1] : null;
    const next = i < rawChords.length - 1 ? rawChords[i + 1] : null;

    // De-glitch chord sandwich: A -> tiny B (< 0.25s) -> A
    if (
      prev &&
      next &&
      prev.rootPc === next.rootPc &&
      prev.quality === next.quality &&
      cur.end - cur.start < 0.25
    ) {
      // Absorb cur into prev
      prev.end = next.end;
      i++; // Skip next since it's absorbed
      continue;
    }

    // Merge adjacent identical chords
    if (
      prev &&
      prev.rootPc === cur.rootPc &&
      prev.quality === cur.quality &&
      prev.bassPc === cur.bassPc &&
      Math.abs(prev.end - cur.start) <= 0.08
    ) {
      prev.end = cur.end;
      prev.score = Math.max(prev.score, cur.score);
      continue;
    }

    // Discard microscopic blips (< 0.16s) unless nothing else exists
    if (cur.end - cur.start < 0.16 && (prev !== null || next !== null)) {
      if (prev) {
        prev.end = cur.end;
      }
      continue;
    }

    corrected.push({ ...cur });
  }

  // 7. Final Output Assembly
  return corrected.map((c, idx) => {
    const tones = getChordPitchClasses(c.rootPc, c.quality);
    const label = buildChordLabel(c.rootPc, c.quality, c.bassPc);

    return {
      id: `chord_${Date.now()}_${idx}`,
      rootPitchClass: c.rootPc,
      quality: c.quality,
      label,
      startSeconds: Number(c.start.toFixed(3)),
      endSeconds: Number(c.end.toFixed(3)),
      confidence: Number(Math.max(0.4, Math.min(0.99, c.score)).toFixed(2)),
      chordTones: tones,
      bassPitchClass: c.bassPc,
      inversion: c.inversion,
      voicingNotes: c.voicingNotes,
      alternativeLabels: c.alternatives,
    };
  });
}
