/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  MusicalProject,
  createInitialProject,
  AnalysisMode,
  InstrumentProfile,
} from '../music/MusicalProject.ts';
import { NoteEvent } from '../music/NoteEvent.ts';
import {
  ChordEvent,
  ChordDetectionMode,
  chordEventToNoteEvents,
  getChordAuditionNotes,
} from '../music/Chord.ts';
import { MusicalKey, snapPitchToScale } from '../music/Scale.ts';
import { QuantizeSettings, quantizeNotes } from '../music/Quantization.ts';
import { WaveformPeaks, generateWaveformPeaks } from '../audio/WaveformData.ts';
import { decodeAudioFile } from '../audio/AudioDecoder.ts';
import { sharedAudioPlayback, PlaybackMonitorMode } from '../audio/AudioPlayback.ts';
import { sharedMidiSynth, SynthSound } from '../audio/MidiSynth.ts';
import { DEMO_SAMPLES } from '../audio/SampleBank.ts';
import { sharedAnalysisEngine } from '../analysis/AnalysisEngine.ts';
import { AnalysisDiagnosticWarning } from '../analysis/Confidence.ts';
import { UndoRedoManager } from './UndoRedo.ts';

export type EditorTool = 'select' | 'draw' | 'erase' | 'split';

interface ProjectContextValue {
  project: MusicalProject;
  audioBuffer: AudioBuffer | null;
  waveformPeaks: WaveformPeaks | null;
  analysisStatus: 'idle' | 'analyzing' | 'complete' | 'error';
  analysisProgress: number;
  analysisStep: string;
  diagnostics: AnalysisDiagnosticWarning[];
  errorMessage: string | null;

  // Selection & Editing
  selectedNoteIds: Set<string>;
  activeTool: EditorTool;
  setActiveTool: (tool: EditorTool) => void;
  scaleHighlightEnabled: boolean;
  setScaleHighlightEnabled: (enabled: boolean) => void;

  // Playback & Transport
  isPlaying: boolean;
  isLooping: boolean;
  playheadTime: number;
  monitorMode: PlaybackMonitorMode;
  audioVolume: number;
  midiVolume: number;
  isAudioMuted: boolean;
  isMidiMuted: boolean;
  synthSound: SynthSound;
  setSynthSound: (sound: SynthSound) => void;
  setAudioVolume: (vol: number) => void;
  setMidiVolume: (vol: number) => void;
  setMonitorMode: (mode: PlaybackMonitorMode) => void;
  setAudioMuted: (muted: boolean) => void;
  setMidiMuted: (muted: boolean) => void;
  toggleAudioMute: () => void;
  toggleMidiMute: () => void;
  previewGeneratedMidi: () => void;
  previewOriginalAudio: () => void;
  previewBoth: () => void;
  play: (offset?: number) => void;
  pause: () => void;
  stop: () => void;
  seek: (timeSeconds: number) => void;
  toggleLoop: () => void;

  // Project Actions
  loadAudioFile: (file: File) => Promise<void>;
  loadDemoSample: (sampleId: string) => Promise<void>;
  setSelectedRegion: (startSeconds: number, endSeconds: number) => void;
  setAnalysisMode: (mode: AnalysisMode) => void;
  setInstrumentProfile: (profile: InstrumentProfile) => void;
  setBpm: (bpm: number) => void;
  setKey: (key: MusicalKey) => void;
  chordDetectionMode: ChordDetectionMode;
  setChordDetectionMode: (mode: ChordDetectionMode) => void;
  runAnalysis: () => Promise<void>;
  cancelAnalysis: () => void;

