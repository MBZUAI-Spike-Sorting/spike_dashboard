export const CURATION_SESSION_SCHEMA = 'spikescope.curation-session';
export const CURATION_SESSION_VERSION = 1;
export const CURATION_EXPORT_SCHEMA = 'spikescope.curated-assignments';

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;
const keyOf = (value) => String(value);

const normalizeMetadata = (value = {}) => ({
  group: String(value.group || 'unsorted'),
  label: String(value.label || ''),
  note: String(value.note || ''),
});

const metadataOverride = (annotations, clusterId) => {
  const value = annotations?.[clusterId] ?? annotations?.[String(clusterId)];
  return value ? normalizeMetadata(value) : null;
};

const findResultSpikes = (clusteringResults, clusterId, fallbackIndex) => {
  const fullData = clusteringResults?.fullData;
  if (!fullData) return [];
  if (!Array.isArray(fullData)) return fullData[clusterId] || fullData[String(clusterId)] || [];
  const resultIndex = (clusteringResults.clusters || []).findIndex((cluster, index) => (
    keyOf(clusterIdOf(cluster, index)) === keyOf(clusterId)
  ));
  return fullData[resultIndex >= 0 ? resultIndex : fallbackIndex] || [];
};

const updateFingerprint = (hash, value) => {
  const text = `${String(value)}\u0000`;
  let next = hash;
  for (let index = 0; index < text.length; index += 1) {
    next ^= text.charCodeAt(index);
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
};

const signatureFor = (sourceKey, clusters, spikesById) => {
  let primary = 2166136261;
  let secondary = 2246822507;
  const add = (value) => {
    primary = updateFingerprint(primary, value);
    secondary = updateFingerprint(secondary, `${value}:membership`);
  };

  add(sourceKey);
  clusters.forEach((cluster) => {
    add(cluster.id);
    add(cluster.spikeIds.length);
    cluster.spikeIds.forEach((spikeId) => {
      const spike = spikesById[spikeId] || {};
      add(spikeId);
      add(spike.spikeIndex);
      add(spike.timeSamples);
      add(spike.channel);
    });
  });
  const spikeCount = clusters.reduce((total, cluster) => total + cluster.spikeIds.length, 0);
  return `${sourceKey}|${clusters.length}:${spikeCount}:${primary.toString(16)}${secondary.toString(16)}`;
};

export const createCurationSource = ({
  sourceKey = 'default',
  clusterData = null,
  clusteringResults = null,
  clusterWaveforms = {},
  clusterAnnotations = {},
} = {}) => {
  const dataClusters = clusterData?.clusters || [];
  const spikesById = {};
  const usedIds = new Set();
  const clusters = dataClusters.map((cluster, clusterIndex) => {
    const clusterId = clusterIdOf(cluster, clusterIndex);
    const resultSpikes = findResultSpikes(clusteringResults, clusterId, clusterIndex);
    const times = cluster.spikeTimes || cluster.spike_times || [];
    const channels = cluster.spikeChannels || cluster.spike_channels || [];
    const points = cluster.points || [];
    const amplitudes = cluster.spikeAmplitudes || [];
    const suppliedSpikeIds = cluster.spikeIds || cluster.originalSpikeIds || [];
    const suppliedWaveforms = clusterWaveforms?.[clusterId]
      || clusterWaveforms?.[String(clusterId)]
      || [];
    const waveforms = Array.isArray(suppliedWaveforms) ? suppliedWaveforms : [];
    const waveformsBySpikeIndex = new Map(waveforms
      .filter((waveform) => waveform?.spikeIndex !== undefined || waveform?.spike_index !== undefined)
      .map((waveform) => [
        keyOf(waveform.spikeIndex ?? waveform.spike_index),
        waveform,
      ]));
    const count = Math.max(
      times.length,
      channels.length,
      points.length,
      amplitudes.length,
      resultSpikes.length,
      Number(cluster.pointCount) || 0
    );
    const spikeIds = [];
    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      const resultSpike = resultSpikes[pointIndex] || {};
      const spikeIndex = finiteNumber(
        resultSpike.spikeIndex ?? resultSpike.spike_index
        ?? cluster.spikeIndices?.[pointIndex] ?? pointIndex
      ) ?? pointIndex;
      const preferredId = String(
        suppliedSpikeIds[pointIndex] ?? `${clusterId}:${Math.round(spikeIndex)}`
      );
      let spikeId = preferredId;
      let collisionIndex = 1;
      while (usedIds.has(spikeId)) {
        spikeId = `${preferredId}:duplicate-${collisionIndex}`;
        collisionIndex += 1;
      }
      usedIds.add(spikeId);
      const timeSamples = finiteNumber(resultSpike.time ?? times[pointIndex]);
      const channel = finiteNumber(resultSpike.channel ?? channels[pointIndex] ?? cluster.channelId);
      const x = finiteNumber(resultSpike.x ?? points[pointIndex]?.[0]);
      const y = finiteNumber(resultSpike.y ?? points[pointIndex]?.[1]);
      const amplitude = finiteNumber(
        resultSpike.amplitude ?? resultSpike.amp ?? amplitudes[pointIndex]
      );
      const waveform = waveformsBySpikeIndex.get(keyOf(Math.round(spikeIndex)))
        ?? waveforms[pointIndex]
        ?? null;
      spikesById[spikeId] = {
        spikeId,
        originalClusterId: clusterId,
        originalPointIndex: pointIndex,
        spikeIndex: Math.round(spikeIndex),
        timeSamples,
        channel: channel === null ? null : Math.round(channel),
        point: x === null || y === null ? null : [x, y],
        amplitude,
        waveform,
      };
      spikeIds.push(spikeId);
    }
    return {
      id: clusterId,
      spikeIds,
      sourceClusterIds: [clusterId],
      metadata: {
        ...normalizeMetadata(cluster.metadata),
        ...(metadataOverride(clusterAnnotations, clusterId) || {}),
      },
    };
  });

  return {
    sourceKey,
    signature: signatureFor(sourceKey, clusters, spikesById),
    clusters,
    spikesById,
    spikeOrder: Object.fromEntries(Object.keys(spikesById).map((spikeId, index) => [spikeId, index])),
  };
};

