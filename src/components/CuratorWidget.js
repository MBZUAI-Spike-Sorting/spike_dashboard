import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import './CuratorWidget.css';

const KNOWN_CLUSTER_FIELDS = new Set([
  'id',
  'clusterId',
  'cluster_id',
  'label',
  'name',
  'spikeTimes',
  'spike_times',
  'times',
  'primaryChannel',
  'primary_channel',
  'channel'
]);

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value)
);

const normalizeSpikeTimes = (rawSpikeTimes) => {
  if (!Array.isArray(rawSpikeTimes)) {
    return [];
  }

  return rawSpikeTimes
    .map(toNumber)
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
};

const isDisplayableMetadataValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return true;
  }

  return Array.isArray(value) && value.length <= 6;
};

const normalizeCluster = (cluster, index) => {
  const source = isPlainObject(cluster) ? cluster : {};
  const spikeTimes = normalizeSpikeTimes(
    source.spikeTimes ?? source.spike_times ?? source.times
  );

  const id = String(
    source.id ??
    source.clusterId ??
    source.cluster_id ??
    source.label ??
    index
  );

  const rawPrimaryChannel = (
    source.primaryChannel ??
    source.primary_channel ??
    source.channel ??
    null
  );
  const numericPrimaryChannel = toNumber(rawPrimaryChannel);
  const primaryChannel = numericPrimaryChannel !== null
    ? numericPrimaryChannel
    : rawPrimaryChannel;

  const metadata = Object.entries(source).reduce((accumulator, [key, value]) => {
    if (!KNOWN_CLUSTER_FIELDS.has(key) && isDisplayableMetadataValue(value)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});

  return {
    id,
    primaryChannel,
    primaryChannelSource: primaryChannel === null || primaryChannel === undefined ? null : 'provided',
    spikeTimes,
    spikeCount: spikeTimes.length,
    metadata
  };
};

const normalizeDataset = (dataset, fallbackName = 'Cluster file') => {
  const payload = dataset?.data ?? dataset ?? {};
  const metadata = payload.metadata ?? dataset?.metadata ?? {};
  const clustersSource = payload.clusters ?? dataset?.clusters ?? [];
  const clusters = Array.isArray(clustersSource)
    ? clustersSource.map(normalizeCluster)
    : [];

  return {
    name: metadata.algorithmName || metadata.name || dataset?.name || fallbackName,
    metadata,
    clusters
  };
};

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
};

const formatSample = (value) => (
  Number.isFinite(value) ? Math.round(value).toLocaleString() : '-'
);

const getMetadataPreview = (metadata) => {
  const entries = Object.entries(metadata || {});
  if (!entries.length) {
    return '-';
  }

  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(' | ');
};

const getSignalChannelEntries = (signalData) => {
  const source = signalData?.data ?? signalData?.channels ?? signalData;

  if (Array.isArray(source)) {
    return source
      .map((series, index) => ({
        channelId: index,
        values: Array.isArray(series) ? series : (Array.isArray(series?.data) ? series.data : null)
      }))
      .filter((entry) => Array.isArray(entry.values));
  }

  if (isPlainObject(source)) {
    return Object.entries(source)
      .map(([channelId, series]) => ({
        channelId,
        values: Array.isArray(series) ? series : (Array.isArray(series?.data) ? series.data : null)
      }))
      .filter((entry) => Array.isArray(entry.values));
  }

  return [];
};

const predictPrimaryChannels = (clusters, signalData) => {
  const channels = getSignalChannelEntries(signalData);

  if (!channels.length) {
    return {
      clusters,
      hasSignal: false,
      predictedCount: 0
    };
  }

  let predictedCount = 0;
  const nextClusters = clusters.map((cluster) => {
    if (
      cluster.primaryChannel !== null &&
      cluster.primaryChannel !== undefined &&
      cluster.primaryChannel !== ''
    ) {
      return cluster;
    }

    let bestChannel = null;

    channels.forEach(({ channelId, values }) => {
      let total = 0;
      let count = 0;

      cluster.spikeTimes.forEach((time) => {
        const sampleIndex = Math.round(Number(time));
        if (!Number.isFinite(sampleIndex) || sampleIndex < 0 || sampleIndex >= values.length) {
          return;
        }

        const value = Number(values[sampleIndex]);
        if (!Number.isFinite(value)) {
          return;
        }

        total += Math.abs(value);
        count += 1;
      });

      if (!count) {
        return;
      }

      const score = total / count;
      if (!bestChannel || score > bestChannel.score) {
        bestChannel = { channelId, score };
      }
    });

    if (!bestChannel) {
      return cluster;
    }

    predictedCount += 1;
    return {
      ...cluster,
      primaryChannel: bestChannel.channelId,
      primaryChannelSource: 'predicted',
      metadata: {
        ...cluster.metadata,
        predictionScore: Number(bestChannel.score.toFixed(4))
      }
    };
  });

  return {
    clusters: nextClusters,
    hasSignal: true,
    predictedCount
  };
};

const SORT_COLUMNS = [
  { key: 'id', label: 'Cluster' },
  { key: 'primaryChannel', label: 'Primary channel' },
  { key: 'spikeCount', label: 'Spikes' },
  { key: 'firstSpike', label: 'First spike' },
  { key: 'lastSpike', label: 'Last spike' }
];

