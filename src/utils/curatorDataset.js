const numericValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const normalizeCuratorClusterId = (value, fallback) => {
  const resolved = value ?? fallback;
  const number = numericValue(resolved);

  return number !== null && String(resolved).trim() !== ''
    ? number
    : String(resolved);
};

const getDeclaredTimeUnit = (metadata = {}) => (
  metadata?.units?.time ??
  metadata?.timeUnit ??
  metadata?.time_unit ??
  metadata?.spikeTimeUnit ??
  metadata?.spike_time_unit ??
  ''
);

const getTimeScale = (unit, sampleRateHz) => {
  const normalized = String(unit || '').trim().toLowerCase();
  if (['s', 'sec', 'secs', 'second', 'seconds'].includes(normalized)) return sampleRateHz;
  if (['ms', 'msec', 'millisecond', 'milliseconds'].includes(normalized)) return sampleRateHz / 1000;
  return 1;
};

export const normalizeCuratorDatasetTimes = (dataset, datasetInfo = {}) => {
  if (!Array.isArray(dataset?.clusters)) return dataset;

  const sampleRateHz = numericValue(
    datasetInfo?.sampleRateHz ??
    datasetInfo?.samplingRate ??
    datasetInfo?.sampling_rate
  ) ?? 30000;
  const durationSamples = numericValue(datasetInfo?.totalDataPoints);
  const declaredUnit = getDeclaredTimeUnit(dataset.metadata);
  let timeCount = 0;
  let maximumTime = -Infinity;
  let hasSubSampleValues = false;

  dataset.clusters.forEach((cluster) => {
    if (!Array.isArray(cluster?.spikeTimes)) return;

    cluster.spikeTimes.forEach((rawTime) => {
      const time = numericValue(rawTime);
      if (time === null) return;

      timeCount += 1;
      maximumTime = Math.max(maximumTime, time);
      hasSubSampleValues = hasSubSampleValues || !Number.isInteger(time);
    });
  });

  let unit = declaredUnit;
  if (!unit && timeCount > 0 && durationSamples && sampleRateHz > 0) {
    const durationSeconds = durationSamples / sampleRateHz;

    if (
      maximumTime > 0 &&
      maximumTime <= durationSeconds * 1.1 &&
      hasSubSampleValues
    ) {
      unit = 'seconds';
    }
  }

  const scale = getTimeScale(unit, sampleRateHz);
  if (scale === 1) return dataset;

  return {
    ...dataset,
    metadata: {
      ...(dataset.metadata || {}),
      originalTimeUnit: unit,
      timeUnit: 'samples',
      sampleRateHz,
      timeScaleApplied: scale,
    },
    clusters: dataset.clusters.map((cluster) => ({
      ...cluster,
      spikeTimes: (cluster.spikeTimes || [])
        .map((time) => numericValue(time))
        .filter((time) => time !== null)
        .map((time) => Math.round(time * scale))
        .sort((left, right) => left - right),
    })),
  };
};

export const createDashboardDataFromCuratorDataset = (dataset) => {
  const sourceClusters = Array.isArray(dataset?.clusters) ? dataset.clusters : [];
  const clusterDataClusters = sourceClusters.map((cluster, index) => {
    const clusterId = normalizeCuratorClusterId(cluster?.id, index);
    const spikeTimes = Array.isArray(cluster?.spikeTimes) ? cluster.spikeTimes : [];
    const pointCount = numericValue(cluster?.spikeCount) ?? spikeTimes.length;
    const primaryChannel = cluster?.primaryChannel ?? null;

    return {
      clusterId,
      clusterLabel: `Cluster ${clusterId}`,
      spikeTimes,
      spikeChannels: Array.isArray(cluster?.spikeChannels) && cluster.spikeChannels.length > 0
        ? cluster.spikeChannels
        : spikeTimes.map(() => primaryChannel),
      spikeAmplitudes: Array.isArray(cluster?.spikeAmplitudes)
        ? cluster.spikeAmplitudes
        : [],
      pointCount,
      channelId: primaryChannel,
      primaryChannel,
      metadata: cluster?.metadata || {},
      points: Array.isArray(cluster?.points) ? cluster.points : [],
    };
  });

  const clusterIds = clusterDataClusters.map((cluster) => cluster.clusterId);
  const clusters = clusterDataClusters.map((cluster) => ({
    id: cluster.clusterId,
    size: cluster.pointCount,
    peakChannel: cluster.primaryChannel,
    depth: cluster.metadata?.depth ?? null,
  }));
  const clusterStats = Object.fromEntries(clusterDataClusters.map((cluster) => [
    String(cluster.clusterId),
    {
      clusterId: cluster.clusterId,
      count: cluster.pointCount,
      numSpikes: cluster.pointCount,
      peakChannel: cluster.primaryChannel,
      depth: cluster.metadata?.depth ?? null,
      firingRateHz: cluster.metadata?.firingRateHz ?? cluster.metadata?.firing_rate_hz,
      isiViolationRate: cluster.metadata?.isiViolationRate ?? cluster.metadata?.isi_violation_rate,
      meanAmplitude: cluster.metadata?.meanAmplitude ?? cluster.metadata?.mean_amplitude,
    },
  ]));

  return {
    clusters,
    clusterStats,
    clusterWaveforms: Object.fromEntries(
      sourceClusters
        .filter((cluster) => Array.isArray(cluster?.waveforms) && cluster.waveforms.length > 0)
        .map((cluster, index) => [
          String(normalizeCuratorClusterId(cluster?.id, index)),
          cluster.waveforms,
        ])
    ),
    clusterData: {
      available: clusterDataClusters.length > 0,
      source: 'curator',
      name: dataset?.name || 'Curator cluster file',
      metadata: dataset?.metadata || {},
      clusters: clusterDataClusters,
      clusterIds,
      numClusters: clusterDataClusters.length,
      totalPoints: clusterDataClusters.reduce((total, cluster) => total + cluster.pointCount, 0),
    },
  };
};

