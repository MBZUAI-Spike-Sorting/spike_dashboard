import unittest

from app.models.user_profile import UserProfile


class UserProfileLayoutNormalizationTests(unittest.TestCase):
    def test_cluster_groups_are_preserved_with_sanitized_widget_layout(self):
        profile = UserProfile()

        normalized = profile._normalize_widget_states({
            'clusterList': {
                'visible': True,
                'position': {'left': 10, 'top': 20},
                'size': {'width': 700, 'height': 400},
                'clusterGroups': {
                    '12': 'good',
                    'unit-a': 'mua',
                    '14': 'invalid-group',
                },
            },
        })

        self.assertEqual(normalized['clusterList']['clusterGroups'], {
            '12': 'good',
            'unit-a': 'mua',
        })

    def test_other_widgets_cannot_store_cluster_group_payloads(self):
        profile = UserProfile()

        normalized = profile._normalize_widget_states({
            'waveform': {
                'visible': True,
                'clusterGroups': {'12': 'good'},
            },
        })

        self.assertNotIn('clusterGroups', normalized['waveform'])

    def test_saved_canvas_viewport_is_sanitized_and_preserved(self):
        profile = UserProfile()

        self.assertEqual(profile._normalize_viewport({
            'x': -420.5,
            'y': 90,
            'zoom': 0.75,
        }), {
            'x': -420.5,
            'y': 90.0,
            'zoom': 0.75,
        })
        self.assertIsNone(profile._normalize_viewport({
            'x': 0,
            'y': 0,
            'zoom': 0,
        }))

    def test_theme_preference_accepts_only_light_or_dark(self):
        profile = UserProfile()

        self.assertEqual(profile._normalize_preferences({'theme': 'light'})['theme'], 'light')
        self.assertEqual(profile._normalize_preferences({'theme': 'neon'})['theme'], 'dark')


if __name__ == '__main__':
    unittest.main()
