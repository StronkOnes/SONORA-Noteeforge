/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent } from './NoteEvent.ts';

export type QuantizeGrid = '1/4' | '1/8' | '1/16' | '1/32' | '1/8T' | '1/16T';

export interface QuantizeSettings {
  grid: QuantizeGrid;
  strength: number; // 0.0 to 1.0 (0% - 100%)
  swing: number; // 0.0 to 1.0 (0% - 100%)
  quantizeDurations: boolean;
}

export function getGridDurationInSeconds(grid: QuantizeGrid, bpm: number): number {
  const beatDuration = 60 / bpm; // 1/4 note
  switch (grid) {
    case '1/4':
      return beatDuration;
    case '1/8':
      return beatDuration / 2;
    case '1/16':
      return beatDuration / 4;
    case '1/32':
      return beatDuration / 8;
    case '1/8T':
      return (beatDuration * 2) / 3;
    case '1/16T':
      return (beatDuration * 1) / 3;
    default:
      return beatDuration / 4;
  }
}

/**
 * Quantize a list of NoteEvents according to the grid, tempo, strength, and swing.
 */
export function quantizeNotes(
  notes: NoteEvent[],
  bpm: number,
  settings: QuantizeSettings,
  timeOffset: number = 0
): NoteEvent[] {
  const gridSec = getGridDurationInSeconds(settings.grid, bpm);
  const { strength, swing, quantizeDurations } = settings;

  return notes.map((note) => {
    const relStart = note.startSeconds - timeOffset;
    const gridIndex = Math.round(relStart / gridSec);
    let targetStart = gridIndex * gridSec;

    // Apply swing if every odd subdivision
    if (swing > 0 && gridIndex % 2 === 1) {
      const swingDelay = gridSec * 0.333 * swing;
      targetStart += swingDelay;
    }

    const newRelStart = relStart + (targetStart - relStart) * strength;
    const newStartSeconds = Math.max(0, timeOffset + newRelStart);

    let newDuration = note.durationSeconds;
    if (quantizeDurations) {
      const durationGridUnits = Math.max(1, Math.round(note.durationSeconds / gridSec));
      const targetDuration = durationGridUnits * gridSec;
      newDuration = note.durationSeconds + (targetDuration - note.durationSeconds) * strength;
      newDuration = Math.max(gridSec * 0.5, newDuration);
    }

    return {
      ...note,
      startSeconds: Number(newStartSeconds.toFixed(4)),
      durationSeconds: Number(newDuration.toFixed(4)),
    };
  });
}
