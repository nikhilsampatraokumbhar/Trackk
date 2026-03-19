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
  background: '#141414',
  surface: '#1F1F1F',
  surfaceHigh: '#262626',
  surfaceHigher: '#303030',
  glass: '#1F1F1F',
  glassHigh: '#262626',
  glassBorder: '#383838',
  primary: '#1890FF',
  primaryLight: '#40A9FF',
  primaryDark: '#096DD9',
  primaryGlow: 'rgba(24,144,255,0.15)',
  text: '#F5F5F5',
  textSecondary: '#8C8C8C',
  textLight: '#595959',
  border: '#303030',
  borderLight: '#262626',
  success: '#52C41A',
  warning: '#FAAD14',
  danger: '#FF4D4F',
  personalColor: '#9254DE',
  groupColor: '#52C41A',
  reimbursementColor: '#F759AB',
  secondary: '#F759AB',
};

export const LIGHT_COLORS: ThemeColors = {
  background: '#F0F2F5',
  surface: '#FFFFFF',
  surfaceHigh: '#F5F7FA',
  surfaceHigher: '#E8ECF0',
  glass: '#FFFFFF',
  glassHigh: '#F8F9FC',
  glassBorder: '#E8ECF0',
  primary: '#1890FF',
  primaryLight: '#40A9FF',
  primaryDark: '#096DD9',
  primaryGlow: 'rgba(24,144,255,0.08)',
  text: '#1F1F1F',
  textSecondary: '#8C8C8C',
  textLight: '#BFBFBF',
  border: '#E8ECF0',
  borderLight: '#F0F2F5',
  success: '#52C41A',
  warning: '#FAAD14',
  danger: '#FF4D4F',
  personalColor: '#722ED1',
  groupColor: '#52C41A',
  reimbursementColor: '#EB2F96',
  secondary: '#EB2F96',
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
