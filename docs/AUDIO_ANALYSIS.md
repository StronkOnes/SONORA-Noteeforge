# SONORA NoteForge: Audio Analysis & DSP Pipeline

## 1. Overview
The analysis layer processes arbitrary audio selections (from isolated vocal hooks to complex polyphonic chords and sub-bass lines) and produces structured musical data.

## 2. Onset & Rhythmic Detection
- **Spectral Flux**: Measures the positive difference in spectral energy across adjacent windowed frames:
  $$SF(m) = \sum_k H(|X(m, k)| - |X(m-1, k)|)$$
  where $H(x) = \frac{x + |x|}{2}$ (half-wave rectification).
- **Adaptive Thresholding**: Compares spectral flux against a local moving average to reject gradual swells and isolate distinct note attacks.

## 3. Pitch Tracking & Transcription Profiles

### Vocal Mode
- **Goal**: Monophonic melodic lines with expressive pitch bends and vibrato.
- **Unvoiced Consonant Rejection**: Evaluates zero-crossing rate (ZCR). Frames with high ZCR (>0.22) representing unvoiced fricatives ('s', 't', 'sh', 'f') and breath noise are suppressed from creating false pitch triggers.
- **Continuous Pitch Bends**: Deviations in cents from the median quantized note pitch are recorded in `pitchBends` (±200 cents range).

### Bass Mode
- **Goal**: Sub-bass and 808 fundamental tracking (30Hz - 250Hz).
- **Low-Frequency Resolution**: Frame size extended to 4096 samples at 44.1kHz (~92ms window) for sub-octave fundamental discrimination.
- **Harmonic Filtering**: Prevents higher overtones (2nd and 3rd harmonics) from erroneously creating separate notes in higher octaves.

### Polyphonic Instrument Modes (Piano, Guitar, Synth, Chords)
- **Multi-Pitch Peak Picking**: Evaluates discrete log-frequency semitone filters across active frames.
- **Overtone De-duplication**: When multiple peaks are detected, candidates matching integer multiples ($2f_0, 3f_0, 4f_0$) of an energetic fundamental within a 6% frequency margin are filtered out.
- **Fragment Merging**: Micro-pauses and contiguous frames of identical pitch are joined conservatively if the gap is less than 80ms.

## 4. Key & Mode Estimation
- **Chroma Representation**: A 12-dimensional duration-weighted pitch class distribution is compiled from transcribed notes and audio spectral frames.
- **Krumhansl-Schmuckler (K-S) Algorithm**: Computes the Pearson correlation coefficient $r$ against canonical cognitive tonal profiles:
  $$r(x, y) = \frac{\sum (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum (x_i - \bar{x})^2 \sum (y_i - \bar{y})^2}}$$
- **Ambiguity Detection**: Explicitly identifies relative major/minor pairs (e.g. C Major vs A Minor) and flags when tonal separation is below confidence margins.

## 5. Chord Recognition & Voicings
- Divides the audio selection into uniform time slices (500ms).
- Evaluates chroma against weighted templates:
  - Major (0, 4, 7)
  - Minor (0, 3, 7)
  - Dominant 7th (0, 4, 7, 10)
  - Major 7th (0, 4, 7, 11)
  - Minor 7th (0, 3, 7, 10)
  - Sus4 (0, 5, 7), Sus2 (0, 2, 7)
  - Diminished (0, 3, 6), Augmented (0, 4, 8)
  - Add9 (0, 4, 7, 2), Half-Diminished (0, 3, 6, 10)
- Identifies lowest active bass pitch for slash-chord inversions (e.g. G/B, C/E).
- Merges adjacent contiguous slices exhibiting identical chord classification.
