const asFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => (
  cluster?.clusterId ?? cluster?.id ?? fallback
);

export const collectClusterEvents = ({
  spikes = [],
  clusterData = null,
  clusteringResults = null,
  selectedClusters = [],
}) => {
  const selected = new Set(selectedClusters.map(String));
  const include = (clusterId) => selected.size === 0 || selected.has(String(clusterId));
  const events = [];

  if (Array.isArray(clusterData?.clusters) && clusterData.clusters.length > 0) {
    clusterData.clusters.forEach((cluster, clusterIndex) => {
      const clusterId = clusterIdOf(cluster, clusterIndex);
      if (!include(clusterId)) return;
      const times = cluster.spikeTimes || cluster.spike_times || [];
      times.forEach((time, pointIndex) => {
        const numericTime = asFiniteNumber(time);
        if (numericTime === null) return;
        events.push({
          clusterId,
          time: numericTime,
          pointIndex,
          channel: cluster.spikeChannels?.[pointIndex] ?? cluster.channelId,
        });
      });
    });
    return events;
  }

  if (Array.isArray(clusteringResults?.fullData)) {
    clusteringResults.fullData.forEach((clusterSpikes, clusterIndex) => {
      const clusterId = clusterIdOf(clusteringResults.clusters?.[clusterIndex], clusterIndex);
      if (!include(clusterId)) return;
      (clusterSpikes || []).forEach((spike, pointIndex) => {
        const numericTime = asFiniteNumber(spike?.time);
        if (numericTime === null) return;
        events.push({
          clusterId,
          time: numericTime,
          pointIndex,
          channel: spike?.channel,
        });
      });
    });
    if (events.length > 0) return events;
  }

  (spikes || []).forEach((spike, pointIndex) => {
    const clusterId = spike?.clusterId;
    const numericTime = asFiniteNumber(spike?.time);
    if (clusterId === undefined || numericTime === null || !include(clusterId)) return;
    events.push({ ...spike, clusterId, time: numericTime, pointIndex: spike.pointIndex ?? pointIndex });
  });

  return events;
};

