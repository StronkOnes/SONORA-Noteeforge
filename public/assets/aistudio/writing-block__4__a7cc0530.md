# SONORA NoteForge
## Product Specification and Implementation Plan

**Product category:** Audio-to-MIDI transcription and sample analysis for music producers  
**Brand:** SONORA  
**Platform:** Local-first web application, designed for future native C++/JUCE integration  
**Initial stack:** React, TypeScript, Vite, Material UI (MUI), Web Audio API  
**Primary goal:** Turn a selected section of audio into editable MIDI notes, identify its likely key and chords, and get the result into a DAW quickly.

---

# 1. Product vision

Build SONORA NoteForge for producers who sample music and want to extract useful musical information without manually figuring out every note.

A user should be able to import a sample, select a musical section, identify whether they are analysing vocals or instruments, detect notes and chords, discover the likely key, correct the transcription visually, and export the result as MIDI.

The experience should feel like a focused music-production tool rather than a general audio editor or a complicated digital audio workstation.

### Core promise

**Find the notes. Discover the key. Make the sample yours.**

### Target users

- Hip-hop and trap producers.
- Amapiano, gqom, Afro-house and other dance-music producers.
- Sample-based beatmakers.
- Songwriters extracting vocal melodies.
- Producers transcribing bass lines, piano riffs, guitar phrases and synth melodies.
- Musicians who want to understand the harmony of a sample.

### Product principles

1. Musical accuracy matters more than the number of features.
2. Users must be able to correct imperfect transcription results.
3. Original audio must never be overwritten.
4. Key detection must provide confidence and acknowledge ambiguity.
5. Every enabled control must perform a real operation.
6. The application should work locally without a required account or paid cloud API.
7. The interface and audio engine must remain separate for future native development.

---

# 2. The main user workflow

The primary workflow must be straightforward.

1. Import an audio sample.
2. Select the section to analyse.
3. Select the analysis mode.
4. Run analysis.
5. Inspect the detected notes, chords, key and scale.
6. Correct the piano roll.
7. Audition the extracted MIDI.
8. Export a MIDI file or use supported drag-and-drop.
9. Import the result into Ableton Live, FL Studio or another compatible DAW.

Do not force users to navigate through separate screens for every step. The principal workspace should present the waveform, analysis controls, piano roll and musical information in a coherent layout.

# 3. Technology and architecture

## 3.1 Required stack

- React.
- TypeScript with strict type checking.
- Vite.
- Material UI.
- Web Audio API for decoding, playback, auditioning and waveform generation.
- Web Workers where supported and useful for CPU-intensive analysis.
- Vitest for unit and integration tests.
- A MIDI file library or a small tested MIDI writer.
- IndexedDB only if needed for local project persistence.

Do not use Tailwind CSS.

Do not introduce Next.js merely to solve an audio-processing problem. Server rendering is not required for the core local application.

## 3.2 Separation of concerns

Maintain four independent layers:

**UI layer**
- Workspace layout.
- Waveform and region selection.
- Piano roll.
- Musical information panels.
- Controls, playback and export.

**Audio layer**
- Audio decoding.
- Playback and seeking.
- Region extraction.
- Sample-rate conversion where required.
- Waveform and spectral data.

**Analysis layer**
- Note transcription.
- Key and scale estimation.
- Chord recognition.
- Timing and onset analysis.
- Confidence and diagnostics.

**Musical project layer**
- Notes, velocities and durations.
- Chords and key metadata.
- Tempo and time signature.
- User edits and undo/redo.
- MIDI generation and export.

The analysis engine must not manipulate React components directly.

## 3.3 Suggested directory structure

Adapt the structure to the existing repository if one exists.

