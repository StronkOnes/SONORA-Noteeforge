/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Typography } from '@mui/material';
import { useProject } from '../../state/ProjectStore.tsx';

interface PitchBendLaneProps {
  pixelsPerSecond: number;
  scrollLeft: number;
  visibleDuration: number;
  height?: number;
}

export const PitchBendLane: React.FC<PitchBendLaneProps> = ({
  pixelsPerSecond,
  scrollLeft,
  visibleDuration,
  height = 60,
}) => {
  const { project } = useProject();
  const centerY = height / 2;

  return (
    <Box
      sx={{
        position: 'relative',
        height,
        backgroundColor: '#0a0c10',
        borderTop: '1px solid #1c202a',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
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
          Pitch Bend (±200 Cents / Vibrato)
        </Typography>
      </Box>

      {/* Center 0 cents line */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: centerY,
          borderTop: '1px solid #1e2430',
        }}
      />

      {/* SVG Bend Curves */}
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {project.notes.map((note) => {
          if (!note.pitchBends || note.pitchBends.length === 0) return null;
          const noteStartPx = note.startSeconds * pixelsPerSecond - scrollLeft + 56;

          let pathD = '';
          note.pitchBends.forEach((pb, idx) => {
            const x = noteStartPx + pb.timeOffset * pixelsPerSecond;
            // Bend cents: -200 to +200 -> map to +/- (height * 0.4)
            const y = centerY - (pb.bendCents / 200) * (height * 0.4);
            if (idx === 0) {
              pathD += `M ${x} ${y}`;
            } else {
              pathD += ` L ${x} ${y}`;
            }
          });

          return (
            <path
              key={`pb_${note.id}`}
              d={pathD}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              opacity="0.85"
            />
          );
        })}
      </svg>
    </Box>
  );
};
