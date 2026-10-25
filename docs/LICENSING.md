# SONORA NoteForge: Commercial Licensing & Third-Party Dependencies

## 1. Executive Summary
SONORA NoteForge is commercial software developed by SONORA. Every dependency, model, and algorithm integrated into the application has been audited for commercial redistribution compliance.

## 2. Dependency Audit & Rights Matrix

| Library / Component | Version | Source | Licence | Commercial Redistribution Status |
| :--- | :--- | :--- | :--- | :--- |
| **Material UI (MUI)** | 6.x | `@mui/material` | MIT | Permitted for commercial use without royalty. |
| **React & React-DOM** | 19.x | `react` | MIT | Permitted for commercial distribution. |
| **Emotion** | 11.x | `@emotion/react` | MIT | Permitted for commercial distribution. |
| **Lucide Icons** | 0.546.x | `lucide-react` | ISC / MIT | Permitted for commercial distribution. |
| **Vite** | 8.x | `vite` | MIT | Build tool, no runtime payload restriction. |

## 3. Machine Learning & Audio Engine Licensing Analysis

### Basic Pitch (Spotify)
- **Official Repository**: `https://github.com/spotify/basic-pitch-ts` & `https://github.com/spotify/basic-pitch`
- **Licence**: Apache License 2.0.
- **Commercial Status**: Permitted for commercial products with appropriate notice and copyright preservation.
- **Model Weights**: The pretrained weights are released under Apache 2.0.
- **Current Integration**: NoteForge uses a self-contained Web Audio DSP engine with an identical typed engine interface (`ITranscriptionEngine`), allowing drop-in loading of Basic Pitch ONNX/TFJS weights with zero architectural modifications.

### Essentia (MTG / Universitat Pompeu Fabra)
- **Official Repository**: `https://essentia.upf.edu/licensing_information.html`
- **Licence Notice**: Essentia's open-source distribution is governed by **AGPLv3**, which imposes copyleft obligations and is incompatible with proprietary commercial distributions without a separate commercial licence agreement from UPF.
- **SONORA Decision**: To guarantee total commercial compliance without third-party licensing encumbrances, SONORA NoteForge **does not integrate Essentia**. Instead, NoteForge implements original, clean-room algorithms for key estimation (K-S correlation) and chord estimation.

## 4. Audio Asset Licensing
All pre-bundled musical demonstration samples in `SampleBank.ts`:
- Generated procedurally using Web Audio API synthesis.
- 100% royalty-free and owned by SONORA.
- No third-party copyright sample packs or copyrighted recordings are bundled.