```text
src/
  app/
  components/
  features/
    import/
    waveform/
    region-selection/
    analysis/
    key-detection/
    chord-detection/
    piano-roll/
    timing/
    export/
  audio/
    AudioLoader.ts
    AudioDecoder.ts
    AudioPlayback.ts
    AudioRegion.ts
    WaveformData.ts
  analysis/
    AnalysisEngine.ts
    TranscriptionEngine.ts
    KeyEstimator.ts
    ChordEstimator.ts
    OnsetDetector.ts
    TempoEstimator.ts
    Confidence.ts
  music/
    NoteEvent.ts
    MusicalProject.ts
    Scale.ts
    Chord.ts
    Quantization.ts
    MidiSerializer.ts
  state/
    ProjectStore.ts
    UndoRedo.ts
  workers/
  theme/
  utils/
  tests/

docs/
  ARCHITECTURE.md
  AUDIO_ANALYSIS.md
  MIDI_EXPORT.md
  LICENSING.md
  CPP_PORTING.md
  TESTING.md
```

Do not create empty modules for speculative features. Add modules as their responsibilities are implemented.

---

# 4. Import and section selection

## 4.1 Audio import

Support browser-decodable audio formats, prioritising WAV, MP3, FLAC and M4A where supported.

Provide:

- File picker.
- Drag-and-drop import.
- Filename and duration.
- Sample rate and channel count.
- Clear decoding and unsupported-format errors.
- Original recording preservation.

Do not upload audio to a remote service by default.

Long files should be handled carefully. Avoid unnecessary full-file copies and provide an appropriate warning if the browser does not have enough memory.

## 4.2 Waveform

Render the actual audio waveform.

Required controls:

- Play, pause and stop.
- Playhead.
- Seek.
- Zoom.
- Horizontal navigation.
- Loop playback.
- Region start and end handles.
- Clear selected-region highlighting.

The selected region must be used by the analysis engine. Do not analyse the entire recording when the user has selected a smaller section.

Keep the waveform and piano-roll timeline aligned.

Allow the user to audition the selected region before analysis.

## 4.3 Region boundaries

Preserve precise region positions in seconds and samples.

Where analysis windows need additional context, the engine may read a small amount of audio outside the selected region, but it must not produce unrelated notes outside the intended selection.

MIDI timestamps must be correctly offset so the user can choose between:

- Exporting the region starting at MIDI time zero.
- Preserving its position relative to the original recording when the project supports that workflow.

---

# 5. Analysis modes

The mode selector is one of the most important parts of NoteForge.

The user must explicitly choose the type of material being analysed.

## 5.1 Vocal

Purpose: extract a sung, rapped or hummed melodic line.

Behaviour:

- Prioritise a monophonic melody.
- Detect pitch changes and note durations.
- Reduce false notes caused by breaths, consonants and background instruments.
- Where supported, preserve pitch bends and expressive slides.
- Allow the user to decide whether vibrato should be represented as pitch-bend data or simplified into conventional MIDI notes.
- Display the extracted melody as editable piano-roll notes.

The vocal mode should not automatically assume that every detected sound is a pitched note. Unvoiced consonants, breaths and noisy vocal attacks can confuse transcription models.

Provide a setting to choose between:

- Expressive transcription.
- Clean MIDI melody.

Expressive transcription attempts to preserve useful pitch movement. Clean MIDI melody prioritises discrete notes suitable for editing and playing through a synthesizer.

Do not promise accurate separation of a vocal from a complete mix unless a real source-separation model is integrated.

## 5.2 Melody / Instrument

Purpose: extract a lead, bass or other pitched instrument line.

Provide an instrument-profile selector:

- Bass.
- Piano.
- Guitar.
- Synth.
- Other pitched instrument.

These profiles should change meaningful analysis settings or model selection.

### Bass

Prioritise low-frequency pitches, longer sustained notes, slides and reduced false detections from harmonics.

### Piano

Allow polyphonic note detection, repeated notes, overlapping note releases and chordal passages.

### Guitar

Support polyphonic passages and, where supported, slides and bends. Recognise that distortion, overlapping strings and strong overtones can produce octave errors.

### Synth

Provide profiles suitable for sustained leads, plucks and bass sounds. These should be tested separately rather than relying on instrument labels alone.

