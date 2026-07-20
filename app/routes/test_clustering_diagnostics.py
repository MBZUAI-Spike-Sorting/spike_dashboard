import unittest
from types import SimpleNamespace

import numpy as np
from flask import Flask

from app.routes.clustering import _ensure_requested_clustering_results, clustering_bp


class ClusterDiagnosticRouteTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config.update(TESTING=True)
        results = [
            [
                {'time': 10, 'channel': 1, 'spikeIndex': 0},
                {'time': 40, 'channel': 1, 'spikeIndex': 1},
                {'time': 90, 'channel': 1, 'spikeIndex': 2},
            ],
            [
                {'time': 25, 'channel': 2, 'spikeIndex': 0},
                {'time': 70, 'channel': 2, 'spikeIndex': 1},
            ],
        ]
        data = np.zeros((2, 120), dtype=np.float32)
        data[0, 7:14] = [-1, -2, 0, 4, 2, 0, -1]
        data[1, 22:29] = [-2, -1, 1, 3, 1, 0, -2]
        app.config['clustering_manager'] = SimpleNamespace(clustering_results=results)
        app.config['dataset_manager'] = SimpleNamespace(data_array=data)
        app.config['app_config'] = SimpleNamespace(SAMPLING_RATE=1000)
        app.register_blueprint(clustering_bp)
        self.client = app.test_client()

    def test_statistics_contract(self):
        response = self.client.post('/api/cluster-statistics', json={
            'clusterIds': [0, 1],
            'algorithm': 'test',
        })
        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload['metadata']['sampleRateHz'], 1000)
        self.assertEqual(payload['statistics']['0']['numSpikes'], 3)

    def test_correlogram_and_isi_contracts(self):
        correlograms = self.client.post('/api/cluster-correlograms', json={
            'clusterIds': [0, 1],
            'algorithm': 'test',
            'binSizeMs': 10,
            'windowSizeMs': 100,
        }).get_json()
        isis = self.client.post('/api/cluster-isi-histograms', json={
            'clusterIds': [0],
            'algorithm': 'test',
            'binSizeMs': 10,
            'windowSizeMs': 100,
            'refractoryPeriodMs': 40,
        }).get_json()
        self.assertEqual(len(correlograms['pairs']), 4)
        self.assertEqual(isis['series'][0]['violationCount'], 1)

    def test_amplitude_contract_uses_raw_data(self):
        payload = self.client.post('/api/cluster-amplitudes', json={
            'clusterIds': [0],
            'algorithm': 'test',
            'windowSamples': 3,
        }).get_json()
        self.assertEqual(payload['amplitudeUnit'], 'raw')
        self.assertGreater(payload['series'][0]['points'][0]['amplitude'], 0)

    def test_waveform_sampling_is_stable_and_includes_selected_spike(self):
        payload = self.client.post('/api/cluster-waveforms', json={
            'clusterIds': [0],
            'algorithm': 'test',
            'maxWaveforms': 1,
            'windowSize': 3,
            'includeSpikeIndices': [{'clusterId': 0, 'pointIndex': 2}],
        }).get_json()
        waveforms = payload['waveforms']['0']
        self.assertEqual([waveform['spikeIndex'] for waveform in waveforms], [0, 2])
        self.assertAlmostEqual(waveforms[0]['timePoints'][1] - waveforms[0]['timePoints'][0], 1.0)

    def test_preprocessed_source_switch_reloads_requested_results(self):
        calls = []
        manager = SimpleNamespace(
            clustering_results=[[{'time': 1}]],
            clustering_results_source='preprocessed_torchbci',
            load_preprocessed_kilosort4=lambda: calls.append('kilosort4'),
        )

        _ensure_requested_clustering_results(manager, 'preprocessed_kilosort4')

        self.assertEqual(calls, ['kilosort4'])


if __name__ == '__main__':
    unittest.main()
