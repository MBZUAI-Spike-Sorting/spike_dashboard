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

const meanSignature = (waveforms = []) => {
  const values = waveforms.map((waveform) => (
    Array.isArray(waveform) ? waveform : waveform?.amplitude
  )).filter((waveform) => Array.isArray(waveform) && waveform.length > 1);
  if (!values.length) return null;
  const length = Math.min(...values.map((waveform) => waveform.length));
  const signature = Array.from({ length }, (_, index) => (
    values.reduce((sum, waveform) => sum + (asFiniteNumber(waveform[index]) || 0), 0)
    / values.length
  ));
  const mean = signature.reduce((sum, value) => sum + value, 0) / signature.length;
  const centered = signature.map((value) => value - mean);
  const norm = Math.sqrt(centered.reduce((sum, value) => sum + value * value, 0));
  return norm > 0 ? centered.map((value) => value / norm) : null;
};

const featureCentroid = (cluster) => {
  const points = (cluster?.points || []).map((point) => {
    const x = asFiniteNumber(Array.isArray(point) ? point[0] : point?.x);
    const y = asFiniteNumber(Array.isArray(point) ? point[1] : point?.y);
    return x === null || y === null ? null : [x, y];
  }).filter(Boolean);
  if (!points.length) return null;
  return [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
  ];
};

const peakChannel = (cluster) => {
  const counts = new Map();
  (cluster?.spikeChannels || []).forEach((channel) => {
    const numeric = asFiniteNumber(channel);
    if (numeric === null) return;
    counts.set(numeric, (counts.get(numeric) || 0) + 1);
  });
  if (!counts.size) return asFiniteNumber(cluster?.channelId ?? cluster?.peakChannel);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
};

const cosineSimilarity01 = (left, right) => {
  if (!left || !right) return null;
  const length = Math.min(left.length, right.length);
  if (!length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm <= 0 || rightNorm <= 0) return null;
  return Math.max(0, Math.min(1, (dot / Math.sqrt(leftNorm * rightNorm) + 1) / 2));
};

