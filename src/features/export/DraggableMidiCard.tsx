/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { createMidiBlob, serializeNotesToMidi } from '../../music/MidiSerializer.ts';
import { NoteEvent } from '../../music/NoteEvent.ts';

interface DraggableMidiCardProps {
  notes: NoteEvent[];
  filename: string;
  bpm: number;
  offsetToZero: boolean;
  startOffsetSeconds?: number;
  includePitchBends?: boolean;
}

export const DraggableMidiCard: React.FC<DraggableMidiCardProps> = ({
  notes,
  filename,
  bpm,
  offsetToZero,
  startOffsetSeconds,
  includePitchBends,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setIsDragging(true);

    const safeFilename = filename.endsWith('.mid') ? filename : `${filename}.mid`;
    const midiBlob = createMidiBlob(notes, {
      bpm,
      trackName: filename.replace('.mid', ''),
      offsetToZero,
      startOffsetSeconds,
      includePitchBends,
    });

    const file = new File([midiBlob], safeFilename, { type: 'audio/midi' });
    const fileUrl = URL.createObjectURL(file);

    // Standard DownloadURL format for browser-to-desktop / DAW drag-and-drop:
    // "mime:filename:url"
    const downloadUrlPayload = `audio/midi:${safeFilename}:${window.location.origin}${fileUrl}`;

    try {
      e.dataTransfer.setData('DownloadURL', downloadUrlPayload);
      e.dataTransfer.setData('application/x-midi', fileUrl);
      e.dataTransfer.setData('audio/midi', fileUrl);
      e.dataTransfer.setData('text/plain', safeFilename);

      // Attempt to attach File object to DataTransfer if supported by browser
      if (e.dataTransfer.items && e.dataTransfer.items.add) {
        try {
          e.dataTransfer.items.add(file);
        } catch {
          // Some browsers restrict programmatic File additions
        }
      }
    } catch (err) {
      console.warn('Drag data transfer error:', err);
    }
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <Tooltip title="Drag directly into Ableton Live, FL Studio, Logic Pro, or your desktop file manager">
      <Box
        draggable={notes.length > 0}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          p: 2.5,
          backgroundColor: isDragging ? 'rgba(245, 158, 11, 0.2)' : '#10131a',
          border: isDragging ? '2px dashed #f59e0b' : '2px dashed #2d3445',
          borderRadius: 2,
          cursor: notes.length > 0 ? 'grab' : 'not-allowed',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          '&:hover': {
            borderColor: '#f59e0b',
            backgroundColor: '#161922',
          },
        }}
      >
        <DragIndicatorIcon sx={{ color: '#f59e0b', fontSize: '1.4rem' }} />
        <Box sx={{ textAlign: 'left' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <MusicNoteIcon sx={{ color: '#38bdf8', fontSize: '1rem' }} />
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: '0.875rem',
                color: '#f1f5f9',
              }}
            >
              {filename}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.6875rem' }}>
            Click & drag this card into your DAW track or desktop
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
};
