/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { estimateKeyFromNotes } from '../analysis/KeyEstimator.ts';
import { NoteEvent } from '../music/NoteEvent.ts';

describe('KeyEstimator', () => {
  test('correctly identifies A Minor passage', () => {
    // A Minor notes: A, C, D, E, G
    const notes: NoteEvent[] = [
      { id: '1', pitch: 69, startSeconds: 0, durationSeconds: 1.0, velocity: 90, source: 'user' }, // A4
      { id: '2', pitch: 72, startSeconds: 1, durationSeconds: 0.8, velocity: 85, source: 'user' }, // C5
      { id: '3', pitch: 74, startSeconds: 2, durationSeconds: 0.6, velocity: 80, source: 'user' }, // D5
      { id: '4', pitch: 76, startSeconds: 3, durationSeconds: 1.2, velocity: 95, source: 'user' }, // E5
      { id: '5', pitch: 69, startSeconds: 4, durationSeconds: 1.5, velocity: 90, source: 'user' }, // A4
    ];

    const result = estimateKeyFromNotes(notes);
    expect(result.rootName).toBe('A');
    expect(result.mode).toBe('minor');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('correctly identifies C Major passage', () => {
    // C Major notes: C, E, G, B
    const notes: NoteEvent[] = [
      { id: '1', pitch: 60, startSeconds: 0, durationSeconds: 1.0, velocity: 90, source: 'user' }, // C4
      { id: '2', pitch: 64, startSeconds: 1, durationSeconds: 0.8, velocity: 85, source: 'user' }, // E4
      { id: '3', pitch: 67, startSeconds: 2, durationSeconds: 1.0, velocity: 80, source: 'user' }, // G4
      { id: '4', pitch: 60, startSeconds: 3, durationSeconds: 1.5, velocity: 95, source: 'user' }, // C4
    ];

    const result = estimateKeyFromNotes(notes);
    expect(result.rootName).toBe('C');
    expect(result.mode).toBe('major');
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});
