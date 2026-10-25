/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { quantizeNotes } from '../music/Quantization.ts';
import { NoteEvent } from '../music/NoteEvent.ts';

describe('Quantization', () => {
  test('snaps notes to nearest 1/4 note grid at 120 BPM', () => {
    // 120 BPM -> 1/4 note is 0.5 seconds
    const notes: NoteEvent[] = [
      { id: '1', pitch: 60, startSeconds: 0.08, durationSeconds: 0.4, velocity: 80, source: 'user' },
      { id: '2', pitch: 62, startSeconds: 0.48, durationSeconds: 0.4, velocity: 80, source: 'user' },
    ];

    const quantized = quantizeNotes(
      notes,
      120,
      {
        grid: '1/4',
        strength: 1.0,
        swing: 0,
        quantizeDurations: false,
      },
      0
    );

    expect(quantized[0].startSeconds).toBe(0.0);
    expect(quantized[1].startSeconds).toBe(0.5);
  });
});
