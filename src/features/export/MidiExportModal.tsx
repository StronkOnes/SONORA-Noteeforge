/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
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
  ButtonGroup,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { useProject } from '../../state/ProjectStore.tsx';
import { createMidiBlob } from '../../music/MidiSerializer.ts';
import { chordEventToNoteEvents } from '../../music/Chord.ts';
import { NoteEvent } from '../../music/NoteEvent.ts';
import { DraggableMidiCard } from './DraggableMidiCard.tsx';

interface MidiExportModalProps {
  open: boolean;
  onClose: () => void;
}

export const MidiExportModal: React.FC<MidiExportModalProps> = ({ open, onClose }) => {
  const { project } = useProject();

  const [exportSource, setExportSource] = useState<'notes' | 'chords'>('notes');
  const [chordSustainStyle, setChordSustainStyle] = useState<'natural' | 'legato' | 'staccato'>('natural');
  const [exportScope, setExportScope] = useState<'region' | 'all'>('region');
  const [offsetToZero, setOffsetToZero] = useState(true);
  const [includePitchBends, setIncludePitchBends] = useState(project.expressiveVibrato);

  // Safe default filename: [Title]_[Key]_[BPM]bpm.mid
  const keyLabel = project.key ? `${project.key.rootName}${project.key.mode === 'minor' ? 'm' : 'Maj'}` : 'Track';
  const defaultBaseName = `${project.name.replace(/\s+/g, '_')}_${keyLabel}_${Math.round(project.bpm)}bpm`;
  const [filename, setFilename] = useState(defaultBaseName);

  // Derive target notes according to selection:
  // If exportSource === 'chords', voice the chords into NoteEvents preserving inversions, bass register, and velocity distribution
  const targetNotes = useMemo<NoteEvent[]>(() => {
    if (exportSource === 'chords') {
      const filteredChords =
        exportScope === 'region'
          ? project.chords.filter(
              (c) =>
                c.startSeconds >= project.selectedRegion.startSeconds - 0.05 &&
                c.startSeconds < project.selectedRegion.endSeconds + 0.05
            )
          : project.chords;

      const generated: NoteEvent[] = [];
      filteredChords.forEach((chord, i) => {
        const events = chordEventToNoteEvents(chord, {
          baseOctave: 3,
          bassOctave: 2,
          defaultVelocity: 85,
        });

        // Apply sustain style
        const nextChord = filteredChords[i + 1];
        const nextStart = nextChord ? nextChord.startSeconds : chord.endSeconds;

        events.forEach((ev) => {
          let dur = ev.durationSeconds;
          if (chordSustainStyle === 'staccato') {
            dur = Math.max(0.12, dur * 0.45);
          } else if (chordSustainStyle === 'legato' && nextStart > chord.startSeconds) {
            dur = Math.max(0.15, nextStart - chord.startSeconds);
          }
          generated.push({
            ...ev,
            durationSeconds: Number(dur.toFixed(3)),
          });
        });
      });

      return generated;
    }

    // Otherwise export transcribed / edited piano roll notes
    return exportScope === 'region'
      ? project.notes.filter(
          (n) =>
            n.startSeconds >= project.selectedRegion.startSeconds - 0.05 &&
            n.startSeconds < project.selectedRegion.endSeconds + 0.05
        )
      : project.notes;
  }, [exportSource, exportScope, project.notes, project.chords, project.selectedRegion, chordSustainStyle]);

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
      includePitchBends: exportSource === 'notes' ? includePitchBends : false,
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
        {/* Source Track Selector: Notes vs Chords */}
        <Box>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.75, fontWeight: 700, textTransform: 'uppercase' }}>
            1. MIDI Content Track:
          </Typography>
          <ButtonGroup size="small" fullWidth sx={{ backgroundColor: '#0d0f14', p: 0.5, borderRadius: 1.5, border: '1px solid #222633' }}>
            <Button
              variant={exportSource === 'notes' ? 'contained' : 'text'}
              onClick={() => {
                setExportSource('notes');
                setFilename(`${defaultBaseName}_Melody`);
              }}
              startIcon={<MusicNoteIcon sx={{ fontSize: '0.95rem !important' }} />}
              sx={{
                py: 0.8,
                fontSize: '0.8125rem',
                fontWeight: 700,
                backgroundColor: exportSource === 'notes' ? '#f59e0b' : 'transparent',
                color: exportSource === 'notes' ? '#0c0e12' : '#94a3b8',
                '&:hover': {
                  backgroundColor: exportSource === 'notes' ? '#fbbf24' : '#181b24',
                },
              }}
            >
              Transcribed Notes ({project.notes.length})
            </Button>
            <Button
              variant={exportSource === 'chords' ? 'contained' : 'text'}
              disabled={project.chords.length === 0}
              onClick={() => {
                setExportSource('chords');
                setFilename(`${defaultBaseName}_Chords`);
              }}
              startIcon={<LibraryMusicIcon sx={{ fontSize: '0.95rem !important' }} />}
              sx={{
                py: 0.8,
                fontSize: '0.8125rem',
                fontWeight: 700,
                backgroundColor: exportSource === 'chords' ? '#f59e0b' : 'transparent',
                color: exportSource === 'chords' ? '#0c0e12' : '#94a3b8',
                '&:hover': {
                  backgroundColor: exportSource === 'chords' ? '#fbbf24' : '#181b24',
                },
              }}
            >
              Voiced Chords ({project.chords.length})
            </Button>
          </ButtonGroup>
        </Box>

        {/* Chord Sustain / Voicing Options if Chords Selected */}
        {exportSource === 'chords' && (
          <Box
            sx={{
              backgroundColor: '#0d0f14',
              p: 1.5,
              borderRadius: 1.5,
              border: '1px solid #222633',
            }}
          >
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.75, fontWeight: 700 }}>
              Chord Articulation & Sustain:
            </Typography>
            <ButtonGroup size="small">
              <Button
                variant={chordSustainStyle === 'natural' ? 'contained' : 'outlined'}
                onClick={() => setChordSustainStyle('natural')}
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: chordSustainStyle === 'natural' ? '#38bdf8' : 'transparent',
                  color: chordSustainStyle === 'natural' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#2b3140',
                }}
              >
                Natural (90% gate)
              </Button>
              <Button
                variant={chordSustainStyle === 'legato' ? 'contained' : 'outlined'}
                onClick={() => setChordSustainStyle('legato')}
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: chordSustainStyle === 'legato' ? '#38bdf8' : 'transparent',
                  color: chordSustainStyle === 'legato' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#2b3140',
                }}
              >
                Legato (Full sustain)
              </Button>
              <Button
                variant={chordSustainStyle === 'staccato' ? 'contained' : 'outlined'}
                onClick={() => setChordSustainStyle('staccato')}
                sx={{
                  fontSize: '0.75rem',
                  backgroundColor: chordSustainStyle === 'staccato' ? '#38bdf8' : 'transparent',
                  color: chordSustainStyle === 'staccato' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#2b3140',
                }}
              >
                Staccato (Punchy)
              </Button>
            </ButtonGroup>
            <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.75, fontSize: '0.7rem' }}>
              Voicing preserves true bass note in octave 2, registered harmony in octave 3-4, and role-based velocities.
            </Typography>
          </Box>
        )}

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
              label={<Typography sx={{ fontSize: '0.8125rem' }}>Full Project ({targetNotes.length} notes)</Typography>}
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
          {exportSource === 'notes' && (
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
          )}
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
            includePitchBends={exportSource === 'notes' ? includePitchBends : false}
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
              Standard SMF Format 0 • 480 PPQ • {targetNotes.length} notes ready ({exportSource === 'chords' ? 'Voiced Progressions' : 'Lead Notes'})
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
