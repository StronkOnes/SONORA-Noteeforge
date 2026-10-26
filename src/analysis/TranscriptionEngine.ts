/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent, PitchBendEvent, frequencyToPitch, pitchToFrequency } from '../music/NoteEvent.ts';
import { AnalysisMode, InstrumentProfile } from '../music/MusicalProject.ts';
import { ChordDetectionMode } from '../music/Chord.ts';
import { detectOnsets } from './OnsetDetector.ts';

export interface TranscriptionSettings {
  mode: AnalysisMode;
  instrumentProfile: InstrumentProfile;
  sensitivity: number; // 0.1 to 1.0 (default ~0.65)
  minNoteDurationSeconds: number; // default ~0.05s
  mergeFragments: boolean;
  expressiveVibrato: boolean;
  octaveCorrection: boolean;
  chordDetectionMode?: ChordDetectionMode;
}

export interface TranscriptionResult {
  notes: NoteEvent[];
  confidence: number;
  diagnostics: {
    framesAnalyzed: number;
    peaksDetected: number;
    pitchBendEventsCount: number;
  };
}

export interface ITranscriptionEngine {
  analyse(
    audioBuffer: AudioBuffer,
    settings: TranscriptionSettings,
    regionStartOffset?: number,
    onProgress?: (progress: number) => void
  ): Promise<TranscriptionResult>;
  cancel?(): void;
}

/**
 * High-accuracy Normalized Square Difference Function (NSDF / YIN)
 * with parabolic sub-sample peak interpolation
 */
function findMonophonicPitch(
  frame: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number
): { freq: number; clarity: number } {
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.ceil(sampleRate / minFreq);
  const N = frame.length;

  if (maxLag >= N) return { freq: 0, clarity: 0 };

  // Calculate frame RMS
  let energy = 0;
  for (let i = 0; i < N; i++) {
    energy += frame[i] * frame[i];
  }
  const rms = Math.sqrt(energy / N);
  if (rms < 0.005) return { freq: 0, clarity: 0 };

  // NSDF
  let bestLag = -1;
  let maxNsdf = -1;
  const nsdfValues = new Float32Array(maxLag + 2);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0;
    let den1 = 0;
    let den2 = 0;
    const len = N - lag;
    for (let i = 0; i < len; i++) {
      const a = frame[i];
      const b = frame[i + lag];
      num += a * b;
      den1 += a * a;
      den2 += b * b;
    }
    const den = den1 + den2;
    const nsdf = den > 0 ? (2 * num) / den : 0;
    nsdfValues[lag] = nsdf;

    if (nsdf > maxNsdf) {
      maxNsdf = nsdf;
      bestLag = lag;
    }
  }

  // Threshold for periodicity: 0.45
  if (bestLag > 0 && maxNsdf > 0.42) {
    let fineLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const alpha = nsdfValues[bestLag - 1];
      const beta = maxNsdf;
      const gamma = nsdfValues[bestLag + 1];
      const denom = 2 * (2 * beta - alpha - gamma);
      if (Math.abs(denom) > 1e-5) {
        fineLag = bestLag + (alpha - gamma) / denom;
      }
    }
    const freq = sampleRate / fineLag;
    return { freq, clarity: Math.min(1.0, maxNsdf) };
  }

  return { freq: 0, clarity: 0 };
}

/**
 * Harmonic Salience Polyphonic Pitch Detector with Harmonic Cancellation:
 * Eliminates false octave and fifth overtones when analyzing chords, piano, and guitar!
 */