const initialNextClusterId = (source) => {
  const numericIds = source.clusters.map((cluster) => finiteNumber(cluster.id)).filter((value) => value !== null);
  return Math.max(-1, ...numericIds) + 1;
};

export const createCurationSession = (source) => ({
  schema: CURATION_SESSION_SCHEMA,
  schemaVersion: CURATION_SESSION_VERSION,
  sourceSignature: source.signature,
  revision: 0,
  cursor: 0,
  operations: [],
  nextClusterId: initialNextClusterId(source),
  nextOperationId: 1,
});

const sortedSpikeIds = (source, spikeIds) => [...spikeIds].sort((left, right) => (
  (source.spikeOrder[left] ?? Number.MAX_SAFE_INTEGER)
  - (source.spikeOrder[right] ?? Number.MAX_SAFE_INTEGER)
));

const deriveInitialClusters = (source) => new Map(source.clusters.map((cluster) => [
  keyOf(cluster.id),
  {
    id: cluster.id,
    spikeIds: [...cluster.spikeIds],
    sourceClusterIds: [...cluster.sourceClusterIds],
    metadata: normalizeMetadata(cluster.metadata),
  },
]));

const replayOperation = (source, clusters, operation) => {
  if (operation.type === 'merge') {
    const uniqueClusterIds = new Set((operation.clusterIds || []).map(keyOf));
    if (uniqueClusterIds.size < 2 || uniqueClusterIds.size !== operation.clusterIds?.length) {
      throw new Error(`Merge ${operation.id} must reference at least two distinct clusters.`);
    }
    if (clusters.has(keyOf(operation.targetClusterId))) {
      throw new Error(`Merge ${operation.id} reuses an existing target cluster.`);
    }
    const inputs = operation.clusterIds.map((clusterId) => clusters.get(keyOf(clusterId)));
    if (inputs.some((cluster) => !cluster)) throw new Error(`Merge ${operation.id} references an unavailable cluster.`);
    const spikeIds = sortedSpikeIds(source, [...new Set(inputs.flatMap((cluster) => cluster.spikeIds))]);
    const sourceClusterIds = [...new Map(inputs
      .flatMap((cluster) => cluster.sourceClusterIds)
      .map((clusterId) => [keyOf(clusterId), clusterId])).values()];
    operation.clusterIds.forEach((clusterId) => clusters.delete(keyOf(clusterId)));
    clusters.set(keyOf(operation.targetClusterId), {
      id: operation.targetClusterId,
      spikeIds,
      sourceClusterIds,
      metadata: normalizeMetadata(operation.metadata),
    });
    return;
  }

  if (operation.type === 'split') {
    const sourceCluster = clusters.get(keyOf(operation.sourceClusterId));
    if (!sourceCluster) throw new Error(`Split ${operation.id} references an unavailable cluster.`);
    if (clusters.has(keyOf(operation.targetClusterId))) {
      throw new Error(`Split ${operation.id} reuses an existing target cluster.`);
    }
    if (
      !Array.isArray(operation.spikeIds)
      || new Set(operation.spikeIds).size !== operation.spikeIds.length
    ) {
      throw new Error(`Split ${operation.id} must contain distinct spike IDs.`);
    }
    const selected = new Set(operation.spikeIds);
    if (operation.spikeIds.some((spikeId) => !sourceCluster.spikeIds.includes(spikeId))) {
      throw new Error(`Split ${operation.id} contains spikes outside its source cluster.`);
    }
    const remaining = sourceCluster.spikeIds.filter((spikeId) => !selected.has(spikeId));
    if (!operation.spikeIds.length || !remaining.length) {
      throw new Error(`Split ${operation.id} must leave spikes on both sides.`);
    }
    clusters.set(keyOf(sourceCluster.id), { ...sourceCluster, spikeIds: remaining });
    const targetSpikeIds = sortedSpikeIds(source, operation.spikeIds);
    const sourceClusterIds = [...new Map(targetSpikeIds.map((spikeId) => {
      const originalId = source.spikesById[spikeId]?.originalClusterId;
      return [keyOf(originalId), originalId];
    })).values()];
    clusters.set(keyOf(operation.targetClusterId), {
      id: operation.targetClusterId,
      spikeIds: targetSpikeIds,
      sourceClusterIds,
      metadata: normalizeMetadata(operation.metadata),
    });
    return;
  }

  throw new Error(`Unknown curation operation: ${operation.type}`);
};

