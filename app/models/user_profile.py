"""User profile and preference model."""

import json
from datetime import datetime

from app.models.database import db


class UserProfile(db.Model):
    """Optional profile information for a dashboard user."""

    __tablename__ = 'user_profiles'

    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    real_name = db.Column(db.String(120), default='')
    affiliation = db.Column(db.String(160), default='')
    contact_info = db.Column(db.String(160), default='')
    home_page = db.Column(db.String(240), default='')
    avatar_url = db.Column(db.String(300), default='')
    bio = db.Column(db.Text, default='')
    preferences_json = db.Column(db.Text, default='{}')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship(
        'User',
        backref=db.backref('profile', uselist=False, cascade='all, delete-orphan')
    )

    DEFAULT_PREFERENCES = {
        'defaultView': 'multipanel',
        'defaultDataset': '',
        'compactTables': False
    }

    @classmethod
    def get_or_create(cls, user):
        """Return a user's profile, creating it when missing."""
        profile = cls.query.filter_by(user_id=user.id).first()
        if profile:
            return profile

        profile = cls(user_id=user.id)
        db.session.add(profile)
        db.session.commit()
        return profile

    def get_preferences(self):
        """Return saved preferences with defaults applied."""
        try:
            saved = json.loads(self.preferences_json or '{}')
        except (TypeError, ValueError):
            saved = {}

        return {
            **self.DEFAULT_PREFERENCES,
            **{k: saved.get(k) for k in self.DEFAULT_PREFERENCES if k in saved}
        }

    def update_from_payload(self, payload):
        """Update editable profile fields from a request payload."""
        profile_data = payload.get('profile', payload)
        preferences = payload.get('preferences')

        if not isinstance(profile_data, dict):
            profile_data = {}

        for field, limit in (
            ('real_name', 120),
            ('affiliation', 160),
            ('contact_info', 160),
            ('home_page', 240),
            ('avatar_url', 300),
            ('bio', 1000),
        ):
            if field in profile_data:
                setattr(self, field, self._clean_text(profile_data.get(field), limit))

        if preferences is not None:
            self.preferences_json = json.dumps(self._normalize_preferences(preferences))

    def to_dict(self):
        """Convert profile to API response data."""
        return {
            'real_name': self.real_name or '',
            'affiliation': self.affiliation or '',
            'contact_info': self.contact_info or '',
            'home_page': self.home_page or '',
            'avatar_url': self.avatar_url or '',
            'bio': self.bio or '',
            'preferences': self.get_preferences(),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def _normalize_preferences(self, preferences):
        normalized = self.get_preferences()
        if not isinstance(preferences, dict):
            return normalized

        if preferences.get('defaultView') in ('signal', 'clusters', 'multipanel', 'runtime'):
            normalized['defaultView'] = preferences['defaultView']
        if 'defaultDataset' in preferences:
            normalized['defaultDataset'] = self._clean_text(preferences.get('defaultDataset'), 180)
        if 'compactTables' in preferences:
            normalized['compactTables'] = bool(preferences.get('compactTables'))

        return normalized

    def _clean_text(self, value, limit):
        return str(value or '').strip()[:limit]
