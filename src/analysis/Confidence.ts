/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent } from '../music/NoteEvent.ts';
import { MusicalKey } from '../music/Scale.ts';
import { ChordEvent } from '../music/Chord.ts';

export interface AnalysisDiagnosticWarning {
  id: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  description: string;
}

export function generateDiagnostics(
  notes: NoteEvent[],
  key: MusicalKey | undefined,
  chords: ChordEvent[],
  regionDuration: number,
  analysisMode: string
): AnalysisDiagnosticWarning[] {
  const warnings: AnalysisDiagnosticWarning[] = [];

  if (regionDuration < 0.8) {
    warnings.push({
      id: 'short_region',
      level: 'warning',
      title: 'Short Selection Region',
      description: `Selected region is ${regionDuration.toFixed(2)}s. Transcription and key estimation are most accurate on sections > 1.0s.`,
    });
  }

  if (notes.length === 0) {
    warnings.push({
      id: 'no_notes',
      level: 'warning',
      title: 'No Pitch Events Detected',
      description: 'The selected section may contain percussion, silence, or noise below the sensitivity threshold.',
    });
    return warnings;
  }

  if (key && key.confidence < 0.45) {
    warnings.push({
      id: 'low_key_conf',
      level: 'info',
      title: 'Tonal Ambiguity',
      description: `Key detection confidence is moderate (${Math.round(key.confidence * 100)}%). The material may be modal, chromatic, or changing keys.`,
    });
  }

  // Check for polyphony in vocal mode
  if (analysisMode === 'vocal') {
    let overlappingCount = 0;
    for (let i = 0; i < notes.length - 1; i++) {
      const aEnd = notes[i].startSeconds + notes[i].durationSeconds;
      if (notes[i + 1].startSeconds < aEnd - 0.05) {
        overlappingCount++;
      }
    }
    if (overlappingCount > 2) {
      warnings.push({
        id: 'vocal_overlap',
        level: 'info',
        title: 'Overlapping Vocal Notes',
        description: 'Vocal mode simplified overlapping notes into a primary melodic line.',
      });
    }
  }

  // Check for ultra-low or ultra-high pitches
  const pitches = notes.map((n) => n.pitch);
  const minP = Math.min(...pitches);
  const maxP = Math.max(...pitches);

  if (minP < 28) {
    warnings.push({
      id: 'sub_bass',
      level: 'info',
      title: 'Sub-Bass Frequencies (< 40Hz)',
      description: 'Extracted notes include deep sub-bass frequencies. Verify pitch fundamentals on studio monitors or headphones.',
    });
  }

  if (maxP > 96) {
    warnings.push({
      id: 'high_register',
      level: 'info',
      title: 'High Register Transcriptions',
      description: 'High notes above C7 detected. Some may represent acoustic harmonics or string noise.',
    });
  }

  return warnings;
}
