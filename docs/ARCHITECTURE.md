# SONORA NoteForge Architecture

## 1. Architectural Philosophy
SONORA NoteForge is an audio-to-MIDI transcription and sample-intelligence tool engineered for modern music producers.
The application adheres to strict separation of concerns across four independent layers:

```
+-------------------------------------------------------------+
|                          UI Layer                           |
|   Header | WaveformViewer | ChordLane | PianoRoll | Info    |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                    Musical Project Layer                    |
|   MusicalProject | NoteEvent | Scale | Chord | Quantization |
|                    UndoRedo State Manager                   |
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                       Analysis Layer                        |
|   AnalysisEngine | TranscriptionEngine | Onset | Key | Chord|
+-------------------------------------------------------------+
                              |
+-------------------------------------------------------------+
|                         Audio Layer                         |
|   AudioDecoder | WaveformData | AudioRegion | PlaybackSynth |
+-------------------------------------------------------------+
```

## 2. Layer Definitions

### UI Layer (`src/features/`)
- Contains React/MUI components for user interaction.
- Purely presentation and dispatch: no direct audio processing or DSP logic lives in React components.
- Components communicate via `useProject()` context.

### Musical Project Layer (`src/music/`, `src/state/`)
- Canonical domain model for musical entities: `NoteEvent`, `ChordEvent`, `MusicalKey`.
- Note events track MIDI pitch (21-108), start seconds, duration seconds, velocity (1-127), and optional continuous pitch bends (for expressive vocal portamento).
- `UndoRedoManager`: Snapshot history stack supporting instant non-destructive undo and redo.

### Analysis Layer (`src/analysis/`)
- `ITranscriptionEngine`: Abstract contract defining `analyse(buffer, settings, onProgress)`.
- `CoreTranscriptionEngine`: Web Audio DSP multi-pitch tracking engine implementing YIN/NSDF autocorrelation, spectral peak picking, vocal formant/consonant discrimination, bass sub-octave fundamental tracking, and polyphonic overtone filtering.
- `KeyEstimator`: Krumhansl-Schmuckler cognitive key profiles computing Pearson correlation against 12 Major and 12 Minor profiles.
- `ChordEstimator`: Multi-slice chroma template matching with root and bass inversion detection.
- `OnsetDetector`: Spectral flux novelty curve with adaptive moving-average peak picking.
- `TempoEstimator`: Inter-onset autocorrelation estimating BPM and half/double time candidates.

### Audio Layer (`src/audio/`)
- `AudioDecoder`: Browser Web Audio `decodeAudioData` wrapper for local decoding of WAV, MP3, FLAC, M4A, OGG.
- `AudioRegion`: Sample-accurate buffer slicing preserving original recordings.
- `WaveformData`: Multi-resolution peak & RMS computation for smooth 60fps canvas rendering.
- `AudioPlayback`: Synchronized dual audio/MIDI playback engine with looping and playhead synchronization.
- `MidiSynth`: 4-engine polyphonic preview synthesizer (Electric Piano, Warm Poly Synth, Plucked String, Sub Bass).
