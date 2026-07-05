import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  type Colors,
  type Fonts,
  type TextSize,
  darkColors,
  lightColors,
  scaledFonts,
  TEXT_SCALES,
} from './theme';

export type ThemeMode = 'light' | 'dark' | 'auto';

type ThemeValue = {
  colors: Colors;
  fonts: Fonts;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  textSize: TextSize;
  setTextSize: (t: TextSize) => void;
};

const MODE_KEY = 'kinly.themeMode.v1';
const SIZE_KEY = 'kinly.textSize.v1';

const fallback: ThemeValue = {
  colors: lightColors,
  fonts: scaledFonts(1),
  isDark: false,
  mode: 'light',
  setMode: () => {},
  textSize: 'normal',
  setTextSize: () => {},
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [textSize, setSizeState] = useState<TextSize>('normal');

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => v && setModeState(v as ThemeMode))
      .catch(() => {});
    AsyncStorage.getItem(SIZE_KEY)
      .then((v) => v && setSizeState(v as TextSize))
      .catch(() => {});
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m).catch(() => {});
  };
  const setTextSize = (t: TextSize) => {
    setSizeState(t);
    AsyncStorage.setItem(SIZE_KEY, t).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'auto' && system === 'dark');

  const value = useMemo<ThemeValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      fonts: scaledFonts(TEXT_SCALES[textSize]),
      isDark,
      mode,
      setMode,
      textSize,
      setTextSize,
    }),
    [isDark, mode, textSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? fallback;
}
