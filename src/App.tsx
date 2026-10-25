/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, Box, Alert, Snackbar } from '@mui/material';
import { sonoraTheme } from './theme/sonoraTheme.ts';
import { ProjectProvider, useProject } from './state/ProjectStore.tsx';
import { Header } from './features/header/Header.tsx';
import { DemoSamplesBar } from './features/demo/DemoSamplesBar.tsx';
import { AnalysisControls } from './features/analysis/AnalysisControls.tsx';
import { WaveformViewer } from './features/waveform/WaveformViewer.tsx';
import { ChordLane } from './features/analysis/ChordLane.tsx';
import { PianoRoll } from './features/piano-roll/PianoRoll.tsx';
import { MusicalInfoPanel } from './features/sidebar/MusicalInfoPanel.tsx';
import { MidiExportModal } from './features/export/MidiExportModal.tsx';

const NoteForgeWorkspace: React.FC = () => {
  const { loadDemoSample, errorMessage } = useProject();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Load first demo sample automatically on fresh launch
  useEffect(() => {
    loadDemoSample('demo_soul_piano');
  }, [loadDemoSample]);

  useEffect(() => {
    if (errorMessage) {
      setSnackbarMessage(errorMessage);
    }
  }, [errorMessage]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: '#0c0e12',
      }}
    >
      {/* 1. Header Bar */}
      <Header onOpenExportModal={() => setExportModalOpen(true)} />

      {/* 2. Quick Demo Samples Bar */}
      <DemoSamplesBar />

      {/* 3. Analysis Configuration & Action Bar */}
      <AnalysisControls />

      {/* 4. Primary Workspace: Main Editor + Right Panel */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Main Center Area: Waveform, Chord Lane, Piano Roll */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Audio Waveform Viewer */}
          <WaveformViewer />

          {/* Detected Chords Timeline Lane */}
          <ChordLane />

          {/* Interactive Piano Roll Editor */}
          <PianoRoll />
        </Box>

        {/* Right Panel: Musical Intelligence (Key, Scale, Tempo, Sound Engine, Diagnostics) */}
        <MusicalInfoPanel />
      </Box>

      {/* MIDI Export Dialog */}
      <MidiExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />

      {/* Error & Warning Notification */}
      <Snackbar
        open={Boolean(snackbarMessage)}
        autoHideDuration={6000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setSnackbarMessage(null)}
          sx={{ backgroundColor: '#1e1014', color: '#fca5a5', border: '1px solid #7f1d1d' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default function App() {
  return (
    <ThemeProvider theme={sonoraTheme}>
      <CssBaseline />
      <ProjectProvider>
        <NoteForgeWorkspace />
      </ProjectProvider>
    </ThemeProvider>
  );
}
