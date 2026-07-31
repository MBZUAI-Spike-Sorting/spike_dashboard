import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import apiClient from '../api/client';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    getCurrentUser: jest.fn(),
    login: jest.fn(),
  },
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

test('hydrates the account profile from the login response before opening the dashboard', async () => {
  localStorage.clear();
  const host = document.createElement('div');
  const root = createRoot(host);
  let auth = null;

  const AuthProbe = () => {
    auth = useAuth();
    return null;
  };

  await act(async () => {
    root.render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );
    await Promise.resolve();
  });

  const profile = {
    preferences: {
      currentDashboardViewId: 'curation-layout',
      dashboardViews: [{
        id: 'curation-layout',
        widgetStates: {
          clusterList: {
            clusterGroups: { 12: 'good' },
          },
        },
      }],
    },
  };
  apiClient.login.mockResolvedValue({
    success: true,
    data: {
      token: 'test-token',
      user: { id: 7, username: 'curator' },
      profile,
      allowed_algorithms: ['preprocessed_torchbci'],
    },
  });

  await act(async () => {
    await auth.login('curator', 'Valid123!');
  });

  expect(auth.isAuthenticated).toBe(true);
  expect(auth.profile).toEqual(profile);
  expect(localStorage.getItem('spike_dashboard_token')).toBe('test-token');

  act(() => root.unmount());
  localStorage.clear();
});
