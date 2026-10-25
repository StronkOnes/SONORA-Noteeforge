/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  FormControl,
  Select,
  MenuItem,
  LinearProgress,
  Tooltip,
  Paper,
  Switch,
  FormControlLabel,
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ViewAgendaIcon from '@mui/icons-material/ViewAgenda';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useProject } from '../../state/ProjectStore.tsx';
import { AnalysisMode, InstrumentProfile } from '../../music/MusicalProject.ts';

export const AnalysisControls: React.FC = () => {
  const {
    project,
    setAnalysisMode,
    setInstrumentProfile,
    runAnalysis,
    cancelAnalysis,
    analysisStatus,
    analysisProgress,
    analysisStep,
    audioBuffer,
    setSelectedRegion,
  } = useProject();

  const isAnalyzing = analysisStatus === 'analyzing';
  const regionDuration = project.selectedRegion.endSeconds - project.selectedRegion.startSeconds;

  const handleSelectFullAudio = () => {
    if (audioBuffer) {
      setSelectedRegion(0, audioBuffer.duration);
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        backgroundColor: '#12151c',
        borderBottom: '1px solid #20242e',
        px: 2.5,
        py: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        {/* Left: Mode Selector */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: '#64748b',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.6875rem',
                mb: 0.5,
              }}
            >
              1. Analysis Mode
            </Typography>
            <ButtonGroup size="small" sx={{ backgroundColor: '#181b22', borderRadius: 1 }}>
              <Button
                variant={project.analysisMode === 'vocal' ? 'contained' : 'outlined'}
                onClick={() => setAnalysisMode('vocal')}
                startIcon={<MicIcon sx={{ fontSize: '0.95rem !important' }} />}
                sx={{
                  backgroundColor: project.analysisMode === 'vocal' ? '#f59e0b' : 'transparent',
                  color: project.analysisMode === 'vocal' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#292e3c',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  py: 0.6,
                  px: 1.5,
                  '&:hover': {
                    backgroundColor: project.analysisMode === 'vocal' ? '#fbbf24' : '#222733',
                  },
                }}
              >
                Vocal
              </Button>
              <Button
                variant={project.analysisMode === 'melody' ? 'contained' : 'outlined'}
                onClick={() => setAnalysisMode('melody')}
                startIcon={<MusicNoteIcon sx={{ fontSize: '0.95rem !important' }} />}
                sx={{
                  backgroundColor: project.analysisMode === 'melody' ? '#f59e0b' : 'transparent',
                  color: project.analysisMode === 'melody' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#292e3c',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  py: 0.6,
                  px: 1.5,
                  '&:hover': {
                    backgroundColor: project.analysisMode === 'melody' ? '#fbbf24' : '#222733',
                  },
                }}
              >
                Melody / Lead
              </Button>
              <Button
                variant={project.analysisMode === 'chords' ? 'contained' : 'outlined'}
                onClick={() => setAnalysisMode('chords')}
                startIcon={<ViewAgendaIcon sx={{ fontSize: '0.95rem !important' }} />}
                sx={{
                  backgroundColor: project.analysisMode === 'chords' ? '#f59e0b' : 'transparent',
                  color: project.analysisMode === 'chords' ? '#0c0e12' : '#94a3b8',
                  borderColor: '#292e3c',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  py: 0.6,
                  px: 1.5,
                  '&:hover': {
                    backgroundColor: project.analysisMode === 'chords' ? '#fbbf24' : '#222733',
                  },
                }}
              >
                Chords / Harmony
              </Button>
            </ButtonGroup>
          </Box>

          {/* Instrument Profile (if Melody or Chords) */}
          {project.analysisMode !== 'vocal' && (
            <Box>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#64748b',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontSize: '0.6875rem',
                  mb: 0.5,
                }}
              >
                Instrument Profile
              </Typography>
              <FormControl size="small">
                <Select
                  value={project.instrumentProfile}
                  onChange={(e) => setInstrumentProfile(e.target.value as InstrumentProfile)}
                  sx={{
                    height: 33,
                    fontSize: '0.8125rem',
                    backgroundColor: '#181b22',
                    borderColor: '#292e3c',
                    color: '#f1f5f9',
                    minWidth: 130,
                    '.MuiOutlinedInput-notchedOutline': {
                      borderColor: '#292e3c',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#3f4659',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#f59e0b',
                    },
                  }}
                >
                  <MenuItem value="piano">Piano / Rhodes</MenuItem>
                  <MenuItem value="bass">Bass / 808 Sub</MenuItem>
                  <MenuItem value="guitar">Guitar</MenuItem>
                  <MenuItem value="synth">Synthesizer / Pluck</MenuItem>
                  <MenuItem value="other">General Pitched</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Vocal Mode Setting: Pitch Bends vs Clean */}
          {project.analysisMode === 'vocal' && (
            <Box sx={{ pt: 1.8 }}>
              <Tooltip title="When enabled, captures vocal pitch micro-movements, glides, and vibrato as MIDI pitch bend events">
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={project.expressiveVibrato}
                      onChange={(e) => {
                        // Will apply to next transcription
                      }}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#f59e0b',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#d97706',
                        },
                      }}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 500 }}>
                      Capture Pitch Bends & Vibrato
                    </Typography>
                  }
                />
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Center / Right: Region details & Analyze Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          {/* Selected Region Info */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              backgroundColor: '#181b22',
              px: 1.5,
              py: 0.6,
              borderRadius: 1,
              border: '1px solid #282d38',
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', display: 'block' }}>
                Analysis Region
              </Typography>
              <Typography
                sx={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.75rem',
                  color: '#cbd5e1',
                  fontWeight: 600,
                }}
              >
                {project.selectedRegion.startSeconds.toFixed(2)}s - {project.selectedRegion.endSeconds.toFixed(2)}s (
                <span style={{ color: '#f59e0b' }}>{regionDuration.toFixed(2)}s</span>)
              </Typography>
            </Box>

            {audioBuffer && (
              <Button
                size="small"
                variant="text"
                onClick={handleSelectFullAudio}
                sx={{
                  fontSize: '0.6875rem',
                  color: '#94a3b8',
                  p: 0.3,
                  minWidth: 'auto',
                  '&:hover': { color: '#f59e0b' },
                }}
              >
                Full Track
              </Button>
            )}
          </Box>

          {/* Action Button: Run Analysis */}
          {isAnalyzing ? (
            <Button
              variant="outlined"
              color="error"
              size="medium"
              startIcon={<CloseIcon fontSize="small" />}
              onClick={cancelAnalysis}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                px: 2.5,
                py: 0.8,
                height: 38,
                borderColor: '#ef4444',
                color: '#ef4444',
                '&:hover': {
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                },
              }}
            >
              Cancel
            </Button>
          ) : (
            <Button
              variant="contained"
              color="primary"
              size="medium"
              startIcon={<AutoAwesomeIcon sx={{ fontSize: '1.05rem !important' }} />}
              onClick={runAnalysis}
              disabled={!audioBuffer}
              sx={{
                fontSize: '0.8125rem',
                fontWeight: 800,
                letterSpacing: '0.02em',
                px: 2.75,
                py: 0.8,
                height: 38,
                backgroundColor: '#f59e0b',
                color: '#0c0e12',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
                '&:hover': {
                  backgroundColor: '#fbbf24',
                },
              }}
            >
              Analyze Region
            </Button>
          )}
        </Box>
      </Box>

      {/* Honest Progress Indicator */}
      {isAnalyzing && (
        <Box sx={{ mt: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 600 }}>
              {analysisStep}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: "'JetBrains Mono', monospace", color: '#94a3b8' }}>
              {Math.round(analysisProgress * 100)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.round(analysisProgress * 100)}
            sx={{
              height: 4,
              borderRadius: 2,
              backgroundColor: '#1f2430',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#f59e0b',
              },
            }}
          />
        </Box>
      )}
    </Paper>
  );
};