export const deriveCurationState = (source, session) => {
  if (!source || !session || session.sourceSignature !== source.signature) {
    throw new Error('Curation session does not match the loaded source.');
  }
  if (
    !Array.isArray(session.operations)
    || !Number.isInteger(session.cursor)
    || session.cursor < 0
    || session.cursor > session.operations.length
  ) {
    throw new Error('Curation session history cursor is invalid.');
  }
  const clusters = deriveInitialClusters(source);
  session.operations.slice(0, session.cursor).forEach((operation) => (
    replayOperation(source, clusters, operation)
  ));
  const clusterList = [...clusters.values()];
  const assignments = {};
  clusterList.forEach((cluster) => cluster.spikeIds.forEach((spikeId, pointIndex) => {
    if (assignments[spikeId]) {
      throw new Error(`Spike ${spikeId} is assigned to more than one current cluster.`);
    }
    assignments[spikeId] = { clusterId: cluster.id, pointIndex };
  }));
  const sourceSpikeIds = Object.keys(source.spikesById);
  if (
    Object.keys(assignments).length !== sourceSpikeIds.length
    || sourceSpikeIds.some((spikeId) => !assignments[spikeId])
  ) {
    throw new Error('Curation history does not preserve a complete spike assignment.');
  }
  return { clusters: clusterList, assignments };
};

const metadataFor = (cluster, overrides = {}) => ({
  ...normalizeMetadata(cluster.metadata),
  ...(metadataOverride(overrides, cluster.id) || {}),
});

const allocateTarget = (session) => session.nextClusterId;

