/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent, PitchBendEvent, frequencyToPitch } from '../music/NoteEvent.ts';
import { AnalysisMode, InstrumentProfile } from '../music/MusicalProject.ts';

export interface TranscriptionSettings {
  mode: AnalysisMode;
  instrumentProfile: InstrumentProfile;
  sensitivity: number; // 0.1 to 1.0 (default ~0.65)
  minNoteDurationSeconds: number; // default ~0.06s
  mergeFragments: boolean;
  expressiveVibrato: boolean;
  octaveCorrection: boolean;
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
 * Autocorrelation / Normalized Square Difference Function (NSDF) for pitch detection
 */
function findFundamentalPitch(
  frame: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number
): { freq: number; clarity: number } {
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.ceil(sampleRate / minFreq);
  const N = frame.length;

  if (maxLag >= N) return { freq: 0, clarity: 0 };

  // Check energy
  let energy = 0;
  for (let i = 0; i < N; i++) {
    energy += frame[i] * frame[i];
  }
  if (energy < 0.0005) return { freq: 0, clarity: 0 };

  // NSDF
  let bestLag = -1;
  let maxNsdf = -1;

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

    if (nsdf > maxNsdf) {
      maxNsdf = nsdf;
      bestLag = lag;
    }
  }

  if (bestLag > 0 && maxNsdf > 0.45) {
    // Parabolic interpolation for sub-sample accuracy
    let fineLag = bestLag;
    if (bestLag > minLag && bestLag < maxLag) {
      const alpha = getLagCorr(frame, bestLag - 1);
      const beta = maxNsdf;
      const gamma = getLagCorr(frame, bestLag + 1);
      const denom = 2 * (2 * beta - alpha - gamma);
      if (Math.abs(denom) > 1e-5) {
        fineLag = bestLag + (alpha - gamma) / denom;
      }
    }
    const freq = sampleRate / fineLag;
    return { freq, clarity: maxNsdf };
  }

  return { freq: 0, clarity: 0 };
}

function getLagCorr(frame: Float32Array, lag: number): number {
  let num = 0;
  let den = 0;
  const len = frame.length - lag;
  for (let i = 0; i < len; i++) {
    num += frame[i] * frame[i + lag];
    den += frame[i] * frame[i] + frame[i + lag] * frame[i + lag];
  }
  return den > 0 ? (2 * num) / den : 0;
}

/**
 * Polyphonic spectral peak extraction for instruments and chords
 */
