import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../api/client';
import CustomPipelineManager from '../components/CustomPipelineManager';
import { useAuth } from '../context/AuthContext';
import './UserPage.css';

const EMPTY_PROFILE = {
  real_name: '',
  affiliation: '',
  contact_info: '',
  home_page: '',
  avatar_url: '',
  bio: ''
};

const DEFAULT_PREFERENCES = {
  defaultView: 'multipanel',
  defaultDataset: '',
  compactTables: false
};

const ROLE_OPTIONS = [
  {
    value: 'guest',
    label: 'Guest',
    summary: 'GUI and preprocessed results only'
  },
  {
    value: 'user',
    label: 'Regular',
    summary: 'CPU and predefined torchBCI workflows'
  },
  {
    value: 'pro',
    label: 'Pro',
    summary: 'GPU workflows and custom pipeline linking'
  },
  {
    value: 'admin',
    label: 'Admin',
    summary: 'Full access and user role management'
  }
];

const getInitials = (user, profile) => {
  const source = profile?.real_name || user?.username || 'U';
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
};

const formatDate = (value) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
};

const roleLabel = (role) => {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
};

const UserPage = () => {
  const {
    user,
    profile,
    refreshProfile,
    updateProfile
  } = useAuth();

  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [pipelines, setPipelines] = useState([]);
  const [users, setUsers] = useState([]);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [adminCreateForm, setAdminCreateForm] = useState({
    email: '',
    password: '',
    role: 'user'
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [pipelineError, setPipelineError] = useState(null);
  const [userError, setUserError] = useState(null);
  const [notice, setNotice] = useState(null);

  const capabilities = useMemo(() => {
    const caps = user?.capabilities || {};
    return [
      ['GUI access', caps.can_use_gui],
      ['CPU algorithms', caps.can_run_cpu_algorithms],
      ['GPU algorithms', caps.can_run_gpu_algorithms],
      ['Custom pipeline linking', caps.can_link_custom_pipelines],
      ['User role management', caps.can_manage_users]
    ];
  }, [user]);

  const activeProfile = useMemo(() => profile || {}, [profile]);
  const isUserAdmin = user?.role === 'admin';
  const canManagePipelines = Boolean(user?.capabilities?.can_link_custom_pipelines);

  useEffect(() => {
    setProfileForm({
      ...EMPTY_PROFILE,
      real_name: activeProfile.real_name || '',
      affiliation: activeProfile.affiliation || '',
      contact_info: activeProfile.contact_info || '',
      home_page: activeProfile.home_page || '',
      avatar_url: activeProfile.avatar_url || '',
      bio: activeProfile.bio || ''
    });
    setPreferences({
      ...DEFAULT_PREFERENCES,
      ...(activeProfile.preferences || {})
    });
  }, [
    activeProfile.real_name,
    activeProfile.affiliation,
    activeProfile.contact_info,
    activeProfile.home_page,
    activeProfile.avatar_url,
    activeProfile.bio,
    activeProfile.preferences
  ]);

  const loadPipelines = useCallback(async () => {
    setIsLoadingPipelines(true);
    setPipelineError(null);

    try {
      const response = await apiClient.getCustomPipelines();
      setPipelines(response.pipelines || []);
    } catch (error) {
      setPipelineError(error.message || 'Failed to load custom pipelines');
    } finally {
      setIsLoadingPipelines(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!isUserAdmin) return;
    setIsLoadingUsers(true);
    setUserError(null);

    try {
      const response = await apiClient.listUsers();
      setUsers(response.data?.users || []);
    } catch (error) {
      setUserError(error.message || 'Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isUserAdmin]);

  useEffect(() => {
    let isMounted = true;

    const loadPage = async () => {
      setIsLoading(true);
      try {
        await refreshProfile();
        if (!isMounted) return;
        await loadPipelines();
        if (!isMounted) return;
        await loadUsers();
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadPage();

    return () => {
      isMounted = false;
    };
  }, [refreshProfile, loadPipelines, loadUsers]);

  const handleProfileFieldChange = (field) => (event) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handlePreferenceChange = (field) => (event) => {
    const value = field === 'compactTables' ? event.target.checked : event.target.value;
    setPreferences((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePasswordFieldChange = (field) => (event) => {
    setPasswordForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleAdminCreateFieldChange = (field) => (event) => {
    setAdminCreateForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setNotice(null);

    try {
      await updateProfile({
        profile: profileForm,
        preferences
      });
      setNotice({ type: 'success', text: 'Profile saved.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Failed to save profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setNotice(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setNotice({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setIsChangingPassword(true);

    try {
      await apiClient.changePassword(
        passwordForm.currentPassword,
        passwordForm.newPassword
      );
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setNotice({ type: 'success', text: 'Password updated.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Failed to change password.' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setUserError(null);

    setIsCreatingUser(true);

    try {
      const response = await apiClient.createUser(adminCreateForm);
      const createdUser = response.data?.user;

      if (createdUser) {
        setUsers((prev) => [...prev, createdUser]);
      } else {
        await loadUsers();
      }

      setAdminCreateForm({
        email: '',
        password: '',
        role: 'user'
      });
    } catch (error) {
      setUserError(error.message || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleAddPipeline = async (pipeline) => {
    const response = await apiClient.addCustomPipeline(pipeline);
    await loadPipelines();
    return response.pipeline;
  };

  const handleDeletePipeline = async (pipelineId) => {
    await apiClient.deleteCustomPipeline(pipelineId);
    await loadPipelines();
  };

  const handleRoleChange = async (targetUser, nextRole) => {
    setUserError(null);

    try {
      const response = await apiClient.updateUserRole(targetUser.id, nextRole);
      const updatedUser = response.data?.user;

      if (updatedUser) {
        setUsers((prev) =>
          prev.map((listedUser) =>
            listedUser.id === updatedUser.id ? updatedUser : listedUser
          )
        );
      }

      if (targetUser.id === user?.id) {
        await refreshProfile();
      }
    } catch (error) {
      setUserError(error.message || 'Failed to update user role');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    setUserError(null);

    const confirmed = window.confirm(`Delete user "${targetUser.username}"?`);
    if (!confirmed) return;

    try {
      await apiClient.deleteUser(targetUser.id);
      setUsers((prev) => prev.filter((listedUser) => listedUser.id !== targetUser.id));
    } catch (error) {
      setUserError(error.message || 'Failed to delete user');
    }
  };

  if (!user) return null;

  return (
    <div className="user-page">
      <header className="user-page-header">
        <Link to="/dashboard" className="user-page-brand">
          <span className="user-page-bolt">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
            </svg>
          </span>
          <span>SpikeScope</span>
        </Link>
        <Link to="/dashboard" className="user-page-return">Dashboard</Link>
      </header>

      <main className="user-page-main">
        <section className="user-page-hero">
          <div className="user-page-avatar">
            {profileForm.avatar_url ? (
              <img src={profileForm.avatar_url} alt="" />
            ) : (
              <span>{getInitials(user, profileForm)}</span>
            )}
          </div>

          <div className="user-page-identity">
            <h1>{profileForm.real_name || user.username}</h1>
            <div className="user-page-subtitle">
              <span>{user.email}</span>
              <span>{user.role_label || roleLabel(user.role)}</span>
            </div>
          </div>
        </section>

        {notice && (
          <div className={`user-page-notice ${notice.type}`}>
            {notice.text}
          </div>
        )}

        <div className="user-page-grid">
          <section className="user-page-section user-page-account">
            <div className="user-page-section-header">
              <h2>Account</h2>
            </div>

            <div className="account-facts">
              <div>
                <span>Username</span>
                <strong>{user.username}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{user.role_label || roleLabel(user.role)}</strong>
              </div>
              <div>
                <span>Last login</span>
                <strong>{formatDate(user.last_login)}</strong>
              </div>
            </div>

            <div className="capability-list">
              {capabilities.map(([label, enabled]) => (
                <div className="capability-row" key={label}>
                  <span>{label}</span>
                  <strong className={enabled ? 'enabled' : 'disabled'}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <form className="user-page-section user-page-form" onSubmit={handleSaveProfile}>
            <div className="user-page-section-header">
              <h2>Profile</h2>
              <button type="submit" disabled={isSavingProfile || isLoading}>
                {isSavingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>

            <div className="profile-fields">
              <label>
                <span>Real name</span>
                <input
                  type="text"
                  value={profileForm.real_name}
                  onChange={handleProfileFieldChange('real_name')}
                  maxLength={120}
                />
              </label>

              <label>
                <span>Affiliation</span>
                <input
                  type="text"
                  value={profileForm.affiliation}
                  onChange={handleProfileFieldChange('affiliation')}
                  maxLength={160}
                />
              </label>

              <label>
                <span>Contact info</span>
                <input
                  type="text"
                  value={profileForm.contact_info}
                  onChange={handleProfileFieldChange('contact_info')}
                  maxLength={160}
                />
              </label>

              <label>
                <span>Home page</span>
                <input
                  type="url"
                  value={profileForm.home_page}
                  onChange={handleProfileFieldChange('home_page')}
                  maxLength={240}
                />
              </label>

              <label className="profile-field-wide">
                <span>Avatar URL</span>
                <input
                  type="url"
                  value={profileForm.avatar_url}
                  onChange={handleProfileFieldChange('avatar_url')}
                  maxLength={300}
                />
              </label>

              <label className="profile-field-wide">
                <span>Bio</span>
                <textarea
                  value={profileForm.bio}
                  onChange={handleProfileFieldChange('bio')}
                  maxLength={1000}
                  rows={4}
                />
              </label>
            </div>
          </form>

          <section className="user-page-section">
            <div className="user-page-section-header">
              <h2>Preferences</h2>
            </div>

            <div className="preference-fields">
              <label>
                <span>Default view</span>
                <select
                  value={preferences.defaultView}
                  onChange={handlePreferenceChange('defaultView')}
                >
                  <option value="multipanel">Multi-Panel View</option>
                  <option value="signal">Signal View</option>
                  <option value="clusters">Cluster View</option>
                  <option value="runtime">Runtime Analysis View</option>
                </select>
              </label>

              <label>
                <span>Default dataset</span>
                <input
                  type="text"
                  value={preferences.defaultDataset}
                  onChange={handlePreferenceChange('defaultDataset')}
                  placeholder="Use current dashboard default"
                  maxLength={180}
                />
              </label>

              <label className="preference-checkbox">
                <input
                  type="checkbox"
                  checked={preferences.compactTables}
                  onChange={handlePreferenceChange('compactTables')}
                />
                <span>Use compact tables when supported</span>
              </label>
            </div>
          </section>

          <form className="user-page-section user-page-form" onSubmit={handleChangePassword}>
            <div className="user-page-section-header">
              <h2>Password</h2>
              <button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? 'Updating...' : 'Update'}
              </button>
            </div>

            <div className="profile-fields">
              <label>
                <span>Current password</span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordFieldChange('currentPassword')}
                  autoComplete="current-password"
                  required
                />
              </label>

              <label>
                <span>New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordFieldChange('newPassword')}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <label className="profile-field-wide">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordFieldChange('confirmPassword')}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
            </div>
          </form>

          <section className="user-page-section">
            <div className="user-page-section-header">
              <h2>Saved Pipelines</h2>
            </div>

            <CustomPipelineManager
              pipelines={pipelines}
              isLoading={isLoadingPipelines}
              error={pipelineError}
              onAddPipeline={canManagePipelines ? handleAddPipeline : undefined}
              onDeletePipeline={canManagePipelines ? handleDeletePipeline : undefined}
              readOnly={!canManagePipelines}
              readOnlyLabel="Pro access required"
            />
          </section>

          <section className="user-page-section user-page-role-matrix">
            <div className="user-page-section-header">
              <h2>Roles</h2>
            </div>

            <div className="role-grid">
              {ROLE_OPTIONS.map((role) => (
                <div className={`role-tier ${role.value}`} key={role.value}>
                  <strong>{role.label}</strong>
                  <span>{role.summary}</span>
                </div>
              ))}
            </div>
          </section>

          {isUserAdmin && (
            <section className="user-page-section user-page-admin">
              <div className="user-page-section-header">
                <h2>User Roles</h2>
                <button type="button" onClick={loadUsers} disabled={isLoadingUsers}>
                  {isLoadingUsers ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {userError && <div className="user-page-inline-error">{userError}</div>}

              <form className="admin-create-user" onSubmit={handleCreateUser}>
                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={adminCreateForm.email}
                    onChange={handleAdminCreateFieldChange('email')}
                    required
                  />
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={adminCreateForm.password}
                    onChange={handleAdminCreateFieldChange('password')}
                    minLength={6}
                    required
                  />
                </label>

                <label>
                  <span>Role</span>
                  <select
                    value={adminCreateForm.role}
                    onChange={handleAdminCreateFieldChange('role')}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" disabled={isCreatingUser}>
                  {isCreatingUser ? 'Adding...' : 'Add User'}
                </button>
              </form>

              <div className="admin-user-table">
                <div className="admin-user-row heading">
                  <span>User</span>
                  <span>Email</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Actions</span>
                </div>
                {users.map((listedUser) => (
                  <div className="admin-user-row" key={listedUser.id}>
                    <span>{listedUser.username}</span>
                    <span>{listedUser.email}</span>
                    <select
                      value={listedUser.role}
                      onChange={(event) => handleRoleChange(listedUser, event.target.value)}
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <span className={listedUser.is_locked ? 'user-status locked' : 'user-status active'}>
                      {listedUser.is_locked
                        ? `Locked until ${formatDate(listedUser.locked_until)}`
                        : listedUser.is_active
                        ? 'Active'
                        : 'Disabled'}
                    </span>
                    <button
                      className="admin-delete-user"
                      type="button"
                      onClick={() => handleDeleteUser(listedUser)}
                      disabled={listedUser.id === user.id}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

export default UserPage;
