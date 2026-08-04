import {
  buildLocalAmplitudeSeries,
  buildLocalCorrelograms,
  buildLocalFiringRates,
  buildLocalIsiHistograms,
  collectClusterEvents,
} from './clusterDiagnostics';

const clusterData = {
  clusters: [
    { clusterId: 0, spikeTimes: [0, 30, 90], spikeChannels: [1, 1, 2] },
    { clusterId: 1, spikeTimes: [15, 45], spikeChannels: [2, 2] },
  ],
};

test('collectClusterEvents keeps stable point indices and selected clusters', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [1] });
  expect(events).toEqual([
    { clusterId: 1, time: 15, pointIndex: 0, channel: 2 },
    { clusterId: 1, time: 45, pointIndex: 1, channel: 2 },
  ]);
});

test('local correlograms build a complete pair matrix without autocorrelation self-events', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [0, 1] });
  const result = buildLocalCorrelograms({
    events,
    clusterIds: [0, 1],
    sampleRateHz: 1000,
    binSizeMs: 10,
    windowSizeMs: 100,
  });
  const auto = result.pairs.find((pair) => pair.sourceClusterId === 0 && pair.targetClusterId === 0);
  expect(result.pairs).toHaveLength(4);
  expect(auto.counts.reduce((sum, count) => sum + count, 0)).toBe(6);
});

test('local ISI histograms report refractory violations', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [0] });
  const result = buildLocalIsiHistograms({
    events,
    clusterIds: [0],
    sampleRateHz: 1000,
    binSizeMs: 10,
    windowSizeMs: 100,
    refractoryPeriodMs: 40,
  });
  expect(result.series[0].totalIntervals).toBe(2);
  expect(result.series[0].violationCount).toBe(1);
});

test('local firing rates preserve counts and normalize a short final bin', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [0, 1] });
  const result = buildLocalFiringRates({
    events,
    clusterIds: [0, 1],
    sampleRateHz: 1000,
    binSizeSeconds: 0.05,
    recordingDurationSamples: 120,
  });

  expect(result.binEdgesSamples).toEqual([0, 50, 100, 120]);
  expect(result.series[0].counts).toEqual([2, 1, 0]);
  expect(result.series[0].rateHz).toEqual([40, 20, 0]);
  expect(result.series[1].counts).toEqual([2, 0, 0]);
  expect(result.series[0].meanRateHz).toBe(25);
});

test('local firing-rate timelines cap the number of bins', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [0] });
  const result = buildLocalFiringRates({
    events,
    clusterIds: [0],
    sampleRateHz: 1000,
    binSizeSeconds: 0.001,
    recordingDurationSamples: 10000,
    maxBins: 25,
  });

  expect(result.binSizeAdjusted).toBe(true);
  expect(result.binCentersSeconds).toHaveLength(25);
  expect(result.binSizeSeconds).toBeCloseTo(0.4);
});

test('local amplitude series preserves spike identity and time', () => {
  const events = collectClusterEvents({ clusterData, selectedClusters: [0] });
  const result = buildLocalAmplitudeSeries({
    events,
    clusterIds: [0],
    sampleRateHz: 1000,
    clusterWaveforms: {
      0: [{ amplitude: [-2, 0, 3], time: 30, channel: 1 }],
    },
  });
  expect(result.series[0].points[0]).toMatchObject({
    spikeId: '0:0',
    pointIndex: 0,
    timeSamples: 30,
    timeSeconds: 0.03,
    amplitude: 5,
  });
});
