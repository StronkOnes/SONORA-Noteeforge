/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encodeVlq, serializeNotesToMidi } from '../music/MidiSerializer.ts';
import { NoteEvent } from '../music/NoteEvent.ts';

describe('MidiSerializer', () => {
  test('encodeVlq correctly encodes single and multi-byte values', () => {
    expect(encodeVlq(0)).toEqual([0x00]);
    expect(encodeVlq(0x40)).toEqual([0x40]);
    expect(encodeVlq(0x7f)).toEqual([0x7f]);
    expect(encodeVlq(0x80)).toEqual([0x81, 0x00]);
    expect(encodeVlq(0x2000)).toEqual([0xc0, 0x00]);
    expect(encodeVlq(0x3fff)).toEqual([0xff, 0x7f]);
  });

  test('serializeNotesToMidi outputs a valid SMF Format 0 file', () => {
    const notes: NoteEvent[] = [
      {
        id: 'n1',
        pitch: 60, // C4
        startSeconds: 0.0,
        durationSeconds: 0.5,
        velocity: 80,
        source: 'user',
      },
      {
        id: 'n2',
        pitch: 64, // E4
        startSeconds: 0.5,
        durationSeconds: 0.5,
        velocity: 90,
        source: 'user',
      },
    ];

    const bytes = serializeNotesToMidi(notes, {
      bpm: 120,
      ticksPerQuarterNote: 480,
      trackName: 'Test Track',
      offsetToZero: true,
    });

    // Check Header chunk 'MThd'
    expect(bytes[0]).toBe(0x4d); // 'M'
    expect(bytes[1]).toBe(0x54); // 'T'
    expect(bytes[2]).toBe(0x68); // 'h'
    expect(bytes[3]).toBe(0x64); // 'd'

    // Format 0
    expect(bytes[8]).toBe(0x00);
    expect(bytes[9]).toBe(0x00);

    // Number of tracks = 1
    expect(bytes[10]).toBe(0x00);
    expect(bytes[11]).toBe(0x01);

    // Division 480 = 0x01E0
    expect(bytes[12]).toBe(0x01);
    expect(bytes[13]).toBe(0xe0);

    // Check Track chunk 'MTrk' starts at offset 14
    expect(bytes[14]).toBe(0x4d);
    expect(bytes[15]).toBe(0x54);
    expect(bytes[16]).toBe(0x72);
    expect(bytes[17]).toBe(0x6b);

    // End of track marker: FF 2F 00 at end
    const len = bytes.length;
    expect(bytes[len - 3]).toBe(0xff);
    expect(bytes[len - 2]).toBe(0x2f);
    expect(bytes[len - 1]).toBe(0x00);
  });
});
