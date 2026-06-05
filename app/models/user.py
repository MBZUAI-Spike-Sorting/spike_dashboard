"""
User Model

Defines the User model with authentication and role management.
"""

import enum
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
from app.models.database import db


class UserRole(enum.Enum):
    """User role enumeration."""
    USER = 'user'
    GUEST = 'guest'
    PRO = 'pro'
    ADMIN = 'admin'


ROLE_LABELS = {
    UserRole.GUEST: 'Guest',
    UserRole.USER: 'Regular',
    UserRole.PRO: 'Pro',
    UserRole.ADMIN: 'Admin'
}


class User(db.Model):
    """
    User model for authentication and authorization.
    
    Attributes:
        id: Primary key
        username: Unique username
        email: User email address
        password_hash: Hashed password
        role: User role (user or admin)
        created_at: Account creation timestamp
        last_login: Last login timestamp
        is_active: Whether the account is active
    """
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.Enum(UserRole), default=UserRole.USER, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    failed_login_attempts = db.Column(db.Integer, default=0, nullable=False)
    locked_until = db.Column(db.DateTime, nullable=True)
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def set_password(self, password):
        """
        Hash and set the user's password.
        
        Args:
            password: Plain text password
        """
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """
        Check if the provided password matches the stored hash.
        
        Args:
            password: Plain text password to check
            
        Returns:
            bool: True if password matches
        """
        return check_password_hash(self.password_hash, password)
    
    def update_last_login(self):
        """Update the last login timestamp."""
        self.last_login = datetime.utcnow()
        db.session.commit()

    def is_locked(self):
        """Check if the account is temporarily locked."""
        return bool(self.locked_until and self.locked_until > datetime.utcnow())

    def register_failed_login(self, max_attempts=5, lock_minutes=60):
        """Record a failed login and lock after too many consecutive failures."""
        self.failed_login_attempts = (self.failed_login_attempts or 0) + 1

        if self.failed_login_attempts >= max_attempts:
            self.locked_until = datetime.utcnow() + timedelta(minutes=lock_minutes)

        db.session.commit()

    def clear_failed_logins(self):
        """Reset failed-login tracking after successful login or admin action."""
        self.failed_login_attempts = 0
        self.locked_until = None
    
    def is_admin(self):
        """Check if user has admin role."""
        return self.role == UserRole.ADMIN

    def is_pro(self):
        """Check if user has pro or admin access."""
        return self.role in (UserRole.PRO, UserRole.ADMIN)

    def can_link_custom_pipelines(self):
        """Check if user can link custom pipeline repositories."""
        return self.role in (UserRole.PRO, UserRole.ADMIN)

    def can_manage_users(self):
        """Check if user can manage other users."""
        return self.role == UserRole.ADMIN

    def get_capabilities(self):
        """Return capability flags used by the frontend."""
        return {
            'can_manage_users': self.can_manage_users(),
            'can_link_custom_pipelines': self.can_link_custom_pipelines(),
            'can_run_gpu_algorithms': self.role in (UserRole.PRO, UserRole.ADMIN),
            'can_run_cpu_algorithms': self.role in (UserRole.USER, UserRole.PRO, UserRole.ADMIN),
            'can_use_gui': True,
        }
    
    def to_dict(self):
        """
        Convert user to dictionary (for JSON responses).
        Excludes sensitive information like password hash.
        
        Returns:
            dict: User data
        """
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'role': self.role.value,
            'role_label': ROLE_LABELS.get(self.role, self.role.value.title()),
            'capabilities': self.get_capabilities(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'is_active': self.is_active,
            'failed_login_attempts': self.failed_login_attempts or 0,
            'locked_until': self.locked_until.isoformat() if self.locked_until else None,
            'is_locked': self.is_locked(),
        }
    
    def get_allowed_algorithms(self):
        """
        Get list of algorithms this user is allowed to access.
        
        Returns:
            list: Algorithm identifiers
        """
        if self.role in (UserRole.ADMIN, UserRole.PRO):
            # Admin/Pro users can access GPU-backed and advanced algorithms.
            return ['preprocessed_torchbci', 'preprocessed_kilosort4', 'torchbci_jims', 'kilosort4']

        if self.role == UserRole.USER:
            # Regular users can run CPU/pre-defined torchBCI workflows.
            return ['preprocessed_torchbci', 'preprocessed_kilosort4', 'torchbci_jims']

        # Guests can inspect the GUI/preprocessed outputs but cannot compute.
        if self.role == UserRole.GUEST:
            return ['preprocessed_torchbci', 'preprocessed_kilosort4']

        return ['preprocessed_torchbci', 'preprocessed_kilosort4']
    
    @staticmethod
    def validate_password(password):
        """
        Validate password requirements.
        
        Args:
            password: Password to validate
            
        Returns:
            tuple: (is_valid, error_message)
        """
        if len(password) < 6:
            return False, 'Password must be at least 6 characters long'
        return True, None
    
    @staticmethod
    def validate_username(username):
        """
        Validate username requirements.
        
        Args:
            username: Username to validate
            
        Returns:
            tuple: (is_valid, error_message)
        """
        if len(username) < 3:
            return False, 'Username must be at least 3 characters long'
        if len(username) > 80:
            return False, 'Username must be less than 80 characters'
        if not username.isalnum() and '_' not in username:
            return False, 'Username can only contain letters, numbers, and underscores'
        return True, None