### Other

Use the general transcription engine without pretending that a dedicated model exists.

The instrument selector is a musical analysis preference, not a guarantee that the system can identify the instrument automatically.

## 5.3 Chords / Harmony

Purpose: detect simultaneous notes and infer chord labels.

Provide:

- Detected chord names.
- Chord start and end times.
- Individual chord tones.
- Inversions where sufficiently supported.
- Alternative chord interpretations when confidence is low.
- Editable chord regions.
- Ability to audition a chord.
- Ability to export the chord tones as MIDI.

Chord detection must not simply label every group of simultaneous notes as a chord. Sustained notes, melodic overlaps, passing tones and harmonic overtones can create misleading combinations.

Keep the original note transcription accessible so the user can correct the chord interpretation.

---

# 6. Transcription engine

## 6.1 First candidate: Spotify Basic Pitch

Evaluate the TypeScript implementation of Spotify Basic Pitch as the first transcription engine.

Official repository:

https://github.com/spotify/basic-pitch-ts

Python implementation and documentation:

https://github.com/spotify/basic-pitch

Basic Pitch is a lightweight automatic music-transcription system that can detect polyphonic notes and pitch bends. Its repository is licensed under Apache 2.0.

It is a promising starting point for the commercial product, subject to verification of the exact package version, dependencies and bundled assets.

### Important limitations

- It works best on one instrument at a time.
- Mixed recordings are harder than isolated instruments.
- Background instruments can produce false notes.
- Low-frequency bass notes can be confused with harmonics.
- Note onset and offset boundaries may need correction.
- Expressive vocals and pitch bends may not translate perfectly into conventional MIDI.
- A polyphonic model does not guarantee correct chord names.
- A successful transcription does not automatically produce a correct musical key.

Do not treat model output as ground truth.

## 6.2 Engine interface

Create a typed transcription contract independent of the model implementation.

Conceptually:

```ts
interface TranscriptionEngine {
  analyse(
    audio: AudioBufferData,
    settings: TranscriptionSettings,
    onProgress?: (progress: number) => void
  ): Promise<TranscriptionResult>;

  cancel?(): void;
}
```

Define the actual types for audio data, settings, note events, pitch bends, warnings and errors.

The contract must not depend on React.

## 6.3 Model execution

Evaluate whether the selected TypeScript package runs efficiently in the supported browsers.

If it requires substantial CPU time:

- Move inference to a Web Worker where supported.
- Show genuine progress if the engine provides it.
- Allow cancellation when technically feasible.
- Prevent multiple overlapping analysis jobs.
- Release large audio buffers when no longer needed.
- Provide a useful error if the model cannot be loaded.

Do not simulate progress with timers.

If a model requires downloading weights, disclose that the first use needs the model files. Cache them locally where appropriate and legally permitted.

Do not require a cloud service to perform transcription.

## 6.4 Post-processing

Add a separate note-cleanup stage after model inference.

Possible operations:

- Remove detections below a configurable confidence threshold.
- Merge fragments that are clearly parts of the same sustained note.
- Separate repeated notes when there is evidence of a new onset.
- Remove extremely short false detections.
- Correct obvious timing inconsistencies.
- Detect likely octave errors.
- Preserve intentional overlaps.
- Retain expressive pitch bends where requested.

These operations must be conservative. The system must not merge every adjacent repeated note or delete short musical notes simply because they are short.

Allow users to adjust cleanup settings and rerun post-processing without rerunning expensive model inference whenever possible.

---

# 7. Key and scale detection

## 7.1 Required output

Display:

- Most likely key.
- Major or minor mode.
- Confidence.
- Alternative key candidates when appropriate.
- The scale notes.
- A visual highlight of notes belonging to the selected scale.

Example output:

**Likely key: A minor**

Confidence: High, Medium or Low, supported by an internal score and clearly defined scoring method.

The application must not present a raw model score as a calibrated probability unless calibration has been validated.

## 7.2 Estimation approach

