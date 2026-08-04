import unittest

import numpy as np

from processing.template_gallery import extract_cluster_templates


class TemplateGalleryTests(unittest.TestCase):
    def test_retained_template_is_preferred_over_raw_fallback(self):
        results = [[{
            'time': 20,
            'channel': 1,
            'templateWaveform': [-1, 0, 4, 1],
        }]]
        data = np.zeros((1, 50), dtype=np.float32)

        payload = extract_cluster_templates(results, data, [0], sample_rate_hz=1000)
        template = payload['templates'][0]

        self.assertEqual(template['source'], 'retained_template')
        self.assertEqual(template['retainedKey'], 'templateWaveform')
        self.assertEqual(template['template'], [-1.0, 0.0, 4.0, 1.0])

    def test_mean_waveform_fallback_is_deterministic_and_ordered(self):
        results = [
            [{'time': 20, 'channel': 1}, {'time': 40, 'channel': 1}],
            [{'time': 30, 'channel': 2}],
        ]
        data = np.zeros((2, 70), dtype=np.float32)
        data[0, 18:23] = [-1, -2, 4, 2, -1]
        data[0, 38:43] = [-2, -1, 5, 1, -2]
        data[1, 28:33] = [-3, 0, 6, 0, -3]

        first = extract_cluster_templates(
            results, data, [1, 0], sample_rate_hz=1000, window_samples=2, max_waveforms=2
        )
        second = extract_cluster_templates(
            results, data, [1, 0], sample_rate_hz=1000, window_samples=2, max_waveforms=2
        )

        self.assertEqual(first, second)
        self.assertEqual(first['clusterIds'], [1, 0])
        self.assertEqual([item['source'] for item in first['templates']], [
            'mean_raw_waveform', 'mean_raw_waveform'
        ])
        self.assertEqual(first['templates'][1]['sampledWaveforms'], 2)

    def test_invalid_cluster_ids_are_removed(self):
        payload = extract_cluster_templates([[]], None, [9, 0, 0])
        self.assertEqual(payload['clusterIds'], [0])
        self.assertEqual(payload['templates'][0]['source'], 'unavailable')


if __name__ == '__main__':
    unittest.main()