const getSortValue = (cluster, key) => {
  if (key === 'firstSpike') {
    return cluster.spikeTimes[0] ?? null;
  }

  if (key === 'lastSpike') {
    return cluster.spikeTimes[cluster.spikeTimes.length - 1] ?? null;
  }

  return cluster[key];
};

const compareValues = (left, right, direction) => {
  const multiplier = direction === 'asc' ? 1 : -1;
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);

  if (leftNumber !== null && rightNumber !== null) {
    return (leftNumber - rightNumber) * multiplier;
  }

  return String(left ?? '').localeCompare(String(right ?? '')) * multiplier;
};

const CuratorWidget = ({ clusterSetData, signalData, onClusterSelect }) => {
  const [dataset, setDataset] = useState(() => normalizeDataset(null, 'No file loaded'));
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'spikeCount', direction: 'desc' });
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);

  useEffect(() => {
    if (!clusterSetData) {
      return;
    }

    setDataset(normalizeDataset(clusterSetData, 'Wired cluster set'));
    setSelectedClusterId(null);
    setError('');
  }, [clusterSetData]);

  const summary = useMemo(() => {
    const clusters = dataset.clusters || [];
    const totalSpikes = clusters.reduce((total, cluster) => total + cluster.spikeCount, 0);
    const missingPrimary = clusters.filter(
      (cluster) => cluster.primaryChannel === null || cluster.primaryChannel === undefined || cluster.primaryChannel === ''
    ).length;

    return {
      totalClusters: clusters.length,
      totalSpikes,
      missingPrimary
    };
  }, [dataset]);

  const sortedClusters = useMemo(() => {
    return [...(dataset.clusters || [])].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction
      )
    ));
  }, [dataset, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const response = await apiClient.parseClusterComparisonFile(file);
      setDataset(normalizeDataset(response.data?.dataset, file.name));
      setSelectedClusterId(null);
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to load the cluster file.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handlePredictPrimaryChannels = () => {
    setIsPredicting(true);
    setError('');

    try {
      const result = predictPrimaryChannels(dataset.clusters, signalData);

      if (!result.hasSignal) {
        setError('Signal data is required to predict primary channels.');
        return;
      }

      setDataset((current) => ({
        ...current,
        clusters: result.clusters
      }));

      if (!result.predictedCount) {
        setError('No missing primary channels could be predicted from the current signal data.');
      }
    } finally {
      setIsPredicting(false);
    }
  };

  const handleClusterSelect = (cluster) => {
    setSelectedClusterId(cluster.id);
    if (typeof onClusterSelect === 'function') {
      onClusterSelect({
        ...cluster,
        datasetName: dataset.name,
        datasetMetadata: dataset.metadata
      });
    }
  };

  return (
    <div className="curator-widget">
      <div className="curator-toolbar">
        <div className="curator-file-control">
          <label htmlFor="curator-cluster-file">Cluster file</label>
          <input
            id="curator-cluster-file"
            type="file"
            accept=".json,.mat"
            onChange={handleFileUpload}
          />
        </div>
        <button
          type="button"
          className="curator-action-button"
          onClick={handlePredictPrimaryChannels}
          disabled={!summary.totalClusters || isPredicting || !summary.missingPrimary}
        >
          Predict Primary Channels
        </button>
      </div>

      {error && (
        <div className="curator-message curator-message-error">
          {error}
        </div>
      )}

      {(isUploading || isPredicting) && (
        <div className="curator-message">
          {isUploading ? 'Loading cluster file...' : 'Predicting primary channels...'}
        </div>
      )}

      <div className="curator-summary-grid">
        <div className="curator-summary-card">
          <span>Source</span>
          <strong>{dataset.name}</strong>
        </div>
        <div className="curator-summary-card">
          <span>Clusters</span>
          <strong>{summary.totalClusters}</strong>
        </div>
        <div className="curator-summary-card">
          <span>Total spikes</span>
          <strong>{summary.totalSpikes.toLocaleString()}</strong>
        </div>
        <div className="curator-summary-card">
          <span>Missing primary</span>
          <strong>{summary.missingPrimary}</strong>
        </div>
      </div>

      <div className="curator-table-shell">
        <table className="curator-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((column) => (
                <th key={column.key}>
                  <button type="button" onClick={() => handleSort(column.key)}>
                    {column.label}
                    {sortConfig.key === column.key && (
                      <span>{sortConfig.direction === 'desc' ? ' down' : ' up'}</span>
                    )}
                  </button>
                </th>
              ))}
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {!sortedClusters.length && (
              <tr>
                <td colSpan={6} className="curator-empty-state">
                  Load a cluster file to inspect clusters.
                </td>
              </tr>
            )}
            {sortedClusters.map((cluster) => (
              <tr
                key={cluster.id}
                className={selectedClusterId === cluster.id ? 'selected' : ''}
                onClick={() => handleClusterSelect(cluster)}
              >
                <td>{cluster.id}</td>
                <td>
                  {formatValue(cluster.primaryChannel)}
                  {cluster.primaryChannelSource === 'predicted' && (
                    <span className="curator-pill">predicted</span>
                  )}
                </td>
                <td>{cluster.spikeCount.toLocaleString()}</td>
                <td>{formatSample(cluster.spikeTimes[0])}</td>
                <td>{formatSample(cluster.spikeTimes[cluster.spikeTimes.length - 1])}</td>
                <td>{getMetadataPreview(cluster.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CuratorWidget;