export const buildLocalClusterSimilarities = ({
  clusterData = null,
  clusterWaveforms = {},
  primaryClusterId,
  candidateClusterIds = [],
  maxCandidates = 20,
}) => {
  const clusters = clusterData?.clusters || [];
  const clusterLookup = new Map(clusters.map((cluster, index) => [
    String(clusterIdOf(cluster, index)),
    cluster,
  ]));
  const primary = clusterLookup.get(String(primaryClusterId));
  if (!primary) {
    return { primaryClusterId: null, source: 'unavailable', candidates: [] };
  }
  const ids = candidateClusterIds.length
    ? candidateClusterIds
    : clusters.map((cluster, index) => clusterIdOf(cluster, index));
  const primarySignature = meanSignature(
    clusterWaveforms[primaryClusterId] || clusterWaveforms[String(primaryClusterId)] || []
  );
  const primaryCentroid = featureCentroid(primary);
  const primaryChannel = peakChannel(primary);
  const usedSources = new Set();

  const candidates = ids.filter((clusterId) => String(clusterId) !== String(primaryClusterId))
    .map((clusterId) => {
      const cluster = clusterLookup.get(String(clusterId));
      if (!cluster) return null;
      const signature = meanSignature(
        clusterWaveforms[clusterId] || clusterWaveforms[String(clusterId)] || []
      );
      const waveformSimilarity = cosineSimilarity01(primarySignature, signature);
      const centroid = featureCentroid(cluster);
      const featureDistance = centroid && primaryCentroid
        ? Math.hypot(centroid[0] - primaryCentroid[0], centroid[1] - primaryCentroid[1])
        : null;
      const featureSimilarity = featureDistance === null ? null : 1 / (1 + featureDistance);
      const candidateChannel = peakChannel(cluster);
      const channelDistance = primaryChannel === null || candidateChannel === null
        ? null
        : Math.abs(candidateChannel - primaryChannel);
      const channelSimilarity = channelDistance === null ? 0 : Math.exp(-channelDistance / 4);
      let similarity;
      let source;
      if (waveformSimilarity !== null) {
        similarity = 0.85 * waveformSimilarity + 0.15 * channelSimilarity;
        source = 'mean_waveform_channel';
      } else if (featureSimilarity !== null) {
        similarity = 0.8 * featureSimilarity + 0.2 * channelSimilarity;
        source = 'feature_centroid_channel';
      } else {
        similarity = channelSimilarity;
        source = 'channel_distance';
      }
      usedSources.add(source);
      return {
        clusterId,
        similarity,
        source,
        sorterSimilarity: null,
        waveformSimilarity,
        featureSimilarity,
        channelSimilarity,
        channelDistance,
        peakChannel: candidateChannel,
        numSpikes: cluster.pointCount ?? cluster.spikeTimes?.length ?? cluster.points?.length ?? 0,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.similarity - left.similarity || Number(left.clusterId) - Number(right.clusterId))
    .slice(0, Math.max(1, maxCandidates));

  return {
    primaryClusterId,
    primaryPeakChannel: primaryChannel,
    source: usedSources.size === 1 ? [...usedSources][0] : 'mixed_fallback',
    maxCandidates,
    candidates,
  };
};

export const buildLocalFiringRates = ({
  events,
  clusterIds,
  sampleRateHz = 30000,
  binSizeSeconds = 1,
  recordingDurationSamples = null,
  maxBins = 5000,
}) => {
  const safeSampleRate = Math.max(Number(sampleRateHz) || 0, 1);
  const requestedBinSizeSeconds = Math.max(
    Number(binSizeSeconds) || 0,
    1 / safeSampleRate
  );
  const boundedMaxBins = Math.min(Math.max(Math.floor(Number(maxBins) || 1), 1), 20000);
  const grouped = groupTimes(events, clusterIds);
  let latestSpikeSample = 0;

  grouped.forEach((times) => {
    times.forEach((time) => {
      if (Number.isFinite(time) && time >= 0) latestSpikeSample = Math.max(latestSpikeSample, time);
    });
  });

  const requestedDuration = Number(recordingDurationSamples);
  const durationSamples = Math.max(
    Number.isFinite(requestedDuration) ? requestedDuration : 0,
    latestSpikeSample + 1,
    1
  );
  const requestedBinSamples = Math.max(requestedBinSizeSeconds * safeSampleRate, 1);
  const requestedBinCount = Math.max(1, Math.ceil(durationSamples / requestedBinSamples));
  const binCount = Math.min(requestedBinCount, boundedMaxBins);
  const effectiveBinSamples = requestedBinCount > boundedMaxBins
    ? durationSamples / binCount
    : requestedBinSamples;
  const binEdgesSamples = Array.from(
    { length: binCount + 1 },
    (_, index) => index * effectiveBinSamples
  );
  binEdgesSamples[binEdgesSamples.length - 1] = durationSamples;
  const binWidthsSeconds = binEdgesSamples.slice(0, -1).map(
    (edge, index) => (binEdgesSamples[index + 1] - edge) / safeSampleRate
  );
  const binCentersSeconds = binEdgesSamples.slice(0, -1).map(
    (edge, index) => (edge + binEdgesSamples[index + 1]) / (2 * safeSampleRate)
  );

  const series = clusterIds.map((clusterId) => {
    const counts = new Array(binCount).fill(0);
    const times = (grouped.get(String(clusterId)) || []).filter(
      (time) => Number.isFinite(time) && time >= 0 && time <= durationSamples
    );
    times.forEach((time) => {
      const index = Math.min(binCount - 1, Math.floor(time / effectiveBinSamples));
      if (index >= 0) counts[index] += 1;
    });
    const rateHz = counts.map((count, index) => (
      binWidthsSeconds[index] > 0 ? count / binWidthsSeconds[index] : 0
    ));
    return {
      clusterId,
      counts,
      rateHz,
      totalSpikes: times.length,
      meanRateHz: times.length / (durationSamples / safeSampleRate),
      maxRateHz: rateHz.length ? Math.max(...rateHz) : 0,
    };
  });

  return {
    clusterIds,
    binEdgesSamples,
    binCentersSeconds,
    binWidthsSeconds,
    requestedBinSizeSeconds,
    binSizeSeconds: effectiveBinSamples / safeSampleRate,
    binSizeAdjusted: requestedBinCount > boundedMaxBins,
    recordingDurationSamples: durationSamples,
    recordingDurationSeconds: durationSamples / safeSampleRate,
    sampleRateHz: safeSampleRate,
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
