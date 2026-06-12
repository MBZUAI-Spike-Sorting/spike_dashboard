/**
 * Register Page Component
 * 
 * Provides user registration form with validation.
 */

import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  areRequirementsMet,
  getPasswordRequirements,
  getUsernameRequirements
} from '../utils/authPolicy';
import './Auth.css';

const RequirementList = ({ requirements, label }) => (
  <ul className="requirement-list" aria-label={label}>
    {requirements.map((requirement) => (
      <li
        key={requirement.id}
        className={`requirement-item ${requirement.met ? 'met' : 'unmet'}`}
      >
        {requirement.label}
      </li>
    ))}
  </ul>
);

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { register } = useAuth();
  const navigate = useNavigate();

  const usernameRequirements = useMemo(
    () => getUsernameRequirements(formData.username),
    [formData.username]
  );
  const passwordRequirements = useMemo(
    () => getPasswordRequirements(formData.password),
    [formData.password]
  );
  const confirmPasswordRequirements = useMemo(
    () => [
      {
        id: 'passwords-match',
        label: 'Passwords match',
        met:
          formData.confirmPassword.length > 0 &&
          formData.password === formData.confirmPassword
      }
    ],
    [formData.password, formData.confirmPassword]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(''); // Clear error on input change
  };

  const validateForm = () => {
    const { email, password, confirmPassword } = formData;

    if (!areRequirementsMet(usernameRequirements)) {
      setError('Username does not meet the requirements');
      return false;
    }

    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return false;
    }

    if (!areRequirementsMet(passwordRequirements)) {
      setError('Password does not meet the requirements');
      return false;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      await register(formData.username, formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <span className="logo-icon">⚡</span>
            <h1>Spike Dashboard</h1>
          </div>
          <p className="auth-subtitle">Create your account</p>
        </div>

        {error && (
          <div className="auth-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Choose a username"
              required
              autoFocus
              autoComplete="username"
              minLength={USERNAME_MIN_LENGTH}
              maxLength={USERNAME_MAX_LENGTH}
            />
            <RequirementList
              requirements={usernameRequirements}
              label="Username requirements"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Create a password"
              required
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <RequirementList
              requirements={passwordRequirements}
              label="Password requirements"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              required
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <RequirementList
              requirements={confirmPasswordRequirements}
              label="Password confirmation requirements"
            />
          </div>

          <button 
            type="submit" 
            className="auth-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="button-spinner"></span>
                Creating account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
