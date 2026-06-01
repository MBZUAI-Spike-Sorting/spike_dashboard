/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

// Create context
const AuthContext = createContext(null);

// Local storage keys
const TOKEN_KEY = 'spike_dashboard_token';
const USER_KEY = 'spike_dashboard_user';

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [token, setToken] = useState(null);
  const [allowedAlgorithms, setAllowedAlgorithms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Initialize auth state from localStorage
   */
  useEffect(() => {
    const initAuth = async () => {
      try {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedUser = localStorage.getItem(USER_KEY);
        
        if (savedToken && savedUser) {
          // Validate token by fetching current user
          const response = await apiClient.getCurrentUser(savedToken);
          
          if (response.success) {
            setToken(savedToken);
            setUser(response.data.user);
            setProfile(response.data.profile || null);
            setAllowedAlgorithms(response.data.allowed_algorithms || []);
            setIsAuthenticated(true);
          } else {
            // Token invalid, clear storage
            clearAuthData();
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        clearAuthData();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  /**
   * Clear authentication data
   */
  const clearAuthData = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
    setProfile(null);
    setAllowedAlgorithms([]);
    setIsAuthenticated(false);
  }, []);

  /**
   * Save authentication data
   */
  const saveAuthData = useCallback((authToken, userData, algorithms) => {
    localStorage.setItem(TOKEN_KEY, authToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(authToken);
    setUser(userData);
    setProfile(null);
    setAllowedAlgorithms(algorithms || []);
    setIsAuthenticated(true);
  }, []);

  const applyProfileData = useCallback((data) => {
    if (!data) return;
    if (data.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
    }
    if (data.profile) {
      setProfile(data.profile);
    }
    if (data.allowed_algorithms) {
      setAllowedAlgorithms(data.allowed_algorithms);
    }
  }, []);

  /**
   * Login with username and password
   */
  const login = useCallback(async (username, password) => {
    const response = await apiClient.login(username, password);
    
    if (response.success) {
      saveAuthData(
        response.data.token,
        response.data.user,
        response.data.allowed_algorithms
      );
      return response.data;
    } else {
      throw new Error(response.error || 'Login failed');
    }
  }, [saveAuthData]);

  /**
   * Register new user
   */
  const register = useCallback(async (username, email, password) => {
    const response = await apiClient.register(username, email, password);
    
    if (response.success) {
      saveAuthData(
        response.data.token,
        response.data.user,
        response.data.allowed_algorithms
      );
      return response.data;
    } else {
      throw new Error(response.error || 'Registration failed');
    }
  }, [saveAuthData]);

  /**
   * Logout current user
   */
  const logout = useCallback(async () => {
    try {
      if (token) {
        await apiClient.logout(token);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearAuthData();
    }
  }, [token, clearAuthData]);

  /**
   * Check if user has access to an algorithm
   */
  const hasAlgorithmAccess = useCallback((algorithm) => {
    return allowedAlgorithms.includes(algorithm);
  }, [allowedAlgorithms]);

  /**
   * Check if user is admin
   */
  const isAdmin = useCallback(() => {
    return user?.role === 'admin';
  }, [user]);

  const canLinkCustomPipelines = useCallback(() => {
    return Boolean(user?.capabilities?.can_link_custom_pipelines);
  }, [user]);

  const refreshProfile = useCallback(async () => {
    const response = await apiClient.getProfile();
    if (response.success) {
      applyProfileData(response.data);
      return response.data;
    }
    throw new Error(response.error || 'Failed to load profile');
  }, [applyProfileData]);

  const updateProfile = useCallback(async (payload) => {
    const response = await apiClient.updateProfile(payload);
    if (response.success) {
      applyProfileData(response.data);
      return response.data;
    }
    throw new Error(response.error || 'Failed to update profile');
  }, [applyProfileData]);

  /**
   * Get auth header for API requests
   */
  const getAuthHeader = useCallback(() => {
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
    return {};
  }, [token]);

  // Context value
  const value = {
    user,
    profile,
    token,
    allowedAlgorithms,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    hasAlgorithmAccess,
    isAdmin,
    canLinkCustomPipelines,
    refreshProfile,
    updateProfile,
    getAuthHeader,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