const commitOperation = (session, operation) => ({
  ...session,
  revision: session.revision + 1,
  cursor: session.cursor + 1,
  operations: [...session.operations.slice(0, session.cursor), operation],
  nextClusterId: session.nextClusterId + 1,
  nextOperationId: session.nextOperationId + 1,
});

export const mergeCurationClusters = (
  source,
  session,
  clusterIds,
  metadataOverrides = {}
) => {
  const derived = deriveCurationState(source, session);
  const uniqueIds = [...new Map((clusterIds || []).map((clusterId) => [keyOf(clusterId), clusterId])).values()];
  if (uniqueIds.length < 2) throw new Error('Select at least two current clusters to merge.');
  const clusters = uniqueIds.map((clusterId) => derived.clusters.find((item) => keyOf(item.id) === keyOf(clusterId)));
  if (clusters.some((cluster) => !cluster)) throw new Error('The merge selection contains an unavailable cluster.');
  const metadata = clusters.map((cluster) => metadataFor(cluster, metadataOverrides));
  const groups = [...new Set(metadata.map((item) => item.group))];
  const labels = [...new Set(metadata.map((item) => item.label).filter(Boolean))];
  const notes = [...new Set(metadata.map((item) => item.note).filter(Boolean))];
  const targetClusterId = allocateTarget(session);
  return commitOperation(session, {
    id: `op-${session.nextOperationId}`,
    type: 'merge',
    clusterIds: uniqueIds,
    targetClusterId,
    metadata: {
      group: groups.length === 1 ? groups[0] : 'unsorted',
      label: labels.length === 1 ? labels[0] : `Merged ${uniqueIds.map((id) => `C${id}`).join(' + ')}`,
      note: notes.join('\n'),
    },
  });
};

export const splitCurationSelection = (
  source,
  session,
  spikeIds,
  metadataOverrides = {}
) => {
  const derived = deriveCurationState(source, session);
  const uniqueIds = [...new Set((spikeIds || []).map(String))];
  if (!uniqueIds.length) throw new Error('Select exact spike IDs before splitting.');
  if (uniqueIds.some((spikeId) => !source.spikesById[spikeId])) {
    throw new Error('The split selection contains a spike outside the loaded source.');
  }
  const selectedClusterKeys = new Set(uniqueIds.map((spikeId) => (
    keyOf(derived.assignments[spikeId]?.clusterId)
  )));
  if (selectedClusterKeys.has('undefined') || selectedClusterKeys.size !== 1) {
    throw new Error('All selected spikes must belong to one current cluster.');
  }
  const sourceCluster = derived.clusters.find((cluster) => (
    keyOf(cluster.id) === [...selectedClusterKeys][0]
  ));
  if (!sourceCluster || uniqueIds.length >= sourceCluster.spikeIds.length) {
    throw new Error('A split must leave at least one spike in the source cluster.');
  }
  const targetClusterId = allocateTarget(session);
  const sourceMetadata = metadataFor(sourceCluster, metadataOverrides);
  return commitOperation(session, {
    id: `op-${session.nextOperationId}`,
    type: 'split',
    sourceClusterId: sourceCluster.id,
    targetClusterId,
    spikeIds: sortedSpikeIds(source, uniqueIds),
    metadata: {
      ...sourceMetadata,
      label: sourceMetadata.label ? `${sourceMetadata.label} split` : `Split from C${sourceCluster.id}`,
    },
  });
};

export const undoCuration = (session) => session.cursor > 0 ? ({
  ...session,
  revision: session.revision + 1,
  cursor: session.cursor - 1,
}) : session;

export const redoCuration = (session) => session.cursor < session.operations.length ? ({
  ...session,
  revision: session.revision + 1,
  cursor: session.cursor + 1,
}) : session;

