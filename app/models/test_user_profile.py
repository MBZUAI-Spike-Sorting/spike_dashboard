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


if __name__ == '__main__':
    unittest.main()
