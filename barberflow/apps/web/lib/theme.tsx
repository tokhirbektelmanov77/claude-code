'use client';
import * as React from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'bf_theme';


export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = React.useState<ThemePref>('system');
  React.useEffect(() => {
    try {
      const t = localStorage.getItem(KEY);
      if (t === 'light' || t === 'dark') setPref(t);
    } catch { /* storage unavailable */ }
  }, []);
  const update = React.useCallback((t: ThemePref) => {
    setPref(t);
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch { /* storage unavailable */ }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, []);
  return [pref, update];
}
