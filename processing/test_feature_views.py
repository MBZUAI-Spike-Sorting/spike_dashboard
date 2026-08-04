import unittest

from processing.feature_views import extract_cluster_features


class FeatureViewTests(unittest.TestCase):
    def setUp(self):
        self.results = [
            [
                {'time': 10, 'channel': 1, 'x': 0.0, 'y': 0.1, 'spikeIndex': 4},
                {'time': 20, 'channel': 2, 'x': 0.2, 'y': 0.3, 'spikeIndex': 5},
            ],
            [
                {'time': 30, 'channel': 1, 'x': 2.0, 'y': 2.1, 'spikeIndex': 8},
                {'time': 40, 'channel': 1, 'x': 2.2, 'y': 2.3, 'spikeIndex': 9},
            ],
            [{'time': 50, 'channel': 1, 'x': 8.0, 'y': 9.0, 'spikeIndex': 2}],
        ]

    def test_features_keep_stable_spike_ids_and_background(self):
        result = extract_cluster_features(
            self.results,
            [0],
            sample_rate_hz=1000,
            include_background=True,
        )

        self.assertEqual(result['series'][0]['points'][0]['spikeId'], '0:4')
        self.assertEqual(result['series'][0]['points'][0]['values']['timeSeconds'], 0.01)
        self.assertEqual(len(result['backgroundPoints']), 3)
        self.assertIn('pc1', [dimension['id'] for dimension in result['dimensions']])

    def test_pair_projection_separates_two_clusters(self):
        result = extract_cluster_features(self.results, [0, 1], include_background=False)
        first = [point['values']['pairProjection'] for point in result['series'][0]['points']]
        second = [point['values']['pairProjection'] for point in result['series'][1]['points']]

        self.assertEqual(result['pairFeatureSource'], 'pca_centroid_axis')
        self.assertLess(max(first), min(second))

    def test_selected_channel_filter_is_applied(self):
        result = extract_cluster_features(
            self.results,
            [0],
            selected_channels=[2],
            include_background=False,
        )

        self.assertEqual(len(result['series'][0]['points']), 1)
        self.assertEqual(result['series'][0]['points'][0]['channel'], 2)
        self.assertEqual(result['series'][0]['points'][0]['pointIndex'], 1)
        self.assertEqual(result['series'][0]['points'][0]['spikeId'], '0:5')


if __name__ == '__main__':
    unittest.main()
