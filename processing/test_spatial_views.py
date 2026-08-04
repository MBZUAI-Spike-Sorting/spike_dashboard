import unittest

import numpy as np

from processing.spatial_views import build_probe_geometry, downsample_trace_heatmap


class SpatialViewTests(unittest.TestCase):
    def test_probe_geometry_uses_physical_positions_and_cluster_footprints(self):
        result = build_probe_geometry(
            3,
            probe={
                'xc': [10, 20, 30],
                'yc': [0, 20, 40],
                'chanMap': [0, 1, 2],
                'kcoords': [0, 0, 1],
            },
            clustering_results=[
                [{'time': 1, 'channel': 2}, {'time': 2, 'channel': 2}, {'time': 3, 'channel': 1}],
            ],
            cluster_ids=[0],
        )

        self.assertEqual(result['source'], 'physical_probe')
        self.assertEqual(result['channels'][1]['x'], 20.0)
        self.assertEqual(result['channels'][2]['shank'], 1)
        self.assertEqual(result['clusterFootprints'][0]['peakChannel'], 2)

    def test_probe_geometry_has_deterministic_fallback(self):
        result = build_probe_geometry(5)

        self.assertEqual(result['source'], 'fallback_grid')
        self.assertEqual([channel['channelId'] for channel in result['channels']], [1, 2, 3, 4, 5])
        self.assertEqual(result['channels'][4]['y'], 20.0)

    def test_trace_heatmap_preserves_peak_polarity_and_bounds_shape(self):
        data = np.zeros((3, 100), dtype=np.float32)
        data[0, 10] = -12
        data[1, 50] = 8
        result = downsample_trace_heatmap(
            data,
            start_sample=0,
            end_sample=100,
            channel_ids=[1, 2],
            max_time_bins=10,
            normalization='raw',
            sample_rate_hz=1000,
        )

        self.assertEqual(result['channelIds'], [1, 2])
        self.assertEqual(np.asarray(result['values']).shape, (2, 10))
        self.assertEqual(min(result['values'][0]), -12.0)
        self.assertEqual(max(result['values'][1]), 8.0)
        self.assertEqual(result['timeBinCentersSeconds'][-1], 0.095)


if __name__ == '__main__':
    unittest.main()
