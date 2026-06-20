'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

export interface ThemeConfig {
  mode: ThemeMode;
  // Header
  headerBg: string;
  headerSurface: string;
  headerBorderColor: string;
  headerText: string;
  headerMuted: string;
  // Body / children
  bodyBg: string;
  bodyText: string;
  bodyMuted: string;
  bodySurface: string;
  bodyBorder: string;
}

export const THEMES: Record<ThemeMode, ThemeConfig> = {
  dark: {
    mode: 'dark',
    headerBg: '#1f2937',
    headerSurface: '#334155',
    headerBorderColor: '#475569',
    headerText: '#f1f5f9',
    headerMuted: '#94a3b8',
    bodyBg: '#f8fafc',
    bodyText: '#1f2937',
    bodyMuted: '#64748b',
    bodySurface: '#ffffff',
    bodyBorder: '#e2e8f0',
  },
  light: {
    mode: 'light',
    headerBg: '#ffffff',
    headerSurface: '#f1f5f9',
    headerBorderColor: '#e2e8f0',
    headerText: '#1f2937',
    headerMuted: '#64748b',
    bodyBg: '#ffffff',
    bodyText: '#1f2937',
    bodyMuted: '#64748b',
    bodySurface: '#f8fafc',
    bodyBorder: '#e2e8f0',
  },
};

interface ThemeContextValue {
  theme: ThemeConfig;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES.light,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const toggleTheme = () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme: THEMES[mode], toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
