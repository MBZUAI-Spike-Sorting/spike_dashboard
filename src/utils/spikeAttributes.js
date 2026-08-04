const finiteNumber = (value) => {
  if (typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;
const safeId = (value) => String(value).replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
const labelOf = (value) => String(value)
  .replace(/([A-Z])/g, ' $1')
  .replace(/_/g, ' ')
  .trim()
  .replace(/\b\w/g, (character) => character.toUpperCase());
const units = { channel: 'channel_id', depth: 'um', probeDepth: 'um', ypos: 'um', yPosition: 'um' };
const reserved = new Set([
  'time', 'x', 'y', 'spikeIndex', 'spike_index', 'clusterId', 'cluster_id',
  'features', 'template_features', 'templateFeatures', 'pointIndex',
]);

const numericVector = (value) => {
  if (!Array.isArray(value) || value.length < 2 || value.length > 32) return null;
  const vector = value.map(finiteNumber);
  return vector.every((number) => number !== null) ? vector : null;
};

const scalarDefinition = (id, field, provenance, label = labelOf(field), unit = null) => ({
  id,
  label,
  shape: 'scalar',
  dimensions: [{ id: 'value', label, unit }],
  provenance,
  kind: 'scalar',
  field,
});

const vectorDefinition = (id, field, provenance, labels, kind = 'vector') => ({
  id,
  label: labelOf(field),
  shape: 'two_dimensional',
  dimensions: [
    { id: 'x', label: labels?.[0] || `${labelOf(field)} 1`, unit: null },
    { id: 'y', label: labels?.[1] || `${labelOf(field)} 2`, unit: null },
  ],
  provenance,
  kind,
  field,
});

const sourceEntries = ({ clusterData, clusteringResults }) => {
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
    const count = Math.max(points.length, times.length, channels.length, amplitudes.length);
    return {
      clusterId: clusterIdOf(cluster, index),
      spikes: Array.from({ length: count }, (_, pointIndex) => ({
        x: points[pointIndex]?.[0],
        y: points[pointIndex]?.[1],
        time: times[pointIndex],
        channel: channels[pointIndex] ?? cluster.channelId,
        amplitude: amplitudes[pointIndex],
        spikeIndex: cluster.spikeIndices?.[pointIndex] ?? pointIndex,
        pointIndex,
      })),
    };
  });
};

const discoverDefinitions = (entries) => {
  const definitions = new Map();
  entries.forEach((entry) => {
    const spikes = entry.spikes.length <= 256
      ? entry.spikes
      : Array.from({ length: 256 }, (_, index) => entry.spikes[
          Math.round(index * (entry.spikes.length - 1) / 255)
        ]);
    spikes.forEach((spike) => {
      if (finiteNumber(spike.x) !== null && finiteNumber(spike.y) !== null) {
        definitions.set('embedding', definitions.get('embedding') || vectorDefinition(
          'embedding',
          'PCA embedding',
          { source: 'retained_embedding', fields: ['x', 'y'] },
          ['PC 1', 'PC 2'],
          'embedding'
        ));
      }
      Object.entries(spike).forEach(([key, value]) => {
        if (reserved.has(key)) return;
        const safeKey = safeId(key);
        if (finiteNumber(value) !== null) {
          const id = `metadata:${safeKey}`;
          definitions.set(id, definitions.get(id) || scalarDefinition(
            id, key, { source: 'spike_metadata', field: key }, labelOf(key), units[key]
          ));
        } else if (numericVector(value)) {
          const id = `vector:${safeKey}`;
          definitions.set(id, definitions.get(id) || vectorDefinition(
            id, key, { source: 'spike_metadata_vector', field: key, indices: [0, 1] }
          ));
        }
      });
      if (spike.features && !Array.isArray(spike.features) && typeof spike.features === 'object') {
        Object.entries(spike.features).forEach(([key, value]) => {
          if (finiteNumber(value) === null) return;
          const id = `feature:${safeId(key)}`;
          definitions.set(id, definitions.get(id) || scalarDefinition(
            id, key, { source: 'retained_feature_map', field: key }
          ));
        });
      } else if (numericVector(spike.features)) {
        definitions.set('features', definitions.get('features') || vectorDefinition(
          'features',
          'Feature vector',
          { source: 'retained_feature_vector', field: 'features', indices: [0, 1] },
          ['Feature 1', 'Feature 2'],
          'features_vector'
        ));
      }
      const templateFeatures = spike.template_features ?? spike.templateFeatures;
      if (numericVector(templateFeatures)) {
        definitions.set('template_features', definitions.get('template_features') || vectorDefinition(
          'template_features',
          'Template features',
          { source: 'retained_template_features', indices: [0, 1] },
          ['Template feature 1', 'Template feature 2'],
          'template_features'
        ));
      }
    });
  });
  const preferred = ['embedding', 'template_features', 'features', 'metadata:amplitude', 'metadata:channel'];
  const ids = [
    ...preferred.filter((id) => definitions.has(id)),
    ...[...definitions.keys()].filter((id) => !preferred.includes(id)).sort(),
  ];
  return ids.slice(0, 128).map((id) => definitions.get(id));
};

