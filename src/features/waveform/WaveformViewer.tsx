/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Paper,
  Divider,
  Button,
  ButtonGroup,
  Slider,
  Select,
  MenuItem,
  FormControl,
  Chip,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import RepeatIcon from '@mui/icons-material/Repeat';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import PianoIcon from '@mui/icons-material/Piano';
import { useProject } from '../../state/ProjectStore.tsx';
import { formatTime } from '../../music/NoteEvent.ts';
import { SynthSound } from '../../audio/MidiSynth.ts';

export const WaveformViewer: React.FC = () => {
  const {
    audioBuffer,
    waveformPeaks,
    project,
    setSelectedRegion,
    playheadTime,
    isPlaying,
    isLooping,
    play,
    pause,
    stop,
    seek,
    toggleLoop,
    isAudioMuted,
    isMidiMuted,
    toggleAudioMute,
    toggleMidiMute,
    setAudioMuted,
    setMidiMuted,
    previewGeneratedMidi,
    previewOriginalAudio,
    previewBoth,
    monitorMode,
    audioVolume,
    setAudioVolume,
    midiVolume,
    setMidiVolume,
    synthSound,
    setSynthSound,
  } = useProject();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Viewport state: horizontal zoom factor (1 = 100% full view)
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Region drag interaction state
  const [draggingMode, setDraggingMode] = useState<'left' | 'right' | 'body' | null>(null);
  const dragStartX = useRef<number>(0);
  const dragInitialRegion = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const totalDuration = audioBuffer ? audioBuffer.duration : 4.0;

  // Zoom in / out handlers
  const handleZoomIn = () => setZoom((z) => Math.min(8, z * 1.3));
  const handleZoomOut = () => setZoom((z) => Math.max(1, z / 1.3));
  const handleZoomReset = () => {
    setZoom(1);
    setScrollOffset(0);
  };

  // Convert pixel X on canvas to audio timestamp in seconds
  const pixelToSeconds = useCallback(
    (pixelX: number, width: number): number => {
      const visibleDuration = totalDuration / zoom;
      const startTime = scrollOffset * totalDuration;
      const fraction = pixelX / width;
      return startTime + fraction * visibleDuration;
    },
    [totalDuration, zoom, scrollOffset]
  );

  // Convert audio timestamp in seconds to pixel X on canvas
  const secondsToPixel = useCallback(
    (seconds: number, width: number): number => {
      const visibleDuration = totalDuration / zoom;
      const startTime = scrollOffset * totalDuration;
      const fraction = (seconds - startTime) / visibleDuration;
      return fraction * width;
    },
    [totalDuration, zoom, scrollOffset]
  );

  // Draw Waveform and Overlay on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width;
    const height = rect.height;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0f1217';
    ctx.fillRect(0, 0, width, height);

    // Grid / Time ruler marks
    const visibleDuration = totalDuration / zoom;
    const startTime = scrollOffset * totalDuration;
    const endTime = startTime + visibleDuration;

    let timeStep = 1.0;
    if (visibleDuration < 2) timeStep = 0.25;
    else if (visibleDuration < 5) timeStep = 0.5;
    else if (visibleDuration > 20) timeStep = 2.0;

    const firstMark = Math.floor(startTime / timeStep) * timeStep;

    ctx.strokeStyle = '#1e232e';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';

    for (let t = firstMark; t <= endTime; t += timeStep) {
      const x = secondsToPixel(t, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillText(`${t.toFixed(1)}s`, x + 4, 12);
    }

    // Center baseline
    const centerY = height / 2;
    ctx.strokeStyle = '#222733';
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Render Waveform Peaks
    if (waveformPeaks && waveformPeaks.buckets > 0) {
      const buckets = waveformPeaks.buckets;
      const startBucket = Math.floor((startTime / totalDuration) * buckets);
      const endBucket = Math.min(buckets, Math.ceil((endTime / totalDuration) * buckets));

      ctx.beginPath();
      for (let b = startBucket; b < endBucket; b++) {
        const bucketTime = (b / buckets) * totalDuration;
        const x = secondsToPixel(bucketTime, width);
        const minVal = waveformPeaks.min[b];
        const maxVal = waveformPeaks.max[b];

        const yTop = centerY - maxVal * (height * 0.44);
        const yBottom = centerY - minVal * (height * 0.44);

        ctx.moveTo(x, yTop);
        ctx.lineTo(x, Math.max(yTop + 1, yBottom));
      }

      // If audio is muted, render waveform in muted slate tone
      ctx.strokeStyle = isAudioMuted ? '#334155' : '#64748b';
      ctx.lineWidth = Math.max(1, (width / (endBucket - startBucket)) * 0.9);
      ctx.stroke();

      // Render Selected Region Waveform in Amber (or subdued if audio is muted)
      const regionStartSec = project.selectedRegion.startSeconds;
      const regionEndSec = project.selectedRegion.endSeconds;
      const regStartPx = Math.max(0, secondsToPixel(regionStartSec, width));
      const regEndPx = Math.min(width, secondsToPixel(regionEndSec, width));

      if (regEndPx > regStartPx) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(regStartPx, 0, regEndPx - regStartPx, height);
        ctx.clip();

        ctx.beginPath();
        for (let b = startBucket; b < endBucket; b++) {
          const bucketTime = (b / buckets) * totalDuration;
          const x = secondsToPixel(bucketTime, width);
          const minVal = waveformPeaks.min[b];
          const maxVal = waveformPeaks.max[b];

          const yTop = centerY - maxVal * (height * 0.44);
          const yBottom = centerY - minVal * (height * 0.44);

          ctx.moveTo(x, yTop);
          ctx.lineTo(x, Math.max(yTop + 1, yBottom));
        }
        // Amber highlighted waveform if active, subdued amber if audio track is muted
        ctx.strokeStyle = isAudioMuted ? '#785317' : '#f59e0b';
        ctx.stroke();
        ctx.restore();
      }
    }

    // Selected Region Dim & Highlight Overlay
    const regStartPx = secondsToPixel(project.selectedRegion.startSeconds, width);
    const regEndPx = secondsToPixel(project.selectedRegion.endSeconds, width);

    // Dim non-selected areas
    ctx.fillStyle = 'rgba(10, 12, 16, 0.65)';
    if (regStartPx > 0) {
      ctx.fillRect(0, 0, regStartPx, height);
    }
    if (regEndPx < width) {
      ctx.fillRect(regEndPx, 0, width - regEndPx, height);
    }

    // Highlight area border
    ctx.fillStyle = isAudioMuted ? 'rgba(56, 189, 248, 0.05)' : 'rgba(245, 158, 11, 0.08)';
    ctx.fillRect(regStartPx, 0, regEndPx - regStartPx, height);

    ctx.strokeStyle = isAudioMuted ? '#38bdf8' : '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(regStartPx, 0);
    ctx.lineTo(regStartPx, height);
    ctx.moveTo(regEndPx, 0);
    ctx.lineTo(regEndPx, height);
    ctx.stroke();

    // Region drag handle tabs
    const handleW = 6;
    ctx.fillStyle = isAudioMuted ? '#38bdf8' : '#f59e0b';
    ctx.fillRect(regStartPx - handleW, 0, handleW, height);
    ctx.fillRect(regEndPx, 0, handleW, height);

    // Playhead Line
    const playheadPx = secondsToPixel(playheadTime, width);
    if (playheadPx >= 0 && playheadPx <= width) {
      ctx.strokeStyle = '#38bdf8'; // Ice Cyan Playhead
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadPx, 0);
      ctx.lineTo(playheadPx, height);
      ctx.stroke();

      // Playhead top marker
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(playheadPx - 5, 0);
      ctx.lineTo(playheadPx + 5, 0);
      ctx.lineTo(playheadPx, 7);
      ctx.closePath();
      ctx.fill();
    }
  }, [
    waveformPeaks,
    project.selectedRegion,
    playheadTime,
    totalDuration,
    zoom,
    scrollOffset,
    secondsToPixel,
    isAudioMuted,
  ]);

  // Mouse event handlers for Region dragging and Seeking
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    const leftHandleX = secondsToPixel(project.selectedRegion.startSeconds, width);
    const rightHandleX = secondsToPixel(project.selectedRegion.endSeconds, width);
    const tolerance = 8;

    dragStartX.current = x;
    dragInitialRegion.current = {
      start: project.selectedRegion.startSeconds,
      end: project.selectedRegion.endSeconds,
    };

    if (Math.abs(x - leftHandleX) <= tolerance) {
      setDraggingMode('left');
    } else if (Math.abs(x - rightHandleX) <= tolerance) {
      setDraggingMode('right');
    } else if (x > leftHandleX && x < rightHandleX) {
      setDraggingMode('body');
    } else {
      const targetSec = pixelToSeconds(x, width);
      seek(targetSec);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (!draggingMode) {
      const leftHandleX = secondsToPixel(project.selectedRegion.startSeconds, width);
      const rightHandleX = secondsToPixel(project.selectedRegion.endSeconds, width);
      const tolerance = 8;

      if (Math.abs(x - leftHandleX) <= tolerance || Math.abs(x - rightHandleX) <= tolerance) {
        canvas.style.cursor = 'ew-resize';
      } else if (x > leftHandleX && x < rightHandleX) {
        canvas.style.cursor = 'grab';
      } else {
        canvas.style.cursor = 'pointer';
      }
      return;
    }

    const deltaX = x - dragStartX.current;
    const timeDelta = (deltaX / width) * (totalDuration / zoom);

    if (draggingMode === 'left') {
      const newStart = Math.max(
        0,
        Math.min(dragInitialRegion.current.end - 0.1, dragInitialRegion.current.start + timeDelta)
      );
      setSelectedRegion(newStart, dragInitialRegion.current.end);
    } else if (draggingMode === 'right') {
      const newEnd = Math.max(
        dragInitialRegion.current.start + 0.1,
        Math.min(totalDuration, dragInitialRegion.current.end + timeDelta)
      );
      setSelectedRegion(dragInitialRegion.current.start, newEnd);
    } else if (draggingMode === 'body') {
      const dur = dragInitialRegion.current.end - dragInitialRegion.current.start;
      let newStart = dragInitialRegion.current.start + timeDelta;
      let newEnd = dragInitialRegion.current.end + timeDelta;

      if (newStart < 0) {
        newStart = 0;
        newEnd = dur;
      }
      if (newEnd > totalDuration) {
        newEnd = totalDuration;
        newStart = totalDuration - dur;
      }
      setSelectedRegion(newStart, newEnd);
    }
  };

  const handleMouseUp = () => {
    setDraggingMode(null);
  };

  return (
    <Paper
      elevation={0}
      ref={containerRef}
      sx={{
        backgroundColor: '#0c0e12',
        borderBottom: '1px solid #1f232d',
      }}
    >
      {/* Waveform Canvas with Active Status Badges */}
      <Box sx={{ position: 'relative', height: 110, width: '100%', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />

        {/* Audio Mute Indicator Banner */}
        {isAudioMuted && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 12,
              backgroundColor: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.6)',
              borderRadius: 1,
              px: 1.25,
              py: 0.4,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <VolumeOffIcon sx={{ color: '#ef4444', fontSize: '0.9rem' }} />
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: '#fca5a5',
                letterSpacing: '0.04em',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              AUDIO MUTED • AUDITIONING GENERATED MIDI SYNTH
            </Typography>
          </Box>
        )}

        {/* MIDI Muted Indicator Banner */}
        {isMidiMuted && !isAudioMuted && (
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              left: 12,
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 1,
              px: 1.25,
              py: 0.4,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              backdropFilter: 'blur(4px)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <VolumeOffIcon sx={{ color: '#f59e0b', fontSize: '0.9rem' }} />
            <Typography
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: '#fbbf24',
                letterSpacing: '0.04em',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              MIDI MUTED • AUDITIONING ORIGINAL SAMPLE ONLY
            </Typography>
          </Box>
        )}
      </Box>

      {/* Main Transport & Live Track Audition Monitor Strip */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.75,
          backgroundColor: '#12151e',
          borderTop: '1px solid #1f232c',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Left: Playback Transport Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            onClick={isPlaying ? pause : () => play()}
            sx={{
              backgroundColor: isPlaying ? '#f59e0b' : '#222735',
              color: isPlaying ? '#0c0e12' : '#f1f5f9',
              p: 0.8,
              '&:hover': {
                backgroundColor: isPlaying ? '#fbbf24' : '#2a3142',
              },
            }}
          >
            {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>

          <IconButton
            size="small"
            onClick={stop}
            sx={{
              backgroundColor: '#181b22',
              color: '#94a3b8',
              border: '1px solid #282d3b',
              p: 0.8,
              '&:hover': { backgroundColor: '#222735', color: '#f1f5f9' },
            }}
          >
            <StopIcon fontSize="small" />
          </IconButton>

          <Tooltip title={isLooping ? 'Looping active (Region)' : 'Looping disabled'}>
            <IconButton
              size="small"
              onClick={toggleLoop}
              sx={{
                backgroundColor: isLooping ? 'rgba(245, 158, 11, 0.15)' : '#181b22',
                color: isLooping ? '#f59e0b' : '#64748b',
                border: isLooping ? '1px solid #f59e0b' : '1px solid #282d3b',
                p: 0.8,
                '&:hover': {
                  backgroundColor: isLooping ? 'rgba(245, 158, 11, 0.25)' : '#222735',
                },
              }}
            >
              <RepeatIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5, mx: 0.5 }} />

          {/* Time Counter */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.9375rem',
                fontWeight: 700,
                color: '#38bdf8',
                letterSpacing: '0.04em',
              }}
            >
              {formatTime(playheadTime)}
            </Typography>
            <Typography
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              / {formatTime(totalDuration)}
            </Typography>
          </Box>
        </Box>

        {/* Center: DAW-Style Mute, Solo & Audition Monitor Channels */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            backgroundColor: '#0a0c10',
            border: '1px solid #222633',
            borderRadius: 1.5,
            px: 1.5,
            py: 0.5,
            flexWrap: 'wrap',
          }}
        >
          {/* Quick Audition Presets */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Tooltip title="Mute original audio and solo generated MIDI synthesizer notes to audition transcription accuracy">
              <Button
                size="small"
                variant={isAudioMuted && !isMidiMuted ? 'contained' : 'outlined'}
                onClick={previewGeneratedMidi}
                startIcon={<HeadphonesIcon sx={{ fontSize: '0.85rem !important' }} />}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  height: 28,
                  px: 1.25,
                  backgroundColor: isAudioMuted && !isMidiMuted ? '#f59e0b' : 'rgba(245, 158, 11, 0.08)',
                  color: isAudioMuted && !isMidiMuted ? '#0c0e12' : '#fbbf24',
                  borderColor: 'rgba(245, 158, 11, 0.4)',
                  '&:hover': {
                    backgroundColor: isAudioMuted && !isMidiMuted ? '#fbbf24' : 'rgba(245, 158, 11, 0.18)',
                  },
                }}
              >
                Preview MIDI Only
              </Button>
            </Tooltip>

            <Tooltip title="Mute generated MIDI notes and listen to original audio recording alone">
              <Button
                size="small"
                variant={isMidiMuted && !isAudioMuted ? 'contained' : 'outlined'}
                onClick={previewOriginalAudio}
                startIcon={<GraphicEqIcon sx={{ fontSize: '0.85rem !important' }} />}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  height: 28,
                  px: 1.25,
                  backgroundColor: isMidiMuted && !isAudioMuted ? '#38bdf8' : '#141720',
                  color: isMidiMuted && !isAudioMuted ? '#0c0e12' : '#94a3b8',
                  borderColor: '#292e3c',
                  '&:hover': {
                    backgroundColor: isMidiMuted && !isAudioMuted ? '#7dd3fc' : '#1f2432',
                  },
                }}
              >
                Original Audio
              </Button>
            </Tooltip>

            <Tooltip title="Play both original sample and transcribed MIDI together to compare tracking">
              <Button
                size="small"
                variant={!isAudioMuted && !isMidiMuted ? 'contained' : 'outlined'}
                onClick={previewBoth}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  height: 28,
                  px: 1.25,
                  backgroundColor: !isAudioMuted && !isMidiMuted ? '#252a38' : '#141720',
                  color: !isAudioMuted && !isMidiMuted ? '#f1f5f9' : '#64748b',
                  borderColor: '#292e3c',
                  '&:hover': {
                    backgroundColor: '#2f3545',
                  },
                }}
              >
                Mix Both
              </Button>
            </Tooltip>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.2 }} />

          {/* Track 1: Original Audio Channel Strip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: isAudioMuted ? '#64748b' : '#cbd5e1',
                textDecoration: isAudioMuted ? 'line-through' : 'none',
                letterSpacing: '0.04em',
              }}
            >
              AUDIO
            </Typography>

            {/* Audio Mute Button */}
            <Tooltip title={isAudioMuted ? 'Unmute Original Audio' : 'Mute Original Audio'}>
              <Box
                onClick={toggleAudioMute}
                sx={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  borderRadius: 0.75,
                  cursor: 'pointer',
                  backgroundColor: isAudioMuted ? '#ef4444' : '#181b24',
                  color: isAudioMuted ? '#ffffff' : '#94a3b8',
                  border: isAudioMuted ? '1px solid #dc2626' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: isAudioMuted ? '#dc2626' : '#222735',
                  },
                }}
              >
                M
              </Box>
            </Tooltip>

            {/* Audio Solo Button */}
            <Tooltip title="Solo Original Audio (Mutes MIDI)">
              <Box
                onClick={() => {
                  setAudioMuted(false);
                  setMidiMuted(true);
                }}
                sx={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  borderRadius: 0.75,
                  cursor: 'pointer',
                  backgroundColor: !isAudioMuted && isMidiMuted ? '#38bdf8' : '#181b24',
                  color: !isAudioMuted && isMidiMuted ? '#0c0e12' : '#94a3b8',
                  border: !isAudioMuted && isMidiMuted ? '1px solid #0284c7' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: !isAudioMuted && isMidiMuted ? '#7dd3fc' : '#222735',
                  },
                }}
              >
                S
              </Box>
            </Tooltip>

            {/* Audio Level Slider */}
            <Box sx={{ width: 55, mx: 0.5 }}>
              <Slider
                size="small"
                disabled={isAudioMuted}
                value={isAudioMuted ? 0 : Math.round(audioVolume * 100)}
                onChange={(_, v) => setAudioVolume((v as number) / 100)}
                sx={{
                  py: 0.5,
                  color: '#38bdf8',
                  opacity: isAudioMuted ? 0.3 : 1,
                }}
              />
            </Box>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.2 }} />

          {/* Track 2: Transcribed MIDI Channel Strip */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: 700,
                color: isMidiMuted ? '#64748b' : '#f59e0b',
                textDecoration: isMidiMuted ? 'line-through' : 'none',
                letterSpacing: '0.04em',
              }}
            >
              MIDI SYNTH
            </Typography>

            {/* MIDI Mute Button */}
            <Tooltip title={isMidiMuted ? 'Unmute MIDI Synth' : 'Mute MIDI Synth'}>
              <Box
                onClick={toggleMidiMute}
                sx={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  borderRadius: 0.75,
                  cursor: 'pointer',
                  backgroundColor: isMidiMuted ? '#ef4444' : '#181b24',
                  color: isMidiMuted ? '#ffffff' : '#94a3b8',
                  border: isMidiMuted ? '1px solid #dc2626' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: isMidiMuted ? '#dc2626' : '#222735',
                  },
                }}
              >
                M
              </Box>
            </Tooltip>

            {/* MIDI Solo Button */}
            <Tooltip title="Solo Generated MIDI (Mutes Original Audio)">
              <Box
                onClick={() => {
                  setAudioMuted(true);
                  setMidiMuted(false);
                }}
                sx={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.6875rem',
                  fontWeight: 800,
                  borderRadius: 0.75,
                  cursor: 'pointer',
                  backgroundColor: isAudioMuted && !isMidiMuted ? '#f59e0b' : '#181b24',
                  color: isAudioMuted && !isMidiMuted ? '#0c0e12' : '#94a3b8',
                  border: isAudioMuted && !isMidiMuted ? '1px solid #d97706' : '1px solid #2d3445',
                  transition: 'all 0.1s ease',
                  '&:hover': {
                    backgroundColor: isAudioMuted && !isMidiMuted ? '#fbbf24' : '#222735',
                  },
                }}
              >
                S
              </Box>
            </Tooltip>

            {/* Synth Instrument Picker */}
            <FormControl size="small">
              <Select
                value={synthSound}
                onChange={(e) => setSynthSound(e.target.value as SynthSound)}
                sx={{
                  height: 24,
                  fontSize: '0.6875rem',
                  backgroundColor: '#161922',
                  color: '#cbd5e1',
                  minWidth: 105,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#2d3445' },
                }}
              >
                <MenuItem value="epiano" sx={{ fontSize: '0.75rem' }}>Rhodes Piano</MenuItem>
                <MenuItem value="synth" sx={{ fontSize: '0.75rem' }}>Poly Synth</MenuItem>
                <MenuItem value="pluck" sx={{ fontSize: '0.75rem' }}>Plucked String</MenuItem>
                <MenuItem value="bass" sx={{ fontSize: '0.75rem' }}>808 Sub-Bass</MenuItem>
              </Select>
            </FormControl>

            {/* MIDI Level Slider */}
            <Box sx={{ width: 55, mx: 0.5 }}>
              <Slider
                size="small"
                disabled={isMidiMuted}
                value={isMidiMuted ? 0 : Math.round(midiVolume * 100)}
                onChange={(_, v) => setMidiVolume((v as number) / 100)}
                sx={{
                  py: 0.5,
                  color: '#f59e0b',
                  opacity: isMidiMuted ? 0.3 : 1,
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Right: Zoom & Viewport Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Zoom In">
            <IconButton
              size="small"
              onClick={handleZoomIn}
              sx={{ color: '#94a3b8', p: 0.5, '&:hover': { color: '#f1f5f9' } }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Zoom Out">
            <IconButton
              size="small"
              onClick={handleZoomOut}
              sx={{ color: '#94a3b8', p: 0.5, '&:hover': { color: '#f1f5f9' } }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Reset Zoom">
            <IconButton
              size="small"
              onClick={handleZoomReset}
              sx={{ color: '#94a3b8', p: 0.5, '&:hover': { color: '#f1f5f9' } }}
            >
              <RestartAltIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
};
