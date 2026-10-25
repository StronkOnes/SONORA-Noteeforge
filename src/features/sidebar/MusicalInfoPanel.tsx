/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Slider,
  Select,
  MenuItem,
  FormControl,
  Divider,
  Alert,
  Tooltip,
  ButtonGroup,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import SpeedIcon from '@mui/icons-material/Speed';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useProject } from '../../state/ProjectStore.tsx';
import { NOTE_NAMES } from '../../music/NoteEvent.ts';
import { SCALE_DEFINITIONS, ScaleMode, getScaleNoteNames } from '../../music/Scale.ts';
import { QuantizeGrid } from '../../music/Quantization.ts';
import { SynthSound } from '../../audio/MidiSynth.ts';

export const MusicalInfoPanel: React.FC = () => {
  const {
    project,
    setKey,
    setBpm,
    applyQuantization,
    applyScaleCorrection,
    diagnostics,
    monitorMode,
    setMonitorMode,
    audioVolume,
    setAudioVolume,
    midiVolume,
    setMidiVolume,
    synthSound,
    setSynthSound,
    isAudioMuted,
    isMidiMuted,
    toggleAudioMute,
    toggleMidiMute,
    previewGeneratedMidi,
  } = useProject();

  // Quantization local controls
  const [grid, setGrid] = useState<QuantizeGrid>('1/16');
  const [strength, setStrength] = useState<number>(100);
  const [swing, setSwing] = useState<number>(0);

  const key = project.key;
  const scaleNotes = key ? getScaleNoteNames(key.rootPitchClass, key.mode) : [];

  const handleManualKeyRootChange = (rootIndex: number) => {
    const curMode = key ? key.mode : 'minor';
    setKey({
      rootPitchClass: rootIndex,
      rootName: NOTE_NAMES[rootIndex],
      mode: curMode,
      confidence: 1.0,
    });
  };

  const handleManualModeChange = (mode: ScaleMode) => {
    const curRoot = key ? key.rootPitchClass : 9; // A
    setKey({
      rootPitchClass: curRoot,
      rootName: NOTE_NAMES[curRoot],
      mode,
      confidence: 1.0,
    });
  };

  const handleQuantizeClick = () => {
    applyQuantization({
      grid,
      strength: strength / 100,
      swing: swing / 100,
      quantizeDurations: false,
    });
  };

  // Confidence color & badge
  const getConfidenceLevel = (conf: number): { label: string; color: string } => {
    if (conf >= 0.75) return { label: 'High Confidence', color: '#10b981' };
    if (conf >= 0.5) return { label: 'Medium Confidence', color: '#f59e0b' };
    return { label: 'Ambiguous / Low', color: '#ef4444' };
  };

  const confInfo = key ? getConfidenceLevel(key.confidence) : { label: 'Not Analyzed', color: '#64748b' };

  return (
    <Box
      sx={{
        width: 320,
        backgroundColor: '#12151c',
        borderLeft: '1px solid #20242e',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        p: 2,
        gap: 2.5,
      }}
    >
      {/* 1. KEY & SCALE DETECTION SECTION */}
      <Paper
        elevation={0}
        sx={{
          backgroundColor: '#161922',
          border: '1px solid #252a38',
          p: 1.75,
          borderRadius: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyIcon sx={{ fontSize: '1.1rem', color: '#f59e0b' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f1f5f9' }}>
              Key & Scale
            </Typography>
          </Box>
          <Chip
            size="small"
            label={confInfo.label}
            sx={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${confInfo.color}`,
              color: confInfo.color,
              fontSize: '0.6875rem',
              fontWeight: 700,
              height: 22,
            }}
          />
        </Box>

        {/* Primary Key Display */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem' }}>
            Estimated Musical Key
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              color: '#f59e0b',
              letterSpacing: '-0.02em',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {key ? `${key.rootName} ${SCALE_DEFINITIONS[key.mode]?.name || key.mode}` : '—'}
          </Typography>
        </Box>

        {/* Scale Notes Chips */}
        {scaleNotes.length > 0 && (
          <Box sx={{ mb: 1.75 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
              Scale Pitch Classes:
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {scaleNotes.map((note) => (
                <Chip
                  key={note}
                  size="small"
                  label={note}
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    height: 22,
                    backgroundColor: '#1f2430',
                    border: '1px solid #2d3445',
                    color: '#e2e8f0',
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Alternative Key Candidates */}
        {key?.secondaryCandidates && key.secondaryCandidates.length > 0 && (
          <Box sx={{ mb: 1.5, p: 1, backgroundColor: '#111319', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
              Alternative Candidates:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {key.secondaryCandidates.map((cand, idx) => (
                <Typography
                  key={idx}
                  variant="caption"
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.6875rem',
                    color: '#94a3b8',
                  }}
                >
                  {cand.rootName} {cand.mode} ({Math.round(cand.score * 100)}%)
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Manual Key Override Controls */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <FormControl size="small" fullWidth>
            <Select
              value={key ? key.rootPitchClass : 9}
              onChange={(e) => handleManualKeyRootChange(Number(e.target.value))}
              sx={{
                height: 30,
                fontSize: '0.75rem',
                backgroundColor: '#111319',
                color: '#f1f5f9',
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#252a38' },
              }}
            >
              {NOTE_NAMES.map((name, idx) => (
                <MenuItem key={name} value={idx} sx={{ fontSize: '0.75rem' }}>
                  Root: {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <Select
              value={key ? key.mode : 'minor'}
              onChange={(e) => handleManualModeChange(e.target.value as ScaleMode)}
              sx={{
                height: 30,
                fontSize: '0.75rem',
                backgroundColor: '#111319',
                color: '#f1f5f9',
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#252a38' },
              }}
            >
              <MenuItem value="minor">Natural Minor</MenuItem>
              <MenuItem value="major">Major</MenuItem>
              <MenuItem value="harmonic_minor">Harmonic Minor</MenuItem>
              <MenuItem value="dorian">Dorian</MenuItem>
              <MenuItem value="mixolydian">Mixolydian</MenuItem>
              <MenuItem value="pentatonic_minor">Minor Pentatonic</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Non-destructive Scale Correction Action */}
        <Tooltip title="Snap out-of-scale notes to the nearest scale pitch in this key (undoable)">
          <span>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              startIcon={<AutoFixHighIcon sx={{ fontSize: '0.9rem' }} />}
              onClick={applyScaleCorrection}
              disabled={project.notes.length === 0}
              sx={{
                color: '#cbd5e1',
                borderColor: '#2d3445',
                fontSize: '0.75rem',
                py: 0.5,
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                },
              }}
            >
              Snap Notes to Scale
            </Button>
          </span>
        </Tooltip>
      </Paper>

      {/* 2. TEMPO & QUANTIZATION SECTION */}
      <Paper
        elevation={0}
        sx={{
          backgroundColor: '#161922',
          border: '1px solid #252a38',
          p: 1.75,
          borderRadius: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon sx={{ fontSize: '1.1rem', color: '#f59e0b' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f1f5f9' }}>
              Tempo & Quantization
            </Typography>
          </Box>
        </Box>

        {/* BPM Selector */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Tempo (BPM):
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <input
              type="number"
              value={project.bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              style={{
                width: 68,
                height: 28,
                backgroundColor: '#111319',
                border: '1px solid #252a38',
                borderRadius: 4,
                color: '#f59e0b',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                fontSize: '0.875rem',
                textAlign: 'center',
              }}
            />
          </Box>
        </Box>

        {/* Grid Division Selector */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
            Quantize Grid:
          </Typography>
          <FormControl size="small">
            <Select
              value={grid}
              onChange={(e) => setGrid(e.target.value as QuantizeGrid)}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                backgroundColor: '#111319',
                color: '#f1f5f9',
                minWidth: 85,
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#252a38' },
              }}
            >
              <MenuItem value="1/4">1/4 Note</MenuItem>
              <MenuItem value="1/8">1/8 Note</MenuItem>
              <MenuItem value="1/16">1/16 Note</MenuItem>
              <MenuItem value="1/32">1/32 Note</MenuItem>
              <MenuItem value="1/8T">1/8 Triplet</MenuItem>
              <MenuItem value="1/16T">1/16 Triplet</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Strength Slider */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              Strength:
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#cbd5e1' }}>
              {strength}%
            </Typography>
          </Box>
          <Slider
            size="small"
            value={strength}
            onChange={(_, val) => setStrength(val as number)}
            min={0}
            max={100}
            sx={{ py: 0.5 }}
          />
        </Box>

        {/* Swing Slider */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              Swing Groove:
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#cbd5e1' }}>
              {swing}%
            </Typography>
          </Box>
          <Slider
            size="small"
            value={swing}
            onChange={(_, val) => setSwing(val as number)}
            min={0}
            max={100}
            sx={{ py: 0.5 }}
          />
        </Box>

        <Button
          fullWidth
          size="small"
          variant="contained"
          color="primary"
          onClick={handleQuantizeClick}
          disabled={project.notes.length === 0}
          sx={{
            fontSize: '0.75rem',
            fontWeight: 700,
            py: 0.6,
          }}
        >
          Apply Quantize & Swing
        </Button>
      </Paper>

      {/* 3. PLAYBACK MONITOR & AUDITION */}
      <Paper
        elevation={0}
        sx={{
          backgroundColor: '#161922',
          border: '1px solid #252a38',
          p: 1.75,
          borderRadius: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <VolumeUpIcon sx={{ fontSize: '1.1rem', color: '#38bdf8' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#f1f5f9' }}>
            Monitor & Sound Engine
          </Typography>
        </Box>

        {/* Solo / Mix Mode */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
            Playback Source:
          </Typography>
          <ButtonGroup size="small" fullWidth sx={{ backgroundColor: '#111319', borderRadius: 1 }}>
            <Button
              variant={monitorMode === 'both' ? 'contained' : 'outlined'}
              onClick={() => setMonitorMode('both')}
              sx={{
                fontSize: '0.7rem',
                py: 0.4,
                backgroundColor: monitorMode === 'both' ? '#38bdf8' : 'transparent',
                color: monitorMode === 'both' ? '#0c0e12' : '#94a3b8',
                borderColor: '#252a38',
              }}
            >
              Both
            </Button>
            <Button
              variant={monitorMode === 'audio' ? 'contained' : 'outlined'}
              onClick={() => setMonitorMode('audio')}
              sx={{
                fontSize: '0.7rem',
                py: 0.4,
                backgroundColor: monitorMode === 'audio' ? '#38bdf8' : 'transparent',
                color: monitorMode === 'audio' ? '#0c0e12' : '#94a3b8',
                borderColor: '#252a38',
              }}
            >
              Audio Only
            </Button>
            <Button
              variant={monitorMode === 'midi' ? 'contained' : 'outlined'}
              onClick={() => setMonitorMode('midi')}
              sx={{
                fontSize: '0.7rem',
                py: 0.4,
                backgroundColor: monitorMode === 'midi' ? '#38bdf8' : 'transparent',
                color: monitorMode === 'midi' ? '#0c0e12' : '#94a3b8',
                borderColor: '#252a38',
              }}
            >
              MIDI Only
            </Button>
          </ButtonGroup>
        </Box>

        {/* Sound Engine Selector */}
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block', mb: 0.5 }}>
            MIDI Synthesizer Instrument:
          </Typography>
          <FormControl size="small" fullWidth>
            <Select
              value={synthSound}
              onChange={(e) => setSynthSound(e.target.value as SynthSound)}
              sx={{
                height: 28,
                fontSize: '0.75rem',
                backgroundColor: '#111319',
                color: '#f1f5f9',
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#252a38' },
              }}
            >
              <MenuItem value="epiano">Electric Piano (Rhodes)</MenuItem>
              <MenuItem value="synth">Warm Poly Synthesizer</MenuItem>
              <MenuItem value="pluck">Acoustic Pluck</MenuItem>
              <MenuItem value="bass">Sub / 808 Bass</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Audio Volume & Mute */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                onClick={toggleAudioMute}
                sx={{
                  px: 0.75,
                  py: 0.2,
                  fontSize: '0.625rem',
                  fontWeight: 800,
                  borderRadius: 0.5,
                  cursor: 'pointer',
                  backgroundColor: isAudioMuted ? '#ef4444' : '#181b24',
                  color: isAudioMuted ? '#ffffff' : '#94a3b8',
                  border: isAudioMuted ? '1px solid #dc2626' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: isAudioMuted ? '#dc2626' : '#252a38',
                  },
                }}
              >
                MUTE
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: isAudioMuted ? '#64748b' : '#94a3b8',
                  fontSize: '0.6875rem',
                  textDecoration: isAudioMuted ? 'line-through' : 'none',
                }}
              >
                Original Audio:
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#94a3b8' }}>
              {isAudioMuted ? 'MUTED' : `${Math.round(audioVolume * 100)}%`}
            </Typography>
          </Box>
          <Slider
            size="small"
            disabled={isAudioMuted}
            value={isAudioMuted ? 0 : Math.round(audioVolume * 100)}
            onChange={(_, v) => setAudioVolume((v as number) / 100)}
            sx={{ py: 0.5, opacity: isAudioMuted ? 0.3 : 1 }}
          />
        </Box>

        {/* MIDI Synth Volume & Mute */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box
                onClick={toggleMidiMute}
                sx={{
                  px: 0.75,
                  py: 0.2,
                  fontSize: '0.625rem',
                  fontWeight: 800,
                  borderRadius: 0.5,
                  cursor: 'pointer',
                  backgroundColor: isMidiMuted ? '#ef4444' : '#181b24',
                  color: isMidiMuted ? '#ffffff' : '#94a3b8',
                  border: isMidiMuted ? '1px solid #dc2626' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: isMidiMuted ? '#dc2626' : '#252a38',
                  },
                }}
              >
                MUTE
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: isMidiMuted ? '#64748b' : '#94a3b8',
                  fontSize: '0.6875rem',
                  textDecoration: isMidiMuted ? 'line-through' : 'none',
                }}
              >
                MIDI Synth:
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#94a3b8' }}>
              {isMidiMuted ? 'MUTED' : `${Math.round(midiVolume * 100)}%`}
            </Typography>
          </Box>
          <Slider
            size="small"
            disabled={isMidiMuted}
            value={isMidiMuted ? 0 : Math.round(midiVolume * 100)}
            onChange={(_, v) => setMidiVolume((v as number) / 100)}
            sx={{ py: 0.5, opacity: isMidiMuted ? 0.3 : 1 }}
          />
        </Box>

        {/* Quick Audition Button */}
        <Button
          fullWidth
          size="small"
          variant="contained"
          startIcon={<HeadphonesIcon sx={{ fontSize: '0.95rem' }} />}
          onClick={previewGeneratedMidi}
          disabled={project.notes.length === 0}
          sx={{
            fontSize: '0.75rem',
            fontWeight: 800,
            py: 0.75,
            backgroundColor: '#f59e0b',
            color: '#0c0e12',
            '&:hover': {
              backgroundColor: '#fbbf24',
            },
          }}
        >
          Preview Generated MIDI (Mute Sample)
        </Button>
      </Paper>

      {/* 4. DIAGNOSTICS & HONEST ADVICE */}
      {diagnostics.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            backgroundColor: '#161922',
            border: '1px solid #252a38',
            p: 1.5,
            borderRadius: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
            <InfoOutlinedIcon sx={{ fontSize: '0.95rem', color: '#94a3b8' }} />
            <Typography variant="caption" sx={{ fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.04em' }}>
              Analysis Diagnostics
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {diagnostics.map((diag) => (
              <Alert
                key={diag.id}
                severity={diag.level}
                sx={{
                  py: 0.25,
                  px: 1,
                  fontSize: '0.6875rem',
                  backgroundColor: '#111319',
                  color: '#cbd5e1',
                  '& .MuiAlert-icon': { fontSize: '0.9rem', mr: 0.75 },
                }}
              >
                <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, lineHeight: 1.2 }}>
                  {diag.title}
                </Typography>
                <Typography sx={{ fontSize: '0.625rem', color: '#94a3b8', lineHeight: 1.2 }}>
                  {diag.description}
                </Typography>
              </Alert>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};
