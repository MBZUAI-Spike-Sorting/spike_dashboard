import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ThemeToggle from '../components/ThemeToggle';
import { THEME_STORAGE_KEY, ThemeProvider } from './ThemeContext';

const mockUpdateProfile = jest.fn().mockResolvedValue({});

jest.mock('./AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    profile: { preferences: { theme: 'dark', compactTables: false } },
    updateProfile: mockUpdateProfile,
  }),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

test('switches theme immediately and persists it to the signed-in profile', async () => {
  mockUpdateProfile.mockResolvedValue({});
  localStorage.clear();
  const host = document.createElement('div');
  const root = createRoot(host);

  await act(async () => {
    root.render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    await Promise.resolve();
  });

  expect(document.documentElement.dataset.theme).toBe('dark');
  await act(async () => {
    host.querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });

  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  expect(mockUpdateProfile).toHaveBeenCalledWith({
    preferences: { theme: 'light', compactTables: false },
  });

  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
