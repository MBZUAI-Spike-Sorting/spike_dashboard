const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;

const dimensionMetadata = (id) => {
  const definitions = {
    timeSeconds: ['Recording time', 's', 'spike_time'],
    pc1: ['PC 1', null, 'retained_embedding'],
    pc2: ['PC 2', null, 'retained_embedding'],
    channel: ['Channel', 'channel_id', 'spike_assignment'],
    amplitude: ['Amplitude', null, 'sorter_or_spike_metadata'],
    pairProjection: ['Pair separation', null, 'pair_projection'],
  };
  const [label, unit, source] = definitions[id] || [
    id.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
    null,
    'spike_metadata',
  ];
  return { id, label, unit, source };
};

const valuesFromSpike = (spike, sampleRateHz) => {
  const values = {};
  const timeSamples = finiteNumber(spike?.time ?? spike?.timeSamples);
  const pc1 = finiteNumber(spike?.x ?? spike?.pc1);
  const pc2 = finiteNumber(spike?.y ?? spike?.pc2);
  const channel = finiteNumber(spike?.channel);
  const amplitude = finiteNumber(
    spike?.amplitude ?? spike?.amp ?? spike?.peakAmplitude ?? spike?.spikeAmplitude
  );
  if (timeSamples !== null) values.timeSeconds = timeSamples / sampleRateHz;
  if (pc1 !== null) values.pc1 = pc1;
  if (pc2 !== null) values.pc2 = pc2;
  if (channel !== null) values.channel = Math.round(channel);
  if (amplitude !== null) values.amplitude = amplitude;

  const featureValues = spike?.features;
  if (Array.isArray(featureValues)) {
    featureValues.forEach((value, index) => {
      const number = finiteNumber(value);
      if (number !== null) values[`feature${index + 1}`] = number;
    });
  } else if (featureValues && typeof featureValues === 'object') {
    Object.entries(featureValues).forEach(([key, value]) => {
      const number = finiteNumber(value);
      const safeKey = String(key).replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
      if (number !== null) values[`feature_${safeKey}`] = number;
    });
  }

  const templateFeatures = spike?.template_features ?? spike?.templateFeatures;
  if (Array.isArray(templateFeatures)) {
    templateFeatures.forEach((value, index) => {
      const number = finiteNumber(value);
      if (number !== null) values[`templateFeature${index + 1}`] = number;
    });
  } else {
    const templateFeature = finiteNumber(spike?.templateFeature);
    if (templateFeature !== null) values.templateFeature1 = templateFeature;
  }
  return values;
};

const clusterEntries = ({ clusterData, clusteringResults }) => {
  if (Array.isArray(clusteringResults?.fullData) && clusteringResults.fullData.length) {
    return clusteringResults.fullData.map((spikes, index) => ({
      clusterId: clusterIdOf(clusteringResults.clusters?.[index], index),
      spikes: (spikes || []).map((spike, pointIndex) => ({ ...spike, pointIndex })),
    }));
  }

  return (clusterData?.clusters || []).map((cluster, index) => {
    const points = cluster.points || [];
    const times = cluster.spikeTimes || cluster.spike_times || [];
    const channels = cluster.spikeChannels || [];
    const amplitudes = cluster.spikeAmplitudes || [];
    const spikeIndices = cluster.spikeIndices || [];
    const count = Math.max(points.length, times.length, channels.length, amplitudes.length);
    return {
      clusterId: clusterIdOf(cluster, index),
      spikes: Array.from({ length: count }, (_, pointIndex) => ({
        x: points[pointIndex]?.[0],
        y: points[pointIndex]?.[1],
        time: times[pointIndex],
        channel: channels[pointIndex] ?? cluster.channelId,
        amplitude: amplitudes[pointIndex],
        spikeIndex: spikeIndices[pointIndex] ?? pointIndex,
        pointIndex,
      })),
    };
  });
};

const evenlySample = (items, maximum) => {
  if (items.length <= maximum) return items;
  if (maximum <= 1) return items.slice(0, maximum);
  return Array.from({ length: maximum }, (_, index) => (
    items[Math.round(index * (items.length - 1) / (maximum - 1))]
  ));
};

const buildPoint = (clusterId, spike, fallbackIndex, sampleRateHz) => {
  const pointIndex = finiteNumber(spike?.pointIndex) ?? fallbackIndex;
  const spikeIndex = finiteNumber(spike?.spikeIndex) ?? pointIndex;
  const timeSamples = finiteNumber(spike?.time ?? spike?.timeSamples);
  const channel = finiteNumber(spike?.channel);
  return {
    spikeId: `${clusterId}:${Math.round(spikeIndex)}`,
    clusterId,
    pointIndex: Math.round(pointIndex),
    spikeIndex: Math.round(spikeIndex),
    timeSamples,
    channel: channel === null ? null : Math.round(channel),
    values: valuesFromSpike(spike, sampleRateHz),
  };
};

