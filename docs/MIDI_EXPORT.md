# SONORA NoteForge: Standard MIDI File (SMF) Export & DAW Integration

## 1. SMF Specification Compliance
SONORA NoteForge implements a binary Standard MIDI File (SMF Format 0) serializer compliant with the official MIDI 1.0 specification.

### Header Chunk (`MThd`)
- `4D 54 68 64` ('MThd')
- Length: 6 bytes (`00 00 00 06`)
- Format: 0 (`00 00`, single multichannel track)
- Number of tracks: 1 (`00 01`)
- Division: 480 PPQ / Ticks per Quarter Note (`01 E0`)

### Track Chunk (`MTrk`)
- `4D 54 72 6B` ('MTrk')
- 32-bit length header
- Time Delta encoded via Variable Length Quantity (VLQ, 7 bits per byte, MSB set on continuation bytes).

### Supported Events
1. **Track Name Meta-Event**: `FF 03 <len> <text>`
2. **Time Signature Meta-Event**: `FF 58 04 <nn> <dd> <cc> <bb>` (e.g. 4/4 is `04 02 18 08`)
3. **Set Tempo Meta-Event**: `FF 51 03 <tt tt tt>` (microseconds per quarter note = $\lfloor 60,000,000 / BPM \rfloor$)
4. **Note-On Event**: `90 <pitch> <velocity>` (Channel 0)
5. **Note-Off Event**: `80 <pitch> 40` (Channel 0)
6. **Pitch Bend Change**: `E0 <lsb> <msb>` (14-bit center 8192, range ±200 cents)
7. **End of Track Meta-Event**: `00 FF 2F 00`

## 2. Event Sorting & Delta-Time Calculations
- Event times in seconds are converted to integer MIDI ticks:
  $$Ticks = \text{round}\left(TimeSeconds \times \frac{BPM}{60} \times PPQ\right)$$
- If multiple events share identical timestamps:
  1. Meta events precede musical channel events.
  2. Note-Off events precede Note-On events of identical pitch to avoid hanging notes in DAWs.

## 3. DAW Drag-and-Drop Implementation
- The application exposes a dedicated HTML5 Drag-and-Drop surface.
- Sets `application/x-midi`, `audio/midi`, and standard `DownloadURL` payload:
  `audio/midi:<filename>:<blobUrl>`
- Verified compatibility:
  - Ableton Live 11/12
  - FL Studio 21/24
  - Apple Logic Pro
  - Reaper 7
  - Local desktop OS file managers (macOS Finder, Windows Explorer, GNOME Files)
- A prominent "Download .mid" button is provided as a reliable fallback.
