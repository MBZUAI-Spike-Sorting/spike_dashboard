const asFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;

const fallbackPosition = (index) => {
  const xPattern = [0, 32, 16, 48];
  return { x: xPattern[index % xPattern.length], y: Math.floor(index / xPattern.length) * 20 };
};

export const buildFallbackProbeGeometry = ({
  totalChannels = 0,
  clusterData = null,
  clusterIds = [],
}) => {
  const channelCount = Math.max(0, Math.floor(Number(totalChannels) || 0));
  const selected = new Set(clusterIds.map(String));
  const clusterFootprints = (clusterData?.clusters || []).map((cluster, index) => {
    const clusterId = clusterIdOf(cluster, index);
    if (selected.size && !selected.has(String(clusterId))) return null;
    const counts = new Map();
    (cluster?.spikeChannels || []).forEach((rawChannel) => {
      const channelId = asFiniteNumber(rawChannel);
      if (channelId === null || channelId < 1 || channelId > channelCount) return;
      counts.set(channelId, (counts.get(channelId) || 0) + 1);
    });
    const maximum = Math.max(...counts.values(), 1);
    const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    return {
      clusterId,
      peakChannel: ranked[0]?.[0] ?? cluster?.channelId ?? null,
      channels: [...counts.entries()].sort((left, right) => left[0] - right[0]).map(
        ([channelId, spikeCount]) => ({ channelId, spikeCount, weight: spikeCount / maximum })
      ),
    };
  }).filter(Boolean);

  return {
    source: 'fallback_grid',
    channelConvention: 'one_based',
    channelCount,
    channels: Array.from({ length: channelCount }, (_, index) => ({
      channelId: index + 1,
      channelIndex: index,
      ...fallbackPosition(index),
      shank: 0,
      connected: true,
    })),
    clusterFootprints,
  };
};

const robustNormalize = (values) => {
  if (!values.length) return values;
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((value) => Math.abs(value - median)).sort((left, right) => left - right);
  const mad = deviations[Math.floor(deviations.length / 2)] * 1.4826;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const scale = mad > 0 ? mad : Math.sqrt(variance) || 1;
  return values.map((value) => (value - median) / scale);
};

export const chooseHeatmapChannels = (totalChannels, maximum = 128) => {
  const count = Math.max(0, Math.floor(Number(totalChannels) || 0));
  const limit = Math.max(1, Math.floor(Number(maximum) || 1));
  if (count <= limit) return Array.from({ length: count }, (_, index) => index + 1);
  if (limit === 1) return [1];
  const step = (count - 1) / (limit - 1);
  return Array.from({ length: limit }, (_, index) => Math.round(index * step) + 1);
};

export const buildLocalTraceHeatmap = ({
  channelSeries = {},
  channelIds = [],
  startSample = 0,
  endSample = null,
  maxTimeBins = 1000,
  normalization = 'robust_zscore',
  sampleRateHz = 30000,
}) => {
  const seriesLength = Math.max(
    ...channelIds.map((channelId) => channelSeries[channelId]?.length || 0),
    0
  );
  const start = Math.max(0, Math.floor(Number(startSample) || 0));
  const end = Math.max(start + 1, Math.min(
    Number.isFinite(Number(endSample)) ? Math.floor(Number(endSample)) : seriesLength,
    seriesLength
  ));
  const span = Math.max(1, end - start);
  const binCount = Math.min(span, Math.max(10, Math.floor(Number(maxTimeBins) || 1000)));
  const edges = Array.from({ length: binCount + 1 }, (_, index) => (
    Math.round(start + (span * index) / binCount)
  ));
  edges[0] = start;
  edges[edges.length - 1] = end;
  const values = channelIds.map((channelId) => {
    const source = channelSeries[channelId] || [];
    const row = Array.from({ length: binCount }, (_, binIndex) => {
      const left = edges[binIndex];
      const right = Math.max(left + 1, edges[binIndex + 1]);
      let peak = 0;
      for (let index = left; index < right; index += 1) {
        const value = asFiniteNumber(source[index]) || 0;
        if (Math.abs(value) > Math.abs(peak)) peak = value;
      }
      return peak;
    });
    return normalization === 'robust_zscore' ? robustNormalize(row) : row;
  });
  const centers = edges.slice(0, -1).map((edge, index) => (edge + edges[index + 1]) / 2);
  const safeSampleRate = Math.max(Number(sampleRateHz) || 0, 1);

  return {
    channelIds,
    timeBinEdgesSamples: edges,
    timeBinCentersSamples: centers,
    timeBinCentersSeconds: centers.map((center) => center / safeSampleRate),
    values,
    startSample: start,
    endSample: end,
    sampleRateHz: safeSampleRate,
    normalization,
    valueUnit: normalization === 'robust_zscore' ? 'robust_zscore' : 'raw',
    downsampleFactor: span / binCount,
  };
};
