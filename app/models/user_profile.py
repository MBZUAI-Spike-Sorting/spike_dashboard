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
        'compactTables': False,
        'dashboardViews': [],
        'currentDashboardViewId': 'default'
    }
    MAX_DASHBOARD_VIEWS = 30
    MAX_WIDGET_STATES_PER_VIEW = 40

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

        normalized = {
            **self.DEFAULT_PREFERENCES,
            **{k: saved.get(k) for k in self.DEFAULT_PREFERENCES if k in saved}
        }

        normalized['dashboardViews'] = self._normalize_dashboard_views(
            normalized.get('dashboardViews')
        )
        normalized['currentDashboardViewId'] = self._clean_text(
            normalized.get('currentDashboardViewId') or 'default',
            80
        ) or 'default'

        return normalized

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
        if 'dashboardViews' in preferences:
            normalized['dashboardViews'] = self._normalize_dashboard_views(
                preferences.get('dashboardViews')
            )
        if 'currentDashboardViewId' in preferences:
            current_view_id = self._clean_text(
                preferences.get('currentDashboardViewId') or 'default',
                80
            ) or 'default'
            saved_view_ids = {
                view.get('id')
                for view in normalized.get('dashboardViews', [])
                if isinstance(view, dict)
            }
            normalized['currentDashboardViewId'] = (
                current_view_id if current_view_id in saved_view_ids else 'default'
            )

        return normalized

    def _clean_text(self, value, limit):
        return str(value or '').strip()[:limit]

    def _normalize_dashboard_views(self, views):
        if not isinstance(views, list):
            return []

        normalized = []
        seen_ids = set()

        for view in views[:self.MAX_DASHBOARD_VIEWS]:
            if not isinstance(view, dict):
                continue

            view_id = self._clean_text(view.get('id'), 80)
            if not view_id or view_id in seen_ids:
                continue

            seen_ids.add(view_id)
            normalized.append({
                'id': view_id,
                'name': self._clean_text(view.get('name') or 'Layout', 120),
                'isDefault': bool(view.get('isDefault')),
                'widgetStates': self._normalize_widget_states(view.get('widgetStates')),
                'createdAt': self._clean_text(view.get('createdAt'), 40),
                'updatedAt': self._clean_text(view.get('updatedAt'), 40),
            })

        return normalized

    def _normalize_widget_states(self, widget_states):
        if not isinstance(widget_states, dict):
            return {}

        normalized = {}
        for widget_id, state in list(widget_states.items())[:self.MAX_WIDGET_STATES_PER_VIEW]:
            clean_widget_id = self._clean_widget_id(widget_id)
            if not clean_widget_id or not isinstance(state, dict):
                continue

            order = self._clean_int(state.get('order'), 0, 1000)
            normalized_state = {
                'visible': bool(state.get('visible')),
                'minimized': bool(state.get('minimized')),
                'maximized': bool(state.get('maximized')),
                'order': order if order is not None else 0,
                'position': self._clean_layout_pair(state.get('position'), ('left', 'top')),
                'size': self._clean_layout_pair(state.get('size'), ('width', 'height')),
            }
            normalized[clean_widget_id] = normalized_state

        return normalized

    def _clean_widget_id(self, value):
        widget_id = self._clean_text(value, 80)
        if not widget_id:
            return ''
        if not all(char.isalnum() or char in ('_', '-') for char in widget_id):
            return ''
        return widget_id

    def _clean_layout_pair(self, value, keys):
        if not isinstance(value, dict):
            return None

        cleaned = {}
        for key in keys:
            cleaned[key] = self._clean_int(value.get(key), -10000, 10000)
        return cleaned

    def _clean_int(self, value, minimum, maximum):
        try:
            cleaned = int(round(float(value)))
        except (TypeError, ValueError):
            return None

        return max(minimum, min(maximum, cleaned))
