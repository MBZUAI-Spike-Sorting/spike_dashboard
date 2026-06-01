"""
Database Configuration and Initialization

Provides SQLAlchemy database setup for the Flask application.
"""

import os
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import scoped_session, sessionmaker

# Initialize SQLAlchemy instance
db = SQLAlchemy()


def init_db(app):
    """
    Initialize the database with the Flask app.
    
    Args:
        app: Flask application instance
    """
    # Get database path from config or use default
    db_path = app.config.get('DATABASE_PATH', 'instance/spike_dashboard.db')
    
    # Convert to absolute path relative to the app root
    if not os.path.isabs(db_path):
        # Get the root directory (where run.py is)
        root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        db_path = os.path.join(root_dir, db_path)
    
    # Ensure the directory exists
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir)
        print(f'Created database directory: {db_dir}')
    
    # Configure SQLAlchemy
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    print(f'Database path: {db_path}')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
    }
    
    # Initialize with app
    db.init_app(app)
    
    # Create all tables
    with app.app_context():
        from app.models.user import User, UserRole
        from app.models.user_profile import UserProfile  # noqa: F401

        db.create_all()

        # Create default admin user if not exists
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(
                username='admin',
                email='admin@spike-dashboard.local',
                role=UserRole.ADMIN
            )
            admin.set_password('admin123')  # Default password - should be changed
            db.session.add(admin)
            db.session.commit()
            print('Default admin user created (username: admin, password: admin123)')
    
    return db


def get_db_session():
    """
    Get the current database session.
    
    Returns:
        SQLAlchemy session
    """
    return db.session
