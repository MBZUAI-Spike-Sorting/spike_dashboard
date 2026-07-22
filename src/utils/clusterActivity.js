export const normalizeMinimumSpikeCount = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.ceil(numericValue));
};

export const getClusterSpikeCount = (cluster) => {
  const explicitCount = Number(
    cluster?.spikeCount ??
    cluster?.numSpikes ??
    cluster?.num_spikes ??
    cluster?.spike_count
  );
  if (Number.isFinite(explicitCount)) return Math.max(0, explicitCount);

  const spikeTimes = cluster?.spikeTimes ?? cluster?.spike_times ?? cluster?.times;
  return Array.isArray(spikeTimes) ? spikeTimes.length : 0;
};

export const filterActiveClusters = (clusters = [], minimumSpikeCount = 0) => {
  const minimum = normalizeMinimumSpikeCount(minimumSpikeCount);
  return clusters.filter((cluster) => getClusterSpikeCount(cluster) >= minimum);
};
