"""Persistent resource limits configured for each account tier."""

from datetime import datetime

from app.models.database import db
from app.models.user import UserRole


class TierQuota(db.Model):
    """Admin-managed quota values for a user role."""

    __tablename__ = 'tier_quotas'

    tier = db.Column(db.String(20), primary_key=True)
    max_custom_layouts = db.Column(db.Integer, nullable=False)
    max_storage_gb = db.Column(db.Float, nullable=False)
    max_gpu_hours = db.Column(db.Float, nullable=False)
    max_custom_pipelines = db.Column(db.Integer, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    DEFAULTS = {
        UserRole.GUEST.value: {
            'max_custom_layouts': 2,
            'max_storage_gb': 1,
            'max_gpu_hours': 0,
            'max_custom_pipelines': 0,
        },
        UserRole.USER.value: {
            'max_custom_layouts': 10,
            'max_storage_gb': 10,
            'max_gpu_hours': 0,
            'max_custom_pipelines': 0,
        },
        UserRole.PRO.value: {
            'max_custom_layouts': 30,
            'max_storage_gb': 100,
            'max_gpu_hours': 25,
            'max_custom_pipelines': 10,
        },
        UserRole.ADMIN.value: {
            'max_custom_layouts': -1,
            'max_storage_gb': -1,
            'max_gpu_hours': -1,
            'max_custom_pipelines': -1,
        },
    }

    @classmethod
    def ensure_defaults(cls):
        """Create missing tier rows without overwriting admin changes."""
        changed = False
        for tier, values in cls.DEFAULTS.items():
            if db.session.get(cls, tier) is None:
                db.session.add(cls(tier=tier, **values))
                changed = True
        if changed:
            db.session.commit()

    @classmethod
    def get_for_role(cls, role):
        tier = role.value if isinstance(role, UserRole) else str(role)
        quota = db.session.get(cls, tier)
        if quota is None and tier in cls.DEFAULTS:
            quota = cls(tier=tier, **cls.DEFAULTS[tier])
            db.session.add(quota)
            db.session.commit()
        return quota

    def to_dict(self):
        return {
            'tier': self.tier,
            'max_custom_layouts': self.max_custom_layouts,
            'max_storage_gb': self.max_storage_gb,
            'max_gpu_hours': self.max_gpu_hours,
            'max_custom_pipelines': self.max_custom_pipelines,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