function extractSalientPolyphonicPitches(
  frame: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number,
  maxVoices: number = 5,
  minSalienceThreshold: number = 0.04
): Array<{ pitch: number; freq: number; energy: number; clarity: number }> {
  const N = frame.length;
  const minPitch = Math.max(24, Math.round(frequencyToPitch(minFreq)));
  const maxPitch = Math.min(96, Math.round(frequencyToPitch(maxFreq)));
  const numPitches = maxPitch - minPitch + 1;

  // 1. Measure spectral energy across candidate semitone pitches
  const pitchEnergies = new Float32Array(numPitches);

  for (let pIdx = 0; pIdx < numPitches; pIdx++) {
    const pitch = minPitch + pIdx;
    const freq = pitchToFrequency(pitch);
    const omega = (2 * Math.PI * freq) / sampleRate;

    let real = 0;
    let imag = 0;
    // Step by 2 for high-speed DFT evaluation
    for (let n = 0; n < N; n += 2) {
      const val = frame[n];
      real += val * Math.cos(omega * n);
      imag -= val * Math.sin(omega * n);
    }
    pitchEnergies[pIdx] = Math.sqrt(real * real + imag * imag) / (N / 2);
  }

  // 2. Harmonic Salience Calculation:
  // S(p) combines fundamental with its 2nd, 3rd, 4th, and 5th harmonics
  const salience = new Float32Array(numPitches);
  for (let pIdx = 0; pIdx < numPitches; pIdx++) {
    const fundamentalEnergy = pitchEnergies[pIdx];
    if (fundamentalEnergy < 0.008) continue;

    let score = fundamentalEnergy * 1.2;
    // Harmonic intervals in semitones:
    // Harmonic 2 = +12 st (octave)
    // Harmonic 3 = +19 st (octave + fifth)
    // Harmonic 4 = +24 st (2 octaves)
    // Harmonic 5 = +28 st (2 octaves + major third)
    const harmonicOffsets = [12, 19, 24, 28];
    const harmonicWeights = [0.65, 0.45, 0.35, 0.25];

    harmonicOffsets.forEach((st, hIdx) => {
      const targetIdx = pIdx + st;
      if (targetIdx < numPitches) {
        score += pitchEnergies[targetIdx] * harmonicWeights[hIdx];
      }
    });

    salience[pIdx] = score;
  }

  // 3. Iterative Peak Picking with Harmonic Cancellation
  const detectedPitches: Array<{ pitch: number; freq: number; energy: number; clarity: number }> = [];

  for (let voice = 0; voice < maxVoices; voice++) {
    let bestIdx = -1;
    let maxSal = minSalienceThreshold;

    for (let pIdx = 1; pIdx < numPitches - 1; pIdx++) {
      const val = salience[pIdx];
      if (val > maxSal && val >= salience[pIdx - 1] && val >= salience[pIdx + 1]) {
        maxSal = val;
        bestIdx = pIdx;
      }
    }

    if (bestIdx < 0) break; // No more prominent peaks

    const detectedPitch = minPitch + bestIdx;
    const detectedFreq = pitchToFrequency(detectedPitch);

    detectedPitches.push({
      pitch: detectedPitch,
      freq: detectedFreq,
      energy: pitchEnergies[bestIdx],
      clarity: Math.min(1.0, maxSal * 4),
    });

    // Harmonic Cancellation:
    // Suppress the salience of the fundamental and its integer harmonics
    // so they do not get picked up as separate false notes!
    salience[bestIdx] = 0;
    const cancellationOffsets = [12, 19, 24, 28];
    for (const offset of cancellationOffsets) {
      const target = bestIdx + offset;
      if (target < numPitches) {
        salience[target] = Math.max(0, salience[target] - maxSal * 0.7);
        // Suppress direct pitch energy as well
        pitchEnergies[target] = Math.max(0, pitchEnergies[target] - maxSal * 0.5);
      }
    }

    // Suppress adjacent semitones to avoid pitch blur
    if (bestIdx > 0) salience[bestIdx - 1] *= 0.2;
    if (bestIdx + 1 < numPitches) salience[bestIdx + 1] *= 0.2;
  }

  return detectedPitches;
}

export class CoreTranscriptionEngine implements ITranscriptionEngine {
  private isCancelled = false;

  public cancel(): void {
    this.isCancelled = true;
  }

  public async analyse(
    audioBuffer: AudioBuffer,
    settings: TranscriptionSettings,
    regionStartOffset: number = 0,
    onProgress?: (progress: number) => void
  ): Promise<TranscriptionResult> {
    this.isCancelled = false;

    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const totalSamples = channelData.length;

    // 1. Detect high-resolution attack onsets
    const onsetResult = detectOnsets(channelData, sampleRate, 1024, 256, 0.22);
    const onsetTimes = onsetResult.onsetTimes.map((t) => regionStartOffset + t);

    // 2. Select windowing parameters based on material
    let frameSize = 2048;
    let hopSize = 512;
    let minFreq = 65; // ~C2
    let maxFreq = 1200; // ~D6

    if (settings.instrumentProfile === 'bass') {
      frameSize = 4096; // Extended window for clean sub-bass cycles
      hopSize = 512;
      minFreq = 28; // ~A0 / sub-bass
      maxFreq = 250; // ~B3
    } else if (settings.mode === 'vocal') {
      frameSize = 2048;
      hopSize = 256;
      minFreq = 75; // ~D2
      maxFreq = 980; // ~B5
    }

    const timePerHop = hopSize / sampleRate;
    const numFrames = Math.floor((totalSamples - frameSize) / hopSize);

    // Hanning Window
    const window = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
    }

