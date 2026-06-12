export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const getUsernameRequirements = (username = '') => {
  const value = username.trim();

  return [
    {
      id: 'username-length',
      label: `${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters`,
      met: value.length >= USERNAME_MIN_LENGTH && value.length <= USERNAME_MAX_LENGTH
    },
    {
      id: 'username-format',
      label: 'Letters, numbers, and underscores only',
      met: /^[A-Za-z0-9_]+$/.test(value)
    }
  ];
};

export const getPasswordRequirements = (password = '') => {
  return [
    {
      id: 'password-length',
      label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH
    },
    {
      id: 'password-uppercase',
      label: 'At least one uppercase letter',
      met: /[A-Z]/.test(password)
    },
    {
      id: 'password-lowercase',
      label: 'At least one lowercase letter',
      met: /[a-z]/.test(password)
    },
    {
      id: 'password-number',
      label: 'At least one number',
      met: /\d/.test(password)
    },
    {
      id: 'password-symbol',
      label: 'At least one symbol',
      met: /[^A-Za-z0-9\s]/.test(password)
    }
  ];
};

export const areRequirementsMet = (requirements) => {
  return requirements.every((requirement) => requirement.met);
};
