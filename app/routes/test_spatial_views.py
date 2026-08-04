import unittest
from types import SimpleNamespace

import numpy as np
from flask import Flask

from app.routes.clustering import clustering_bp
from app.routes.spike_data import spike_data_bp


class SpatialViewRouteTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config.update(TESTING=True)
        data = np.zeros((4, 100), dtype=np.float32)
        data[0, 10] = -10
        results = [[{'time': 10, 'channel': 1}, {'time': 20, 'channel': 1}]]
        app.config['dataset_manager'] = SimpleNamespace(data_array=data)
        app.config['clustering_manager'] = SimpleNamespace(clustering_results=results)
        app.config['app_config'] = SimpleNamespace(SAMPLING_RATE=1000)
        app.register_blueprint(clustering_bp)
        app.register_blueprint(spike_data_bp)
        self.client = app.test_client()

    def test_probe_geometry_route_includes_selected_cluster_footprint(self):
        payload = self.client.post('/api/probe-geometry', json={
            'clusterIds': [0],
        }).get_json()

        self.assertEqual(payload['channelCount'], 4)
        self.assertEqual(payload['source'], 'fallback_grid')
        self.assertEqual(payload['clusterFootprints'][0]['peakChannel'], 1)

    def test_trace_heatmap_route_is_bounded(self):
        payload = self.client.post('/api/trace-heatmap', json={
            'startSample': 0,
            'endSample': 100,
            'channelIds': [1, 2],
            'maxTimeBins': 10,
            'normalization': 'raw',
        }).get_json()

        self.assertEqual(payload['channelIds'], [1, 2])
        self.assertEqual(len(payload['timeBinCentersSamples']), 10)
        self.assertEqual(len(payload['values']), 2)


if __name__ == '__main__':
    unittest.main()
