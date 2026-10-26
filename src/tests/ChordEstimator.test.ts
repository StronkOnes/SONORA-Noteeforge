/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { estimateChordsFromNotes } from '../analysis/ChordEstimator.ts';
import { NoteEvent } from '../music/NoteEvent.ts';
import { MusicalKey } from '../music/Scale.ts';
import { buildProChordVoicing, chordEventToNoteEvents } from '../music/Chord.ts';

describe('ChordEstimator & Pro Voicings', () => {
  const cMajorKey: MusicalKey = {
    rootPitchClass: 0,
    rootName: 'C',
    mode: 'major',
    confidence: 0.9,
    secondaryCandidates: [],
  };

  test('bounds chord estimation strictly to selected region', () => {
    // Notes at 2.0s - 4.0s (C Major triad)
    const notes: NoteEvent[] = [
      { id: '1', pitch: 48, startSeconds: 2.0, durationSeconds: 2.0, velocity: 90, source: 'user' }, // C3
      { id: '2', pitch: 64, startSeconds: 2.0, durationSeconds: 2.0, velocity: 85, source: 'user' }, // E4
      { id: '3', pitch: 67, startSeconds: 2.0, durationSeconds: 2.0, velocity: 85, source: 'user' }, // G4
    ];

    const chords = estimateChordsFromNotes(notes, 2.0, 4.0, cMajorKey, { mode: 'strict' });
    expect(chords.length).toBeGreaterThan(0);
    expect(chords[0].startSeconds).toBeGreaterThanOrEqual(1.95);
    expect(chords[0].endSeconds).toBeLessThanOrEqual(4.05);
    expect(chords[0].label).toContain('C');
  });

  test('recognizes Cmaj7 over plain C when B is sustained', () => {
    // Cmaj7: C3, E4, G4, B4
    const notes: NoteEvent[] = [
      { id: '1', pitch: 48, startSeconds: 0, durationSeconds: 2.0, velocity: 90, source: 'user' }, // C3
      { id: '2', pitch: 64, startSeconds: 0, durationSeconds: 2.0, velocity: 85, source: 'user' }, // E4
      { id: '3', pitch: 67, startSeconds: 0, durationSeconds: 2.0, velocity: 85, source: 'user' }, // G4
      { id: '4', pitch: 71, startSeconds: 0, durationSeconds: 2.0, velocity: 88, source: 'user' }, // B4
    ];

    const chords = estimateChordsFromNotes(notes, 0, 2.0, cMajorKey, { mode: 'strict' });
    expect(chords.length).toBe(1);
    expect(chords[0].quality).toBe('maj7');
    expect(chords[0].label).toBe('Cmaj7');
  });

  test('recognizes first inversion with 3rd in the bass (C/E)', () => {
    // C Major first inversion: E2/E3 as lowest note, with C4 and G4
    const notes: NoteEvent[] = [
      { id: '1', pitch: 40, startSeconds: 0, durationSeconds: 2.0, velocity: 92, source: 'user' }, // E2 (bass)
      { id: '2', pitch: 60, startSeconds: 0, durationSeconds: 2.0, velocity: 85, source: 'user' }, // C4
      { id: '3', pitch: 67, startSeconds: 0, durationSeconds: 2.0, velocity: 80, source: 'user' }, // G4
    ];

    const chords = estimateChordsFromNotes(notes, 0, 2.0, cMajorKey, { mode: 'strict' });
    expect(chords.length).toBe(1);
    expect(chords[0].rootPitchClass).toBe(0); // C
    expect(chords[0].inversion).toBe('first');
    expect(chords[0].label).toBe('C/E');
  });

  test('buildProChordVoicing outputs ascending pitches with grounded bass in octave 2', () => {
    // Am7 voicing
    const voicing = buildProChordVoicing(9, 'min7', 9, 'root', { bassOctave: 2 });
    expect(voicing.length).toBeGreaterThanOrEqual(4);
    // Bass note should be A1/A2 (MIDI 33 or 45, octave 2)
    expect(voicing[0]).toBeLessThan(48);
    // Upper notes should be sorted ascending
    for (let i = 0; i < voicing.length - 1; i++) {
      expect(voicing[i]).toBeLessThan(voicing[i + 1]);
    }
  });

  test('chordEventToNoteEvents distributes musical velocities by role', () => {
    const chord = {
      id: 'test_chord',
      rootPitchClass: 0,
      quality: 'maj' as const,
      label: 'C',
      startSeconds: 1.0,
      endSeconds: 3.0,
      confidence: 0.95,
      chordTones: [0, 4, 7],
      bassPitchClass: 0,
      inversion: 'root' as const,
    };

    const noteEvents = chordEventToNoteEvents(chord, { defaultVelocity: 85 });
    expect(noteEvents.length).toBeGreaterThanOrEqual(3);
    // Bass note has highest foundational velocity
    const bassEvent = noteEvents[0];
    expect(bassEvent.velocity).toBeGreaterThanOrEqual(88);
    expect(bassEvent.durationSeconds).toBeCloseTo(1.98, 1);
  });
});
