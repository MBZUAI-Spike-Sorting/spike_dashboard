import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export const THEME_STORAGE_KEY = 'spikescope_theme';
const THEMES = new Set(['light', 'dark']);
const ThemeContext = createContext(null);

const getInitialTheme = () => {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (THEMES.has(savedTheme)) return savedTheme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

export const ThemeProvider = ({ children }) => {
  const { isAuthenticated, profile, updateProfile } = useAuth();
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const profileTheme = profile?.preferences?.theme;
    if (THEMES.has(profileTheme)) setTheme(profileTheme);
  }, [profile?.preferences?.theme]);

  const selectTheme = useCallback((nextTheme) => {
    if (!THEMES.has(nextTheme)) return;
    setTheme(nextTheme);

    if (isAuthenticated) {
      Promise.resolve(updateProfile({
        preferences: {
          ...(profile?.preferences || {}),
          theme: nextTheme,
        },
      })).catch((error) => {
        console.error('Unable to save theme preference:', error);
      });
    }
  }, [isAuthenticated, profile?.preferences, updateProfile]);

  const toggleTheme = useCallback(() => {
    selectTheme(theme === 'dark' ? 'light' : 'dark');
  }, [selectTheme, theme]);

  return (
    <ThemeContext.Provider value={{ theme, selectTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export default ThemeContext;
