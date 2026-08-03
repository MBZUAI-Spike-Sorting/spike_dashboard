"""
Authentication Routes

Provides login, register, logout, and user management endpoints.
"""

from flask import Blueprint, request, jsonify
from app.models.database import db
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.models.tier_quota import TierQuota
from app.utils.auth import (
    generate_token, 
    login_required, 
    admin_required,
    get_current_user
)
from app.utils.responses import success_response, error_response, validation_error
from app.logger import get_logger

logger = get_logger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_bp.route('/register', methods=['POST'])
def register():
    """
    Register a new user.
    
    Request Body:
        username: str - Unique username
        email: str - Email address
        password: str - Password matching the current password policy
        
    Returns:
        JSON with user data and token on success
    """
    try:
        data = request.get_json()
        
        if not data:
            return validation_error('Request body is required')
        
        username = data.get('username', '').strip()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        
        # Validate username
        is_valid, error = User.validate_username(username)
        if not is_valid:
            return validation_error(error)
        
        # Validate email
        if not email or '@' not in email:
            return validation_error('Valid email is required')
        
        # Validate password
        is_valid, error = User.validate_password(password)
        if not is_valid:
            return validation_error(error)
        
        # Check if username exists
        if User.query.filter_by(username=username).first():
            return validation_error('Username already exists')
        
        # Check if email exists
        if User.query.filter_by(email=email).first():
            return validation_error('Email already registered')
        
        # Create new user (default role is USER)
        user = User(
            username=username,
            email=email,
            role=UserRole.USER
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        # Generate token
        token = generate_token(user)
        profile = UserProfile.get_or_create(user)
        
        logger.info(f'New user registered: {username}')
        
        return success_response({
            'user': user.to_dict(),
            'profile': profile.to_dict(),
            'token': token,
            'allowed_algorithms': user.get_allowed_algorithms()
        }, message='Registration successful')
        
    except Exception as e:
        logger.error(f'Registration error: {e}')
        db.session.rollback()
        return error_response('Registration failed', status=500)


def _make_username_from_email(email):
    """Create a unique username from an email local-part."""
    base = email.split('@', 1)[0].strip().lower()
    base = ''.join(char if char.isalnum() or char == '_' else '_' for char in base)
    base = base.strip('_') or 'user'
    base = base[:User.USERNAME_MAX_LENGTH]

    username = base
    suffix = 1
    while User.query.filter_by(username=username).first():
        suffix_text = f'_{suffix}'
        username = f'{base[:User.USERNAME_MAX_LENGTH - len(suffix_text)]}{suffix_text}'
        suffix += 1

    return username


@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate user and return token.
    
    Request Body:
        username: str - Username or email
        password: str - Password
        
    Returns:
        JSON with user data and token on success
    """
    try:
        data = request.get_json()
        
        if not data:
            return validation_error('Request body is required')
        
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return validation_error('Username and password are required')
        
        # Find user by username or email
        user = User.query.filter(
            (User.username == username) | (User.email == username.lower())
        ).first()
        
        if not user:
            return error_response('Invalid credentials', status=401)
        
        if not user.is_active:
            return error_response('Account is disabled', status=401)

        if user.is_locked():
            return error_response(
                'Account temporarily locked after too many failed login attempts',
                status=423,
                details={
                    'locked_until': user.locked_until.isoformat() if user.locked_until else None
                }
            )
        
        if not user.check_password(password):
            user.register_failed_login()
            if user.is_locked():
                return error_response(
                    'Account temporarily locked after too many failed login attempts',
                    status=423,
                    details={
                        'locked_until': user.locked_until.isoformat() if user.locked_until else None
                    }
                )
            return error_response('Invalid credentials', status=401)
        
        # Reset failed-login tracking and update last login
        user.clear_failed_logins()
        user.update_last_login()
        
        # Generate token
        token = generate_token(user)
        profile = UserProfile.get_or_create(user)
        
        logger.info(f'User logged in: {username}')
        
        return success_response({
            'user': user.to_dict(),
            'profile': profile.to_dict(),
            'token': token,
            'allowed_algorithms': user.get_allowed_algorithms()
        }, message='Login successful')
        
    except Exception as e:
        logger.error(f'Login error: {e}')
        return error_response('Login failed', status=500)


@auth_bp.route('/me', methods=['GET'])
@login_required
def get_me():
    """
    Get current user information.
    
    Returns:
        JSON with current user data
    """
    user = get_current_user()
    profile = UserProfile.get_or_create(user)
    return success_response({
        'user': user.to_dict(),
        'profile': profile.to_dict(),
        'allowed_algorithms': user.get_allowed_algorithms()
    })


@auth_bp.route('/profile', methods=['GET'])
@login_required
def get_profile():
    """Get current user's profile and preferences."""
    user = get_current_user()
    profile = UserProfile.get_or_create(user)

    return success_response({
        'user': user.to_dict(),
        'profile': profile.to_dict(),
        'allowed_algorithms': user.get_allowed_algorithms()
    })


@auth_bp.route('/profile', methods=['PUT'])
@login_required
def update_profile():
    """Update current user's optional profile fields and preferences."""
    try:
        data = request.get_json() or {}
        user = get_current_user()
        profile = UserProfile.get_or_create(user)
        profile.update_from_payload(data)
        db.session.commit()

        return success_response({
            'user': user.to_dict(),
            'profile': profile.to_dict(),
            'allowed_algorithms': user.get_allowed_algorithms()
        }, message='Profile updated successfully')
    except Exception as e:
        logger.error(f'Profile update error: {e}')
        db.session.rollback()
        return error_response('Failed to update profile', status=500)


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """
    Logout current user.
    
    Note: With JWT, logout is handled client-side by removing the token.
    This endpoint is provided for API consistency and logging.
    
    Returns:
        JSON success response
    """
    user = get_current_user()
    logger.info(f'User logged out: {user.username}')
    return success_response(message='Logged out successfully')


@auth_bp.route('/presence', methods=['POST'])
@login_required
def update_presence():
    """Update the signed-in user's heartbeat used by the admin dashboard."""
    user = get_current_user()
    user.update_last_seen()
    return success_response({
        'last_seen_at': user.last_seen_at.isoformat(),
    })


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """
    Change current user's password.
    
    Request Body:
        current_password: str - Current password
        new_password: str - New password
        
    Returns:
        JSON success response
    """
    try:
        data = request.get_json() or {}
        user = get_current_user()
        
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        
        if not user.check_password(current_password):
            return error_response('Current password is incorrect', status=400)
        
        is_valid, error = User.validate_password(new_password)
        if not is_valid:
            return validation_error(error)
        
        user.set_password(new_password)
        db.session.commit()
        
        logger.info(f'Password changed for user: {user.username}')
        
        return success_response(message='Password changed successfully')
        
    except Exception as e:
        logger.error(f'Change password error: {e}')
        db.session.rollback()
        return error_response('Failed to change password', status=500)


# Admin-only routes

@auth_bp.route('/admin/overview', methods=['GET'])
@admin_required
def admin_overview():
    """Return presence, account, and tier-quota data for administrators."""
    TierQuota.ensure_defaults()
    users = User.query.order_by(User.username.asc()).all()
    user_data = [user.to_dict() for user in users]
    quotas = [
        TierQuota.get_for_role(role).to_dict()
        for role in UserRole
    ]

    return success_response({
        'users': user_data,
        'total': len(user_data),
        'online_count': sum(1 for user in user_data if user['is_online']),
        'online_window_minutes': 5,
        'quotas': quotas,
    })


@auth_bp.route('/admin/quotas/<tier>', methods=['PUT'])
@admin_required
def update_tier_quota(tier):
    """Update resource limits for a single account tier."""
    tier = str(tier or '').strip().lower()
    valid_tiers = {role.value for role in UserRole}
    if tier not in valid_tiers:
        return validation_error(f'Tier must be one of: {", ".join(sorted(valid_tiers))}')

    data = request.get_json() or {}
    fields = {
        'max_custom_layouts': int,
        'max_storage_gb': float,
        'max_gpu_hours': float,
        'max_custom_pipelines': int,
    }
    cleaned = {}
    for field, converter in fields.items():
        value = data.get(field)
        if isinstance(value, bool):
            return validation_error(f'{field} must be a number')
        try:
            value = converter(value)
        except (TypeError, ValueError):
            return validation_error(f'{field} must be a number')
        if value < -1:
            return validation_error(f'{field} must be -1 (unlimited) or zero and above')
        cleaned[field] = value

    quota = TierQuota.get_for_role(tier)
    for field, value in cleaned.items():
        setattr(quota, field, value)
    db.session.commit()

    logger.info('Admin updated quota for tier %s', tier)
    return success_response({
        'quota': quota.to_dict(),
    }, message='Tier quota updated successfully')

@auth_bp.route('/users', methods=['POST'])
@admin_required
def create_user():
    """
    Create a user from the admin page.

    Request Body:
        email: str - Email address
        password: str - Initial password
        role: str - Optional role, defaults to 'user'
        username: str - Optional username

    Returns:
        JSON with created user data
    """
    try:
        data = request.get_json() or {}
        email = data.get('email', '').strip().lower()
        password = data.get('password', '')
        role_str = data.get('role', UserRole.USER.value).strip().lower()
        username = data.get('username', '').strip() or _make_username_from_email(email)

        if not email or '@' not in email:
            return validation_error('Valid email is required')

        is_valid, error = User.validate_username(username)
        if not is_valid:
            return validation_error(error)

        is_valid, error = User.validate_password(password)
        if not is_valid:
            return validation_error(error)

        valid_roles = [role.value for role in UserRole]
        if role_str not in valid_roles:
            return validation_error(f'Role must be one of: {", ".join(valid_roles)}')

        if User.query.filter_by(username=username).first():
            return validation_error('Username already exists')

        if User.query.filter_by(email=email).first():
            return validation_error('Email already registered')

        user = User(
            username=username,
            email=email,
            role=UserRole(role_str)
        )
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        logger.info(f'Admin created user: {username}')

        return success_response({
            'user': user.to_dict()
        }, message='User created successfully')
    except Exception as e:
        logger.error(f'Create user error: {e}')
        db.session.rollback()
        return error_response('Failed to create user', status=500)


@auth_bp.route('/users', methods=['GET'])
@admin_required
def list_users():
    """
    List all users (admin only).
    
    Returns:
        JSON with list of users
    """
    users = User.query.all()
    return success_response({
        'users': [u.to_dict() for u in users],
        'total': len(users)
    })


@auth_bp.route('/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user(user_id):
    """
    Get a specific user by ID (admin only).
    
    Returns:
        JSON with user data
    """
    user = User.query.get(user_id)
    if not user:
        return error_response('User not found', status=404)
    return success_response({'user': user.to_dict()})


@auth_bp.route('/users/<int:user_id>/role', methods=['PUT'])
@admin_required
def update_user_role(user_id):
    """
    Update a user's role (admin only).
    
    Request Body:
        role: str - 'guest', 'user', 'pro', or 'admin'
        
    Returns:
        JSON with updated user data
    """
    try:
        data = request.get_json() or {}
        role_str = data.get('role', '').lower()
        
        valid_roles = [role.value for role in UserRole]
        if role_str not in valid_roles:
            return validation_error(f'Role must be one of: {", ".join(valid_roles)}')
        
        user = User.query.get(user_id)
        if not user:
            return error_response('User not found', status=404)
        
        # Prevent admin from demoting themselves
        current_user = get_current_user()
        if user.id == current_user.id and role_str != UserRole.ADMIN.value:
            return error_response('Cannot demote yourself', status=400)
        
        user.role = UserRole(role_str)
        db.session.commit()
        
        logger.info(f'User role updated: {user.username} -> {role_str}')
        
        return success_response({
            'user': user.to_dict()
        }, message='Role updated successfully')
        
    except Exception as e:
        logger.error(f'Update role error: {e}')
        db.session.rollback()
        return error_response('Failed to update role', status=500)


@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """
    Delete a user (admin only).
    
    Returns:
        JSON success response
    """
    try:
        user = User.query.get(user_id)
        if not user:
            return error_response('User not found', status=404)
        
        # Prevent admin from deleting themselves
        current_user = get_current_user()
        if user.id == current_user.id:
            return error_response('Cannot delete yourself', status=400)
        
        username = user.username
        db.session.delete(user)
        db.session.commit()
        
        logger.info(f'User deleted: {username}')
        
        return success_response(message='User deleted successfully')
        
    except Exception as e:
        logger.error(f'Delete user error: {e}')
        db.session.rollback()
        return error_response('Failed to delete user', status=500)
