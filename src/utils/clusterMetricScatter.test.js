import {
  buildClusterMetricPoints,
  scaleMetricSizes,
} from './clusterMetricScatter';

test('preserves visible order and combines statistics with cluster fallbacks', () => {
  const points = buildClusterMetricPoints({
    clusterIds: [8, 2],
    clusters: [{ id: 2, size: 50 }, { id: 8, size: 80 }],
    clusterStats: {
      2: { numSpikes: 55, peakChannel: 4 },
      8: { firingRateHz: 3.5, peakChannel: 9 },
    },
    clusterAnnotations: { 8: { group: 'good' } },
  });

  expect(points.map((point) => point.clusterId)).toEqual([8, 2]);
  expect(points[0]).toMatchObject({ group: 'good', values: { numSpikes: 80, firingRateHz: 3.5 } });
  expect(points[1]).toMatchObject({ values: { numSpikes: 55, peakChannel: 4 } });
});

test('scales a metric into bounded marker sizes', () => {
  expect(scaleMetricSizes([0, 5, 10], 10, 20)).toEqual([10, 15, 20]);
  expect(scaleMetricSizes([null, null], 8, 30)).toEqual([8, 8]);
});
