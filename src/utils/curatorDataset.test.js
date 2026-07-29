import {
  createDashboardDataFromCuratorDataset,
  createWaveformPcaClusterData,
  normalizeCuratorClusterId,
  normalizeCuratorDatasetTimes,
  reconcileCuratorClusterSelection,
} from './curatorDataset';

describe('curator dataset dashboard wiring', () => {
  test('does not select every cluster when a curator dataset is loaded', () => {
    expect(reconcileCuratorClusterSelection([], [1, 2, 3])).toEqual([]);
    expect(reconcileCuratorClusterSelection([2, 9], [1, 2, 3])).toEqual([2]);
  });

  test('preserves arbitrary numeric cluster IDs', () => {
    expect(normalizeCuratorClusterId('12', 0)).toBe(12);
    expect(normalizeCuratorClusterId(19, 0)).toBe(19);
    expect(normalizeCuratorClusterId('unit-a', 0)).toBe('unit-a');
  });

  test('creates the shared cluster list from every uploaded cluster', () => {
    const result = createDashboardDataFromCuratorDataset({
      name: 'Kilosort4',
      clusters: [
        {
          id: 2,
          primaryChannel: 179,
          spikeTimes: [100, 200],
          spikeCount: 2,
          metadata: {},
        },
        {
          id: 12,
          primaryChannel: 181,
          spikeTimes: [300, 400, 500],
          spikeCount: 3,
          metadata: { depth: 42 },
        },
      ],
    });

    expect(result.clusters).toEqual([
      { id: 2, size: 2, peakChannel: 179, depth: null },
      { id: 12, size: 3, peakChannel: 181, depth: 42 },
    ]);
    expect(result.clusterData.clusterIds).toEqual([2, 12]);
    expect(result.clusterData.clusters[1].spikeTimes).toEqual([300, 400, 500]);
    expect(result.clusterStats['12']).toMatchObject({
      numSpikes: 3,
      peakChannel: 181,
      depth: 42,
    });
  });

  test('creates PCA points from waveforms for uploaded cluster IDs', () => {
    const { clusterData } = createDashboardDataFromCuratorDataset({
      clusters: [
        { id: 2, spikeTimes: [100], spikeCount: 1 },
        { id: 12, spikeTimes: [200], spikeCount: 1 },
      ],
    });
    const result = createWaveformPcaClusterData(clusterData, {
      2: [{ amplitude: [0, 1, 0], time: 100, channel: 4 }],
      12: [{ amplitude: [1, 0, -1], time: 200, channel: 7 }],
    });

    expect(result.source).toBe('curator-waveform-pca');
    expect(result.clusters[0].points).toHaveLength(1);
    expect(result.clusters[1].points).toHaveLength(1);
    expect(result.clusters[1].clusterId).toBe(12);
    expect(result.clusters[1].points[0].every(Number.isFinite)).toBe(true);
    expect(
      result.clusters
        .flatMap((cluster) => cluster.points)
        .some((point) => point.some((value) => Math.abs(value) > Number.EPSILON))
    ).toBe(true);
  });

  test('preserves PCA points and embedded waveforms from a curator file', () => {
    const result = createDashboardDataFromCuratorDataset({
      clusters: [{
        id: 12,
        spikeTimes: [100, 200],
        spikeCount: 2,
        spikeChannels: [4, 5],
        points: [[-1, 2], [3, 4]],
        waveforms: [
          { timePoints: [0, 1], amplitude: [-2, 3] },
          { timePoints: [0, 1], amplitude: [-1, 4] },
        ],
      }],
    });

    expect(result.clusterData.clusters[0].points).toEqual([[-1, 2], [3, 4]]);
    expect(result.clusterData.clusters[0].spikeChannels).toEqual([4, 5]);
    expect(result.clusterWaveforms['12']).toHaveLength(2);
  });

  test('does not present constant waveforms as a fake PCA point at zero', () => {
    const { clusterData } = createDashboardDataFromCuratorDataset({
      clusters: [
        { id: 58, spikeTimes: [100], spikeCount: 1 },
        { id: 60, spikeTimes: [200], spikeCount: 1 },
      ],
    });
    const result = createWaveformPcaClusterData(clusterData, {
      58: [{ amplitude: [-81, -81, -81], time: 100, channel: 1 }],
      60: [{ amplitude: [-81, -81, -81], time: 200, channel: 1 }],
    });

    expect(result).toBe(clusterData);
    expect(result.clusters.every((cluster) => cluster.points.length === 0)).toBe(true);
  });

  test('converts declared seconds to recording sample indices', () => {
    const result = normalizeCuratorDatasetTimes({
      metadata: { units: { time: 'seconds' } },
      clusters: [{ id: 12, spikeTimes: [0.5, 1.25] }],
    }, {
      sampleRateHz: 30000,
      totalDataPoints: 300000,
    });

    expect(result.clusters[0].spikeTimes).toEqual([15000, 37500]);
    expect(result.metadata.timeUnit).toBe('samples');
  });

  test('detects fractional second timestamps from the recording duration', () => {
    const result = normalizeCuratorDatasetTimes({
      clusters: [{ id: 12, spikeTimes: [0.25, 2.5, 9.75] }],
    }, {
      sampleRateHz: 30000,
      totalDataPoints: 300000,
    });

    expect(result.clusters[0].spikeTimes).toEqual([7500, 75000, 292500]);
    expect(result.metadata.originalTimeUnit).toBe('seconds');
  });

  test('leaves sample-index timestamps unchanged', () => {
    const dataset = {
      clusters: [{ id: 12, spikeTimes: [7500, 75000, 292500] }],
    };

    expect(normalizeCuratorDatasetTimes(dataset, {
      sampleRateHz: 30000,
      totalDataPoints: 300000,
    })).toBe(dataset);
  });

  test('converts an explicitly selected millisecond unit to samples', () => {
    const result = normalizeCuratorDatasetTimes({
      metadata: { timeUnit: 'milliseconds' },
      clusters: [{ id: 12, spikeTimes: [0.5, 10] }],
    }, {
      sampleRateHz: 30000,
      totalDataPoints: 300000,
    });

    expect(result.clusters[0].spikeTimes).toEqual([15, 300]);
  });

  test('auto-detects units without spreading a large timestamp array', () => {
    const spikeTimes = Array.from({ length: 150000 }, (_, index) => index / 15000);
    const result = normalizeCuratorDatasetTimes({
      clusters: [{ id: 12, spikeTimes }],
    }, {
      sampleRateHz: 30000,
      totalDataPoints: 300000,
    });

    expect(result.clusters[0].spikeTimes[1]).toBe(2);
    expect(result.clusters[0].spikeTimes).toHaveLength(spikeTimes.length);
  });
});
