/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createTheme } from '@mui/material/styles';

export const sonoraTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0c0e12',
      paper: '#14171d',
    },
    primary: {
      main: '#f59e0b', // Restrained Amber
      light: '#fbbf24',
      dark: '#d97706',
      contrastText: '#0c0e12',
    },
    secondary: {
      main: '#38bdf8', // Ice cyan for secondary selection
      light: '#7dd3fc',
      dark: '#0284c7',
      contrastText: '#0c0e12',
    },
    divider: '#222631',
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#475569',
    },
    action: {
      hover: 'rgba(245, 158, 11, 0.08)',
      selected: 'rgba(245, 158, 11, 0.16)',
    },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    h5: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          fontWeight: 700,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderColor: '#222631',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: '#f59e0b',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1e232d',
          color: '#f1f5f9',
          border: '1px solid #2e3442',
          fontSize: '0.75rem',
        },
      },
    },
  },
});