Implement a key-estimation module that can use:

1. The selected audio region.
2. A chroma or pitch-class representation of the audio.
3. The extracted MIDI note events when available.
4. Chord estimates as supporting evidence.
5. Duration-weighted pitch-class information.
6. A tonal profile or tested key-scoring method.

Compare key candidates against major and minor profiles. Account for the fact that relative major and minor keys share the same pitch collection.

The key estimator should consider harmonic evidence and note emphasis, not merely count which pitch classes occur most frequently.

Where practical, allow the user to select whether the key estimate should prioritise the original audio, extracted notes or detected chords.

## 7.3 Confidence and ambiguity

Confidence must reflect evidence quality.

Show a low-confidence warning when:

- The region is too short.
- The material is mainly percussion.
- Too few distinct pitches are detected.
- The sample is highly chromatic.
- The key is ambiguous between relative major and minor.
- The sample changes key.
- The audio contains multiple unrelated musical layers.

Do not force a definitive key on every sample.

Allow the user to override the detected key manually.

## 7.4 Commercial licensing

Evaluate the implementation and licensing of any third-party key-detection library before integration.

Essentia contains relevant music-analysis algorithms, but its standard library licensing is AGPLv3 for non-commercial applications and commercial use may require a separate licence. Its pretrained models have separate licensing conditions.

Do not integrate Essentia into a paid SONORA product without first resolving the applicable commercial licence and dependencies.

A practical initial alternative is to implement and test a chroma-based key estimator using permissively licensed or original code, with a clearly documented algorithm and its limitations.

---

# 8. Chord detection

## 8.1 Required chord display

Display a timeline of chord regions aligned with the waveform and piano roll.

Each region should include:

- Chord label.
- Root note.
- Chord quality.
- Start and end time.
- Confidence.
- Detected chord tones.

Support common chord types first:

- Major.
- Minor.
- Diminished.
- Augmented.
- Major seventh.
- Minor seventh.
- Dominant seventh.
- Sus2 and sus4.
- Add9 where evidence supports it.

Add extended jazz chords only after the basic chord recognition and inversion logic are reliable.

## 8.2 Chord inference

Use a combination of pitch-class evidence, simultaneous note events and temporal stability.

The algorithm should consider:

- Candidate roots.
- Chord templates.
- Bass-note evidence.
- Note durations.
- Harmonic context.
- Alternative inversions.
- Confidence.

Do not infer an exact chord merely from the presence of a root note and one possible interval.

When the evidence is insufficient, show an uncertain label or offer alternatives.

## 8.3 Editable chords

The user must be able to:

- Change a chord label manually.
- Inspect and edit its component notes.
- Split a chord region.
- Merge adjacent compatible chord regions.
- Audition the chord.
- Export the corrected notes.

Changing a chord label should not silently overwrite the note transcription. Provide an explicit operation when the user wants to replace the detected notes with the chosen chord tones.

---

# 9. Piano-roll editor

The piano roll is a core feature, not a future placeholder.

## 9.1 Display

Show:

- Vertical pitch axis.
- Horizontal musical-time axis.
- Piano-key labels.
- Note rectangles.
- Note duration.
- Playhead.
- Selected note highlighting.
- Scale highlighting.
- Optional velocity lane.
- Optional pitch-bend lane.

The piano roll must display actual transcription output or user-created notes.

## 9.2 Editing operations

Implement:

- Select a note.
- Select multiple notes.
- Move notes in pitch.
- Move notes in time.
- Resize note starts and ends.
- Add notes.
- Delete notes.
- Split notes.
- Merge compatible adjacent notes.
- Duplicate notes.
- Transpose selected notes.
- Undo.
- Redo.

Support keyboard shortcuts for common editing actions.

Provide visible selection feedback and avoid accidental edits during scrolling or zooming.

## 9.3 Note model

Use a canonical note-event model such as:

