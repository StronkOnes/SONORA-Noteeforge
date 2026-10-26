/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  Divider,
  Button,
} from '@mui/material';
import PanToolIcon from '@mui/icons-material/PanTool';
import CreateIcon from '@mui/icons-material/Create';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import DeleteIcon from '@mui/icons-material/Delete';
import StraightenIcon from '@mui/icons-material/Straighten';
import TuneIcon from '@mui/icons-material/Tune';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import { useProject, EditorTool } from '../../state/ProjectStore.tsx';
import {
  NOTE_NAMES,
  pitchToNoteName,
  pitchToPitchClass,
  NoteEvent,
} from '../../music/NoteEvent.ts';
import { isPitchInScale } from '../../music/Scale.ts';
import { sharedMidiSynth } from '../../audio/MidiSynth.ts';
import { VelocityLane } from './VelocityLane.tsx';
import { PitchBendLane } from './PitchBendLane.tsx';

// Range of playable pitches in NoteForge: MIDI 24 (C1) to MIDI 96 (C7)
const MIN_PITCH = 24;
const MAX_PITCH = 96;
const PITCH_COUNT = MAX_PITCH - MIN_PITCH + 1;
const ROW_HEIGHT = 16;
const PIANO_KEY_WIDTH = 56;

export const PianoRoll: React.FC = () => {
  const {
    project,
    audioBuffer,
    selectedNoteIds,
    selectNotes,
    clearSelection,
    addNote,
    updateNote,
    deleteSelectedNotes,
    splitNote,
    moveSelectedNotes,
    activeTool,
    setActiveTool,
    scaleHighlightEnabled,
    setScaleHighlightEnabled,
    playheadTime,
    seek,
    removeGhostNotes,
    applyLegato,
    humanizeVelocities,
    transposeSelectedNotes,
  } = useProject();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Viewport & Zoom state
  const [pixelsPerSecond, setPixelsPerSecond] = useState(140);
  const [gridSnap, setGridSnap] = useState<'1/4' | '1/8' | '1/16' | '1/32' | 'off'>('1/16');
  const [showVelocityLane, setShowVelocityLane] = useState(true);
  const [showPitchBendLane, setShowPitchBendLane] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);

  // Drag interaction states
  const [dragAction, setDragAction] = useState<
    | { type: 'move'; startX: number; startY: number; noteId: string; initialStartSec: number; initialPitch: number }
    | { type: 'resize-start'; startX: number; noteId: string; initialStartSec: number; initialDurSec: number }
    | { type: 'resize-end'; startX: number; noteId: string; initialDurSec: number }
    | { type: 'marquee'; startX: number; startY: number; currentX: number; currentY: number }
    | { type: 'create'; startX: number; pitch: number; startSec: number }
    | null
  >(null);

  const totalDuration = audioBuffer ? audioBuffer.duration : 4.0;
  const bpm = project.bpm || 120;
  const beatSec = 60 / bpm;

  // Grid snap helper
  const getSnapTime = useCallback(
    (timeSec: number): number => {
      if (gridSnap === 'off') return timeSec;
      let snapUnit = beatSec / 4; // 1/16th
      if (gridSnap === '1/4') snapUnit = beatSec;
      else if (gridSnap === '1/8') snapUnit = beatSec / 2;
      else if (gridSnap === '1/32') snapUnit = beatSec / 8;

      return Math.round(timeSec / snapUnit) * snapUnit;
    },
    [gridSnap, beatSec]
  );

  // Auto-scroll to center on note pitch range when notes load
  useEffect(() => {
    if (project.notes.length > 0 && scrollContainerRef.current) {
      const avgPitch =
        project.notes.reduce((sum, n) => sum + n.pitch, 0) / project.notes.length;
      const targetY = (MAX_PITCH - avgPitch) * ROW_HEIGHT - 120;
      scrollContainerRef.current.scrollTop = Math.max(0, targetY);
    }
  }, [project.lastAnalysisTimestamp]);

  // Click on Piano Key to Audition pitch
  const handleKeyAudition = (pitch: number) => {
    sharedMidiSynth.triggerNote(pitch, 90, 0.4);
  };

  // Convert pixel coordinates to Pitch and Time
  const pixelToPitch = (pixelY: number): number => {
    const row = Math.floor(pixelY / ROW_HEIGHT);
    return Math.max(MIN_PITCH, Math.min(MAX_PITCH, MAX_PITCH - row));
  };

  const pitchToPixelY = (pitch: number): number => {
    return (MAX_PITCH - pitch) * ROW_HEIGHT;
  };

  const pixelToTime = (pixelX: number): number => {
    return Math.max(0, pixelX / pixelsPerSecond);
  };

  const timeToPixelX = (timeSec: number): number => {
    return timeSec * pixelsPerSecond;
  };

  // Mouse Down on Note Rectangle
  const handleNoteMouseDown = (
    e: React.MouseEvent,
    note: NoteEvent,
    handleType: 'body' | 'resize-start' | 'resize-end'
  ) => {
    e.stopPropagation();

    // If erase tool active, delete immediately
    if (activeTool === 'erase') {
      selectNotes([note.id]);
      deleteSelectedNotes();
      return;
    }

    // If split tool active, split note at click time
    if (activeTool === 'split') {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickSec = pixelToTime(e.clientX - rect.left) + note.startSeconds;
      splitNote(note.id, clickSec);
      return;
    }

    // Audition note
    sharedMidiSynth.triggerNote(note.pitch, note.velocity, 0.4);

    // Select note if not already selected
    if (!selectedNoteIds.has(note.id)) {
      selectNotes([note.id], e.shiftKey);
    }

    // Begin Drag
    if (handleType === 'resize-start') {
      setDragAction({
        type: 'resize-start',
        startX: e.clientX,
        noteId: note.id,
        initialStartSec: note.startSeconds,
        initialDurSec: note.durationSeconds,
      });
    } else if (handleType === 'resize-end') {
      setDragAction({
        type: 'resize-end',
        startX: e.clientX,
        noteId: note.id,
        initialDurSec: note.durationSeconds,
      });
    } else {
      setDragAction({
        type: 'move',
        startX: e.clientX,
        startY: e.clientY,
        noteId: note.id,
        initialStartSec: note.startSeconds,
        initialPitch: note.pitch,
      });
    }
  };

  // Mouse Down on Background Grid (Draw, Marquee, or Seek)
  const handleGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const clickedPitch = pixelToPitch(relY);
    const clickedTime = pixelToTime(relX);
    const snappedTime = getSnapTime(clickedTime);

    if (activeTool === 'draw') {
      // Create new note
      const defaultDuration = Math.max(0.1, beatSec / 4);
      addNote({
        pitch: clickedPitch,
        startSeconds: Number(snappedTime.toFixed(3)),
        durationSeconds: Number(defaultDuration.toFixed(3)),
        velocity: 85,
        confidence: 1.0,
        source: 'user',
      });
      sharedMidiSynth.triggerNote(clickedPitch, 85, 0.35);
      return;
    }

    // In Select tool mode: clear selection or start marquee drag
    if (!e.shiftKey) {
      clearSelection();
    }

    setDragAction({
      type: 'marquee',
      startX: relX,
      startY: relY,
      currentX: relX,
      currentY: relY,
    });
  };

  // Mouse Move over Grid
  const handleGridMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragAction) return;

    if (dragAction.type === 'move') {
      const deltaX = e.clientX - dragAction.startX;
      const deltaY = e.clientY - dragAction.startY;

      const deltaTime = deltaX / pixelsPerSecond;
      const deltaPitch = -Math.round(deltaY / ROW_HEIGHT);

      if (deltaPitch !== 0 || Math.abs(deltaTime) > 0.02) {
        const targetNote = project.notes.find((n) => n.id === dragAction.noteId);
        if (targetNote) {
          const rawNewStart = dragAction.initialStartSec + deltaTime;
          const snappedStart = Math.max(0, getSnapTime(rawNewStart));
          const newPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, dragAction.initialPitch + deltaPitch));

          updateNote(dragAction.noteId, {
            startSeconds: Number(snappedStart.toFixed(3)),
            pitch: newPitch,
          });
        }
      }
    } else if (dragAction.type === 'resize-end') {
      const deltaX = e.clientX - dragAction.startX;
      const deltaDur = deltaX / pixelsPerSecond;
      const targetNote = project.notes.find((n) => n.id === dragAction.noteId);
      if (targetNote) {
        const rawDur = dragAction.initialDurSec + deltaDur;
        const newDur = Math.max(0.04, rawDur);
        updateNote(dragAction.noteId, {
          durationSeconds: Number(newDur.toFixed(3)),
        });
      }
    } else if (dragAction.type === 'resize-start') {
      const deltaX = e.clientX - dragAction.startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const targetNote = project.notes.find((n) => n.id === dragAction.noteId);
      if (targetNote) {
        const rawStart = dragAction.initialStartSec + deltaTime;
        const snappedStart = Math.max(0, getSnapTime(rawStart));
        const diff = snappedStart - dragAction.initialStartSec;
        const newDur = Math.max(0.04, dragAction.initialDurSec - diff);

        updateNote(dragAction.noteId, {
          startSeconds: Number(snappedStart.toFixed(3)),
          durationSeconds: Number(newDur.toFixed(3)),
        });
      }
    } else if (dragAction.type === 'marquee') {
      const rect = e.currentTarget.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setDragAction((prev) => (prev && prev.type === 'marquee' ? { ...prev, currentX, currentY } : null));

      // Select notes intersecting marquee box
      const minX = Math.min(dragAction.startX, currentX);
      const maxX = Math.max(dragAction.startX, currentX);
      const minY = Math.min(dragAction.startY, currentY);
      const maxY = Math.max(dragAction.startY, currentY);

      const boxStartSec = pixelToTime(minX);
      const boxEndSec = pixelToTime(maxX);
      const boxMaxPitch = pixelToPitch(minY);
      const boxMinPitch = pixelToPitch(maxY);

      const matchedIds: string[] = [];
      for (const n of project.notes) {
        const nEnd = n.startSeconds + n.durationSeconds;
        if (
          n.startSeconds < boxEndSec &&
          nEnd > boxStartSec &&
          n.pitch >= boxMinPitch &&
          n.pitch <= boxMaxPitch
        ) {
          matchedIds.push(n.id);
        }
      }
      selectNotes(matchedIds, e.shiftKey);
    }
  };

  const handleGridMouseUp = () => {
    setDragAction(null);
  };

  // Double Click on Grid to add Note
  const handleGridDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const relY = e.clientY - rect.top;

    const clickedPitch = pixelToPitch(relY);
    const clickedTime = pixelToTime(relX);
    const snappedTime = getSnapTime(clickedTime);
    const defaultDuration = Math.max(0.1, beatSec / 4);

    addNote({
      pitch: clickedPitch,
      startSeconds: Number(snappedTime.toFixed(3)),
      durationSeconds: Number(defaultDuration.toFixed(3)),
      velocity: 85,
      confidence: 1.0,
      source: 'user',
    });
    sharedMidiSynth.triggerNote(clickedPitch, 85, 0.35);
  };

  // Track scroll position
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
  };

  const rollWidth = Math.max(1200, totalDuration * pixelsPerSecond + 200);

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        backgroundColor: '#0a0c10',
        overflow: 'hidden',
        borderTop: '1px solid #1c202a',
      }}
    >
      {/* Piano Roll Tool Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.6,
          backgroundColor: '#12151d',
          borderBottom: '1px solid #1f232d',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        {/* Left: Editor Tools (Select, Draw, Split, Erase) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ToggleButtonGroup
            size="small"
            value={activeTool}
            exclusive
            onChange={(_, val) => val && setActiveTool(val)}
            sx={{
              backgroundColor: '#181b24',
              borderRadius: 1,
              '& .MuiToggleButton-root': {
                color: '#94a3b8',
                borderColor: '#292e3c',
                py: 0.4,
                px: 1.2,
                fontSize: '0.75rem',
                '&.Mui-selected': {
                  color: '#0c0e12',
                  backgroundColor: '#f59e0b',
                  fontWeight: 700,
                  '&:hover': { backgroundColor: '#fbbf24' },
                },
              },
            }}
          >
            <ToggleButton value="select">
              <Tooltip title="Select & Move (V)">
                <PanToolIcon sx={{ fontSize: '0.95rem' }} />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="draw">
              <Tooltip title="Draw Notes (B) - or Double Click Grid">
                <CreateIcon sx={{ fontSize: '0.95rem' }} />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="split">
              <Tooltip title="Split Note (S) - Click on note to cut">
                <ContentCutIcon sx={{ fontSize: '0.95rem' }} />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="erase">
              <Tooltip title="Erase Note (E) - Click note to delete">
                <DeleteIcon sx={{ fontSize: '0.95rem' }} />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5, mx: 0.5 }} />

          {/* Grid Snap Selector */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <StraightenIcon sx={{ fontSize: '0.9rem', color: '#64748b' }} />
            <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.6875rem', fontWeight: 600 }}>
              Snap:
            </Typography>
            <FormControl size="small">
              <Select
                value={gridSnap}
                onChange={(e) => setGridSnap(e.target.value as typeof gridSnap)}
                sx={{
                  height: 28,
                  fontSize: '0.75rem',
                  backgroundColor: '#181b24',
                  color: '#cbd5e1',
                  minWidth: 80,
                  '.MuiOutlinedInput-notchedOutline': { borderColor: '#292e3c' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#3f4659' },
                }}
              >
                <MenuItem value="1/4">1/4 Note</MenuItem>
                <MenuItem value="1/8">1/8 Note</MenuItem>
                <MenuItem value="1/16">1/16 Note</MenuItem>
                <MenuItem value="1/32">1/32 Note</MenuItem>
                <MenuItem value="off">Off (Raw)</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Scale Highlighting Toggle */}
          <Tooltip title="Highlight piano roll rows that belong to the detected/selected musical scale">
            <IconButton
              size="small"
              onClick={() => setScaleHighlightEnabled(!scaleHighlightEnabled)}
              sx={{
                backgroundColor: scaleHighlightEnabled ? 'rgba(245, 158, 11, 0.15)' : '#181b24',
                color: scaleHighlightEnabled ? '#f59e0b' : '#64748b',
                border: scaleHighlightEnabled ? '1px solid #f59e0b' : '1px solid #292e3c',
                borderRadius: 1,
                px: 1,
                py: 0.4,
                fontSize: '0.75rem',
                fontWeight: 600,
                gap: 0.5,
                '&:hover': {
                  backgroundColor: scaleHighlightEnabled ? 'rgba(245, 158, 11, 0.25)' : '#222733',
                },
              }}
            >
              <TuneIcon sx={{ fontSize: '0.85rem' }} />
              Scale Guide: {scaleHighlightEnabled ? 'ON' : 'OFF'}
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5, mx: 0.5 }} />

          {/* Pro MIDI Polish Toolkit */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Tooltip title="Remove accidental ghost notes shorter than 70ms or below 30 velocity">
              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoFixHighIcon sx={{ fontSize: '0.8rem !important' }} />}
                onClick={removeGhostNotes}
                disabled={project.notes.length === 0}
                sx={{
                  color: '#cbd5e1',
                  borderColor: '#292e3c',
                  backgroundColor: '#161922',
                  fontSize: '0.7rem',
                  py: 0.35,
                  px: 1,
                  height: 26,
                  '&:hover': {
                    borderColor: '#f59e0b',
                    color: '#f59e0b',
                    backgroundColor: '#1f2430',
                  },
                }}
              >
                De-Glitch
              </Button>
            </Tooltip>

            <Tooltip title="Legato: Smoothly extends chord and melodic notes to eliminate choppy micro-gaps">
              <Button
                size="small"
                variant="outlined"
                onClick={applyLegato}
                disabled={project.notes.length === 0}
                sx={{
                  color: '#cbd5e1',
                  borderColor: '#292e3c',
                  backgroundColor: '#161922',
                  fontSize: '0.7rem',
                  py: 0.35,
                  px: 1,
                  height: 26,
                  '&:hover': {
                    borderColor: '#f59e0b',
                    color: '#f59e0b',
                    backgroundColor: '#1f2430',
                  },
                }}
              >
                Legato
              </Button>
            </Tooltip>

            <Tooltip title="Humanize velocities: Adds subtle organic dynamics (±8 velocity) for natural feel">
              <Button
                size="small"
                variant="outlined"
                onClick={humanizeVelocities}
                disabled={project.notes.length === 0}
                sx={{
                  color: '#cbd5e1',
                  borderColor: '#292e3c',
                  backgroundColor: '#161922',
                  fontSize: '0.7rem',
                  py: 0.35,
                  px: 1,
                  height: 26,
                  '&:hover': {
                    borderColor: '#38bdf8',
                    color: '#38bdf8',
                    backgroundColor: '#18202d',
                  },
                }}
              >
                Humanize
              </Button>
            </Tooltip>

            {selectedNoteIds.size > 0 && (
              <>
                <Tooltip title="Transpose selected notes up 1 octave (+12 semitones)">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => transposeSelectedNotes(12)}
                    sx={{
                      color: '#f59e0b',
                      borderColor: '#f59e0b',
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      py: 0.35,
                      px: 0.75,
                      minWidth: 42,
                      height: 26,
                    }}
                  >
                    +8ve
                  </Button>
                </Tooltip>
                <Tooltip title="Transpose selected notes down 1 octave (-12 semitones)">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => transposeSelectedNotes(-12)}
                    sx={{
                      color: '#f59e0b',
                      borderColor: '#f59e0b',
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      py: 0.35,
                      px: 0.75,
                      minWidth: 42,
                      height: 26,
                    }}
                  >
                    -8ve
                  </Button>
                </Tooltip>
              </>
            )}
          </Box>
        </Box>

        {/* Right: Lanes Toggle & Zoom */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Toggle Velocity Lane">
            <IconButton
              size="small"
              onClick={() => setShowVelocityLane(!showVelocityLane)}
              sx={{
                color: showVelocityLane ? '#f59e0b' : '#64748b',
                backgroundColor: '#181b24',
                border: '1px solid #292e3c',
                borderRadius: 1,
                px: 1,
                py: 0.35,
                fontSize: '0.7rem',
                gap: 0.5,
              }}
            >
              <StraightenIcon sx={{ fontSize: '0.85rem' }} />
              Vel
            </IconButton>
          </Tooltip>

          <Tooltip title="Toggle Pitch Bend Lane (Vocal Vibrato)">
            <IconButton
              size="small"
              onClick={() => setShowPitchBendLane(!showPitchBendLane)}
              sx={{
                color: showPitchBendLane ? '#38bdf8' : '#64748b',
                backgroundColor: '#181b24',
                border: '1px solid #292e3c',
                borderRadius: 1,
                px: 1,
                py: 0.35,
                fontSize: '0.7rem',
                gap: 0.5,
              }}
            >
              <ShowChartIcon sx={{ fontSize: '0.85rem' }} />
              Bend
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ borderColor: '#222631', my: 0.5, mx: 0.5 }} />

          {/* Zoom controls */}
          <Tooltip title="Zoom In Horizontal">
            <IconButton
              size="small"
              onClick={() => setPixelsPerSecond((p) => Math.min(320, p * 1.25))}
              sx={{ color: '#94a3b8', p: 0.5 }}
            >
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom Out Horizontal">
            <IconButton
              size="small"
              onClick={() => setPixelsPerSecond((p) => Math.max(60, p / 1.25))}
              sx={{ color: '#94a3b8', p: 0.5 }}
            >
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Main Piano Roll Container with Synchronized Scrolling */}
      <Box
        ref={scrollContainerRef}
        onScroll={handleScroll}
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          backgroundColor: '#0a0c10',
          maxHeight: 'calc(100vh - 360px)',
          minHeight: 280,
        }}
      >
        {/* Sticky Left Piano Keys Column */}
        <Box
          sx={{
            width: PIANO_KEY_WIDTH,
            position: 'sticky',
            left: 0,
            zIndex: 10,
            backgroundColor: '#12151d',
            borderRight: '1px solid #252a36',
            userSelect: 'none',
          }}
        >
          {Array.from({ length: PITCH_COUNT }).map((_, idx) => {
            const pitch = MAX_PITCH - idx;
            const noteName = pitchToNoteName(pitch);
            const isBlack = noteName.includes('#');
            const isTonic = noteName.startsWith('C');
            const inScale = project.key
              ? isPitchInScale(pitch, project.key.rootPitchClass, project.key.mode)
              : true;

            return (
              <Box
                key={`key_${pitch}`}
                onClick={() => handleKeyAudition(pitch)}
                sx={{
                  height: ROW_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 0.5,
                  backgroundColor: isBlack
                    ? '#161922'
                    : inScale && scaleHighlightEnabled
                    ? '#e2e8f0'
                    : '#cbd5e1',
                  color: isBlack ? '#94a3b8' : '#0c0e12',
                  borderBottom: '1px solid #252a36',
                  cursor: 'pointer',
                  transition: 'background-color 0.1s',
                  '&:hover': {
                    backgroundColor: isBlack ? '#282d3d' : '#ffffff',
                  },
                }}
              >
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: isTonic ? '0.625rem' : '0.5625rem',
                    fontWeight: isTonic ? 800 : isBlack ? 400 : 600,
                    lineHeight: 1,
                  }}
                >
                  {isTonic || isBlack ? noteName : ''}
                </Typography>

                {/* Scale membership dot */}
                {scaleHighlightEnabled && inScale && (
                  <Box
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      backgroundColor: isBlack ? '#f59e0b' : '#d97706',
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Box>

        {/* Note Grid Surface */}
        <Box
          onMouseDown={handleGridMouseDown}
          onMouseMove={handleGridMouseMove}
          onMouseUp={handleGridMouseUp}
          onDoubleClick={handleGridDoubleClick}
          sx={{
            position: 'relative',
            width: rollWidth,
            height: PITCH_COUNT * ROW_HEIGHT,
            backgroundColor: '#0a0c10',
            cursor: activeTool === 'draw' ? 'crosshair' : activeTool === 'split' ? 'col-resize' : 'default',
            userSelect: 'none',
          }}
        >
          {/* Horizontal Pitch Row Guides & Scale Highlighting */}
          {Array.from({ length: PITCH_COUNT }).map((_, idx) => {
            const pitch = MAX_PITCH - idx;
            const isBlack = NOTE_NAMES[pitchToPitchClass(pitch)].includes('#');
            const inScale = project.key
              ? isPitchInScale(pitch, project.key.rootPitchClass, project.key.mode)
              : true;

            let rowBg = isBlack ? '#0c0e13' : '#101319';
            if (scaleHighlightEnabled && inScale) {
              rowBg = isBlack ? '#141720' : '#181c26';
            }

            return (
              <Box
                key={`row_${pitch}`}
                sx={{
                  position: 'absolute',
                  top: idx * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                  backgroundColor: rowBg,
                  borderBottom: '1px solid #1a1e28',
                }}
              />
            );
          })}

          {/* Vertical Time & Beat Grid Lines */}
          {Array.from({ length: Math.ceil(totalDuration / (beatSec / 4)) + 10 }).map((_, i) => {
            const timeSec = (i * beatSec) / 4;
            const x = timeToPixelX(timeSec);
            const isBar = i % 16 === 0;
            const isBeat = i % 4 === 0;

            return (
              <Box
                key={`grid_v_${i}`}
                sx={{
                  position: 'absolute',
                  left: x,
                  top: 0,
                  bottom: 0,
                  borderLeft: isBar
                    ? '1px solid #333a4c'
                    : isBeat
                    ? '1px solid #202532'
                    : '1px dashed #141720',
                  pointerEvents: 'none',
                }}
              >
                {isBar && (
                  <Typography
                    sx={{
                      position: 'absolute',
                      top: 2,
                      left: 4,
                      fontSize: '0.5625rem',
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#475569',
                      fontWeight: 700,
                    }}
                  >
                    Bar {i / 16 + 1}
                  </Typography>
                )}
              </Box>
            );
          })}

          {/* Interactive Note Rectangles */}
          {project.notes.map((note) => {
            const x = timeToPixelX(note.startSeconds);
            const y = pitchToPixelY(note.pitch);
            const w = Math.max(8, timeToPixelX(note.durationSeconds));
            const isSelected = selectedNoteIds.has(note.id);
            const noteName = pitchToNoteName(note.pitch);
            const inScale = project.key
              ? isPitchInScale(note.pitch, project.key.rootPitchClass, project.key.mode)
              : true;

            return (
              <Box
                key={note.id}
                onMouseDown={(e) => handleNoteMouseDown(e, note, 'body')}
                sx={{
                  position: 'absolute',
                  left: x,
                  top: y + 1,
                  width: w,
                  height: ROW_HEIGHT - 2,
                  backgroundColor: isSelected
                    ? '#38bdf8'
                    : inScale
                    ? '#f59e0b'
                    : '#ef4444', // Out of scale notes shown with reddish-amber tint for instant feedback
                  border: isSelected
                    ? '1.5px solid #ffffff'
                    : inScale
                    ? '1px solid #d97706'
                    : '1px solid #b91c1c',
                  borderRadius: '3px',
                  boxShadow: isSelected ? '0 0 8px rgba(56, 189, 248, 0.7)' : 'none',
                  cursor: activeTool === 'split' ? 'col-resize' : activeTool === 'erase' ? 'pointer' : 'grab',
                  zIndex: isSelected ? 5 : 2,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  px: 0.5,
                  transition: 'background-color 0.1s',
                  '&:hover': {
                    filter: 'brightness(1.15)',
                  },
                }}
              >
                {/* Note Label */}
                <Typography
                  sx={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.5625rem',
                    fontWeight: 700,
                    color: isSelected ? '#0c0e12' : '#0c0e12',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'clip',
                    pointerEvents: 'none',
                  }}
                >
                  {noteName}
                </Typography>

                {/* Left Resize Handle */}
                <Box
                  onMouseDown={(e) => handleNoteMouseDown(e, note, 'resize-start')}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    cursor: 'w-resize',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.4)' },
                  }}
                />

                {/* Right Resize Handle */}
                <Box
                  onMouseDown={(e) => handleNoteMouseDown(e, note, 'resize-end')}
                  sx={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 5,
                    cursor: 'e-resize',
                    '&:hover': { backgroundColor: 'rgba(255,255,255,0.4)' },
                  }}
                />
              </Box>
            );
          })}

          {/* Marquee Box Overlay */}
          {dragAction && dragAction.type === 'marquee' && (
            <Box
              sx={{
                position: 'absolute',
                left: Math.min(dragAction.startX, dragAction.currentX),
                top: Math.min(dragAction.startY, dragAction.currentY),
                width: Math.abs(dragAction.currentX - dragAction.startX),
                height: Math.abs(dragAction.currentY - dragAction.startY),
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid #38bdf8',
                pointerEvents: 'none',
                zIndex: 8,
              }}
            />
          )}

          {/* Live Playhead Marker */}
          <Box
            sx={{
              position: 'absolute',
              left: timeToPixelX(playheadTime),
              top: 0,
              bottom: 0,
              width: 2,
              backgroundColor: '#38bdf8',
              zIndex: 9,
              pointerEvents: 'none',
              boxShadow: '0 0 6px rgba(56, 189, 248, 0.8)',
            }}
          />
        </Box>
      </Box>

      {/* Optional Collapsible Lanes: Velocity & Pitch Bend */}
      {showVelocityLane && (
        <VelocityLane
          pixelsPerSecond={pixelsPerSecond}
          scrollLeft={scrollLeft}
          visibleDuration={totalDuration}
          height={75}
        />
      )}

      {showPitchBendLane && (
        <PitchBendLane
          pixelsPerSecond={pixelsPerSecond}
          scrollLeft={scrollLeft}
          visibleDuration={totalDuration}
          height={65}
        />
      )}
    </Box>
  );
};
