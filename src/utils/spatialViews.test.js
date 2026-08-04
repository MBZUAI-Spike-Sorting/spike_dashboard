import {
  buildFallbackProbeGeometry,
  buildLocalTraceHeatmap,
  chooseHeatmapChannels,
} from './spatialViews';

test('fallback probe geometry is one-based and carries cluster footprints', () => {
  const result = buildFallbackProbeGeometry({
    totalChannels: 5,
    clusterIds: [7],
    clusterData: {
      clusters: [{ clusterId: 7, spikeChannels: [2, 2, 3] }],
    },
  });

  expect(result.channels.map((channel) => channel.channelId)).toEqual([1, 2, 3, 4, 5]);
  expect(result.channels[4]).toMatchObject({ x: 0, y: 20 });
  expect(result.clusterFootprints[0]).toMatchObject({ clusterId: 7, peakChannel: 2 });
});

test('trace heatmap preserves the signed peak in each time bin', () => {
  const first = new Array(100).fill(0);
  const second = new Array(100).fill(0);
  first[10] = -12;
  second[50] = 8;
  const result = buildLocalTraceHeatmap({
    channelSeries: { 1: first, 2: second },
    channelIds: [1, 2],
    startSample: 0,
    endSample: 100,
    maxTimeBins: 10,
    normalization: 'raw',
    sampleRateHz: 1000,
  });

  expect(result.values).toHaveLength(2);
  expect(Math.min(...result.values[0])).toBe(-12);
  expect(Math.max(...result.values[1])).toBe(8);
  expect(result.timeBinCentersSeconds.at(-1)).toBe(0.095);
});

test('heatmap channel sampling includes first and last channel', () => {
  const channels = chooseHeatmapChannels(385, 8);
  expect(channels).toHaveLength(8);
  expect(channels[0]).toBe(1);
  expect(channels.at(-1)).toBe(385);
});
