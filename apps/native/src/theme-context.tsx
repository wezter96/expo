import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import {
  type Colors,
  type Fonts,
  type TextSize,
  type UiStyle,
  colorsFor,
  scaledFonts,
  STYLE_FONT_FACTOR,
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
  /** 'normal' = Modern (refined), 'simple' = Easy (chunky, high-contrast). */
  uiStyle: UiStyle;
  setUiStyle: (s: UiStyle) => void;
};

const MODE_KEY = 'kinly.themeMode.v1';
const SIZE_KEY = 'kinly.textSize.v1';
const STYLE_KEY = 'kinly.uiStyle.v1';

const fallback: ThemeValue = {
  colors: colorsFor(false, 'simple'),
  fonts: scaledFonts(1),
  isDark: false,
  mode: 'light',
  setMode: () => {},
  textSize: 'normal',
  setTextSize: () => {},
  uiStyle: 'simple',
  setUiStyle: () => {},
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('light');
  const [textSize, setSizeState] = useState<TextSize>('normal');
  const [uiStyle, setStyleState] = useState<UiStyle>('simple');

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY)
      .then((v) => v && setModeState(v as ThemeMode))
      .catch(() => {});
    AsyncStorage.getItem(SIZE_KEY)
      .then((v) => v && setSizeState(v as TextSize))
      .catch(() => {});
    AsyncStorage.getItem(STYLE_KEY)
      .then((v) => (v === 'normal' || v === 'simple') && setStyleState(v))
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
  const setUiStyle = (s: UiStyle) => {
    setStyleState(s);
    AsyncStorage.setItem(STYLE_KEY, s).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'auto' && system === 'dark');

  const value = useMemo<ThemeValue>(
    () => ({
      colors: colorsFor(isDark, uiStyle),
      fonts: scaledFonts(TEXT_SCALES[textSize] * STYLE_FONT_FACTOR[uiStyle]),
      isDark,
      mode,
      setMode,
      textSize,
      setTextSize,
      uiStyle,
      setUiStyle,
    }),
    [isDark, mode, textSize, uiStyle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext) ?? fallback;
}
