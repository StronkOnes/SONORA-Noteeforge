/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractAudioRegion } from '../audio/AudioRegion.ts';
import { sharedTranscriptionEngine, TranscriptionSettings } from './TranscriptionEngine.ts';
import { detectOnsets } from './OnsetDetector.ts';
import { estimateTempo } from './TempoEstimator.ts';
import { estimateKeyFromNotes } from './KeyEstimator.ts';
import { estimateChordsFromNotes } from './ChordEstimator.ts';
import { generateDiagnostics, AnalysisDiagnosticWarning } from './Confidence.ts';
import { NoteEvent } from '../music/NoteEvent.ts';
import { MusicalKey } from '../music/Scale.ts';
import { ChordEvent } from '../music/Chord.ts';

export interface FullAnalysisResult {
  notes: NoteEvent[];
  key: MusicalKey;
  chords: ChordEvent[];
  bpm: number;
  overallConfidence: number;
  diagnostics: AnalysisDiagnosticWarning[];
}

export class AnalysisEngine {
  public async runAnalysis(
    sourceAudio: AudioBuffer,
    startSeconds: number,
    endSeconds: number,
    settings: TranscriptionSettings,
    onProgress?: (progress: number, stepLabel: string) => void
  ): Promise<FullAnalysisResult> {
    onProgress?.(0.05, 'Extracting audio selection...');

    // 1. Extract clean audio region
    const region = extractAudioRegion(sourceAudio, startSeconds, endSeconds);
    const channelData = region.buffer.getChannelData(0);

    onProgress?.(0.12, 'Detecting rhythmic onsets and tempo...');
    const onsetResult = detectOnsets(channelData, region.sampleRate);
    const tempoResult = estimateTempo(onsetResult.envelope, onsetResult.timePerFrame);

    onProgress?.(0.20, `Transcribing ${settings.mode} (${settings.instrumentProfile})...`);

    // 2. Transcription
    const transcriptionResult = await sharedTranscriptionEngine.analyse(
      region.buffer,
      settings,
      startSeconds,
      (p) => {
        onProgress?.(0.20 + p * 0.50, `Transcribing pitches... ${Math.round(p * 100)}%`);
      }
    );

    onProgress?.(0.75, 'Estimating key and harmonic scale...');
    // 3. Key & Scale estimation
    const key = estimateKeyFromNotes(transcriptionResult.notes);

    onProgress?.(0.85, 'Inferring key-aware chords and voicings...');
    // 4. Key-Aware, Inversion-Aware Chord estimation on the exact selected region
    const chords = estimateChordsFromNotes(
      transcriptionResult.notes,
      startSeconds,
      endSeconds,
      key,
      {
        mode: settings.chordDetectionMode ?? 'strict',
        minEventDuration: 0.20,
      }
    );

    onProgress?.(0.95, 'Synthesizing confidence diagnostics...');
    // 5. Diagnostics
    const diagnostics = generateDiagnostics(
      transcriptionResult.notes,
      key,
      chords,
      region.durationSeconds,
      settings.mode
    );

    onProgress?.(1.0, 'Analysis complete');

    return {
      notes: transcriptionResult.notes,
      key,
      chords,
      bpm: tempoResult.bpm,
      overallConfidence: transcriptionResult.confidence,
      diagnostics,
    };
  }

  public cancel(): void {
    sharedTranscriptionEngine.cancel();
  }
}

export const sharedAnalysisEngine = new AnalysisEngine();
