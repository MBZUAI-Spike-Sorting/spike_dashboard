import unittest
from types import SimpleNamespace

import numpy as np
from flask import Flask

from app.routes.clustering import (
    _ensure_requested_clustering_results,
    _infer_peak_channel_from_dataset,
    _normalize_cluster_payload,
    clustering_bp,
)


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
        app.config['clustering_manager'] = SimpleNamespace(
            clustering_results=results,
            has_preprocessed_torchbci=lambda: True,
            has_preprocessed_kilosort4=lambda: True,
            check_algorithm_available=lambda _algorithm: True,
        )
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

    def test_preprocessed_kilosort_keeps_its_display_name(self):
        response = self.client.get('/api/spike-sorting/algorithms')
        algorithms = response.get_json()['algorithms']
        custom_upload = next(
            algorithm for algorithm in algorithms
            if algorithm['name'] == 'preprocessed_kilosort4'
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(custom_upload['displayName'], 'Kilosort4 (Preprocessed)')
        self.assertFalse(custom_upload['requiresRun'])

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

    def test_firing_rate_contract_uses_recording_duration(self):
        payload = self.client.post('/api/cluster-firing-rates', json={
            'clusterIds': [0, 1],
            'algorithm': 'test',
            'binSizeSeconds': 0.05,
        }).get_json()

        self.assertEqual(payload['sampleRateHz'], 1000)
        self.assertEqual(payload['recordingDurationSamples'], 120.0)
        self.assertEqual(payload['series'][0]['counts'], [2, 1, 0])
        self.assertEqual(payload['series'][0]['rateHz'], [40.0, 20.0, 0.0])

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

    def test_curator_waveforms_use_explicit_cluster_times_and_infer_peak_channel(self):
        data = np.zeros((3, 100), dtype=np.float32)
        data[0, :] = 500
        data[1, :] = -81
        data[2, 37:44] = [-1, -3, 2, 9, 3, -2, 0]
        self.client.application.config['dataset_manager'].data_array = data

        payload = self.client.post('/api/cluster-waveforms', json={
            'clusterIds': [],
            'clusters': [{
                'id': 515,
                'primaryChannel': None,
                'spikeTimes': [40],
            }],
            'maxWaveforms': 10,
            'windowSize': 5,
        }).get_json()

        waveforms = payload['waveforms']['515']
        self.assertEqual(len(waveforms), 1)
        self.assertEqual(waveforms[0]['time'], 40)
        self.assertEqual(waveforms[0]['channel'], 3)
        self.assertGreater(np.ptp(waveforms[0]['amplitude']), 0)

    def test_preprocessed_source_switch_reloads_requested_results(self):
        calls = []
        manager = SimpleNamespace(
            clustering_results=[[{'time': 1}]],
            clustering_results_source='preprocessed_torchbci',
            load_preprocessed_kilosort4=lambda: calls.append('kilosort4'),
        )

        _ensure_requested_clustering_results(manager, 'preprocessed_kilosort4')

        self.assertEqual(calls, ['kilosort4'])

    def test_peak_channel_inference_ignores_constant_dc_offsets(self):
        data = np.zeros((3, 80), dtype=np.float32)
        data[0, :] = 500
        data[1, :] = -120
        data[2, 36:45] = [0, 2, -5, -20, 35, 12, -4, 1, 0]
        manager = SimpleNamespace(data_array=data)

        channel_index, channel_label = _infer_peak_channel_from_dataset(
            manager,
            [40],
        )

        self.assertEqual(channel_index, 2)
        self.assertEqual(channel_label, 3)

    def test_curator_parser_preserves_visualization_data(self):
        payload = _normalize_cluster_payload({
            'clusters': [{
                'id': 12,
                'spikeTimes': [100, 200],
                'spikeChannels': [4, 5],
                'points': [[-1, 2], [3, 4]],
                'waveforms': [[-2, 0, 3], [-1, 0, 4]],
                'spikeAmplitudes': [5, 6],
            }],
        })
        cluster = payload['clusters'][0]

        self.assertEqual(cluster['points'], [[-1.0, 2.0], [3.0, 4.0]])
        self.assertEqual(cluster['spikeChannels'], [4.0, 5.0])
        self.assertEqual(len(cluster['waveforms']), 2)
        self.assertEqual(cluster['spikeAmplitudes'], [5.0, 6.0])


if __name__ == '__main__':
    unittest.main()
