/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  TextField,
  Divider,
  IconButton,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useProject } from '../../state/ProjectStore.tsx';
import { createMidiBlob } from '../../music/MidiSerializer.ts';
import { DraggableMidiCard } from './DraggableMidiCard.tsx';

interface MidiExportModalProps {
  open: boolean;
  onClose: () => void;
}

export const MidiExportModal: React.FC<MidiExportModalProps> = ({ open, onClose }) => {
  const { project } = useProject();

  const [exportScope, setExportScope] = useState<'region' | 'all'>('region');
  const [offsetToZero, setOffsetToZero] = useState(true);
  const [includePitchBends, setIncludePitchBends] = useState(project.expressiveVibrato);

  // Safe default filename: [Title]_[Key]_[BPM]bpm.mid
  const keyLabel = project.key ? `${project.key.rootName}${project.key.mode === 'minor' ? 'm' : 'Maj'}` : 'Track';
  const defaultBaseName = `${project.name.replace(/\s+/g, '_')}_${keyLabel}_${Math.round(project.bpm)}bpm`;
  const [filename, setFilename] = useState(defaultBaseName);

  // Filter notes based on scope
  const targetNotes =
    exportScope === 'region'
      ? project.notes.filter(
          (n) =>
            n.startSeconds >= project.selectedRegion.startSeconds - 0.05 &&
            n.startSeconds < project.selectedRegion.endSeconds + 0.05
        )
      : project.notes;

  const handleDownload = () => {
    const safeFilename = filename.endsWith('.mid') ? filename : `${filename}.mid`;
    const blob = createMidiBlob(targetNotes, {
      bpm: project.bpm,
      timeSignatureNumerator: project.timeSignature[0],
      timeSignatureDenominator: project.timeSignature[1],
      ticksPerQuarterNote: 480,
      trackName: filename,
      offsetToZero,
      startOffsetSeconds: exportScope === 'region' ? project.selectedRegion.startSeconds : 0,
      includePitchBends,
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            backgroundColor: '#14171f',
            border: '1px solid #282d3b',
            borderRadius: 2,
            color: '#f1f5f9',
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
          borderBottom: '1px solid #222633',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileDownloadIcon sx={{ color: '#f59e0b' }} />
          <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1.1rem' }}>
            Export Standard MIDI (.mid)
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: '#94a3b8' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Filename Input */}
        <Box>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
            File Name:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <Typography sx={{ color: '#64748b', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.8rem' }}>
                    .mid
                  </Typography>
                ),
                sx: {
                  backgroundColor: '#0d0f14',
                  color: '#f1f5f9',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.875rem',
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#282d3b' },
                },
              },
            }}
          />
        </Box>

        {/* Scope Selector */}
        <Box>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
            Export Range:
          </Typography>
          <RadioGroup
            value={exportScope}
            onChange={(e) => setExportScope(e.target.value as 'region' | 'all')}
            row
          >
            <FormControlLabel
              value="region"
              control={<Radio size="small" sx={{ color: '#f59e0b', '&.Mui-checked': { color: '#f59e0b' } }} />}
              label={
                <Typography sx={{ fontSize: '0.8125rem' }}>
                  Selected Region ({project.selectedRegion.startSeconds.toFixed(1)}s - {project.selectedRegion.endSeconds.toFixed(1)}s)
                </Typography>
              }
            />
            <FormControlLabel
              value="all"
              control={<Radio size="small" sx={{ color: '#f59e0b', '&.Mui-checked': { color: '#f59e0b' } }} />}
              label={<Typography sx={{ fontSize: '0.8125rem' }}>Full Project ({project.notes.length} notes)</Typography>}
            />
          </RadioGroup>
        </Box>

        {/* Timing and Pitch Bend Checkboxes */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={offsetToZero}
                onChange={(e) => setOffsetToZero(e.target.checked)}
                sx={{ color: '#f59e0b', '&.Mui-checked': { color: '#f59e0b' } }}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.8125rem' }}>
                Offset timestamps to 00:00 (Starts at bar 1 beat 1 in DAW)
              </Typography>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includePitchBends}
                onChange={(e) => setIncludePitchBends(e.target.checked)}
                sx={{ color: '#f59e0b', '&.Mui-checked': { color: '#f59e0b' } }}
              />
            }
            label={
              <Typography sx={{ fontSize: '0.8125rem' }}>
                Include continuous pitch bend vibrato & slide events
              </Typography>
            }
          />
        </Box>

        <Divider sx={{ borderColor: '#222633' }} />

        {/* Drag to DAW Card */}
        <Box>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 1 }}>
            DAW Drag-and-Drop Surface:
          </Typography>
          <DraggableMidiCard
            notes={targetNotes}
            filename={`${filename}.mid`}
            bpm={project.bpm}
            offsetToZero={offsetToZero}
            startOffsetSeconds={exportScope === 'region' ? project.selectedRegion.startSeconds : 0}
            includePitchBends={includePitchBends}
          />
        </Box>

        {/* Verification Metadata Summary */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.25,
            backgroundColor: '#0d0f14',
            borderRadius: 1,
            border: '1px solid #1f232e',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon sx={{ color: '#10b981', fontSize: '1rem' }} />
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              Standard SMF Format 0 • 480 PPQ • {targetNotes.length} notes ready
            </Typography>
          </Box>
          <Chip
            size="small"
            label={`${project.bpm} BPM`}
            sx={{
              backgroundColor: '#1b1f2b',
              color: '#38bdf8',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6875rem',
              height: 20,
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #222633', justifyContent: 'space-between' }}>
        <Button onClick={onClose} sx={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
          Close
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<FileDownloadIcon />}
          onClick={handleDownload}
          disabled={targetNotes.length === 0}
          sx={{
            fontWeight: 800,
            px: 3,
            py: 0.8,
            backgroundColor: '#f59e0b',
            color: '#0c0e12',
            '&:hover': { backgroundColor: '#fbbf24' },
          }}
        >
          Download .MID File
        </Button>
      </DialogActions>
    </Dialog>
  );
};
