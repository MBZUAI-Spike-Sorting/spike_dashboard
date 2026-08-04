export const CLUSTER_METRICS = Object.freeze({
  clusterId: { id: 'clusterId', label: 'Cluster ID' },
  numSpikes: { id: 'numSpikes', label: 'Spike count' },
  peakChannel: { id: 'peakChannel', label: 'Peak channel' },
  firingRateHz: { id: 'firingRateHz', label: 'Firing rate (Hz)' },
  isiViolationRate: { id: 'isiViolationRate', label: 'ISI violation rate' },
  meanAmplitude: { id: 'meanAmplitude', label: 'Mean amplitude' },
  depth: { id: 'depth', label: 'Depth' },
});

const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;

export const buildClusterMetricPoints = ({
  clusterIds = [],
  clusters = [],
  clusterStats = {},
  clusterAnnotations = {},
} = {}) => clusterIds.map((clusterId) => {
  const cluster = clusters.find((candidate, index) => (
    String(clusterIdOf(candidate, index)) === String(clusterId)
  )) || {};
  const stats = clusterStats[clusterId] || clusterStats[String(clusterId)] || {};
  return {
    clusterId,
    group: clusterAnnotations[clusterId]?.group
      ?? clusterAnnotations[String(clusterId)]?.group
      ?? 'unsorted',
    values: {
      clusterId: finiteNumber(clusterId),
      numSpikes: finiteNumber(stats.numSpikes ?? stats.count ?? cluster.size ?? cluster.pointCount),
      peakChannel: finiteNumber(stats.peakChannel ?? cluster.primaryChannel ?? cluster.channelId),
      firingRateHz: finiteNumber(stats.firingRateHz),
      isiViolationRate: finiteNumber(stats.isiViolationRate),
      meanAmplitude: finiteNumber(stats.meanAmplitude),
      depth: finiteNumber(stats.depth),
    },
  };
});

export const scaleMetricSizes = (values, minimum = 8, maximum = 30) => {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return values.map(() => minimum);
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  if (high === low) return values.map(() => (minimum + maximum) / 2);
  return values.map((value) => Number.isFinite(value)
    ? minimum + (maximum - minimum) * (value - low) / (high - low)
    : minimum);
};