const addPairProjection = (series) => {
  if (series.length !== 2 || series.some((item) => item.points.length === 0)) return null;
  const retainedDimension = ['templateFeature1', 'templateFeature2'].find((dimension) => (
    series.every((item) => item.points.some((point) => point.values[dimension] !== undefined))
  ));
  if (retainedDimension) {
    series.forEach((item) => item.points.forEach((point) => {
      if (point.values[retainedDimension] !== undefined) {
        point.values.pairProjection = point.values[retainedDimension];
      }
    }));
    return 'retained_template_features';
  }

  const coordinates = series.map((item) => item.points
    .filter((point) => Number.isFinite(point.values.pc1) && Number.isFinite(point.values.pc2))
    .map((point) => [point.values.pc1, point.values.pc2]));
  if (coordinates.some((points) => points.length === 0)) return null;
  const centroids = coordinates.map((points) => points.reduce(
    (sum, point) => [sum[0] + point[0] / points.length, sum[1] + point[1] / points.length],
    [0, 0]
  ));
  let axis = [centroids[1][0] - centroids[0][0], centroids[1][1] - centroids[0][1]];
  const norm = Math.hypot(...axis);
  axis = norm > 0 ? axis.map((value) => value / norm) : [1, 0];
  const origin = [
    (centroids[0][0] + centroids[1][0]) / 2,
    (centroids[0][1] + centroids[1][1]) / 2,
  ];
  series.forEach((item) => item.points.forEach((point) => {
    if (!Number.isFinite(point.values.pc1) || !Number.isFinite(point.values.pc2)) return;
    point.values.pairProjection = (
      (point.values.pc1 - origin[0]) * axis[0]
      + (point.values.pc2 - origin[1]) * axis[1]
    );
  }));
  return 'pca_centroid_axis';
};

export const buildLocalFeaturePayload = ({
  clusterData = null,
  clusteringResults = null,
  clusterIds = [],
  sampleRateHz = 30000,
  maxSpikesPerCluster = 5000,
  includeBackground = true,
  maxBackgroundSpikes = 5000,
  selectedChannels = [],
} = {}) => {
  const actualSampleRate = Math.max(finiteNumber(sampleRateHz) ?? 30000, 1);
  const selectedKeys = new Set(clusterIds.map(String));
  const channelKeys = new Set(selectedChannels.map((channel) => String(Math.round(Number(channel)))));
  const entries = clusterEntries({ clusterData, clusteringResults });
  const allowsChannel = (spike) => channelKeys.size === 0 || channelKeys.has(String(Math.round(Number(spike.channel))));
  const makePoints = (entry, maximum) => evenlySample(
    entry.spikes.filter(allowsChannel),
    Math.max(0, maximum)
  ).map((spike, index) => buildPoint(entry.clusterId, spike, index, actualSampleRate));

  const series = clusterIds.map((clusterId) => {
    const entry = entries.find((candidate) => String(candidate.clusterId) === String(clusterId))
      || { clusterId, spikes: [] };
    const points = makePoints(entry, maxSpikesPerCluster);
    return {
      clusterId,
      points,
      totalSpikes: entry.spikes.length,
      returnedSpikes: points.length,
    };
  });
  const pairFeatureSource = addPairProjection(series);
  const backgroundCandidates = entries
    .filter((entry) => !selectedKeys.has(String(entry.clusterId)))
    .flatMap((entry) => entry.spikes.filter(allowsChannel).map((spike, index) => (
      buildPoint(entry.clusterId, spike, index, actualSampleRate)
    )));
  const backgroundPoints = includeBackground
    ? evenlySample(backgroundCandidates, Math.max(0, maxBackgroundSpikes))
    : [];

  const dimensionIds = new Set();
  [...series.flatMap((item) => item.points), ...backgroundPoints]
    .forEach((point) => Object.keys(point.values).forEach((id) => dimensionIds.add(id)));
  const preferred = ['timeSeconds', 'pc1', 'pc2', 'pairProjection', 'amplitude', 'channel'];
  const ordered = preferred.filter((id) => dimensionIds.has(id));
  [...dimensionIds].sort().forEach((id) => { if (!ordered.includes(id)) ordered.push(id); });

  return {
    clusterIds,
    sampleRateHz: actualSampleRate,
    dimensions: ordered.map(dimensionMetadata),
    series,
    backgroundPoints,
    pairFeatureSource,
    selectedChannels: [...channelKeys].map(Number).sort((left, right) => left - right),
  };
};

export const getFeatureSelectionFromPlotEvent = (plotEvent) => {
  const points = (plotEvent?.points || [])
    .map((point) => point.customdata)
    .filter((point) => point?.spikeId);
  return [...new Map(points.map((point) => [point.spikeId, point])).values()];
};
