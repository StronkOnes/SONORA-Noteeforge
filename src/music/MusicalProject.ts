/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent } from './NoteEvent.ts';
import { MusicalKey } from './Scale.ts';
import { ChordEvent } from './Chord.ts';
import { QuantizeSettings } from './Quantization.ts';

export type AnalysisMode = 'vocal' | 'melody' | 'chords';
export type InstrumentProfile = 'bass' | 'piano' | 'guitar' | 'synth' | 'other';

export interface AudioMetadata {
  filename: string;
  durationSeconds: number;
  sampleRate: number;
  numberOfChannels: number;
  fileSizeBytes?: number;
}

export interface RegionBounds {
  startSeconds: number;
  endSeconds: number;
}

export interface MusicalProject {
  id: string;
  name: string;
  audioMetadata?: AudioMetadata;
  selectedRegion: RegionBounds;
  analysisMode: AnalysisMode;
  instrumentProfile: InstrumentProfile;
  bpm: number;
  timeSignature: [number, number]; // e.g. [4, 4]
  key?: MusicalKey;
  chords: ChordEvent[];
  notes: NoteEvent[];
  quantizeSettings: QuantizeSettings;
  expressiveVibrato: boolean; // vocal mode option: preserve pitch bends vs clean MIDI
  transcriptionConfidence: number;
  lastAnalysisTimestamp?: number;
}

export function createInitialProject(name: string = 'Untitled Project'): MusicalProject {
  return {
    id: `proj_${Date.now()}`,
    name,
    selectedRegion: { startSeconds: 0, endSeconds: 4 },
    analysisMode: 'melody',
    instrumentProfile: 'piano',
    bpm: 120,
    timeSignature: [4, 4],
    chords: [],
    notes: [],
    quantizeSettings: {
      grid: '1/16',
      strength: 1.0,
      swing: 0.0,
      quantizeDurations: false,
    },
    expressiveVibrato: false,
    transcriptionConfidence: 1.0,
  };
}
