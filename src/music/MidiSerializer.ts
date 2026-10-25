/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoteEvent } from './NoteEvent.ts';

export interface MidiExportOptions {
  bpm: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  ticksPerQuarterNote?: number; // e.g. 480
  trackName?: string;
  offsetToZero?: boolean; // If true, first note or region start shifts to 0
  startOffsetSeconds?: number;
  includePitchBends?: boolean;
}

/**
 * Encodes an integer into a MIDI Variable Length Quantity (VLQ).
 */
export function encodeVlq(value: number): number[] {
  let val = Math.max(0, Math.floor(value));
  const buffer: number[] = [val & 0x7f];
  while ((val >>= 7) > 0) {
    buffer.unshift((val & 0x7f) | 0x80);
  }
  return buffer;
}

interface RawMidiAction {
  timeSeconds: number;
  bytes: number[];
}

/**
 * Creates a valid Standard MIDI File (SMF Format 0) from an array of NoteEvents.
 */
export function serializeNotesToMidi(
  notes: NoteEvent[],
  options: MidiExportOptions
): Uint8Array {
  const bpm = options.bpm || 120;
  const ppq = options.ticksPerQuarterNote || 480;
  const timeNum = options.timeSignatureNumerator || 4;
  const timeDenom = options.timeSignatureDenominator || 4;
  const trackName = options.trackName || 'SONORA NoteForge';
  const offsetToZero = options.offsetToZero ?? true;
  const startOffset = options.startOffsetSeconds ?? 0;

  // Determine base time shift
  let timeShift = 0;
  if (offsetToZero) {
    if (startOffset > 0) {
      timeShift = startOffset;
    } else if (notes.length > 0) {
      const minStart = Math.min(...notes.map((n) => n.startSeconds));
      timeShift = minStart;
    }
  }

  // Ticks per second: (bpm / 60) * ppq
  const ticksPerSecond = (bpm / 60) * ppq;

  // Build list of timed raw actions
  const actions: RawMidiAction[] = [];

  // Track Name meta-event at time 0
  const trackNameBytes = Array.from(new TextEncoder().encode(trackName));
  actions.push({
    timeSeconds: 0,
    bytes: [0xff, 0x03, ...encodeVlq(trackNameBytes.length), ...trackNameBytes],
  });

  // Time Signature meta-event at time 0: FF 58 04 nn dd cc bb
  // dd is log2(denominator), so 4 -> 2, 8 -> 3
  const dd = Math.round(Math.log2(timeDenom));
  actions.push({
    timeSeconds: 0,
    bytes: [0xff, 0x58, 0x04, timeNum & 0xff, dd & 0xff, 24, 8],
  });

  // Tempo meta-event at time 0: FF 51 03 tt tt tt (microseconds per quarter note)
  const mpqn = Math.round(60000000 / bpm);
  actions.push({
    timeSeconds: 0,
    bytes: [
      0xff,
      0x51,
      0x03,
      (mpqn >> 16) & 0xff,
      (mpqn >> 8) & 0xff,
      mpqn & 0xff,
    ],
  });

  // Note on and note off events
  for (const note of notes) {
    const startSec = Math.max(0, note.startSeconds - timeShift);
    const endSec = Math.max(startSec + 0.01, startSec + note.durationSeconds);
    const pitch = Math.max(0, Math.min(127, Math.round(note.pitch)));
    const vel = Math.max(1, Math.min(127, Math.round(note.velocity || 80)));

    // Note On (Channel 0: 0x90)
    actions.push({
      timeSeconds: startSec,
      bytes: [0x90, pitch, vel],
    });

    // Pitch bends if requested
    if (options.includePitchBends && note.pitchBends && note.pitchBends.length > 0) {
      for (const pb of note.pitchBends) {
        const pbTime = Math.max(0, startSec + pb.timeOffset);
        // Standard pitch bend range is +/- 2 semitones = +/- 200 cents
        // Normalized 14-bit: 0 to 16383, center is 8192
        const bendFraction = Math.max(-1, Math.min(1, pb.bendCents / 200));
        const val14 = Math.round(8192 + bendFraction * 8191);
        const clamped14 = Math.max(0, Math.min(16383, val14));
        const lsb = clamped14 & 0x7f;
        const msb = (clamped14 >> 7) & 0x7f;
        actions.push({
          timeSeconds: pbTime,
          bytes: [0xe0, lsb, msb],
        });
      }
      // Reset pitch bend at end of note
      actions.push({
        timeSeconds: endSec,
        bytes: [0xe0, 0x00, 0x40], // center 8192
      });
    }

    // Note Off (Channel 0: 0x80)
    actions.push({
      timeSeconds: endSec,
      bytes: [0x80, pitch, 0x40],
    });
  }

  // Sort events chronologically. If times are identical, ensure NoteOff precedes NoteOn of same pitch, meta first
  actions.sort((a, b) => {
    if (Math.abs(a.timeSeconds - b.timeSeconds) > 1e-6) {
      return a.timeSeconds - b.timeSeconds;
    }
    // Meta events first
    const isAMeta = a.bytes[0] === 0xff;
    const isBMeta = b.bytes[0] === 0xff;
    if (isAMeta && !isBMeta) return -1;
    if (!isAMeta && isBMeta) return 1;

    // Note-offs (0x80) before Note-ons (0x90)
    const isANoteOff = (a.bytes[0] & 0xf0) === 0x80;
    const isBNoteOff = (b.bytes[0] & 0xf0) === 0x80;
    if (isANoteOff && !isBNoteOff) return -1;
    if (!isANoteOff && isBNoteOff) return 1;

    return 0;
  });

  // Convert to delta-times and generate MTrk bytes
  const trackBytes: number[] = [];
  let lastTick = 0;

  for (const action of actions) {
    const currentTick = Math.max(lastTick, Math.round(action.timeSeconds * ticksPerSecond));
    const deltaTick = currentTick - lastTick;
    lastTick = currentTick;

    const vlqDelta = encodeVlq(deltaTick);
    trackBytes.push(...vlqDelta);
    trackBytes.push(...action.bytes);
  }

  // End of Track meta event: delta 0, FF 2F 00
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  // Construct complete SMF (Header + 1 Track)
  const headerBytes = [
    // 'MThd'
    0x4d, 0x54, 0x68, 0x64,
    // Header length = 6
    0x00, 0x00, 0x00, 0x06,
    // Format 0 (single multi-channel track)
    0x00, 0x00,
    // Number of tracks = 1
    0x00, 0x01,
    // Division (PPQ)
    (ppq >> 8) & 0xff,
    ppq & 0xff,
  ];

  const trackLength = trackBytes.length;
  const trackHeader = [
    // 'MTrk'
    0x4d, 0x54, 0x72, 0x6b,
    // Track byte length (32-bit big endian)
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
  ];

  const fullFile = new Uint8Array(headerBytes.length + trackHeader.length + trackBytes.length);
  fullFile.set(headerBytes, 0);
  fullFile.set(trackHeader, headerBytes.length);
  fullFile.set(trackBytes, headerBytes.length + trackHeader.length);

  return fullFile;
}

/**
 * Creates a downloadable File or Blob from notes
 */
export function createMidiBlob(notes: NoteEvent[], options: MidiExportOptions): Blob {
  const bytes = serializeNotesToMidi(notes, options);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' });
}