const valuesFor = (spike, definition) => {
  if (definition.kind === 'embedding') {
    const x = finiteNumber(spike.x);
    const y = finiteNumber(spike.y);
    return x === null || y === null ? null : { x, y };
  }
  if (definition.kind === 'scalar') {
    const raw = definition.provenance.source === 'retained_feature_map'
      ? spike.features?.[definition.provenance.field]
      : spike[definition.field];
    const value = finiteNumber(raw);
    return value === null ? null : { value };
  }
  const vector = definition.kind === 'features_vector'
    ? numericVector(spike.features)
    : definition.kind === 'template_features'
    ? numericVector(spike.template_features ?? spike.templateFeatures)
    : numericVector(spike[definition.field]);
  return vector ? { x: vector[0], y: vector[1] } : null;
};

const publicDefinition = (definition) => definition ? ({
  id: definition.id,
  label: definition.label,
  shape: definition.shape,
  dimensions: definition.dimensions,
  provenance: definition.provenance,
}) : null;

const evenlySample = (points, maximum) => {
  if (points.length <= maximum) return points;
  return Array.from({ length: maximum }, (_, index) => points[
    Math.round(index * (points.length - 1) / (maximum - 1))
  ]);
};

export const buildLocalSpikeAttributePayload = ({
  clusterIds = [],
  clusterData = null,
  clusteringResults = null,
  attributeId = '',
  sampleRateHz = 30000,
  maxSpikesPerCluster = 5000,
} = {}) => {
  const rate = Math.max(finiteNumber(sampleRateHz) ?? 30000, 1);
  const allEntries = sourceEntries({ clusterData, clusteringResults });
  const selectedKeys = new Set(clusterIds.map(String));
  const entries = allEntries.filter((entry) => selectedKeys.has(String(entry.clusterId)));
  const definitions = discoverDefinitions(entries);
  const definition = definitions.find((candidate) => candidate.id === attributeId) || definitions[0] || null;
  const series = clusterIds.map((clusterId) => {
    const entry = entries.find((candidate) => String(candidate.clusterId) === String(clusterId))
      || { spikes: [] };
    const candidates = definition ? entry.spikes.map((spike, fallbackIndex) => {
      const values = valuesFor(spike, definition);
      const timeSamples = finiteNumber(spike.time ?? spike.timeSamples);
      if (!values || (definition.shape === 'scalar' && timeSamples === null)) return null;
      const pointIndex = finiteNumber(spike.pointIndex) ?? fallbackIndex;
      const spikeIndex = finiteNumber(spike.spikeIndex ?? spike.spike_index) ?? pointIndex;
      const channel = finiteNumber(spike.channel);
      return {
        spikeId: `${clusterId}:${Math.round(spikeIndex)}`,
        clusterId,
        pointIndex: Math.round(pointIndex),
        spikeIndex: Math.round(spikeIndex),
        timeSamples,
        timeSeconds: timeSamples === null ? null : timeSamples / rate,
        channel: channel === null ? null : Math.round(channel),
        values,
      };
    }).filter(Boolean).sort((left, right) => (
      (left.timeSamples ?? left.pointIndex) - (right.timeSamples ?? right.pointIndex)
    )) : [];
    const points = evenlySample(candidates, Math.max(10, maxSpikesPerCluster));
    return {
      clusterId,
      points,
      totalPoints: candidates.length,
      returnedPoints: points.length,
    };
  });
  return {
    clusterIds,
    sampleRateHz: rate,
    attributeDefinitions: definitions.map(publicDefinition),
    selectedAttributeId: definition?.id || null,
    attributeDefinition: publicDefinition(definition),
    series,
  };
};

export const getSpikeAttributeSelection = (plotEvent) => {
  const points = (plotEvent?.points || [])
    .map((point) => point.customdata)
    .filter((point) => point?.spikeId);
  return [...new Map(points.map((point) => [point.spikeId, point])).values()];
};