function extractPolyphonicPitches(
  frame: Float32Array,
  sampleRate: number,
  minFreq: number,
  maxFreq: number,
  maxPitches: number = 4
): Array<{ freq: number; energy: number }> {
  const N = frame.length;
  // Compute DFT over log-spaced pitch candidate frequencies (semitone bins)
  const results: Array<{ freq: number; energy: number; pitch: number }> = [];

  const minPitch = Math.max(24, Math.round(frequencyToPitch(minFreq)));
  const maxPitch = Math.min(96, Math.round(frequencyToPitch(maxFreq)));

  for (let p = minPitch; p <= maxPitch; p++) {
    const freq = 440 * Math.pow(2, (p - 69) / 12);
    // Correlate with sine & cosine
    let real = 0;
    let imag = 0;
    const omega = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < N; i++) {
      const val = frame[i];
      real += val * Math.cos(omega * i);
      imag -= val * Math.sin(omega * i);
    }
    const energy = Math.sqrt(real * real + imag * imag) / N;

    // Harmonic overtone check: if fundamental already exists an octave below, suppress
    if (energy > 0.015) {
      results.push({ freq, energy, pitch: p });
    }
  }

  // Peak picking across pitch spectrum
  const peaks: Array<{ freq: number; energy: number; pitch: number }> = [];
  for (let i = 0; i < results.length; i++) {
    const cur = results[i];
    const prev = results[i - 1]?.energy ?? 0;
    const next = results[i + 1]?.energy ?? 0;
    if (cur.energy >= prev && cur.energy >= next && cur.energy > 0.02) {
      peaks.push(cur);
    }
  }

  // Sort by energy descending and filter out obvious overtones (2f, 3f)
  peaks.sort((a, b) => b.energy - a.energy);
  const filtered: Array<{ freq: number; energy: number }> = [];

  for (const peak of peaks) {
    if (filtered.length >= maxPitches) break;
    // Check if this peak is an integer multiple harmonic of an already selected lower peak
    let isHarmonic = false;
    for (const chosen of filtered) {
      const ratio = peak.freq / chosen.freq;
      const nearestInt = Math.round(ratio);
      if (nearestInt >= 2 && nearestInt <= 5 && Math.abs(ratio - nearestInt) < 0.06) {
        // likely overtone
        isHarmonic = true;
        break;
      }
    }
    if (!isHarmonic) {
      filtered.push({ freq: peak.freq, energy: peak.energy });
    }
  }

  return filtered;
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
    const channelData = audioBuffer.getChannelData(0); // Primary channel
    const totalSamples = channelData.length;

    // Analysis parameters based on mode and profile
    let frameSize = 2048;
    let hopSize = 512;
    let minFreq = 65; // ~C2
    let maxFreq = 1200; // ~D6

    if (settings.instrumentProfile === 'bass') {
      frameSize = 4096; // Longer window for low bass frequencies
      hopSize = 512;
      minFreq = 30; // ~B0
      maxFreq = 300; // ~D4
    } else if (settings.mode === 'vocal') {
      frameSize = 2048;
      hopSize = 256;
      minFreq = 80; // ~E2
      maxFreq = 950; // ~Bb5
    }

    const timePerHop = hopSize / sampleRate;
    const numFrames = Math.floor((totalSamples - frameSize) / hopSize);

    interface ActiveNoteTracker {
      id: string;
      pitch: number;
      startSec: number;
      lastSec: number;
      clarities: number[];
      pitchBends: PitchBendEvent[];
    }

    const completedNotes: NoteEvent[] = [];
    const activeNotes = new Map<number, ActiveNoteTracker>();
    let totalPeaksDetected = 0;

    // Hanning window
    const window = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
    }

    const frame = new Float32Array(frameSize);

    for (let f = 0; f < numFrames; f++) {
      if (this.isCancelled) {
        throw new Error('Analysis cancelled by user');
      }

      // Report progress periodically
      if (f % 50 === 0 && onProgress) {
        onProgress(Math.min(0.95, f / numFrames));
        // Yield to browser UI thread
        await new Promise((r) => setTimeout(r, 0));
      }

      const offset = f * hopSize;
      const frameTime = regionStartOffset + f * timePerHop;

      // Extract windowed frame
      let zcr = 0;
      let prevVal = channelData[offset];
      for (let i = 0; i < frameSize; i++) {
        const val = channelData[offset + i];
        frame[i] = val * window[i];
        if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
          zcr++;
        }
        prevVal = val;
      }
      const zeroCrossingRate = zcr / frameSize;

      // Unvoiced sound / breath filter for vocals
      if (settings.mode === 'vocal' && zeroCrossingRate > 0.22) {
        // High ZCR indicates unvoiced consonant (s, t, f) -> close active vocal note
        for (const [p, tracker] of activeNotes) {
          this.finalizeNote(tracker, completedNotes, settings);
          activeNotes.delete(p);
        }
        continue;
      }

      const framePitches: Array<{ pitch: number; clarity: number; centsOffset: number }> = [];

      if (settings.mode === 'vocal' || settings.instrumentProfile === 'bass') {
        // Monophonic pitch tracking
        const result = findFundamentalPitch(frame, sampleRate, minFreq, maxFreq);
        if (result.freq > 0 && result.clarity >= (1.1 - settings.sensitivity * 0.7)) {
          const exactPitch = frequencyToPitch(result.freq);
          const roundedPitch = Math.round(exactPitch);
          const centsOffset = (exactPitch - roundedPitch) * 100;
          framePitches.push({ pitch: roundedPitch, clarity: result.clarity, centsOffset });
          totalPeaksDetected++;
        }
      } else {
        // Polyphonic / instrument mode
        const maxPolyphony = settings.mode === 'chords' ? 5 : 3;
        const peaks = extractPolyphonicPitches(frame, sampleRate, minFreq, maxFreq, maxPolyphony);
        for (const pk of peaks) {
          const exactPitch = frequencyToPitch(pk.freq);
          const roundedPitch = Math.round(exactPitch);
          const centsOffset = (exactPitch - roundedPitch) * 100;
          framePitches.push({ pitch: roundedPitch, clarity: Math.min(1.0, pk.energy * 10), centsOffset });
          totalPeaksDetected++;
        }
      }

      // Track active notes across frames
      const currentFramePitches = new Set(framePitches.map((fp) => fp.pitch));

      // Close notes not heard in this frame
      for (const [p, tracker] of activeNotes) {
        if (!currentFramePitches.has(p)) {
          this.finalizeNote(tracker, completedNotes, settings);
          activeNotes.delete(p);
        }
      }

      // Add or extend notes
      for (const fp of framePitches) {
        const existing = activeNotes.get(fp.pitch);
        if (existing) {
          existing.lastSec = frameTime + timePerHop;
          existing.clarities.push(fp.clarity);
          if (settings.expressiveVibrato) {
            existing.pitchBends.push({
              timeOffset: Number((frameTime - existing.startSec).toFixed(3)),
              bendCents: Math.round(fp.centsOffset),
            });
          }
        } else {
          // If vocal mode, only allow 1 active note at a time
          if (settings.mode === 'vocal') {
            for (const [, oldTracker] of activeNotes) {
              this.finalizeNote(oldTracker, completedNotes, settings);
            }
            activeNotes.clear();
          }

          activeNotes.set(fp.pitch, {
            id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            pitch: fp.pitch,
            startSec: frameTime,
            lastSec: frameTime + timePerHop,
            clarities: [fp.clarity],
            pitchBends: settings.expressiveVibrato
              ? [{ timeOffset: 0, bendCents: Math.round(fp.centsOffset) }]
              : [],
          });
        }
      }
    }

    // Finalize any remaining notes
    for (const [, tracker] of activeNotes) {
      this.finalizeNote(tracker, completedNotes, settings);
    }
    activeNotes.clear();

    // Post-processing cleanup
    let processedNotes = completedNotes;

    // 1. Filter out notes shorter than minNoteDurationSeconds
    processedNotes = processedNotes.filter((n) => n.durationSeconds >= settings.minNoteDurationSeconds);

    // 2. Merge fragments of same pitch if gap is tiny (< 0.08s)
    if (settings.mergeFragments) {
      processedNotes = this.mergeAdjacentFragments(processedNotes);
    }

    // Calculate overall confidence score
    const avgConfidence =
      processedNotes.length > 0
        ? processedNotes.reduce((acc, n) => acc + (n.confidence || 0.8), 0) / processedNotes.length
        : 0.7;

    const totalPitchBends = processedNotes.reduce((acc, n) => acc + (n.pitchBends?.length || 0), 0);

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
      pitchBends: PitchBendEvent[];
    },
    output: NoteEvent[],
    settings: TranscriptionSettings
  ): void {
    const dur = tracker.lastSec - tracker.startSec;
    if (dur >= settings.minNoteDurationSeconds) {
      const avgClarity = tracker.clarities.reduce((a, b) => a + b, 0) / tracker.clarities.length;
      const velocity = Math.min(127, Math.max(40, Math.round(avgClarity * 115)));

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
        if (gap < 0.08 && gap >= -0.05) {
          // Merge
          const newDuration = (note.startSeconds + note.durationSeconds) - last.startSeconds;
          last.durationSeconds = Number(newDuration.toFixed(3));
          last.velocity = Math.round((last.velocity + note.velocity) / 2);
          continue;
        }
      }
      merged.push({ ...note });
    }
    return merged;
  }
}

export const sharedTranscriptionEngine = new CoreTranscriptionEngine();