const dot = (left, right) => (
  left.reduce((total, value, index) => total + value * right[index], 0)
);

const normalizeVector = (vector) => {
  const length = Math.sqrt(dot(vector, vector));
  return length > Number.EPSILON
    ? vector.map((value) => value / length)
    : null;
};

const principalComponent = (centeredRows, dimension, previousComponent = null) => {
  let vector = normalizeVector(
    Array.from({ length: dimension }, (_, index) => Math.sin(index + 1) + Math.cos((index + 1) * 0.7))
  );

  if (!vector) return null;

  for (let iteration = 0; iteration < 35; iteration += 1) {
    const next = new Array(dimension).fill(0);
    centeredRows.forEach((row) => {
      const projection = dot(row, vector);
      row.forEach((value, index) => {
        next[index] += value * projection;
      });
    });

    if (previousComponent) {
      const overlap = dot(next, previousComponent);
      previousComponent.forEach((value, index) => {
        next[index] -= overlap * value;
      });
    }

    vector = normalizeVector(next);
    if (!vector) return null;
  }

  return vector;
};

export const createWaveformPcaClusterData = (clusterData, clusterWaveforms) => {
  if (!Array.isArray(clusterData?.clusters)) return clusterData;

  const observations = [];
  clusterData.clusters.forEach((cluster) => {
    if (Array.isArray(cluster.points) && cluster.points.length > 0) return;

    const clusterId = cluster.clusterId ?? cluster.id;
    const waveforms = clusterWaveforms?.[clusterId] || clusterWaveforms?.[String(clusterId)] || [];

    waveforms.forEach((waveform, waveformIndex) => {
      const amplitude = Array.isArray(waveform?.amplitude)
        ? waveform.amplitude.map(Number)
        : [];
      if (amplitude.length < 2 || amplitude.some((value) => !Number.isFinite(value))) return;

      observations.push({
        clusterId,
        waveformIndex,
        spikeTime: waveform.time,
        channel: waveform.channel,
        amplitude,
      });
    });
  });

  if (observations.length < 2) return clusterData;

  const dimension = Math.min(...observations.map((observation) => observation.amplitude.length));
  const means = new Array(dimension).fill(0);
  observations.forEach(({ amplitude }) => {
    for (let index = 0; index < dimension; index += 1) means[index] += amplitude[index];
  });
  means.forEach((_, index) => {
    means[index] /= observations.length;
  });

  const centeredRows = observations.map(({ amplitude }) => (
    amplitude.slice(0, dimension).map((value, index) => value - means[index])
  ));
  const firstComponent = principalComponent(centeredRows, dimension);
  if (!firstComponent) return clusterData;

  const secondComponent = principalComponent(centeredRows, dimension, firstComponent);

  const observationsByCluster = new Map();
  observations.forEach((observation, index) => {
    const key = String(observation.clusterId);
    const current = observationsByCluster.get(key) || [];
    current.push({
      ...observation,
      point: [
        dot(centeredRows[index], firstComponent),
        secondComponent ? dot(centeredRows[index], secondComponent) : 0,
      ],
    });
    observationsByCluster.set(key, current);
  });

  return {
    ...clusterData,
    source: 'curator-waveform-pca',
    clusters: clusterData.clusters.map((cluster) => {
      const clusterId = cluster.clusterId ?? cluster.id;
      const embedded = observationsByCluster.get(String(clusterId));
      if (!embedded?.length) return cluster;

      return {
        ...cluster,
        points: embedded.map((observation) => observation.point),
        spikeTimes: embedded.map((observation) => observation.spikeTime),
        spikeChannels: embedded.map((observation) => observation.channel),
        pointCount: embedded.length,
      };
    }),
  };
};
