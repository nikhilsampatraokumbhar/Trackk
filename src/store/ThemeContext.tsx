import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@et_theme';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceHigh: string;
  surfaceHigher: string;
  glass: string;
  glassHigh: string;
  glassBorder: string;
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryGlow: string;
  text: string;
  textSecondary: string;
  textLight: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  danger: string;
  personalColor: string;
  groupColor: string;
  reimbursementColor: string;
  secondary: string;
}

export const DARK_COLORS: ThemeColors = {
  background: '#0A0A0F',
  surface: '#141418',
  surfaceHigh: '#1C1C22',
  surfaceHigher: '#262630',
  glass: '#1A1A20',
  glassHigh: '#222228',
  glassBorder: '#2A2A32',
  primary: '#E8734A',
  primaryLight: '#F09070',
  primaryDark: '#C05A35',
  primaryGlow: 'rgba(232,115,74,0.15)',
  text: '#F0F0F5',
  textSecondary: '#7A7A90',
  textLight: '#4A4A5C',
  border: '#1E1E26',
  borderLight: '#161620',
  success: '#3CB882',
  warning: '#E8C06A',
  danger: '#E0505E',
  personalColor: '#8A78F0',
  groupColor: '#3CB882',
  reimbursementColor: '#E07888',
  secondary: '#E07888',
};

export const LIGHT_COLORS: ThemeColors = {
  background: '#F5F5F8',
  surface: '#FFFFFF',
  surfaceHigh: '#F0F0F4',
  surfaceHigher: '#E8E8EE',
  glass: '#FFFFFF',
  glassHigh: '#F5F5FA',
  glassBorder: '#E2E2EA',
  primary: '#E8734A',
  primaryLight: '#F09070',
  primaryDark: '#C05A35',
  primaryGlow: 'rgba(232,115,74,0.10)',
  text: '#1A1A2E',
  textSecondary: '#6E6E82',
  textLight: '#9E9EB0',
  border: '#E2E2EA',
  borderLight: '#ECECF0',
  success: '#2DA573',
  warning: '#D4A843',
  danger: '#D04050',
  personalColor: '#7A68E0',
  groupColor: '#2DA573',
  reimbursementColor: '#D06878',
  secondary: '#D06878',
};

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  colors: LIGHT_COLORS,
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(val => {
      if (val === 'light' || val === 'dark') {
        setThemeState(val);
      }
    });
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_KEY, mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const colors = theme === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  return (
    <ThemeContext.Provider value={{ theme, colors, isDark: theme === 'dark', toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
