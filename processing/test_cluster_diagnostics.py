import unittest

import numpy as np

from processing.cluster_diagnostics import (
    calculate_cluster_metrics,
    calculate_correlograms,
    calculate_isi_histograms,
    extract_spike_amplitudes,
)


class ClusterDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        self.results = [
            [
                {'time': 0, 'channel': 1, 'spikeIndex': 0},
                {'time': 30, 'channel': 1, 'spikeIndex': 1},
                {'time': 90, 'channel': 2, 'spikeIndex': 2},
            ],
            [
                {'time': 15, 'channel': 2, 'spikeIndex': 0},
                {'time': 45, 'channel': 2, 'spikeIndex': 1},
            ],
        ]

    def test_metrics_use_supplied_sample_rate_and_duration(self):
        metrics = calculate_cluster_metrics(
            self.results,
            [0, 1],
            sample_rate_hz=1000,
            recording_duration_samples=1000,
            refractory_period_ms=40,
        )

        self.assertEqual(metrics['0']['numSpikes'], 3)
        self.assertEqual(metrics['0']['peakChannel'], 1)
        self.assertAlmostEqual(metrics['0']['firingRateHz'], 3.0)
        self.assertEqual(metrics['0']['isiViolationCount'], 1)
        self.assertAlmostEqual(metrics['0']['isiViolationRate'], 0.5)

    def test_isi_histogram_reports_refractory_violations(self):
        result = calculate_isi_histograms(
            self.results,
            [0],
            sample_rate_hz=1000,
            bin_size_ms=10,
            window_size_ms=100,
            refractory_period_ms=40,
        )

        self.assertEqual(result['series'][0]['totalIntervals'], 2)
        self.assertEqual(result['series'][0]['violationCount'], 1)
        self.assertEqual(sum(result['series'][0]['counts']), 2)

    def test_correlogram_matrix_is_pairwise_and_removes_self_events(self):
        result = calculate_correlograms(
            self.results,
            [0, 1],
            sample_rate_hz=1000,
            bin_size_ms=10,
            window_size_ms=100,
        )

        self.assertEqual(result['clusterIds'], [0, 1])
        self.assertEqual(len(result['pairs']), 4)
        auto = next(
            pair for pair in result['pairs']
            if pair['sourceClusterId'] == 0 and pair['targetClusterId'] == 0
        )
        cross_forward = next(
            pair for pair in result['pairs']
            if pair['sourceClusterId'] == 0 and pair['targetClusterId'] == 1
        )
        cross_reverse = next(
            pair for pair in result['pairs']
            if pair['sourceClusterId'] == 1 and pair['targetClusterId'] == 0
        )

        self.assertEqual(sum(auto['counts']), 6)
        self.assertEqual(cross_forward['counts'], list(reversed(cross_reverse['counts'])))

    def test_diagnostics_accept_cluster_ids_above_seven(self):
        results = [[] for _ in range(12)]
        results[11] = [
            {'time': 10, 'channel': 1, 'spikeIndex': 0},
            {'time': 20, 'channel': 1, 'spikeIndex': 1},
        ]

        correlograms = calculate_correlograms(results, [11], sample_rate_hz=1000)
        isi = calculate_isi_histograms(results, [11], sample_rate_hz=1000)

        self.assertEqual(correlograms['clusterIds'], [11])
        self.assertEqual(isi['clusterIds'], [11])

    def test_amplitudes_are_raw_peak_to_peak_values(self):
        data = np.zeros((2, 120), dtype=np.float32)
        data[0, 28:33] = [-2, -1, 0, 3, 1]
        result = extract_spike_amplitudes(
            [[{'time': 30, 'channel': 1, 'spikeIndex': 7}]],
            [0],
            data,
            sample_rate_hz=1000,
            max_spikes_per_cluster=10,
            window_samples=3,
        )

        point = result['series'][0]['points'][0]
        self.assertEqual(point['spikeId'], '0:7')
        self.assertEqual(point['pointIndex'], 0)
        self.assertEqual(point['timeSeconds'], 0.03)
        self.assertEqual(point['amplitude'], 5.0)

    def test_amplitude_background_is_same_channel_and_stably_identified(self):
        data = np.zeros((2, 120), dtype=np.float32)
        data[0, 27:34] = [-2, -1, 0, 4, 1, 0, -1]
        result = extract_spike_amplitudes(
            [
                [{'time': 30, 'channel': 1, 'spikeIndex': 0}],
                [
                    {'time': 60, 'channel': 1, 'spikeIndex': 4},
                    {'time': 80, 'channel': 2, 'spikeIndex': 5},
                ],
            ],
            [0],
            data,
            sample_rate_hz=1000,
            window_samples=3,
            include_background=True,
        )

        self.assertEqual(len(result['backgroundPoints']), 1)
        self.assertEqual(result['backgroundPoints'][0]['spikeId'], '1:4')


if __name__ == '__main__':
    unittest.main()
