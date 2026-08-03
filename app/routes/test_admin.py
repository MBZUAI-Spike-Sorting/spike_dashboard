import unittest
from datetime import datetime

from flask import Flask

from app.models.database import db
from app.models.tier_quota import TierQuota
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.routes.auth import auth_bp
from app.utils.auth import generate_token


class AdminDashboardTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI='sqlite://',
            SQLALCHEMY_TRACK_MODIFICATIONS=False,
        )
        db.init_app(self.app)
        self.app.register_blueprint(auth_bp)

        with self.app.app_context():
            db.create_all()
            TierQuota.ensure_defaults()
            admin = User(
                username='admin_test',
                email='admin@example.com',
                role=UserRole.ADMIN,
                last_seen_at=datetime.utcnow(),
            )
            admin.set_password('Valid123!')
            member = User(
                username='member',
                email='member@example.com',
                role=UserRole.USER,
            )
            member.set_password('Valid123!')
            db.session.add_all([admin, member])
            db.session.commit()
            self.admin_id = admin.id
            self.member_id = member.id
            self.admin_token = generate_token(admin)
            self.member_token = generate_token(member)

        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def headers(self, token):
        return {'Authorization': f'Bearer {token}'}

    def test_admin_overview_returns_online_users_and_all_tier_quotas(self):
        response = self.client.get(
            '/api/auth/admin/overview',
            headers=self.headers(self.admin_token),
        )

        self.assertEqual(response.status_code, 200)
        data = response.get_json()['data']
        self.assertEqual(data['total'], 2)
        self.assertEqual(data['online_count'], 1)
        self.assertEqual({quota['tier'] for quota in data['quotas']}, {
            'guest', 'user', 'pro', 'admin'
        })
        self.assertTrue(next(user for user in data['users'] if user['id'] == self.admin_id)['is_online'])

    def test_regular_user_cannot_open_admin_overview(self):
        response = self.client.get(
            '/api/auth/admin/overview',
            headers=self.headers(self.member_token),
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_update_tier_quota(self):
        response = self.client.put(
            '/api/auth/admin/quotas/pro',
            headers=self.headers(self.admin_token),
            json={
                'max_custom_layouts': 18,
                'max_storage_gb': 75.5,
                'max_gpu_hours': 12.5,
                'max_custom_pipelines': 6,
            },
        )

        self.assertEqual(response.status_code, 200)
        quota = response.get_json()['data']['quota']
        self.assertEqual(quota['max_custom_layouts'], 18)
        self.assertEqual(quota['max_storage_gb'], 75.5)

    def test_presence_heartbeat_marks_user_online(self):
        response = self.client.post(
            '/api/auth/presence',
            headers=self.headers(self.member_token),
        )
        self.assertEqual(response.status_code, 200)

        with self.app.app_context():
            member = db.session.get(User, self.member_id)
            self.assertIsNotNone(member.last_seen_at)
            self.assertTrue(member.is_online())

    def test_layout_quota_limits_custom_views_but_keeps_default(self):
        with self.app.app_context():
            quota = TierQuota.get_for_role(UserRole.USER)
            quota.max_custom_layouts = 1
            member = db.session.get(User, self.member_id)
            profile = UserProfile.get_or_create(member)
            profile.update_from_payload({
                'preferences': {
                    'dashboardViews': [
                        {'id': 'default', 'isDefault': True},
                        {'id': 'first', 'name': 'First'},
                        {'id': 'second', 'name': 'Second'},
                    ],
                    'currentDashboardViewId': 'first',
                },
            })
            db.session.commit()

            views = profile.get_preferences()['dashboardViews']
            self.assertEqual([view['id'] for view in views], ['default', 'first'])


if __name__ == '__main__':
    unittest.main()