    const frame = new Float32Array(frameSize);

    interface ActiveNoteTracker {
      id: string;
      pitch: number;
      startSec: number;
      lastSec: number;
      clarities: number[];
      peakEnergies: number[];
      pitchBends: PitchBendEvent[];
      lastOnsetAssigned?: number;
    }

    const completedNotes: NoteEvent[] = [];
    const activeNotes = new Map<number, ActiveNoteTracker>();
    let totalPeaksDetected = 0;

    // Vocal mode running pitch smoother (5-frame median)
    const vocalPitchHistory: number[] = [];

    for (let f = 0; f < numFrames; f++) {
      if (this.isCancelled) {
        throw new Error('Analysis cancelled by user');
      }

      if (f % 40 === 0 && onProgress) {
        onProgress(Math.min(0.95, f / numFrames));
        await new Promise((r) => setTimeout(r, 0)); // Yield to UI thread
      }

      const offset = f * hopSize;
      const frameTime = regionStartOffset + f * timePerHop;

      // Extract windowed frame & compute ZCR and RMS
      let zcr = 0;
      let prevVal = channelData[offset];
      let sumSq = 0;

      for (let i = 0; i < frameSize; i++) {
        const val = channelData[offset + i];
        frame[i] = val * window[i];
        if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
          zcr++;
        }
        prevVal = val;
        sumSq += val * val;
      }

      const zeroCrossingRate = zcr / frameSize;
      const frameRms = Math.sqrt(sumSq / frameSize);

      // Unvoiced consonant / breath filter in vocal mode
      if (settings.mode === 'vocal' && zeroCrossingRate > 0.24) {
        for (const [p, tracker] of activeNotes) {
          this.finalizeNote(tracker, completedNotes, settings);
          activeNotes.delete(p);
        }
        continue;
      }

      const framePitches: Array<{ pitch: number; clarity: number; energy: number; centsOffset: number }> = [];

      if (settings.mode === 'vocal' || settings.instrumentProfile === 'bass') {
        // Monophonic pitch detection
        const result = findMonophonicPitch(frame, sampleRate, minFreq, maxFreq);
        if (result.freq > 0 && result.clarity >= (0.95 - settings.sensitivity * 0.45)) {
          const exactPitch = frequencyToPitch(result.freq);

          // Vocal running median smoothing to prevent erratic jitter
          let smoothedPitch = exactPitch;
          if (settings.mode === 'vocal') {
            vocalPitchHistory.push(exactPitch);
            if (vocalPitchHistory.length > 5) vocalPitchHistory.shift();
            const sorted = [...vocalPitchHistory].sort((a, b) => a - b);
            smoothedPitch = sorted[Math.floor(sorted.length / 2)];
          }

          const roundedPitch = Math.round(smoothedPitch);
          const centsOffset = (smoothedPitch - roundedPitch) * 100;

          framePitches.push({
            pitch: roundedPitch,
            clarity: result.clarity,
            energy: frameRms,
            centsOffset,
          });
          totalPeaksDetected++;
        }
      } else {
        // Polyphonic detection using Harmonic Salience & Cancellation
        const maxVoices = settings.mode === 'chords' ? 6 : 4;
        const minThresh = Math.max(0.02, 0.08 - settings.sensitivity * 0.06);
        const peaks = extractSalientPolyphonicPitches(frame, sampleRate, minFreq, maxFreq, maxVoices, minThresh);

        for (const pk of peaks) {
          framePitches.push({
            pitch: pk.pitch,
            clarity: pk.clarity,
            energy: pk.energy,
            centsOffset: 0,
          });
          totalPeaksDetected++;
        }
      }

      // Check if an onset transient fired in this frame window
      const hasRecentOnset = onsetTimes.some((ot) => Math.abs(ot - frameTime) <= timePerHop * 1.5);