```ts
interface NoteEvent {
  id: string;
  pitch: number;
  startSeconds: number;
  durationSeconds: number;
  velocity: number;
  confidence?: number;
  source: "transcription" | "user";
}
```

Extend this model when required for pitch bends, MIDI channels or expressive events.

Do not store the same note's timing in unrelated representations that can drift out of sync.

## 9.4 Undo and redo

All meaningful edits must be undoable.

This includes note creation, deletion, movement, resizing, quantisation, transposition and chord-driven note replacement.

Use a tested command-history or snapshot strategy. Avoid storing a complete copy of a large audio buffer for every MIDI edit.

Provide undo and redo buttons, with conventional keyboard shortcuts.

---

# 10. Timing, tempo and groove

## 10.1 Tempo detection

Estimate tempo from the selected region using onset and rhythmic evidence.

Display:

- Estimated BPM.
- Confidence or reliability.
- Optional alternative tempo candidates where ambiguity exists.

Allow manual tempo entry.

Do not assume the fastest or strongest detected periodicity is always the true musical tempo. Half-time and double-time interpretations are common.

## 10.2 Quantisation

Provide selectable grid resolutions, including:

- 1/4.
- 1/8.
- 1/16.
- 1/32.
- Triplet divisions where appropriate.

Support adjustable quantisation strength.

Quantisation should operate on a copy or through an undoable project edit, preserving the ability to restore original timing.

Do not automatically quantise every transcription.

## 10.3 Groove and swing

Provide:

- Preserve original timing.
- Straight-grid quantisation.
- Swing adjustment.
- Adjustable strength or amount.
- Undoable timing changes.

Swing should move appropriate subdivisions rather than apply arbitrary random offsets.

The user must be able to audition the change before exporting.

## 10.4 Time signature

Start with 4/4 support and add other common time signatures when the timeline and MIDI serializer can represent them correctly.

Do not hardcode every sample to 4/4 without telling the user.

---

# 11. Scale highlighting and correction

Use the detected or manually selected key to highlight in-scale pitches in the piano roll.

Provide:

- Automatic key selection from analysis.
- Manual root-note selection.
- Major and minor scales.
- A scale-highlight toggle.
- An optional out-of-scale note indicator.
- An optional scale-correction command.

**Highlighting and correction are separate functions.**

By default, scale highlighting must not alter notes.

If the user chooses scale correction, provide a preview of the changes and allow the user to accept or undo them.

Do not force every note into the selected scale. Chromatic passing notes, blue notes, slides and intentional dissonances may be musically correct.

Where a note has two equally close scale pitches, avoid silent arbitrary choices. Make the correction inspectable.

---

# 12. MIDI export and DAW integration

## 12.1 Standard MIDI export

Implement correct Standard MIDI File export.

The export must contain:

- Correct note-on events.
- Correct note-off events.
- Correct note durations.
- Correct tempo metadata.
- Correct time-signature metadata where supported.
- Correct pitch values.
- Correct velocities.
- Correct track structure.

Support exporting the selected region or the complete transcription.

Where expressive transcription is enabled and supported, preserve pitch-bend events correctly.

## 12.2 MIDI timing

Convert project time to MIDI ticks using a defined resolution and tempo map.

Avoid rounding errors that cause notes to shift, overlap unexpectedly or acquire incorrect durations.

Verify that note-on and note-off events are paired correctly, including when notes overlap.

Test the generated MIDI in independent MIDI readers and at least one target DAW.

Do not simply rename JSON data to `.mid`. The file must be a valid Standard MIDI File.

## 12.3 Drag MIDI into a DAW

Provide a draggable MIDI export surface when the browser and target environment support it.

Investigate browser drag-and-drop data transfer using the correct MIDI file representation and MIME handling.

The preferred behaviour is to generate a valid `.mid` file and expose it through the drag operation.

However, browser support, operating-system handling and DAW-specific import behaviour vary. Test this feature in the actual supported combinations.

**File export remains the reliable fallback.**

Provide a prominent Download MIDI action even when drag-and-drop is available.