  // Note Manipulations
  selectNotes: (noteIds: string[], append?: boolean) => void;
  clearSelection: () => void;
  addNote: (note: Omit<NoteEvent, 'id'>) => void;
  updateNote: (id: string, updates: Partial<NoteEvent>) => void;
  deleteSelectedNotes: () => void;
  duplicateSelectedNotes: () => void;
  transposeSelectedNotes: (semitones: number) => void;
  moveSelectedNotes: (deltaSemitones: number, deltaTimeSec: number) => void;
  splitNote: (noteId: string, splitTimeSec: number) => void;
  applyQuantization: (settings: QuantizeSettings) => void;
  applyScaleCorrection: () => void;
  removeGhostNotes: () => void;
  applyLegato: () => void;
  humanizeVelocities: () => void;

  // Chord Manipulations
  updateChord: (chordId: string, updates: Partial<ChordEvent>) => void;
  splitChord: (chordId: string, splitTimeSec: number) => void;
  deleteChord: (chordId: string) => void;
  auditionChord: (chord: ChordEvent) => void;
  replaceNotesWithChords: () => void;

  // Undo / Redo
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<MusicalProject>(() => createInitialProject());
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<WaveformPeaks | null>(null);

  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'complete' | 'error'>('idle');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState('');
  const [diagnostics, setDiagnostics] = useState<AnalysisDiagnosticWarning[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<EditorTool>('select');
  const [scaleHighlightEnabled, setScaleHighlightEnabled] = useState(true);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [monitorMode, setMonitorModeState] = useState<PlaybackMonitorMode>('both');
  const [audioVolume, setAudioVolumeState] = useState(0.8);
  const [midiVolume, setMidiVolumeState] = useState(0.85);
  const [isAudioMuted, setIsAudioMutedState] = useState(false);
  const [isMidiMuted, setIsMidiMutedState] = useState(false);
  const [synthSound, setSynthSoundState] = useState<SynthSound>('epiano');

  // History manager for notes
  const historyRef = useRef<UndoRedoManager<NoteEvent[]>>(new UndoRedoManager<NoteEvent[]>([]));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryState = useCallback((notes: NoteEvent[]) => {
    historyRef.current.pushState(notes);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  // Sync playback engine updates
  useEffect(() => {
    sharedAudioPlayback.onTimeUpdate((time) => {
      setPlayheadTime(time);
    });
    sharedAudioPlayback.onStateChange((playing) => {
      setIsPlaying(playing);
    });
  }, []);

  // Update notes in playback engine whenever notes change
  useEffect(() => {
    sharedAudioPlayback.setNotes(project.notes);
  }, [project.notes]);

  // Handle loop boundaries
  useEffect(() => {
    sharedAudioPlayback.setLoop(
      isLooping,
      project.selectedRegion.startSeconds,
      project.selectedRegion.endSeconds
    );
  }, [isLooping, project.selectedRegion.startSeconds, project.selectedRegion.endSeconds]);

  const setSynthSound = useCallback((sound: SynthSound) => {
    setSynthSoundState(sound);
    sharedMidiSynth.setSound(sound);
  }, []);

  const setAudioVolume = useCallback((vol: number) => {
    setAudioVolumeState(vol);
    sharedAudioPlayback.setVolumes(vol, midiVolume);
  }, [midiVolume]);

  const setMidiVolume = useCallback((vol: number) => {
    setMidiVolumeState(vol);
    sharedAudioPlayback.setVolumes(audioVolume, vol);
  }, [audioVolume]);

  const setMonitorMode = useCallback((mode: PlaybackMonitorMode) => {
    setMonitorModeState(mode);
    if (mode === 'audio') {
      setIsAudioMutedState(false);
      setIsMidiMutedState(true);
    } else if (mode === 'midi') {
      setIsAudioMutedState(true);
      setIsMidiMutedState(false);
    } else {
      setIsAudioMutedState(false);
      setIsMidiMutedState(false);
    }
    sharedAudioPlayback.setMonitorMode(mode);
  }, []);

  const setAudioMuted = useCallback((muted: boolean) => {
    setIsAudioMutedState(muted);
    sharedAudioPlayback.setAudioMuted(muted);
  }, []);

  const setMidiMuted = useCallback((muted: boolean) => {
    setIsMidiMutedState(muted);
    sharedAudioPlayback.setMidiMuted(muted);
  }, []);

  const toggleAudioMute = useCallback(() => {
    setIsAudioMutedState((prev) => {
      const next = !prev;
      sharedAudioPlayback.setAudioMuted(next);
      return next;
    });
  }, []);

  const toggleMidiMute = useCallback(() => {
    setIsMidiMutedState((prev) => {
      const next = !prev;
      sharedAudioPlayback.setMidiMuted(next);
      return next;
    });
  }, []);

  const previewGeneratedMidi = useCallback(() => {
    setIsAudioMutedState(true);
    setIsMidiMutedState(false);
    setMonitorModeState('midi');
    sharedAudioPlayback.setMonitorMode('midi');
    sharedAudioPlayback.setAudioMuted(true);
    sharedAudioPlayback.setMidiMuted(false);
    sharedAudioPlayback.play(project.selectedRegion.startSeconds);
  }, [project.selectedRegion.startSeconds]);

  const previewOriginalAudio = useCallback(() => {
    setIsAudioMutedState(false);
    setIsMidiMutedState(true);
    setMonitorModeState('audio');
    sharedAudioPlayback.setMonitorMode('audio');
    sharedAudioPlayback.setAudioMuted(false);
    sharedAudioPlayback.setMidiMuted(true);
    sharedAudioPlayback.play(project.selectedRegion.startSeconds);
  }, [project.selectedRegion.startSeconds]);

  const previewBoth = useCallback(() => {
    setIsAudioMutedState(false);
    setIsMidiMutedState(false);
    setMonitorModeState('both');
    sharedAudioPlayback.setMonitorMode('both');
    sharedAudioPlayback.setAudioMuted(false);
    sharedAudioPlayback.setMidiMuted(false);
    sharedAudioPlayback.play(project.selectedRegion.startSeconds);
  }, [project.selectedRegion.startSeconds]);

  const play = useCallback((offset?: number) => {
    const start = offset !== undefined ? offset : playheadTime;
    sharedAudioPlayback.play(start);
  }, [playheadTime]);

  const pause = useCallback(() => {
    sharedAudioPlayback.pause();
  }, []);

  const stop = useCallback(() => {
    sharedAudioPlayback.stop();
  }, []);

  const seek = useCallback((timeSeconds: number) => {
    sharedAudioPlayback.seek(timeSeconds);
  }, []);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  // Load Audio File
  const loadAudioFile = useCallback(async (file: File) => {
    setErrorMessage(null);
    try {
      const buffer = await decodeAudioFile(file);
      const peaks = generateWaveformPeaks(buffer, 2400);

      const dur = buffer.duration;
      const initialRegionEnd = Math.min(dur, Math.max(2, dur * 0.5));

      setAudioBuffer(buffer);
      setWaveformPeaks(peaks);
      sharedAudioPlayback.setAudioBuffer(buffer);

      setProject((prev) => ({
        ...prev,
        name: file.name.replace(/\.[^/.]+$/, ''),
        audioMetadata: {
          filename: file.name,
          durationSeconds: buffer.duration,
          sampleRate: buffer.sampleRate,
          numberOfChannels: buffer.numberOfChannels,
          fileSizeBytes: file.size,
        },
        selectedRegion: {
          startSeconds: 0,
          endSeconds: Number(initialRegionEnd.toFixed(2)),
        },
        notes: [],
        chords: [],
      }));

      historyRef.current.reset([]);
      setCanUndo(false);
      setCanRedo(false);
      setSelectedNoteIds(new Set());
      setAnalysisStatus('idle');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to decode audio file');
    }
  }, []);

  // Load Pre-bundled Demo Sample
  const loadDemoSample = useCallback(async (sampleId: string) => {
    const demo = DEMO_SAMPLES.find((s) => s.id === sampleId) || DEMO_SAMPLES[0];
    setErrorMessage(null);

    const buffer = demo.generateBuffer();
    const peaks = generateWaveformPeaks(buffer, 2000);

    setAudioBuffer(buffer);
    setWaveformPeaks(peaks);
    sharedAudioPlayback.setAudioBuffer(buffer);

    const newProject: MusicalProject = {
      ...createInitialProject(demo.title),
      audioMetadata: {
        filename: `${demo.title}.wav`,
        durationSeconds: buffer.duration,
        sampleRate: buffer.sampleRate,
        numberOfChannels: buffer.numberOfChannels,
      },
      selectedRegion: {
        startSeconds: 0,
        endSeconds: buffer.duration,
      },
      analysisMode: demo.recommendedMode,
      instrumentProfile: demo.recommendedProfile,
      bpm: demo.bpm,
      notes: [],
      chords: [],
    };

    setProject(newProject);
    historyRef.current.reset([]);
    setCanUndo(false);
    setCanRedo(false);
    setSelectedNoteIds(new Set());
    setAnalysisStatus('idle');

    // Automatically trigger initial analysis on the demo sample
    setTimeout(() => {
      runAnalysisInternal(buffer, 0, buffer.duration, demo.recommendedMode, demo.recommendedProfile);
    }, 150);
  }, []);

  // Selection Region
  const setSelectedRegion = useCallback((startSeconds: number, endSeconds: number) => {
    const clampedStart = Math.max(0, startSeconds);
    const clampedEnd = Math.max(clampedStart + 0.1, endSeconds);
    setProject((prev) => ({
      ...prev,
      selectedRegion: {
        startSeconds: Number(clampedStart.toFixed(3)),
        endSeconds: Number(clampedEnd.toFixed(3)),
      },
    }));
  }, []);

  const setAnalysisMode = useCallback((mode: AnalysisMode) => {
    setProject((prev) => ({ ...prev, analysisMode: mode }));
  }, []);

  const setInstrumentProfile = useCallback((profile: InstrumentProfile) => {
    setProject((prev) => ({ ...prev, instrumentProfile: profile }));
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setProject((prev) => ({ ...prev, bpm: Math.max(40, Math.min(260, bpm)) }));
  }, []);

  const setKey = useCallback((key: MusicalKey) => {
    setProject((prev) => ({ ...prev, key }));
  }, []);

  const setChordDetectionMode = useCallback((mode: ChordDetectionMode) => {
    setProject((prev) => ({ ...prev, chordDetectionMode: mode }));
  }, []);

  // Run Analysis Internal
  const runAnalysisInternal = async (
    buf: AudioBuffer,
    startSec: number,
    endSec: number,
    mode: AnalysisMode,
    profile: InstrumentProfile
  ) => {
    setAnalysisStatus('analyzing');
    setAnalysisProgress(0.05);
    setAnalysisStep('Initializing analysis...');
    setErrorMessage(null);

    try {
      const result = await sharedAnalysisEngine.runAnalysis(
        buf,
        startSec,
        endSec,
        {
          mode,
          instrumentProfile: profile,
          sensitivity: 0.65,
          minNoteDurationSeconds: 0.05,
          mergeFragments: true,
          expressiveVibrato: mode === 'vocal',
          octaveCorrection: true,
          chordDetectionMode: project.chordDetectionMode,
        },
        (progress, step) => {
          setAnalysisProgress(progress);
          setAnalysisStep(step);
        }
      );

      setProject((prev) => ({
        ...prev,
        notes: result.notes,
        key: result.key,
        chords: result.chords,
        bpm: result.bpm,
        transcriptionConfidence: result.overallConfidence,
        lastAnalysisTimestamp: Date.now(),
      }));

      updateHistoryState(result.notes);
      setDiagnostics(result.diagnostics);
      setAnalysisStatus('complete');
      setAnalysisProgress(1.0);
      setAnalysisStep('Analysis complete');
    } catch (err) {
      setAnalysisStatus('error');
      setErrorMessage((err as Error).message || 'Analysis failed');
    }
  };

  const runAnalysis = useCallback(async () => {
    if (!audioBuffer) return;
    await runAnalysisInternal(
      audioBuffer,
      project.selectedRegion.startSeconds,
      project.selectedRegion.endSeconds,
      project.analysisMode,
      project.instrumentProfile
    );
  }, [audioBuffer, project.selectedRegion, project.analysisMode, project.instrumentProfile]);

  const cancelAnalysis = useCallback(() => {
    sharedAnalysisEngine.cancel();
    setAnalysisStatus('idle');
    setAnalysisStep('Cancelled');
  }, []);

  // Note Selection
  const selectNotes = useCallback((noteIds: string[], append: boolean = false) => {
    setSelectedNoteIds((prev) => {
      const next = append ? new Set(prev) : new Set<string>();
      noteIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, []);

  // Note Manipulations
  const addNote = useCallback((noteData: Omit<NoteEvent, 'id'>) => {
    const newNote: NoteEvent = {
      ...noteData,
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'user',
    };
    setProject((prev) => {
      const nextNotes = [...prev.notes, newNote];
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
    setSelectedNoteIds(new Set([newNote.id]));
  }, [updateHistoryState]);

  const updateNote = useCallback((id: string, updates: Partial<NoteEvent>) => {
    setProject((prev) => {
      const nextNotes = prev.notes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
  }, [updateHistoryState]);

  const deleteSelectedNotes = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    setProject((prev) => {
      const nextNotes = prev.notes.filter((n) => !selectedNoteIds.has(n.id));
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, updateHistoryState]);

  const duplicateSelectedNotes = useCallback(() => {
    if (selectedNoteIds.size === 0) return;
    setProject((prev) => {
      const duplicated: NoteEvent[] = [];
      const newIds = new Set<string>();
      for (const n of prev.notes) {
        if (selectedNoteIds.has(n.id)) {
          const clone: NoteEvent = {
            ...n,
            id: `dup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            startSeconds: n.startSeconds + 0.25,
            source: 'user',
          };
          duplicated.push(clone);
          newIds.add(clone.id);
        }
      }
      const nextNotes = [...prev.notes, ...duplicated];
      updateHistoryState(nextNotes);
      setSelectedNoteIds(newIds);
      return { ...prev, notes: nextNotes };
    });
  }, [selectedNoteIds, updateHistoryState]);

  const transposeSelectedNotes = useCallback((semitones: number) => {
    if (selectedNoteIds.size === 0) return;
    setProject((prev) => {
      const nextNotes = prev.notes.map((n) => {
        if (selectedNoteIds.has(n.id)) {
          const newPitch = Math.max(21, Math.min(108, n.pitch + semitones));
          return { ...n, pitch: newPitch };
        }
        return n;
      });
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
  }, [selectedNoteIds, updateHistoryState]);

  const moveSelectedNotes = useCallback((deltaSemitones: number, deltaTimeSec: number) => {
    if (selectedNoteIds.size === 0) return;
    setProject((prev) => {
      const nextNotes = prev.notes.map((n) => {
        if (selectedNoteIds.has(n.id)) {
          const newPitch = Math.max(21, Math.min(108, n.pitch + deltaSemitones));
          const newStart = Math.max(0, n.startSeconds + deltaTimeSec);
          return { ...n, pitch: newPitch, startSeconds: Number(newStart.toFixed(3)) };
        }
        return n;
      });
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
  }, [selectedNoteIds, updateHistoryState]);

  const splitNote = useCallback((noteId: string, splitTimeSec: number) => {
    setProject((prev) => {
      const target = prev.notes.find((n) => n.id === noteId);
      if (!target) return prev;
      const noteEnd = target.startSeconds + target.durationSeconds;
      if (splitTimeSec <= target.startSeconds + 0.05 || splitTimeSec >= noteEnd - 0.05) {
        return prev;
      }

      const dur1 = splitTimeSec - target.startSeconds;
      const dur2 = noteEnd - splitTimeSec;

      const part1: NoteEvent = {
        ...target,
        durationSeconds: Number(dur1.toFixed(3)),
      };
      const part2: NoteEvent = {
        ...target,
        id: `split_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        startSeconds: Number(splitTimeSec.toFixed(3)),
        durationSeconds: Number(dur2.toFixed(3)),
        source: 'user',
      };

      const nextNotes = prev.notes.map((n) => (n.id === noteId ? part1 : n)).concat(part2);
      updateHistoryState(nextNotes);
      return { ...prev, notes: nextNotes };
    });
  }, [updateHistoryState]);

  const applyQuantization = useCallback((settings: QuantizeSettings) => {
    setProject((prev) => {
      const quantized = quantizeNotes(
        prev.notes,
        prev.bpm,
        settings,
        prev.selectedRegion.startSeconds
      );
      updateHistoryState(quantized);
      return {
        ...prev,
        notes: quantized,
        quantizeSettings: settings,
      };
    });
  }, [updateHistoryState]);

  const applyScaleCorrection = useCallback(() => {
    if (!project.key) return;
    const { rootPitchClass, mode } = project.key;
    setProject((prev) => {
      let changeCount = 0;
      const corrected = prev.notes.map((n) => {
        const { newPitch, changed } = snapPitchToScale(n.pitch, rootPitchClass, mode);
        if (changed) changeCount++;
        return { ...n, pitch: newPitch };
      });
      if (changeCount > 0) {
        updateHistoryState(corrected);
      }
      return { ...prev, notes: corrected };
    });
  }, [project.key, updateHistoryState]);

  const removeGhostNotes = useCallback(() => {
    setProject((prev) => {
      const filtered = prev.notes.filter((n) => n.durationSeconds >= 0.07 && (n.velocity || 80) >= 30);
      if (filtered.length !== prev.notes.length) {
        updateHistoryState(filtered);
      }
      return { ...prev, notes: filtered };
    });
  }, [updateHistoryState]);

  const applyLegato = useCallback(() => {
    setProject((prev) => {
      const sorted = [...prev.notes].sort((a, b) => a.startSeconds - b.startSeconds);
      const updated = sorted.map((current, i) => {
        const curEnd = current.startSeconds + current.durationSeconds;
        let nextStart: number | null = null;
        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].startSeconds > current.startSeconds + 0.04) {
            nextStart = sorted[j].startSeconds;
            break;
          }
        }
        if (nextStart !== null && nextStart > curEnd && nextStart - curEnd <= 0.22) {
          return {
            ...current,
            durationSeconds: Number((nextStart - current.startSeconds).toFixed(3)),
          };
        }
        return current;
      });
      updateHistoryState(updated);
      return { ...prev, notes: updated };
    });
  }, [updateHistoryState]);

  const humanizeVelocities = useCallback(() => {
    setProject((prev) => {
      const humanized = prev.notes.map((n) => {
        const jitter = Math.round((Math.random() * 16) - 8);
        const newVel = Math.max(35, Math.min(127, n.velocity + jitter));
        return { ...n, velocity: newVel };
      });
      updateHistoryState(humanized);
      return { ...prev, notes: humanized };
    });
  }, [updateHistoryState]);

  // Chord Manipulations
  const updateChord = useCallback((chordId: string, updates: Partial<ChordEvent>) => {
    setProject((prev) => ({
      ...prev,
      chords: prev.chords.map((c) => (c.id === chordId ? { ...c, ...updates } : c)),
    }));
  }, []);

  const splitChord = useCallback((chordId: string, splitTimeSec: number) => {
    setProject((prev) => {
      const c = prev.chords.find((ch) => ch.id === chordId);
      if (!c || splitTimeSec <= c.startSeconds + 0.1 || splitTimeSec >= c.endSeconds - 0.1) return prev;
      const c1: ChordEvent = { ...c, endSeconds: splitTimeSec };
      const c2: ChordEvent = {
        ...c,
        id: `ch_split_${Date.now()}`,
        startSeconds: splitTimeSec,
      };
      return {
        ...prev,
        chords: prev.chords.map((ch) => (ch.id === chordId ? c1 : ch)).concat(c2),
      };
    });
  }, []);

  const deleteChord = useCallback((chordId: string) => {
    setProject((prev) => ({
      ...prev,
      chords: prev.chords.filter((c) => c.id !== chordId),
    }));
  }, []);

  const auditionChord = useCallback((chord: ChordEvent) => {
    const pitches =
      chord.voicingNotes && chord.voicingNotes.length > 0
        ? chord.voicingNotes
        : getChordAuditionNotes(chord.rootPitchClass, chord.quality, chord.bassPitchClass, chord.inversion);
    sharedMidiSynth.auditionChord(pitches, 1.2);
  }, []);

  const replaceNotesWithChords = useCallback(() => {
    if (project.chords.length === 0) return;
    setProject((prev) => {
      const chordNotes: NoteEvent[] = [];
      for (const chord of prev.chords) {
        const events = chordEventToNoteEvents(chord, {
          bassOctave: 2,
          baseOctave: 3,
          defaultVelocity: 84,
        });
        chordNotes.push(...events);
      }
      updateHistoryState(chordNotes);
      return { ...prev, notes: chordNotes };
    });
  }, [project.chords, updateHistoryState]);

  // Undo / Redo
  const undo = useCallback(() => {
    const prev = historyRef.current.undo();
    if (prev !== null) {
      setProject((p) => ({ ...p, notes: prev }));
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    }
  }, []);

  const redo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next !== null) {
      setProject((p) => ({ ...p, notes: next }));
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    }
  }, []);

  // Keyboard Shortcuts (Undo, Redo, Delete, Duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Space: Play / Pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          pause();
        } else {
          play();
        }
        return;
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        redo();
        return;
      }

      // Duplicate: Ctrl+D / Cmd+D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedNotes();
        return;
      }

      // Delete: Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedNotes();
        return;
      }

      // Transpose: Up / Down arrow
      if (e.key === 'ArrowUp' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        transposeSelectedNotes(e.shiftKey ? 12 : 1);
        return;
      }
      if (e.key === 'ArrowDown' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        transposeSelectedNotes(e.shiftKey ? -12 : -1);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, play, pause, undo, redo, deleteSelectedNotes, duplicateSelectedNotes, transposeSelectedNotes]);

  return (
    <ProjectContext.Provider
      value={{
        project,
        audioBuffer,
        waveformPeaks,
        analysisStatus,
        analysisProgress,
        analysisStep,
        diagnostics,
        errorMessage,

        selectedNoteIds,
        activeTool,
        setActiveTool,
        scaleHighlightEnabled,
        setScaleHighlightEnabled,

        isPlaying,
        isLooping,
        playheadTime,
        monitorMode,
        audioVolume,
        midiVolume,
        isAudioMuted,
        isMidiMuted,
        synthSound,
        setSynthSound,
        setAudioVolume,
        setMidiVolume,
        setMonitorMode,
        setAudioMuted,
        setMidiMuted,
        toggleAudioMute,
        toggleMidiMute,
        previewGeneratedMidi,
        previewOriginalAudio,
        previewBoth,
        play,
        pause,
        stop,
        seek,
        toggleLoop,

        loadAudioFile,
        loadDemoSample,
        setSelectedRegion,
        setAnalysisMode,
        setInstrumentProfile,
        setBpm,
        setKey,
        chordDetectionMode: project.chordDetectionMode,
        setChordDetectionMode,
        runAnalysis,
        cancelAnalysis,

        selectNotes,
        clearSelection,
        addNote,
        updateNote,
        deleteSelectedNotes,
        duplicateSelectedNotes,
        transposeSelectedNotes,
        moveSelectedNotes,
        splitNote,
        applyQuantization,
        applyScaleCorrection,
        removeGhostNotes,
        applyLegato,
        humanizeVelocities,

        updateChord,
        splitChord,
        deleteChord,
        auditionChord,
        replaceNotesWithChords,

        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextValue => {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return ctx;
};
