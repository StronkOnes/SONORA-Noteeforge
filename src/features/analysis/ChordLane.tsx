/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  Button,
} from '@mui/material';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import { useProject } from '../../state/ProjectStore.tsx';
import { ChordEvent, CHORD_TEMPLATES, buildChordLabel, ChordQuality } from '../../music/Chord.ts';

export const ChordLane: React.FC = () => {
  const {
    project,
    auditionChord,
    updateChord,
    deleteChord,
    replaceNotesWithChords,
    audioBuffer,
  } = useProject();

  const [activeMenuAnchor, setActiveMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedChord, setSelectedChord] = useState<ChordEvent | null>(null);

  const totalDuration = audioBuffer ? audioBuffer.duration : 4.0;
  const chords = project.chords;

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>, chord: ChordEvent) => {
    e.stopPropagation();
    setActiveMenuAnchor(e.currentTarget);
    setSelectedChord(chord);
  };

  const handleCloseMenu = () => {
    setActiveMenuAnchor(null);
    setSelectedChord(null);
  };

  const handleChangeQuality = (quality: ChordQuality) => {
    if (selectedChord) {
      const newLabel = buildChordLabel(selectedChord.rootPitchClass, quality, selectedChord.bassPitchClass);
      updateChord(selectedChord.id, { quality, label: newLabel });
    }
    handleCloseMenu();
  };

  const handleDelete = () => {
    if (selectedChord) {
      deleteChord(selectedChord.id);
    }
    handleCloseMenu();
  };

  if (chords.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.6,
          backgroundColor: '#0e1117',
          borderBottom: '1px solid #1c202a',
          minHeight: 34,
        }}
      >
        <Typography variant="caption" sx={{ color: '#4b5563', fontStyle: 'italic', fontSize: '0.75rem' }}>
          No chords detected yet. Select a section and run analysis in Chords or Melody mode.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        backgroundColor: '#0e1117',
        borderBottom: '1px solid #1c202a',
        px: 2,
        py: 0.75,
        minHeight: 42,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
      }}
    >
      {/* Chord Timeline Blocks */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', flex: 1, py: 0.25 }}>
        <Typography
          variant="caption"
          sx={{
            color: '#64748b',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.6875rem',
            whiteSpace: 'nowrap',
            mr: 0.5,
          }}
        >
          Chords:
        </Typography>

        {chords.map((chord) => {
          return (
            <Box
              key={chord.id}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                backgroundColor: '#161922',
                border: '1px solid #2b3140',
                borderRadius: 1,
                px: 1,
                py: 0.4,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#f59e0b',
                  backgroundColor: '#1d222e',
                },
              }}
            >
              <Tooltip title="Audition Chord">
                <IconButton
                  size="small"
                  onClick={() => auditionChord(chord)}
                  sx={{
                    p: 0.25,
                    color: '#f59e0b',
                    '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.2)' },
                  }}
                >
                  <VolumeUpIcon sx={{ fontSize: '0.9rem' }} />
                </IconButton>
              </Tooltip>

              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  color: '#f1f5f9',
                }}
              >
                {chord.label}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.6875rem',
                  color: '#64748b',
                }}
              >
                {chord.startSeconds.toFixed(1)}s
              </Typography>

              <IconButton
                size="small"
                onClick={(e) => handleOpenMenu(e, chord)}
                sx={{ p: 0.2, color: '#64748b', '&:hover': { color: '#f1f5f9' } }}
              >
                <MoreVertIcon sx={{ fontSize: '0.85rem' }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>

      {/* Action to replace piano roll notes with detected chords */}
      <Tooltip title="Generate editable MIDI chords in the piano roll from these detected chord voicings">
        <Button
          size="small"
          variant="outlined"
          startIcon={<LibraryMusicIcon sx={{ fontSize: '0.85rem' }} />}
          onClick={replaceNotesWithChords}
          sx={{
            color: '#cbd5e1',
            borderColor: '#2b3140',
            backgroundColor: '#14171f',
            fontSize: '0.7rem',
            py: 0.3,
            px: 1.2,
            height: 26,
            whiteSpace: 'nowrap',
            '&:hover': {
              borderColor: '#f59e0b',
              color: '#f59e0b',
            },
          }}
        >
          Send to Piano Roll
        </Button>
      </Tooltip>

      {/* Chord Context Menu */}
      <Menu
        anchorEl={activeMenuAnchor}
        open={Boolean(activeMenuAnchor)}
        onClose={handleCloseMenu}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: '#161922',
              border: '1px solid #282d3b',
              color: '#f1f5f9',
              fontSize: '0.75rem',
            },
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{ px: 2, py: 0.5, color: '#64748b', display: 'block', fontWeight: 700 }}
        >
          Change Quality ({selectedChord?.label}):
        </Typography>
        {CHORD_TEMPLATES.slice(0, 7).map((tpl) => (
          <MenuItem
            key={tpl.quality}
            onClick={() => handleChangeQuality(tpl.quality)}
            sx={{ fontSize: '0.75rem', py: 0.5 }}
          >
            {tpl.fullName} ({tpl.symbol || 'Maj'})
          </MenuItem>
        ))}
        <MenuItem onClick={handleDelete} sx={{ fontSize: '0.75rem', color: '#ef4444', py: 0.5 }}>
          Delete Chord
        </MenuItem>
      </Menu>
    </Box>
  );
};
