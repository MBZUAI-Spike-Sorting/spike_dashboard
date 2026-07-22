import {
  filterActiveClusters,
  getClusterSpikeCount,
  normalizeMinimumSpikeCount
} from './clusterActivity';

test('normalizes minimum spike thresholds to non-negative whole spikes', () => {
  expect(normalizeMinimumSpikeCount('25')).toBe(25);
  expect(normalizeMinimumSpikeCount(2.2)).toBe(3);
  expect(normalizeMinimumSpikeCount(-5)).toBe(0);
  expect(normalizeMinimumSpikeCount('')).toBe(0);
});

test('reads spike counts from normalized and raw cluster shapes', () => {
  expect(getClusterSpikeCount({ spikeCount: 12 })).toBe(12);
  expect(getClusterSpikeCount({ num_spikes: 8 })).toBe(8);
  expect(getClusterSpikeCount({ spike_times: [1, 2, 3] })).toBe(3);
  expect(getClusterSpikeCount({})).toBe(0);
});

test('filters clusters with fewer spikes than the requested minimum', () => {
  const clusters = [
    { id: 'inactive', spikeCount: 4 },
    { id: 'boundary', spikeCount: 5 },
    { id: 'active', spikeTimes: [1, 2, 3, 4, 5, 6] }
  ];

  expect(filterActiveClusters(clusters, 5).map((cluster) => cluster.id)).toEqual([
    'boundary',
    'active'
  ]);
});
