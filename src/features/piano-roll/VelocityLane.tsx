/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { useProject } from '../../state/ProjectStore.tsx';

interface VelocityLaneProps {
  pixelsPerSecond: number;
  scrollLeft: number;
  visibleDuration: number;
  height?: number;
}

export const VelocityLane: React.FC<VelocityLaneProps> = ({
  pixelsPerSecond,
  scrollLeft,
  visibleDuration,
  height = 70,
}) => {
  const { project, updateNote, selectedNoteIds } = useProject();
  const laneRef = useRef<HTMLDivElement>(null);

  const handleBarMouseDown = (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    const lane = laneRef.current;
    if (!lane) return;

    const updateFromY = (clientY: number) => {
      const rect = lane.getBoundingClientRect();
      const relY = clientY - rect.top;
      const fraction = 1 - Math.max(0, Math.min(1, relY / height));
      const newVel = Math.max(1, Math.min(127, Math.round(fraction * 127)));
      updateNote(noteId, { velocity: newVel });
    };

    updateFromY(e.clientY);

    const onMouseMove = (ev: MouseEvent) => {
      updateFromY(ev.clientY);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <Box
      ref={laneRef}
      sx={{
        position: 'relative',
        height,
        backgroundColor: '#0a0c10',
        borderTop: '1px solid #1c202a',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Velocity Axis Label */}
      <Box sx={{ position: 'absolute', left: 8, top: 4, zIndex: 2 }}>
        <Typography
          variant="caption"
          sx={{
            color: '#64748b',
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          Velocity (1 - 127)
        </Typography>
      </Box>

      {/* Guide lines at 64 and 100 */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${(1 - 64 / 127) * 100}%`,
          borderTop: '1px dashed #1a1e28',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${(1 - 100 / 127) * 100}%`,
          borderTop: '1px dashed #1a1e28',
        }}
      />

      {/* Velocity Stems for Notes */}
      {project.notes.map((note) => {
        const x = note.startSeconds * pixelsPerSecond - scrollLeft + 56; // 56px piano key offset
        const isSelected = selectedNoteIds.has(note.id);
        const vel = note.velocity || 80;
        const barHeight = (vel / 127) * (height - 16);

        if (x < 56 || x > 56 + visibleDuration * pixelsPerSecond + 100) {
          return null;
        }

        return (
          <Box
            key={`vel_${note.id}`}
            onMouseDown={(e) => handleBarMouseDown(e, note.id)}
            sx={{
              position: 'absolute',
              left: x,
              bottom: 0,
              width: 8,
              height: barHeight,
              backgroundColor: isSelected ? '#38bdf8' : '#f59e0b',
              cursor: 'ns-resize',
              borderRadius: '2px 2px 0 0',
              opacity: isSelected ? 1 : 0.8,
              '&:hover': {
                opacity: 1,
                boxShadow: '0 0 6px rgba(245, 158, 11, 0.6)',
              },
            }}
          >
            {/* Top Dot */}
            <Box
              sx={{
                width: 6,
                height: 4,
                borderRadius: '50%',
                backgroundColor: isSelected ? '#ffffff' : '#fbbf24',
                position: 'absolute',
                top: -2,
                left: 1,
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
};