const groupTimes = (events, selectedClusters) => {
  const grouped = new Map(selectedClusters.map((clusterId) => [String(clusterId), []]));
  events.forEach((event) => {
    const key = String(event.clusterId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(Number(event.time));
  });
  grouped.forEach((times) => times.sort((left, right) => left - right));
  return grouped;
};

const createEdges = (start, end, binSize) => {
  const count = Math.max(1, Math.ceil((end - start) / binSize));
  return Array.from({ length: count + 1 }, (_, index) => start + index * binSize);
};

const histogram = (values, edges) => {
  const counts = new Array(Math.max(0, edges.length - 1)).fill(0);
  if (counts.length === 0) return counts;
  const start = edges[0];
  const binSize = edges[1] - edges[0];
  values.forEach((value) => {
    const index = Math.floor((value - start) / binSize);
    if (index >= 0 && index < counts.length) counts[index] += 1;
  });
  return counts;
};

export const buildLocalCorrelograms = ({
  events,
  clusterIds,
  sampleRateHz = 30000,
  binSizeMs = 1,
  windowSizeMs = 50,
}) => {
  const grouped = groupTimes(events, clusterIds);
  const actualHalfBins = Math.max(1, Math.ceil(windowSizeMs / binSizeMs));
  const actualWindow = actualHalfBins * binSizeMs;
  const edgesMs = createEdges(-actualWindow, actualWindow, binSizeMs);
  const centersMs = edgesMs.slice(0, -1).map((edge, index) => (edge + edgesMs[index + 1]) / 2);
  const pairs = [];
  const allTimes = events.map((event) => Number(event.time));
  const durationSamples = Math.max(1, Math.max(...allTimes, 0) - Math.min(...allTimes, 0) + 1);

  clusterIds.forEach((sourceId, row) => {
    const source = grouped.get(String(sourceId)) || [];
    clusterIds.forEach((targetId, column) => {
      const target = grouped.get(String(targetId)) || [];
      const differences = [];
      source.forEach((sourceTime) => {
        target.forEach((targetTime) => {
          const differenceMs = (targetTime - sourceTime) * 1000 / sampleRateHz;
          if (Math.abs(differenceMs) > actualWindow) return;
          if (String(sourceId) === String(targetId) && differenceMs === 0) return;
          differences.push(differenceMs);
        });
      });
      pairs.push({
        row,
        column,
        sourceClusterId: sourceId,
        targetClusterId: targetId,
        counts: histogram(differences, edgesMs),
        baselineCount: source.length * target.length * (binSizeMs * sampleRateHz / 1000) / durationSamples,
      });
    });
  });

  return {
    clusterIds,
    binEdgesMs: edgesMs,
    binCentersMs: centersMs,
    binSizeMs,
    windowSizeMs: actualWindow,
    sampleRateHz,
    sampledSpikeCounts: Object.fromEntries(clusterIds.map((clusterId) => [
      String(clusterId),
      (grouped.get(String(clusterId)) || []).length,
    ])),
    pairs,
  };
};

export const buildLocalIsiHistograms = ({
  events,
  clusterIds,
  sampleRateHz = 30000,
  binSizeMs = 0.5,
  windowSizeMs = 100,
  refractoryPeriodMs = 2,
}) => {
  const grouped = groupTimes(events, clusterIds);
  const edgesMs = createEdges(0, windowSizeMs, binSizeMs);
  const centersMs = edgesMs.slice(0, -1).map((edge, index) => (edge + edgesMs[index + 1]) / 2);
  const series = clusterIds.map((clusterId) => {
    const times = grouped.get(String(clusterId)) || [];
    const intervals = times.slice(1).map((time, index) => (time - times[index]) * 1000 / sampleRateHz);
    const visible = intervals.filter((interval) => interval <= edgesMs[edgesMs.length - 1]);
    const violationCount = intervals.filter((interval) => interval < refractoryPeriodMs).length;
    return {
      clusterId,
      counts: histogram(visible, edgesMs),
      totalIntervals: intervals.length,
      visibleIntervals: visible.length,
      violationCount,
      violationRate: intervals.length ? violationCount / intervals.length : 0,
    };
  });

  return {
    clusterIds,
    binEdgesMs: edgesMs,
    binCentersMs: centersMs,
    binSizeMs,
    windowSizeMs: edgesMs[edgesMs.length - 1],
    refractoryPeriodMs,
    sampleRateHz,
    series,
  };
};

const waveformAmplitude = (waveform) => {
  const values = waveform?.amplitude;
  if (!Array.isArray(values) || values.length === 0) return null;
  const finite = values.map(asFiniteNumber).filter((value) => value !== null);
  if (finite.length === 0) return null;
  return Math.max(...finite) - Math.min(...finite);
};

export const buildLocalAmplitudeSeries = ({
  clusterWaveforms = {},
  events = [],
  clusterIds = [],
  sampleRateHz = 30000,
}) => {
  const grouped = groupTimes(events, clusterIds);
  const series = clusterIds.map((clusterId) => {
    const waveforms = clusterWaveforms[clusterId] || clusterWaveforms[String(clusterId)] || [];
    const times = grouped.get(String(clusterId)) || [];
    const points = waveforms.map((waveform, index) => {
      const amplitude = waveformAmplitude(waveform);
      if (amplitude === null) return null;
      const timeSamples = asFiniteNumber(waveform.time) ?? times[index] ?? index;
      return {
        spikeId: `${clusterId}:${index}`,
        spikeIndex: index,
        pointIndex: index,
        timeSamples,
        timeSeconds: timeSamples / sampleRateHz,
        channel: waveform.channel ?? null,
        amplitude,
      };
    }).filter(Boolean);
    const amplitudes = points.map((point) => point.amplitude);
    const sorted = [...amplitudes].sort((left, right) => left - right);
    return {
      clusterId,
      points,
      summary: {
        count: points.length,
        meanAmplitude: amplitudes.length
          ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length
          : null,
        medianAmplitude: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        minAmplitude: sorted[0] ?? null,
        maxAmplitude: sorted[sorted.length - 1] ?? null,
      },
    };
  });

  return { clusterIds, sampleRateHz, amplitudeUnit: 'normalized demo', series };
};
