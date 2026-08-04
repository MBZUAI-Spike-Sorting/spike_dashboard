import unittest

from processing.spike_attributes import extract_spike_attribute


class SpikeAttributeTests(unittest.TestCase):
    def setUp(self):
        self.results = [
            [
                {'time': 10, 'channel': 1, 'x': 0.1, 'y': 0.2, 'amplitude': 4, 'spikeIndex': 8},
                {'time': 20, 'channel': 2, 'x': 0.3, 'y': 0.4, 'amplitude': 5, 'spikeIndex': 9},
            ],
            [
                {'time': 30, 'channel': 1, 'x': 2.1, 'y': 2.2, 'features': [7, 8], 'spikeIndex': 3},
            ],
        ]

    def test_discovers_typed_scalar_and_two_dimensional_attributes(self):
        payload = extract_spike_attribute(self.results, [0, 1])
        definitions = {item['id']: item for item in payload['attributeDefinitions']}

        self.assertEqual(definitions['embedding']['shape'], 'two_dimensional')
        self.assertEqual(definitions['metadata:amplitude']['shape'], 'scalar')
        self.assertEqual(definitions['metadata:channel']['dimensions'][0]['unit'], 'channel_id')
        self.assertEqual(definitions['features']['provenance']['source'], 'retained_feature_vector')

    def test_scalar_payload_keeps_stable_identity_and_time_units(self):
        payload = extract_spike_attribute(
            self.results,
            [0],
            attribute_id='metadata:amplitude',
            sample_rate_hz=1000,
        )
        point = payload['series'][0]['points'][0]

        self.assertEqual(payload['selectedAttributeId'], 'metadata:amplitude')
        self.assertEqual(point['spikeId'], '0:8')
        self.assertEqual(point['timeSeconds'], 0.01)
        self.assertEqual(point['values']['value'], 4.0)

    def test_sampling_is_deterministic_and_preserves_original_point_index(self):
        results = [[{
            'time': index,
            'channel': 1,
            'amplitude': index,
            'spikeIndex': index + 100,
        } for index in range(40)]]
        first = extract_spike_attribute(
            results, [0], 'metadata:amplitude', max_spikes_per_cluster=10
        )
        second = extract_spike_attribute(
            results, [0], 'metadata:amplitude', max_spikes_per_cluster=10
        )

        self.assertEqual(first, second)
        self.assertEqual(first['series'][0]['returnedPoints'], 10)
        self.assertEqual(first['series'][0]['points'][-1]['pointIndex'], 39)


if __name__ == '__main__':
    unittest.main()
