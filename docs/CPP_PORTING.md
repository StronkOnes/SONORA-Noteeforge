# SONORA NoteForge: C++ & JUCE Porting Guide

## 1. Scope & Objective
This document outlines the architectural boundary and data structures designed to facilitate porting SONORA NoteForge into a native C++ application and JUCE VST3/AU/AAX audio plugin.

## 2. Core Boundary Architecture

```
+-------------------------------------------------------------+
|                      UI Layer (React)                       |
|   (Embedded via juce::WebBrowserComponent / WebView2 / CEF) |
+-------------------------------------------------------------+
                              |
                     JSON / Binary IPC
                              |
+-------------------------------------------------------------+
|               C++ Native Engine (JUCE AudioPlugin)          |
|   +-------------------------------------------------------+ |
|   | Audio Thread (Realtime safe, lock-free queues)        | |
|   | - Audio buffer playback / host sync                   | |
|   +-------------------------------------------------------+ |
|   +-------------------------------------------------------+ |
|   | Background Worker Thread                              | |
|   | - Multi-pitch transcription inference                 | |
|   | - Key & chord estimation                              | |
|   +-------------------------------------------------------+ |
+-------------------------------------------------------------+
```

## 3. Real-Time Safety & Threading Constraints
**CRITICAL**: Audio thread safety must be preserved at all costs.
- **Never run transcription on the real-time audio callback** (`processBlock`). Model inference and FFT-based peak picking allocate dynamic memory and require significant CPU cycles that cause audio dropouts/xruns.
- Analysis operations must execute on a dedicated `juce::ThreadPool` or background `juce::Thread`.
- Communication between the UI, audio thread, and worker thread must use lock-free FIFO ring buffers (`juce::AbstractFifo`).

## 4. Canonical C++ Data Structs

```cpp
namespace sonora {

struct PitchBendEvent {
    double timeOffsetSeconds;
    int16_t bendCents; // -200 to +200
};

struct NoteEvent {
    std::string id;
    uint8_t pitch;              // MIDI 0-127
    double startSeconds;
    double durationSeconds;
    uint8_t velocity;           // 1-127
    float confidence;           // 0.0 - 1.0
    bool fromTranscription;
    std::vector<PitchBendEvent> pitchBends;
};

struct MusicalKey {
    uint8_t rootPitchClass;     // 0-11
    std::string rootName;
    std::string mode;           // "major", "minor", etc.
    float confidence;
};

struct ChordEvent {
    std::string id;
    uint8_t rootPitchClass;
    std::string quality;        // "maj", "min", "7", "maj7", etc.
    std::string label;
    double startSeconds;
    double endSeconds;
    float confidence;
    std::vector<uint8_t> chordTones;
};

} // namespace sonora
```

## 5. Native MIDI Serializer & File Drag
In JUCE:
- `juce::MidiFile` and `juce::MidiSequence` can directly receive the `NoteEvent` list.
- Standard drag-and-drop to DAW is supported natively via `juce::DragAndDropContainer::startDragging(juce::var, ...)` and `juce::FileDragAndDropTarget::performExternalDragDropOfFiles()`.

## 6. Implementation Checklist for C++ Port
1. [ ] Wrap frontend in `juce::WebBrowserComponent`.
2. [ ] Replace Web Audio API decoding with `juce::AudioFormatManager` (supports WAV, AIFF, FLAC, MP3, Ogg).
3. [ ] Implement `CoreTranscriptionEngine` in modern C++20 using `juce::dsp::FFT`.
4. [ ] Bind IPC communication with `juce::WebBrowserComponent::Options::withNativeIntegrationEnabled()`.
