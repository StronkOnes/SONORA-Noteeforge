/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Tooltip,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { DEMO_SAMPLES } from '../../audio/SampleBank.ts';
import { useProject } from '../../state/ProjectStore.tsx';

export const DemoSamplesBar: React.FC = () => {
  const { loadDemoSample, loadAudioFile, project } = useProject();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadAudioFile(file);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2.5,
        py: 0.9,
        backgroundColor: '#11141a',
        borderBottom: '1px solid #1f232c',
        flexWrap: 'wrap',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography
          variant="caption"
          sx={{
            color: '#64748b',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.6875rem',
          }}
        >
          Quick Load Sample:
        </Typography>

        {DEMO_SAMPLES.map((demo) => {
          const isActive = project.name.includes(demo.title);
          return (
            <Tooltip
              key={demo.id}
              title={`${demo.description} (${demo.recommendedMode.toUpperCase()} mode • ${demo.bpm} BPM)`}
            >
              <Chip
                clickable
                size="small"
                onClick={() => loadDemoSample(demo.id)}
                icon={
                  <PlayArrowIcon
                    sx={{
                      fontSize: '0.85rem !important',
                      color: isActive ? '#f59e0b !important' : '#94a3b8 !important',
                    }}
                  />
                }
                label={demo.title}
                sx={{
                  backgroundColor: isActive ? 'rgba(245, 158, 11, 0.15)' : '#181b22',
                  border: isActive ? '1px solid #f59e0b' : '1px solid #282d38',
                  color: isActive ? '#fbbf24' : '#cbd5e1',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.75rem',
                  height: 26,
                  '&:hover': {
                    backgroundColor: isActive ? 'rgba(245, 158, 11, 0.25)' : '#222631',
                  },
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      {/* Or Upload Custom Audio File */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="audio/wav,audio/mp3,audio/mpeg,audio/flac,audio/m4a,audio/aac,audio/ogg"
          onChange={handleFileChange}
        />
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileUploadIcon sx={{ fontSize: '0.9rem' }} />}
          onClick={() => fileInputRef.current?.click()}
          sx={{
            color: '#cbd5e1',
            borderColor: '#2f3544',
            backgroundColor: '#161922',
            fontSize: '0.75rem',
            py: 0.35,
            px: 1.5,
            height: 26,
            '&:hover': {
              borderColor: '#f59e0b',
              backgroundColor: '#1f2430',
              color: '#f59e0b',
            },
          }}
        >
          Import Audio File...
        </Button>
      </Box>
    </Box>
  );
};