export const restoreCurationSession = (serialized, source) => {
  try {
    const candidate = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    if (
      candidate?.schema !== CURATION_SESSION_SCHEMA
      || candidate?.schemaVersion !== CURATION_SESSION_VERSION
      || candidate?.sourceSignature !== source.signature
      || !Array.isArray(candidate.operations)
      || !Number.isInteger(candidate.cursor)
      || candidate.cursor < 0
      || candidate.cursor > candidate.operations.length
      || !Number.isInteger(candidate.nextClusterId)
      || candidate.nextClusterId < initialNextClusterId(source)
      || !Number.isInteger(candidate.nextOperationId)
      || candidate.nextOperationId < 1
      || !Number.isInteger(candidate.revision)
      || candidate.revision < candidate.operations.length
    ) {
      throw new Error('Saved curation session is incompatible with this dataset.');
    }
    deriveCurationState(source, candidate);
    deriveCurationState(source, {
      ...candidate,
      cursor: candidate.operations.length,
    });
    const operationNumbers = candidate.operations.map((operation) => {
      const match = /^op-(\d+)$/.exec(operation?.id || '');
      if (!match) throw new Error('Saved curation history contains an invalid operation ID.');
      return Number(match[1]);
    });
    if (
      new Set(operationNumbers).size !== operationNumbers.length
      || operationNumbers.some((operationNumber) => operationNumber >= candidate.nextOperationId)
    ) {
      throw new Error('Saved curation operation counters are invalid.');
    }
    const targetIds = candidate.operations.map((operation) => finiteNumber(operation.targetClusterId));
    if (
      targetIds.some((targetId) => targetId === null || !Number.isInteger(targetId))
      || targetIds.some((targetId) => targetId >= candidate.nextClusterId)
    ) {
      throw new Error('Saved curation cluster counters are invalid.');
    }
    return { session: candidate, recovered: true, error: null };
  } catch (error) {
    return {
      session: createCurationSession(source),
      recovered: false,
      error: error.message || 'Unable to restore the saved curation session.',
    };
  }
};

const mostCommon = (values) => {
  const counts = new Map();
  values.filter((value) => value !== null && value !== undefined).forEach((value) => (
    counts.set(value, (counts.get(value) || 0) + 1)
  ));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
};

const currentMetadata = (cluster, annotations) => ({
  ...normalizeMetadata(cluster.metadata),
  ...(metadataOverride(annotations, cluster.id) || {}),
});