Do not claim universal DAW drag-and-drop compatibility without testing it.

## 12.4 Export options

Include:

- Selected region or complete transcription.
- One combined MIDI track.
- Separate tracks when there are multiple independently transcribed sources.
- Optional quantised export.
- Optional expressive pitch-bend export.
- Meaningful filename.
- Correct tempo and time-signature metadata.

Do not add export options that do not have a real implementation.

---

# 13. Playback and MIDI auditioning

Allow the user to audition the extracted notes before exporting.

Provide:

- Play and stop.
- Loop playback.
- Tempo control.
- Selected-note audition.
- Chord audition.
- Original audio playback.
- MIDI preview playback.
- Optional preview instrument where a legally distributable sound source is available.

Keep source audio and MIDI preview timing aligned.

Make it obvious whether the user is listening to the original sample or the synthesized MIDI result.

Do not bundle copyrighted instrument samples without the necessary permissions.

---

# 14. User interface and SONORA design

## 14.1 Visual identity

Use the established SONORA direction:

- Near-black and charcoal backgrounds.
- Silver and light-grey typography.
- Restrained amber accents.
- Clear, professional spacing.
- Strong visual hierarchy.
- Functional waveforms and musical visualisation.
- No unnecessary gradients or decorative clutter.

Use the existing approved SONORA wordmark if available. Do not invent a replacement logo.

## 14.2 Main workspace layout

Design a single primary workspace with:

**Header**
- SONORA NoteForge.
- Current project or sample name.
- Save/export actions.

**Left or upper panel**
- Import.
- Analysis region.
- Analysis mode.
- Instrument profile.
- Analyze button.

**Main panel**
- Waveform.
- Region selection.
- Transport.
- Piano roll.
- Timeline and playhead.

**Right panel**
- Detected key and scale.
- Chord timeline or chord list.
- Analysis confidence.
- Cleanup and timing controls.

**Bottom or secondary lane**
- Velocity.
- Pitch bend where available.
- Analysis warnings and processing status.

The layout must adapt to smaller screens, although desktop production use is the priority.

## 14.3 Honest status indicators

Distinguish between:

- Ready to analyse.
- Analysing.
- Analysis complete.
- Partial result.
- Low-confidence result.
- Failed analysis.
- Unsupported feature.

Do not use decorative progress bars or show success when the analysis has failed.

---

# 15. Local operation and project persistence

The core workflow must not require an account.

Prefer local processing and local project storage.

If project saving is implemented, preserve:

- Sample reference or locally stored audio where appropriate.
- Selected region.
- Analysis mode.
- Detected notes.
- Key and chord results.
- User edits.
- Tempo and time signature.
- Current export settings.

If the browser cannot retain the imported audio between sessions, explain that limitation and allow the user to reopen the source file.

Do not upload samples without explicit user consent.

---

# 16. Commercial licensing and research requirements

This is a paid SONORA product, so licensing must be reviewed before distribution.

## 16.1 Basic Pitch

Official TypeScript repository:

https://github.com/spotify/basic-pitch-ts

Python repository:

https://github.com/spotify/basic-pitch

The published project uses Apache 2.0. Verify the exact selected package version, model files, dependencies and distribution obligations before release.

Maintain the relevant licence notices.

## 16.2 Essentia

Official licensing information:

https://essentia.upf.edu/licensing_information.html

Essentia includes useful music-analysis algorithms, including key and other music-information analysis. However, its standard library licence is AGPLv3 for non-commercial applications, with commercial licensing available through the rights holder. Pretrained models have separate licensing restrictions.

Do not assume that an open-source repository or a downloadable model is automatically cleared for a commercial product.

## 16.3 Other libraries

For every dependency, model and optional sound library, document:

- Name and version.
- Source repository.
- Licence.
- Commercial redistribution status.
- Attribution requirements.
- Model-weight licence.
- Third-party dependency restrictions.
- Whether modifications are required for distribution.

Create `docs/LICENSING.md`.

