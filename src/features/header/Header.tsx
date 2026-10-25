/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import { useProject } from '../../state/ProjectStore.tsx';

interface HeaderProps {
  onOpenExportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenExportModal }) => {
  const {
    project,
    undo,
    redo,
    canUndo,
    canRedo,
    audioBuffer,
    previewGeneratedMidi,
    isAudioMuted,
  } = useProject();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2.5,
        py: 1.25,
        backgroundColor: '#0c0e12',
        borderBottom: '1px solid #222631',
        minHeight: 56,
      }}
    >
      {/* Brand & Project Identity */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              backgroundColor: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0c0e12',
              fontWeight: 900,
              fontSize: '0.875rem',
            }}
          >
            S
          </Box>
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontSize: '1rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
                lineHeight: 1.1,
                color: '#f1f5f9',
              }}
            >
              SONORA <span style={{ color: '#f59e0b', fontWeight: 600 }}>NoteForge</span>
            </Typography>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6875rem',
                color: '#64748b',
                letterSpacing: '0.02em',
                display: 'block',
              }}
            >
              Audio-to-MIDI Transcription & Sample Analysis
            </Typography>
          </Box>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5 }} />

        {/* Project Name & Stats */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography
            sx={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.8125rem',
              color: '#cbd5e1',
              fontWeight: 500,
              maxWidth: 220,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project.name}
          </Typography>

          {audioBuffer && (
            <Chip
              size="small"
              icon={<GraphicEqIcon sx={{ fontSize: '0.85rem !important', color: '#f59e0b !important' }} />}
              label={`${audioBuffer.duration.toFixed(2)}s • ${(audioBuffer.sampleRate / 1000).toFixed(1)}kHz`}
              sx={{
                backgroundColor: '#161922',
                border: '1px solid #282d3b',
                color: '#94a3b8',
                fontSize: '0.7rem',
                height: 22,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          )}

          {project.notes.length > 0 && (
            <Chip
              size="small"
              label={`${project.notes.length} notes`}
              sx={{
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#fbbf24',
                fontSize: '0.7rem',
                height: 22,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          )}
        </Box>
      </Box>

      {/* Center / Right Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* Undo / Redo */}
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              onClick={undo}
              disabled={!canUndo}
              sx={{
                color: canUndo ? '#cbd5e1' : '#475569',
                backgroundColor: '#161922',
                border: '1px solid #282d3b',
                borderRadius: 1,
                p: 0.75,
                '&:hover': { backgroundColor: '#222735' },
              }}
            >
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton
              size="small"
              onClick={redo}
              disabled={!canRedo}
              sx={{
                color: canRedo ? '#cbd5e1' : '#475569',
                backgroundColor: '#161922',
                border: '1px solid #282d3b',
                borderRadius: 1,
                p: 0.75,
                '&:hover': { backgroundColor: '#222735' },
              }}
            >
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5, mx: 0.5 }} />

        {/* Audition Generated MIDI Shortcut */}
        <Tooltip title="Mute original sample and audition the generated MIDI synthesizer notes">
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={<HeadphonesIcon sx={{ fontSize: '0.95rem' }} />}
              onClick={previewGeneratedMidi}
              disabled={project.notes.length === 0}
              sx={{
                px: 1.5,
                py: 0.6,
                fontSize: '0.8125rem',
                color: isAudioMuted ? '#f59e0b' : '#cbd5e1',
                borderColor: isAudioMuted ? '#f59e0b' : '#282d3b',
                backgroundColor: isAudioMuted ? 'rgba(245, 158, 11, 0.12)' : '#161922',
                '&:hover': {
                  borderColor: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                },
              }}
            >
              Audition MIDI
            </Button>
          </span>
        </Tooltip>

        {/* Export MIDI Modal Trigger */}
        <Button
          variant="contained"
          color="primary"
          size="small"
          startIcon={<FileDownloadIcon sx={{ fontSize: '1rem' }} />}
          onClick={onOpenExportModal}
          disabled={project.notes.length === 0}
          sx={{
            px: 2,
            py: 0.7,
            fontSize: '0.8125rem',
            letterSpacing: '0.02em',
          }}
        >
          Export MIDI
        </Button>
      </Box>
    </Box>
  );
};
