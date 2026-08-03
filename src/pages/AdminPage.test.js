import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import apiClient from '../api/client';
import AdminPage from './AdminPage';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: {
    getAdminOverview: jest.fn(),
    updateTierQuota: jest.fn(),
    updateUserRole: jest.fn(),
    deleteUser: jest.fn(),
  },
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'admin' } }),
}));

jest.mock('../components/ThemeToggle', () => () => null);

global.IS_REACT_ACT_ENVIRONMENT = true;

const quotas = ['guest', 'user', 'pro', 'admin'].map((tier) => ({
  tier,
  max_custom_layouts: tier === 'admin' ? -1 : 10,
  max_storage_gb: tier === 'admin' ? -1 : 10,
  max_gpu_hours: tier === 'admin' ? -1 : 5,
  max_custom_pipelines: tier === 'admin' ? -1 : 2,
}));

test('shows online accounts and filters the user list by tier', async () => {
  apiClient.getAdminOverview.mockResolvedValue({
    success: true,
    data: {
      users: [
        {
          id: 1,
          username: 'root_admin',
          email: 'admin@example.com',
          role: 'admin',
          role_label: 'Admin',
          is_online: true,
          last_seen_at: '2026-08-03T10:00:00',
          created_at: '2026-01-01T00:00:00',
        },
        {
          id: 2,
          username: 'researcher',
          email: 'researcher@example.com',
          role: 'pro',
          role_label: 'Pro',
          is_online: false,
          created_at: '2026-01-02T00:00:00',
        },
      ],
      total: 2,
      online_count: 1,
      online_window_minutes: 5,
      quotas,
    },
  });

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter><AdminPage /></MemoryRouter>);
    await Promise.resolve();
  });

  expect(host.textContent).toContain('Account control center');
  expect(host.textContent).toContain('root_admin');
  expect(host.textContent).toContain('researcher');
  expect(host.querySelectorAll('.quota-card')).toHaveLength(4);

  await act(async () => {
    const tierFilter = host.querySelector('[aria-label="Filter users by tier"]');
    tierFilter.value = 'pro';
    tierFilter.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(host.textContent).not.toContain('admin@example.com');
  expect(host.textContent).toContain('researcher@example.com');

  act(() => root.unmount());
  host.remove();
});