Do not ship a dependency whose commercial-use requirements remain unresolved.

## 16.4 Research and benchmarking

Before committing to an engine, evaluate:

- Basic Pitch TypeScript performance in supported browsers.
- Accuracy on isolated vocal melodies.
- Accuracy on bass lines.
- Accuracy on piano and synth passages.
- Accuracy on polyphonic chords.
- Performance on mixed samples.
- Key-estimation reliability.
- Chord-recognition reliability.
- CPU and memory use.
- Model loading and offline behaviour.
- Compatibility with future native C++ integration.

Do not use a single successful example as evidence of general accuracy.

---

# 17. Future C++/JUCE compatibility

The first deliverable is the working web application. Do not build the VST3 plugin now.

Prepare a documented boundary for future native integration.

The future architecture should support:

- A shared C++ transcription and music-analysis engine where practical.
- A standalone native application.
- A JUCE plugin for supported in-DAW workflows.
- A reusable interface, embedded through a suitable native web-view solution or ported without redesign.
- Stable parameter and project-data schemas.

Keep model inference, audio operations and musical project data separate from React state.

Document the limitations of running browser-oriented machine-learning code in a native real-time audio thread. Do not run heavyweight model inference directly in the DAW's real-time audio callback.

The future plugin may require asynchronous processing, offline analysis or a separate worker thread. Audio-thread safety must be designed explicitly.

Create `docs/CPP_PORTING.md` explaining:

- The UI and processing boundary.
- The canonical note-event representation.
- Analysis-engine interfaces.
- Key and chord data structures.
- MIDI timing representation.
- Browser-specific dependencies.
- Model runtime requirements.
- Possible native implementation strategies.
- Licence constraints for native redistribution.

Do not claim that a browser model can be dropped directly into JUCE without adaptation.

---

# 18. Testing and quality assurance

## 18.1 Unit tests

Test:

- Audio-region selection and time conversion.
- Note-event validation.
- MIDI tick conversion.
- Note-on and note-off pairing.
- Tempo and time-signature serialization.
- Key-profile scoring.
- Chord-template scoring.
- Quantisation.
- Swing transformations.
- Scale membership and correction.
- Undo and redo.
- Invalid parameters.
- Export file structure.

## 18.2 Transcription evaluation

Build a small development test set of legally usable recordings with known MIDI ground truth.

Include:

- Monophonic singing.
- Humming.
- Bass.
- Piano chords.
- Guitar.
- Synth leads.
- Short plucks.
- Sustained notes.
- Repeated notes.
- Slides and bends.
- Mixed and noisy samples.

Measure note-onset accuracy, pitch accuracy, duration error and false detections.

Evaluate key and chord estimation separately from transcription accuracy.

Keep test samples and reference MIDI files clearly labelled.

## 18.3 Manual tests

Confirm that a user can:

1. Import a sample.
2. Select a short region.
3. Choose Vocal mode.
4. Extract a vocal melody.
5. Inspect the piano roll.
6. Move and resize notes.
7. Undo and redo changes.
8. Detect the likely key.
9. View chord names and tones.
10. Highlight the scale.
11. Quantise or preserve original timing.
12. Audition the result.
13. Export a valid MIDI file.
14. Open the file in a target DAW.
15. Compare the result with the original audio.

Repeat equivalent tests with bass, piano and polyphonic material.

## 18.4 Performance tests

Measure:

- Initial load time.
- Model download and initialisation time.
- Analysis time by sample duration.
- Peak memory use.
- Cancellation behaviour.
- Behaviour on lower-powered computers.
- Handling of large samples.

Do not assume that a model's published performance on another machine predicts its performance in this application.

---

# 19. Phased implementation plan

## Phase 0 — Repository audit and technical proof

- Inspect the existing repository.
- Confirm the framework and dependencies.
- Verify the Basic Pitch TypeScript package and model runtime.
- Test inference using a small vocal recording, bass line and polyphonic instrument example.
- Verify commercial licensing for selected dependencies.
- Record the current build and test status.

