import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import './AdminPage.css';

const ROLE_OPTIONS = [
  { value: 'guest', label: 'Guest' },
  { value: 'user', label: 'Regular' },
  { value: 'pro', label: 'Pro' },
  { value: 'admin', label: 'Admin' },
];

const QUOTA_FIELDS = [
  { key: 'max_custom_layouts', label: 'Custom layouts', step: 1 },
  { key: 'max_storage_gb', label: 'Storage (GB)', step: 0.5 },
  { key: 'max_gpu_hours', label: 'GPU hours', step: 0.5 },
  { key: 'max_custom_pipelines', label: 'Custom pipelines', step: 1 },
];

const formatDate = (value) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Never' : date.toLocaleString();
};

const AdminPage = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [quotas, setQuotas] = useState({});
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineWindow, setOnlineWindow] = useState(5);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [savingTier, setSavingTier] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const loadOverview = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    try {
      const response = await apiClient.getAdminOverview();
      const data = response.data || {};
      setUsers(data.users || []);
      setOnlineCount(data.online_count || 0);
      setOnlineWindow(data.online_window_minutes || 5);
      setQuotas((current) => (
        quiet && Object.keys(current).length > 0
          ? current
          : Object.fromEntries((data.quotas || []).map((quota) => [quota.tier, quota]))
      ));
      setError(null);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load admin information');
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const refreshInterval = window.setInterval(() => loadOverview({ quiet: true }), 30000);
    return () => window.clearInterval(refreshInterval);
  }, [loadOverview]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((listedUser) => {
      if (tierFilter !== 'all' && listedUser.role !== tierFilter) return false;
      if (!query) return true;
      return [listedUser.username, listedUser.email, listedUser.role_label, listedUser.role]
        .some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [search, tierFilter, users]);

  const onlineUsers = useMemo(() => users.filter((listedUser) => listedUser.is_online), [users]);

  const handleRoleChange = async (listedUser, role) => {
    setError(null);
    try {
      const response = await apiClient.updateUserRole(listedUser.id, role);
      setUsers((current) => current.map((candidate) => (
        candidate.id === listedUser.id ? response.data.user : candidate
      )));
      setNotice(`${listedUser.username} is now ${role}.`);
    } catch (updateError) {
      setError(updateError.message || 'Unable to update user tier');
    }
  };

  const handleDeleteUser = async (listedUser) => {
    if (!window.confirm(`Delete ${listedUser.username}? This cannot be undone.`)) return;
    setError(null);
    try {
      await apiClient.deleteUser(listedUser.id);
      setUsers((current) => current.filter((candidate) => candidate.id !== listedUser.id));
      setNotice(`${listedUser.username} was deleted.`);
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete user');
    }
  };

  const handleQuotaChange = (tier, field, value) => {
    setQuotas((current) => ({
      ...current,
      [tier]: {
        ...current[tier],
        [field]: value,
      },
    }));
  };

  const handleSaveQuota = async (tier) => {
    setSavingTier(tier);
    setError(null);
    try {
      const payload = Object.fromEntries(QUOTA_FIELDS.map(({ key, step }) => [
        key,
        step === 1 ? Number.parseInt(quotas[tier][key], 10) : Number(quotas[tier][key]),
      ]));
      const response = await apiClient.updateTierQuota(tier, payload);
      setQuotas((current) => ({ ...current, [tier]: response.data.quota }));
      setNotice(`${ROLE_OPTIONS.find((role) => role.value === tier)?.label || tier} quotas saved.`);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save tier quotas');
    } finally {
      setSavingTier(null);
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page-header">
        <Link className="admin-brand" to="/dashboard">SpikeScope</Link>
        <nav>
          <ThemeToggle />
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/profile">Profile & existing panels</Link>
        </nav>
      </header>

      <main className="admin-page-main">
        <div className="admin-page-title">
          <div>
            <span className="admin-eyebrow">Administration</span>
            <h1>Account control center</h1>
            <p>Monitor active accounts and manage access limits by tier.</p>
          </div>
          <button type="button" onClick={() => loadOverview()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh data'}
          </button>
        </div>

        {error && <div className="admin-message error" role="alert">{error}</div>}
        {notice && <div className="admin-message success">{notice}</div>}

        <section className="admin-summary" aria-label="Account summary">
          <article>
            <span>Online now</span>
            <strong>{onlineCount}</strong>
            <small>Active in the last {onlineWindow} minutes</small>
          </article>
          <article>
            <span>Total users</span>
            <strong>{users.length}</strong>
            <small>Across all account tiers</small>
          </article>
          <article className="online-people">
            <span>Currently online</span>
            <div>
              {onlineUsers.length === 0 && <small>No recent activity</small>}
              {onlineUsers.slice(0, 6).map((onlineUser) => (
                <span className="online-person" key={onlineUser.id}>
                  <i />{onlineUser.username}
                </span>
              ))}
            </div>
          </article>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Users</h2>
              <p>Search accounts, inspect their last activity, and change tiers.</p>
            </div>
            <div className="admin-user-filters">
              <input
                aria-label="Search users"
                type="search"
                placeholder="Search name or email…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                aria-label="Filter users by tier"
                value={tierFilter}
                onChange={(event) => setTierFilter(event.target.value)}
              >
                <option value="all">All tiers</option>
                {ROLE_OPTIONS.map((role) => (
                  <option value={role.value} key={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-accounts-table">
            <div className="admin-account-row heading">
              <span>Account</span><span>Presence</span><span>Last online</span>
              <span>Tier</span><span>Joined</span><span>Action</span>
            </div>
            {!isLoading && filteredUsers.length === 0 && (
              <div className="admin-empty">No users match these filters.</div>
            )}
            {filteredUsers.map((listedUser) => (
              <div className="admin-account-row" key={listedUser.id}>
                <div className="admin-account-identity">
                  <b>{listedUser.username}</b>
                  <small>{listedUser.email}</small>
                </div>
                <span className={`presence-pill ${listedUser.is_online ? 'online' : 'offline'}`}>
                  <i />{listedUser.is_online ? 'Online' : 'Offline'}
                </span>
                <span>{formatDate(listedUser.last_seen_at || listedUser.last_login)}</span>
                <select
                  aria-label={`Tier for ${listedUser.username}`}
                  value={listedUser.role}
                  onChange={(event) => handleRoleChange(listedUser, event.target.value)}
                  disabled={listedUser.id === user.id}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option value={role.value} key={role.value}>{role.label}</option>
                  ))}
                </select>
                <span>{formatDate(listedUser.created_at)}</span>
                <button
                  className="admin-remove-user"
                  type="button"
                  disabled={listedUser.id === user.id}
                  onClick={() => handleDeleteUser(listedUser)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Tier quotas</h2>
              <p>Use -1 for unlimited. Zero disables that resource for the tier.</p>
            </div>
          </div>
          <div className="quota-grid">
            {ROLE_OPTIONS.map((role) => {
              const quota = quotas[role.value];
              if (!quota) return null;
              return (
                <article className={`quota-card ${role.value}`} key={role.value}>
                  <div className="quota-card-title">
                    <h3>{role.label}</h3>
                    <span>{users.filter((listedUser) => listedUser.role === role.value).length} users</span>
                  </div>
                  {QUOTA_FIELDS.map((field) => (
                    <label key={field.key}>
                      <span>{field.label}</span>
                      <input
                        type="number"
                        min="-1"
                        step={field.step}
                        value={quota[field.key]}
                        onChange={(event) => handleQuotaChange(
                          role.value,
                          field.key,
                          event.target.value
                        )}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleSaveQuota(role.value)}
                    disabled={savingTier === role.value}
                  >
                    {savingTier === role.value ? 'Saving…' : 'Save quota'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminPage;
