# SONORA NoteForge: Testing & Quality Assurance Plan

## 1. Test Coverage Overview
SONORA NoteForge includes comprehensive automated unit tests covering the core domain models, mathematical transformations, audio region slicing, and Standard MIDI File binary serialization.

## 2. Test Suites (`src/tests/`)

### 1. `MidiSerializer.test.ts`
- Tests Variable-Length Quantity (VLQ) encoding (0, 127, 128, 16383, 2097151).
- Validates SMF Header Chunk (`MThd`) byte signature and format parameters.
- Validates Track Chunk (`MTrk`) byte signature and delta-time calculations.
- Verifies Note-On and Note-Off event pairing.
- Validates Tempo and Time-Signature meta-events.
- Validates continuous pitch bend serialization.

### 2. `KeyEstimator.test.ts`
- Tests Krumhansl-Schmuckler Pearson correlation against known musical passages (A Minor, C Major, F# Minor, G Major).
- Tests ambiguity detection between relative major/minor pairs.
- Validates scale pitch class membership.

### 3. `ChordEstimator.test.ts`
- Tests chord template recognition on synthetic pitch clusters (Major, Minor, 7th, Maj7, Min7, Sus4, Diminished).
- Tests bass pitch class detection for inverted chords (e.g., G/B, C/E).
- Tests contiguous time-slice merging.

### 4. `Quantization.test.ts`
- Tests 1/4, 1/8, 1/16, and 1/32 grid quantization at various BPMs.
- Tests strength interpolation ($0\%$ raw vs $100\%$ hard snap).
- Tests swing groove offset calculation on offbeat subdivisions.

### 5. `UndoRedo.test.ts`
- Validates state history stack depth.
- Validates `pushState`, `undo`, `redo`, `canUndo`, `canRedo`.
- Tests stack truncation on new actions following an undo.

## 3. Manual DAW Integration Testing Protocol
1. Load sample into NoteForge.
2. Select 4-bar loop section in waveform.
3. Choose Vocal or Instrument profile.
4. Execute "Analyze Region".
5. Verify notes in piano roll, correct any erroneous pitch with mouse drag.
6. Click "Export MIDI".
7. Drag the Draggable MIDI Card directly onto an empty MIDI track in Ableton Live / FL Studio.
8. Verify playback in DAW aligns with original audio tempo and pitch.
