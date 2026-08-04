import {
  buildLocalFeaturePayload,
  getFeatureSelectionFromPlotEvent,
} from './featureViews';

const clusteringResults = {
  available: true,
  clusters: [{ clusterId: 10 }, { clusterId: 12 }, { clusterId: 14 }],
  fullData: [
    [
      { time: 100, channel: 1, x: 0, y: 0.1, spikeIndex: 20 },
      { time: 200, channel: 2, x: 0.2, y: 0.3, spikeIndex: 21 },
    ],
    [
      { time: 300, channel: 1, x: 2, y: 2.1, spikeIndex: 30 },
      { time: 400, channel: 1, x: 2.2, y: 2.3, spikeIndex: 31 },
    ],
    [{ time: 500, channel: 1, x: 8, y: 8, spikeIndex: 40 }],
  ],
};

test('keeps stable spike identity and includes unselected background clusters', () => {
  const payload = buildLocalFeaturePayload({
    clusteringResults,
    clusterIds: [10],
    sampleRateHz: 1000,
  });

  expect(payload.series[0].points[0]).toMatchObject({
    spikeId: '10:20', pointIndex: 0, spikeIndex: 20, timeSamples: 100,
  });
  expect(payload.series[0].points[0].values.timeSeconds).toBe(0.1);
  expect(payload.backgroundPoints).toHaveLength(3);
});

test('builds a deterministic pair-separation feature from retained PCA coordinates', () => {
  const payload = buildLocalFeaturePayload({
    clusteringResults,
    clusterIds: [10, 12],
    includeBackground: false,
  });
  const first = payload.series[0].points.map((point) => point.values.pairProjection);
  const second = payload.series[1].points.map((point) => point.values.pairProjection);

  expect(payload.pairFeatureSource).toBe('pca_centroid_axis');
  expect(Math.max(...first)).toBeLessThan(Math.min(...second));
});

test('filters channels without changing original point indices', () => {
  const payload = buildLocalFeaturePayload({
    clusteringResults,
    clusterIds: [10],
    selectedChannels: [2],
    includeBackground: false,
  });

  expect(payload.series[0].points).toHaveLength(1);
  expect(payload.series[0].points[0]).toMatchObject({ pointIndex: 1, spikeId: '10:21' });
});

test('publishes exact deduplicated spike identities from a plot selection', () => {
  const first = { spikeId: '10:20', clusterId: 10, pointIndex: 0, spikeIndex: 20 };
  const second = { spikeId: '12:30', clusterId: 12, pointIndex: 0, spikeIndex: 30 };

  expect(getFeatureSelectionFromPlotEvent({ points: [
    { customdata: first },
    { customdata: second },
    { customdata: first },
    { customdata: null },
  ] })).toEqual([first, second]);
});
