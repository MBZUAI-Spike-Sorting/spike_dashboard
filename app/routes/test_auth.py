import unittest

from flask import Flask

from app.models.database import db
from app.models.user import User, UserRole
from app.models.user_profile import UserProfile
from app.routes.auth import auth_bp


class AuthProfileHydrationTests(unittest.TestCase):
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
            user = User(
                username='curator',
                email='curator@example.com',
                role=UserRole.USER,
            )
            user.set_password('Valid123!')
            db.session.add(user)
            db.session.commit()

            profile = UserProfile.get_or_create(user)
            profile.update_from_payload({
                'preferences': {
                    'dashboardViews': [{
                        'id': 'curation-layout',
                        'name': 'Curation layout',
                        'widgetStates': {
                            'clusterList': {
                                'visible': True,
                                'clusterGroups': {'12': 'good'},
                            },
                        },
                    }],
                    'currentDashboardViewId': 'curation-layout',
                },
            })
            db.session.commit()

        self.client = self.app.test_client()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_login_returns_the_saved_profile_with_cluster_groups(self):
        response = self.client.post('/api/auth/login', json={
            'username': 'curator',
            'password': 'Valid123!',
        })

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()['data']
        self.assertEqual(
            payload['profile']['preferences']['currentDashboardViewId'],
            'curation-layout',
        )
        self.assertEqual(
            payload['profile']['preferences']['dashboardViews'][0]
            ['widgetStates']['clusterList']['clusterGroups'],
            {'12': 'good'},
        )


if __name__ == '__main__':
    unittest.main()