export const createCuratedDashboardData = (
  source,
  session,
  clusterAnnotations = {},
  datasetInfo = {}
) => {
  const derived = deriveCurationState(source, session);
  const sampleRateHz = finiteNumber(datasetInfo.sampleRateHz ?? datasetInfo.samplingRate) ?? 30000;
  const durationSamples = finiteNumber(datasetInfo.totalDataPoints) ?? Math.max(
    1,
    ...Object.values(source.spikesById).map((spike) => spike.timeSamples || 0)
  );
  const curatorClusters = derived.clusters.map((cluster) => {
    const spikes = cluster.spikeIds.map((spikeId) => source.spikesById[spikeId]).filter(Boolean);
    const metadata = currentMetadata(cluster, clusterAnnotations);
    const points = spikes.every((spike) => Array.isArray(spike.point))
      ? spikes.map((spike) => spike.point)
      : [];
    const amplitudes = spikes.every((spike) => spike.amplitude !== null)
      ? spikes.map((spike) => spike.amplitude)
      : [];
    const waveforms = spikes
      .filter((spike) => spike.waveform)
      .map((spike) => ({
        ...spike.waveform,
        spikeId: spike.spikeId,
        spikeIndex: spike.spikeIndex,
      }));
    return {
      id: cluster.id,
      primaryChannel: mostCommon(spikes.map((spike) => spike.channel)),
      spikeTimes: spikes.map((spike) => spike.timeSamples),
      spikeChannels: spikes.map((spike) => spike.channel),
      spikeAmplitudes: amplitudes,
      spikeIndices: spikes.map((spike) => spike.spikeIndex),
      spikeIds: [...cluster.spikeIds],
      points,
      waveforms,
      spikeCount: spikes.length,
      metadata: {
        ...metadata,
        sourceClusterIds: cluster.sourceClusterIds,
        curationRevision: session.revision,
      },
    };
  });
  const clusterDataClusters = curatorClusters.map((cluster) => ({
    clusterId: cluster.id,
    clusterLabel: `Cluster ${cluster.id}`,
    spikeTimes: cluster.spikeTimes,
    spikeChannels: cluster.spikeChannels,
    spikeAmplitudes: cluster.spikeAmplitudes,
    spikeIndices: cluster.spikeIndices,
    spikeIds: cluster.spikeIds,
    points: cluster.points,
    pointCount: cluster.spikeCount,
    channelId: cluster.primaryChannel,
    primaryChannel: cluster.primaryChannel,
    metadata: cluster.metadata,
  }));
  const clusters = clusterDataClusters.map((cluster) => ({
    id: cluster.clusterId,
    size: cluster.pointCount,
    peakChannel: cluster.primaryChannel,
  }));
  const clusterStats = Object.fromEntries(clusterDataClusters.map((cluster) => {
    const times = [...cluster.spikeTimes].filter(Number.isFinite).sort((left, right) => left - right);
    const intervals = times.slice(1).map((time, index) => time - times[index]);
    const refractorySamples = sampleRateHz * 0.002;
    const violationCount = intervals.filter((interval) => interval < refractorySamples).length;
    const amplitudes = cluster.spikeAmplitudes.filter(Number.isFinite);
    return [String(cluster.clusterId), {
      clusterId: cluster.clusterId,
      count: cluster.pointCount,
      numSpikes: cluster.pointCount,
      peakChannel: cluster.primaryChannel,
      firingRateHz: cluster.pointCount / Math.max(durationSamples / sampleRateHz, Number.EPSILON),
      isiViolationCount: violationCount,
      isiViolationRate: intervals.length ? violationCount / intervals.length : 0,
      meanAmplitude: amplitudes.length
        ? amplitudes.reduce((sum, value) => sum + value, 0) / amplitudes.length
        : null,
    }];
  }));
  return {
    derived,
    clusters,
    clusterStats,
    clusterData: {
      available: clusterDataClusters.length > 0,
      source: 'curation-session',
      clusters: clusterDataClusters,
      clusterIds: clusterDataClusters.map((cluster) => cluster.clusterId),
      numClusters: clusterDataClusters.length,
      totalPoints: clusterDataClusters.reduce((sum, cluster) => sum + cluster.pointCount, 0),
    },
    clusterWaveforms: Object.fromEntries(curatorClusters
      .filter((cluster) => cluster.waveforms.length > 0)
      .map((cluster) => [String(cluster.id), cluster.waveforms])),
    curatorDataset: {
      name: 'SpikeScope curation session',
      isLoaded: true,
      metadata: {
        timeUnit: 'samples',
        sampleRateHz,
        curationRevision: session.revision,
        sourceSignature: source.signature,
      },
      clusters: curatorClusters,
      clusterLookup: new Map(curatorClusters.map((cluster) => [String(cluster.id), cluster])),
    },
  };
};

export const createCurationExport = ({
  source,
  session,
  clusterAnnotations = {},
  dataset = null,
  algorithm = '',
  exportedAt = new Date().toISOString(),
}) => {
  const derived = deriveCurationState(source, session);
  return {
    schema: CURATION_EXPORT_SCHEMA,
    schemaVersion: 1,
    exportedAt,
    nonDestructive: true,
    rawSorterInputsModified: false,
    source: { dataset, algorithm, signature: source.signature },
    revision: session.revision,
    historyCursor: session.cursor,
    operations: session.operations.map((operation, index) => ({
      ...operation,
      applied: index < session.cursor,
    })),
    clusters: derived.clusters.map((cluster) => ({
      clusterId: cluster.id,
      spikeCount: cluster.spikeIds.length,
      sourceClusterIds: cluster.sourceClusterIds,
      metadata: currentMetadata(cluster, clusterAnnotations),
    })),
    assignments: Object.values(source.spikesById).map((spike) => ({
      spikeId: spike.spikeId,
      originalClusterId: spike.originalClusterId,
      originalPointIndex: spike.originalPointIndex,
      spikeIndex: spike.spikeIndex,
      timeSamples: spike.timeSamples,
      channel: spike.channel,
      curatedClusterId: derived.assignments[spike.spikeId].clusterId,
      curatedPointIndex: derived.assignments[spike.spikeId].pointIndex,
    })),
  };
};
