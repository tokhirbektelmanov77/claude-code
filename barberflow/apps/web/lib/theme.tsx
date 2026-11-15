'use client';
import * as React from 'react';

export type ThemePref = 'dark' | 'light';
const KEY = 'bf_theme';

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = React.useState<ThemePref>('dark');
  React.useEffect(() => {
    setPref(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const update = React.useCallback((t: ThemePref) => {
    setPref(t);
    try {
      if (t === 'dark') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch { /* storage unavailable: theme still switches for this page view */ }
    document.documentElement.dataset.theme = t;
  }, []);
  return [pref, update];
}