      // Active notes matching
      const currentFramePitches = new Set(framePitches.map((fp) => fp.pitch));

      // Close notes that have disappeared or if a new attack onset fired on the same pitch
      for (const [p, tracker] of activeNotes) {
        if (!currentFramePitches.has(p) || (hasRecentOnset && frameTime - tracker.startSec > 0.12)) {
          this.finalizeNote(tracker, completedNotes, settings);
          activeNotes.delete(p);
        }
      }

      // Add or extend active notes
      for (const fp of framePitches) {
        const existing = activeNotes.get(fp.pitch);
        if (existing) {
          existing.lastSec = frameTime + timePerHop;
          existing.clarities.push(fp.clarity);
          existing.peakEnergies.push(fp.energy);

          if (settings.expressiveVibrato) {
            existing.pitchBends.push({
              timeOffset: Number((frameTime - existing.startSec).toFixed(3)),
              bendCents: Math.round(fp.centsOffset),
            });
          }
        } else {
          // If vocal mode, only 1 note active at a time
          if (settings.mode === 'vocal') {
            for (const [, oldTracker] of activeNotes) {
              this.finalizeNote(oldTracker, completedNotes, settings);
            }
            activeNotes.clear();
          }

          // Lock start time to nearest onset transient if available
          let alignedStartTime = frameTime;
          const nearestOnset = onsetTimes.find((ot) => Math.abs(ot - frameTime) < timePerHop * 1.8);
          if (nearestOnset !== undefined) {
            alignedStartTime = nearestOnset;
          }

          activeNotes.set(fp.pitch, {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            pitch: fp.pitch,
            startSec: alignedStartTime,
            lastSec: frameTime + timePerHop,
            clarities: [fp.clarity],
            peakEnergies: [fp.energy],
            pitchBends: settings.expressiveVibrato
              ? [{ timeOffset: 0, bendCents: Math.round(fp.centsOffset) }]
              : [],
          });
        }
      }
    }

    // Finalize all remaining notes
    for (const [, tracker] of activeNotes) {
      this.finalizeNote(tracker, completedNotes, settings);
    }
    activeNotes.clear();

    // 3. Post-Processing & Pro Musical Polish
    let processedNotes = completedNotes;

    // Filter ultra-short blips
    processedNotes = processedNotes.filter(
      (n) => n.durationSeconds >= settings.minNoteDurationSeconds
    );

    // Merge micro-fragments of the same pitch
    if (settings.mergeFragments) {
      processedNotes = this.mergeAdjacentFragments(processedNotes);
    }

    // Pro Legato sustain: in chord/instrument mode, smooth out micro-gaps (<100ms)
    if (settings.mode === 'chords' || settings.instrumentProfile === 'piano' || settings.instrumentProfile === 'bass') {
      processedNotes = this.applySmartSustain(processedNotes);
    }

    // In chord mode, synchronize harmonic onsets so chord tones strike together "on chord"
    if (settings.mode === 'chords' || (settings.instrumentProfile === 'piano' && processedNotes.length > 2)) {
      processedNotes = this.synchronizeChordOnsets(processedNotes);
    }

    const avgConfidence =
      processedNotes.length > 0
        ? processedNotes.reduce((acc, n) => acc + (n.confidence || 0.8), 0) / processedNotes.length
        : 0.8;

    const totalPitchBends = processedNotes.reduce(
      (acc, n) => acc + (n.pitchBends?.length || 0),
      0
    );

    onProgress?.(1.0);

    return {
      notes: processedNotes,
      confidence: Number(avgConfidence.toFixed(2)),
      diagnostics: {
        framesAnalyzed: numFrames,
        peaksDetected: totalPeaksDetected,
        pitchBendEventsCount: totalPitchBends,
      },
    };
  }

  private finalizeNote(
    tracker: {
      id: string;
      pitch: number;
      startSec: number;
      lastSec: number;
      clarities: number[];
      peakEnergies: number[];
      pitchBends: PitchBendEvent[];
    },
    output: NoteEvent[],
    settings: TranscriptionSettings
  ): void {
    const dur = tracker.lastSec - tracker.startSec;
    if (dur >= settings.minNoteDurationSeconds) {
      const avgClarity = tracker.clarities.reduce((a, b) => a + b, 0) / tracker.clarities.length;
      const maxEnergy = Math.max(...tracker.peakEnergies, 0.01);

      // Studio dynamic velocity mapping:
      // Map audio RMS in dB (-45dB to -4dB) to musical MIDI velocity (35 - 127)
      const db = 20 * Math.log10(maxEnergy + 1e-5);
      const normalizedVel = (db + 45) / 41; // 0.0 to 1.0
      const velocity = Math.min(127, Math.max(35, Math.round(35 + normalizedVel * 92)));

      output.push({
        id: tracker.id,
        pitch: tracker.pitch,
        startSeconds: Number(tracker.startSec.toFixed(3)),
        durationSeconds: Number(dur.toFixed(3)),
        velocity,
        confidence: Number(avgClarity.toFixed(2)),
        source: 'transcription',
        pitchBends: tracker.pitchBends.length > 0 ? tracker.pitchBends : undefined,
      });
    }
  }

  private mergeAdjacentFragments(notes: NoteEvent[]): NoteEvent[] {
    notes.sort((a, b) => a.startSeconds - b.startSeconds);
    const merged: NoteEvent[] = [];

    for (const note of notes) {
      const last = merged[merged.length - 1];
      if (last && last.pitch === note.pitch) {
        const gap = note.startSeconds - (last.startSeconds + last.durationSeconds);
        if (gap < 0.1 && gap >= -0.05) {
          const newDuration = note.startSeconds + note.durationSeconds - last.startSeconds;
          last.durationSeconds = Number(newDuration.toFixed(3));
          last.velocity = Math.round(Math.max(last.velocity, note.velocity));
          continue;
        }
      }
      merged.push({ ...note });
    }
    return merged;
  }

  /**
   * Extends sustained notes to eliminate choppy micro-gaps, creating smooth DAW-grade playback
   */
  private applySmartSustain(notes: NoteEvent[]): NoteEvent[] {
    const sorted = [...notes].sort((a, b) => a.startSeconds - b.startSeconds);

    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const curEnd = current.startSeconds + current.durationSeconds;

      // Find next note on identical pitch
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j];
        if (next.pitch === current.pitch) {
          const gap = next.startSeconds - curEnd;
          if (gap > 0 && gap <= 0.12) {
            // Fill small gap (legato extension)
            current.durationSeconds = Number((next.startSeconds - current.startSeconds).toFixed(3));
          }
          break;
        }
      }
    }

    return sorted;
  }

  /**
   * For chord analysis mode, groups notes whose attack onsets fall within a tight harmonic window (~75ms)
   * and synchronizes their start times so chords play strictly "on chord" (block chords) without arpeggiation.
   */
  private synchronizeChordOnsets(notes: NoteEvent[], clusterWindowSec: number = 0.075): NoteEvent[] {
    if (notes.length <= 1) return notes;

    const sorted = [...notes].sort((a, b) => a.startSeconds - b.startSeconds);
    const clusters: NoteEvent[][] = [];
    let currentCluster: NoteEvent[] = [];

    for (const note of sorted) {
      if (currentCluster.length === 0) {
        currentCluster.push(note);
      } else {
        const clusterStart = currentCluster[0].startSeconds;
        if (note.startSeconds - clusterStart <= clusterWindowSec) {
          currentCluster.push(note);
        } else {
          clusters.push(currentCluster);
          currentCluster = [note];
        }
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const output: NoteEvent[] = [];
    for (const cluster of clusters) {
      if (cluster.length <= 1) {
        output.push(cluster[0]);
      } else {
        // Find cluster onset (earliest start time)
        const unifiedStart = Math.min(...cluster.map((n) => n.startSeconds));
        const maxEnd = Math.max(...cluster.map((n) => n.startSeconds + n.durationSeconds));
        const unifiedDuration = Math.max(0.12, maxEnd - unifiedStart);

        for (const n of cluster) {
          output.push({
            ...n,
            startSeconds: Number(unifiedStart.toFixed(3)),
            durationSeconds: Number(Math.max(0.1, unifiedDuration).toFixed(3)),
          });
        }
      }
    }

    return output.sort((a, b) => a.startSeconds - b.startSeconds || a.pitch - b.pitch);
  }
}

export const sharedTranscriptionEngine = new CoreTranscriptionEngine();