**Exit criteria:** a working transcription proof of concept and a documented technical plan.

## Phase 1 — Core audio workspace

- Build import and decoding.
- Render the real waveform.
- Implement playback and seeking.
- Implement precise region selection.
- Add analysis-mode selection.
- Establish typed project and audio models.

**Exit criteria:** a user can import a recording and select the exact section to analyse.

## Phase 2 — Real transcription

- Integrate the selected transcription engine.
- Implement vocal and instrument profiles.
- Run analysis on the selected region.
- Convert predictions into canonical note events.
- Display the results in the piano roll.
- Implement error handling and progress.

**Exit criteria:** real audio produces editable MIDI note events.

## Phase 3 — Piano-roll editing

- Add note selection.
- Implement moving and resizing.
- Implement note creation and deletion.
- Add splitting and merging.
- Implement undo and redo.
- Add basic auditioning.

**Exit criteria:** the user can correct the transcription without leaving the app.

## Phase 4 — Key, scale and chord analysis

- Implement key estimation.
- Add major/minor interpretation and confidence.
- Implement scale highlighting.
- Add chord detection and chord-tone display.
- Support manual key and chord corrections.
- Display ambiguous results honestly.

**Exit criteria:** key and chord analysis is testable independently and useful on the supported test set.

## Phase 5 — Timing and groove

- Implement tempo estimation.
- Add manual tempo override.
- Implement quantisation and strength.
- Add swing controls.
- Preserve original timing.
- Make every timing edit undoable.

**Exit criteria:** timing adjustments are audible, inspectable and reversible.

## Phase 6 — MIDI export and DAW workflow

- Implement Standard MIDI File serialization.
- Include tempo and time signature.
- Preserve expressive pitch bends when supported.
- Add drag-and-drop MIDI where verified.
- Retain download as the fallback.
- Test the files in independent readers and target DAWs.

**Exit criteria:** exported MIDI opens correctly and has the expected timing and note content.

## Phase 7 — Polish and portability

- Refine the SONORA interface.
- Add project persistence if appropriate.
- Optimise model execution.
- Run the full test suite.
- Complete licensing documentation.
- Complete native-port documentation.
- Fix build errors and regressions.

**Exit criteria:** a stable, documented application with an honest feature set.

---

# 20. Out of scope for the first release

Do not delay the core product to implement:

- Full stem separation.
- Automatic arrangement generation.
- Full song composition.
- Advanced orchestration.
- Full DAW functionality.
- Real-time VST3 transcription.
- Automatic identification of every instrument.
- Guaranteed perfect transcription of complete mixed songs.

These may be evaluated later, once the core workflow is reliable.

---

# 21. Definition of done

The initial NoteForge release is complete when:

- Audio can be imported locally.
- The user can select a precise region.
- Vocal, instrument and chord-analysis modes are available.
- Real transcription runs through a working analysis engine.
- Detected notes appear in an editable piano roll.
- Key and scale detection returns meaningful results and confidence.
- Chord names and chord tones can be inspected and corrected.
- Scale highlighting does not alter notes by default.
- Piano-roll editing supports undo and redo.
- Timing can be quantised or preserved.
- MIDI exports as a valid Standard MIDI File.
- Drag-and-drop is available in verified target environments, with file export as a fallback.
- Tests cover musical data, editing and export.
- Dependencies and model licences are documented.
- The production build succeeds.
- The C++/JUCE integration boundary is documented.
- No visible feature falsely claims functionality that has not been implemented.

## Final development instruction

Build SONORA NoteForge incrementally in the existing repository if one is provided. Inspect before changing, test each phase and preserve working code.

Prioritise a reliable end-to-end workflow over an oversized feature list.

**The first milestone is simple: import a vocal or instrument sample, select a section, extract real notes, edit them on a piano roll and export MIDI that opens correctly in a DAW.**

Once that works reliably, add key detection, chord recognition and the remaining musical intelligence.
