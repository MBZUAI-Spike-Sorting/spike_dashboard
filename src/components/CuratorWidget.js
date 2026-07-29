import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import {
  filterActiveClusters,
  normalizeMinimumSpikeCount
} from '../utils/clusterActivity';
import { normalizeCuratorClusterId } from '../utils/curatorDataset';
import {
  loadCuratorSessionDataset,
  saveCuratorSessionDataset,
} from '../utils/curatorSessionStore';
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
  'spikeChannels',
  'spike_channels',
  'channels',
  'points',
  'pcaPoints',
  'pca_points',
  'embedding',
  'waveforms',
  'spikeWaveforms',
  'spike_waveforms',
  'amplitudes',
  'spikeAmplitudes',
  'spike_amplitudes',
  'primaryChannel',
  'primary_channel',
  'channel'
]);

const PRIMARY_CHANNEL_FIELDS = ['primaryChannel', 'primary_channel', 'channel'];

const toNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isMissingPrimaryChannel = (value) => (
  value === null ||
  value === undefined ||
  value === '' ||
  (Array.isArray(value) && value.length === 0)
);

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

const normalizeNumberArray = (values) => (
  Array.isArray(values)
    ? values.map(toNumber).filter((value) => value !== null)
    : []
);

const normalizePoints = (values) => (
  Array.isArray(values)
    ? values.map((point) => {
        if (Array.isArray(point) && point.length >= 2) {
          const x = toNumber(point[0]);
          const y = toNumber(point[1]);
          return x !== null && y !== null ? [x, y] : null;
        }
        if (isPlainObject(point)) {
          const x = toNumber(point.x ?? point.pc1 ?? point[0]);
          const y = toNumber(point.y ?? point.pc2 ?? point[1]);
          return x !== null && y !== null ? [x, y] : null;
        }
        return null;
      }).filter(Boolean)
    : []
);

const normalizeWaveforms = (values) => (
  Array.isArray(values)
    ? values.map((waveform, index) => {
        const amplitude = Array.isArray(waveform)
          ? normalizeNumberArray(waveform)
          : normalizeNumberArray(
              waveform?.amplitude ?? waveform?.values ?? waveform?.data
            );
        if (amplitude.length === 0) return null;

        const suppliedTimes = normalizeNumberArray(
          waveform?.timePoints ?? waveform?.time_points
        );
        return {
          ...(isPlainObject(waveform) ? waveform : {}),
          amplitude,
          timePoints: suppliedTimes.length === amplitude.length
            ? suppliedTimes
            : amplitude.map((_, pointIndex) => pointIndex),
          spikeIndex: waveform?.spikeIndex ?? waveform?.spike_index ?? index,
        };
      }).filter(Boolean)
    : []
);

const isDisplayableMetadataValue = (value) => {
  if (value === null || value === undefined) {
    return false;
  }

  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return true;
  }

  return Array.isArray(value) && value.length <= 6;
};

const getRawPrimaryChannel = (source) => {
  for (const field of PRIMARY_CHANNEL_FIELDS) {
    if (hasOwn(source, field)) {
      return source[field];
    }
  }

  return null;
};

const normalizeCluster = (cluster, index) => {
  const source = isPlainObject(cluster) ? cluster : {};
  const spikeTimes = normalizeSpikeTimes(
    source.spikeTimes ?? source.spike_times ?? source.times
  );
  const spikeChannels = normalizeNumberArray(
    source.spikeChannels ?? source.spike_channels ?? source.channels
  );
  const points = normalizePoints(
    source.points ?? source.pcaPoints ?? source.pca_points ?? source.embedding
  );
  const waveforms = normalizeWaveforms(
    source.waveforms ?? source.spikeWaveforms ?? source.spike_waveforms
  );
  const spikeAmplitudes = normalizeNumberArray(
    source.spikeAmplitudes ?? source.spike_amplitudes ?? source.amplitudes
  );

  const id = normalizeCuratorClusterId(
    source.id ??
    source.clusterId ??
    source.cluster_id ??
    source.label,
    index
  );

  const rawPrimaryChannel = getRawPrimaryChannel(source);
  const numericPrimaryChannel = toNumber(rawPrimaryChannel);
  const primaryChannel = isMissingPrimaryChannel(rawPrimaryChannel)
    ? null
    : numericPrimaryChannel !== null
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
    primaryChannelSource:
      source.primaryChannelSource ||
      (primaryChannel === null || primaryChannel === undefined ? null : 'provided'),
    spikeTimes,
    spikeChannels,
    points,
    waveforms,
    spikeAmplitudes,
    spikeCount: spikeTimes.length,
    metadata
  };
};

const normalizePrimaryChannelsForDataset = (clusters, metadata = {}) => {
  const hasExplicitPrimaryChannels = (
    metadata.primaryChannelsProvided === true ||
    metadata.primary_channels_provided === true ||
    metadata.hasPrimaryChannels === true ||
    metadata.has_primary_channels === true
  );

  if (hasExplicitPrimaryChannels || clusters.length <= 1) {
    return clusters;
  }

  const allProvidedZeros = clusters.every((cluster) => (
    cluster.primaryChannelSource === 'provided' &&
    Number(cluster.primaryChannel) === 0
  ));

  if (!allProvidedZeros) {
    return clusters;
  }

  return clusters.map((cluster) => ({
    ...cluster,
    primaryChannel: null,
    primaryChannelSource: null
  }));
};

const normalizeDataset = (dataset, fallbackName = 'Cluster file') => {
  const payload = dataset?.data ?? dataset ?? {};
  const metadata = payload.metadata ?? dataset?.metadata ?? {};
  const clustersSource = payload.clusters ?? dataset?.clusters ?? [];
  const clusters = Array.isArray(clustersSource)
    ? clustersSource.map(normalizeCluster)
    : [];
  const name = (
    metadata.algorithmName ||
    metadata.name ||
    payload.algorithmName ||
    dataset?.algorithmName ||
    dataset?.name ||
    fallbackName
  );

  return {
    name,
    metadata,
    clusters: normalizePrimaryChannelsForDataset(clusters, metadata),
    isLoaded: Boolean(dataset)
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

const getSeriesValues = (series) => {
  if (Array.isArray(series)) {
    return series;
  }

  if (!isPlainObject(series)) {
    return null;
  }

  if (Array.isArray(series.data)) {
    return series.data;
  }

  if (Array.isArray(series.values)) {
    return series.values;
  }

  if (Array.isArray(series.filteredData)) {
    return series.filteredData;
  }

  return null;
};

const getSignalChannelEntries = (signalData) => {
  if (!signalData) {
    return [];
  }

  if (Array.isArray(signalData?.traces)) {
    return signalData.traces
      .map((trace, index) => ({
        channelId: trace?.channel ?? trace?.channelId ?? index,
        values: getSeriesValues(trace),
        startTime: toNumber(trace?.startTime ?? signalData?.startTime ?? 0)
      }))
      .filter((entry) => Array.isArray(entry.values));
  }

  const source = signalData?.data ?? signalData?.channels ?? signalData;

  if (Array.isArray(source)) {
    return source
      .map((series, index) => ({
        channelId: series?.channel ?? series?.channelId ?? index,
        values: getSeriesValues(series),
        startTime: toNumber(series?.startTime ?? signalData?.startTime ?? 0)
      }))
      .filter((entry) => Array.isArray(entry.values));
  }

  if (isPlainObject(source)) {
    return Object.entries(source)
      .map(([channelId, series]) => ({
        channelId: series?.channel ?? series?.channelId ?? channelId,
        values: getSeriesValues(series),
        startTime: toNumber(series?.startTime ?? signalData?.startTime ?? 0)
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
    if (!isMissingPrimaryChannel(cluster.primaryChannel)) {
      return cluster;
    }

    let bestChannel = null;

    channels.forEach(({ channelId, values, startTime }) => {
      let total = 0;
      let count = 0;

      cluster.spikeTimes.forEach((time) => {
        const sampleIndex = Math.round(Number(time));
        const relativeIndex = Number.isFinite(startTime)
          ? sampleIndex - startTime
          : sampleIndex;

        if (
          !Number.isFinite(sampleIndex) ||
          !Number.isFinite(relativeIndex) ||
          relativeIndex < 0 ||
          relativeIndex >= values.length
        ) {
          return;
        }

        const value = Number(values[relativeIndex]);
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

const getMissingPrimaryCount = (clusters = []) => (
  clusters.filter((cluster) => isMissingPrimaryChannel(cluster.primaryChannel)).length
);

const formatPredictionMessage = ({
  signalPredictedCount = 0,
  datasetPredictedCount = 0,
  datasetName = '',
  remainingMissing = 0
}) => {
  const parts = [];

  if (signalPredictedCount > 0) {
    parts.push(
      `Predicted ${signalPredictedCount.toLocaleString()} primary channel${signalPredictedCount === 1 ? '' : 's'} from the current signal data`
    );
  }

  if (datasetPredictedCount > 0) {
    parts.push(
      `Predicted ${datasetPredictedCount.toLocaleString()} primary channel${datasetPredictedCount === 1 ? '' : 's'} from the loaded dataset${datasetName ? ` (${datasetName})` : ''}`
    );
  }

  if (!parts.length) {
    return '';
  }

  if (remainingMissing > 0) {
    parts.push(`${remainingMissing.toLocaleString()} cluster${remainingMissing === 1 ? '' : 's'} still missing a primary channel`);
  }

  return `${parts.join('. ')}.`;
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

export const getCuratorClusterIds = (clusters = []) => (
  clusters.map((cluster) => cluster.id)
);

const CuratorWidget = ({
  clusterSetData,
  initialDataset,
  signalData,
  selectedClusters = [],
  onClusterSelect,
  onDatasetChange,
  onSelectedClustersChange,
  onLoadingChange,
  sessionCacheScope = 'default',
}) => {
  const [dataset, setDataset] = useState(() => (
    normalizeDataset(initialDataset, initialDataset?.name || 'No file loaded')
  ));
  const [sortConfig, setSortConfig] = useState({ key: 'spikeCount', direction: 'desc' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [minimumSpikeCount, setMinimumSpikeCount] = useState(1);
  const [spikeTimeUnit, setSpikeTimeUnit] = useState('auto');

  useEffect(() => {
    onLoadingChange?.(
      'curator',
      isUploading || isPredicting || isRestoring,
      isUploading
        ? 'Loading cluster file…'
        : isRestoring
        ? 'Restoring session file…'
        : 'Predicting primary channels…'
    );
  }, [isPredicting, isRestoring, isUploading, onLoadingChange]);

  useEffect(() => {
    if (initialDataset?.clusters?.length) return undefined;

    let active = true;
    setIsRestoring(true);
    loadCuratorSessionDataset({ scope: sessionCacheScope })
      .then((cachedDataset) => {
        if (!active || !cachedDataset) return;
        setDataset(normalizeDataset(cachedDataset, cachedDataset.name || 'Session file'));
        setNotice(`Restored ${cachedDataset.name || 'the curator file'} from this tab session.`);
        setError('');
      })
      .catch(() => {
        // A cache miss should behave exactly like a fresh curator widget.
      })
      .finally(() => {
        if (active) setIsRestoring(false);
      });

    return () => {
      active = false;
    };
  }, [initialDataset, sessionCacheScope]);

  useEffect(() => {
    if (!clusterSetData) {
      return;
    }

    setDataset(normalizeDataset(clusterSetData, 'Wired cluster set'));
    setError('');
    setNotice('');
  }, [clusterSetData]);

  useEffect(() => {
    if (dataset.isLoaded && typeof onDatasetChange === 'function') {
      const effectiveDataset = spikeTimeUnit === 'auto'
        ? dataset
        : {
            ...dataset,
            metadata: {
              ...(dataset.metadata || {}),
              timeUnit: spikeTimeUnit,
            },
          };
      onDatasetChange(effectiveDataset);
      saveCuratorSessionDataset(effectiveDataset, { scope: sessionCacheScope });
    }
  }, [dataset, onDatasetChange, sessionCacheScope, spikeTimeUnit]);

  const activeClusters = useMemo(() => (
    filterActiveClusters(dataset.clusters, minimumSpikeCount)
  ), [dataset.clusters, minimumSpikeCount]);

  const summary = useMemo(() => {
    const clusters = dataset.clusters || [];
    const totalSpikes = activeClusters.reduce((total, cluster) => total + cluster.spikeCount, 0);
    const missingPrimary = activeClusters.filter(
      (cluster) => isMissingPrimaryChannel(cluster.primaryChannel)
    ).length;

    return {
      totalClusters: clusters.length,
      activeClusters: activeClusters.length,
      filteredClusters: clusters.length - activeClusters.length,
      totalSpikes,
      missingPrimary
    };
  }, [activeClusters, dataset.clusters]);

  const sortedClusters = useMemo(() => {
    return [...activeClusters].sort((left, right) => (
      compareValues(
        getSortValue(left, sortConfig.key),
        getSortValue(right, sortConfig.key),
        sortConfig.direction
      )
    ));
  }, [activeClusters, sortConfig]);

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
    setNotice('');

    try {
      const response = await apiClient.parseClusterComparisonFile(file);
      onSelectedClustersChange?.([]);
      setDataset(normalizeDataset(response.data?.dataset, file.name));
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to load the cluster file.');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const handlePredictPrimaryChannels = async () => {
    setIsPredicting(true);
    setError('');
    setNotice('');

    try {
      const signalResult = predictPrimaryChannels(dataset.clusters, signalData);
      let nextClusters = signalResult.hasSignal ? signalResult.clusters : dataset.clusters;
      let signalPredictedCount = signalResult.predictedCount || 0;
      let datasetPredictedCount = 0;
      let predictionDataset = null;
      let backendAttempted = false;
      let backendErrorMessage = '';

      if (getMissingPrimaryCount(nextClusters) > 0) {
        backendAttempted = true;

        try {
          const response = await apiClient.predictPrimaryChannels(nextClusters);
          const predictedClusters = response.data?.clusters || [];
          datasetPredictedCount = response.data?.predictedCount || 0;
          predictionDataset = response.data?.dataset || null;

          if (predictedClusters.length) {
            nextClusters = predictedClusters.map(normalizeCluster);
          }
        } catch (backendError) {
          backendErrorMessage = backendError?.message || 'Unable to use the loaded dataset for fallback prediction.';

          if (!signalPredictedCount) {
            throw backendError;
          }
        }
      }

      const remainingMissing = getMissingPrimaryCount(nextClusters);
      const totalPredicted = signalPredictedCount + datasetPredictedCount;

      setDataset((current) => ({
        ...current,
        clusters: nextClusters,
        metadata: {
          ...(current.metadata || {}),
          predictionDataset: predictionDataset || current.metadata?.predictionDataset
        }
      }));

      if (totalPredicted > 0) {
        setNotice(formatPredictionMessage({
          signalPredictedCount,
          datasetPredictedCount,
          datasetName: predictionDataset,
          remainingMissing
        }));

        if (backendErrorMessage) {
          setError(
            `Applied the current signal-data predictions, but backend fallback failed: ${backendErrorMessage}`
          );
        }
        return;
      }

      if (signalResult.hasSignal && backendAttempted) {
        setError(
          `No missing primary channels could be predicted from the current signal data or the loaded dataset${predictionDataset ? ` (${predictionDataset})` : ''}.`
        );
      } else if (signalResult.hasSignal) {
        setError('No missing primary channels could be predicted from the current signal data.');
      } else {
        setError(
          `No missing primary channels could be predicted from the loaded dataset${predictionDataset ? ` (${predictionDataset})` : ''}.`
        );
      }
    } catch (predictionError) {
      setError(predictionError?.message || 'Unable to predict primary channels.');
    } finally {
      setIsPredicting(false);
    }
  };

  const handleClusterSelect = (cluster, event, forceAdditive = false) => {
    if (typeof onClusterSelect === 'function') {
      onClusterSelect(
        {
          ...cluster,
          datasetName: dataset.name,
          datasetMetadata: dataset.metadata
        },
        {
          additive: forceAdditive || Boolean(
            event?.ctrlKey || event?.metaKey || event?.shiftKey
          )
        }
      );
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
        <label className="curator-filter-control">
          <span>Minimum spikes</span>
          <input
            type="number"
            min="0"
            step="1"
            value={minimumSpikeCount}
            onChange={(event) => setMinimumSpikeCount(event.target.value)}
            onBlur={() => setMinimumSpikeCount(normalizeMinimumSpikeCount(minimumSpikeCount))}
            title="Hide clusters with fewer spikes than this value"
          />
        </label>
        <label className="curator-filter-control">
          <span>Spike-time unit</span>
          <select
            value={spikeTimeUnit}
            onChange={(event) => setSpikeTimeUnit(event.target.value)}
            title="Choose how spike timestamps in the cluster file should be interpreted"
          >
            <option value="auto">Auto</option>
            <option value="samples">Samples</option>
            <option value="seconds">Seconds</option>
            <option value="milliseconds">Milliseconds</option>
          </select>
        </label>
        <button
          type="button"
          className="curator-action-button"
          onClick={handlePredictPrimaryChannels}
          disabled={!summary.totalClusters || isPredicting || !summary.missingPrimary}
        >
          Predict Primary Channels
        </button>
      </div>

      <div className="curator-selection-controls">
        <span>
          {selectedClusters.length.toLocaleString()} selected
        </span>
        <button
          type="button"
          onClick={() => onSelectedClustersChange?.(getCuratorClusterIds(activeClusters))}
          disabled={!activeClusters.length}
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onSelectedClustersChange?.([])}
          disabled={!selectedClusters.length}
        >
          Deselect all
        </button>
      </div>

      {error && (
        <div className="curator-message curator-message-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="curator-message curator-message-success">
          {notice}
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
          <span>Active clusters</span>
          <strong title={`${summary.filteredClusters} filtered out`}>
            {summary.activeClusters} / {summary.totalClusters}
          </strong>
        </div>
        <div className="curator-summary-card">
          <span>Active spikes</span>
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
              <th aria-label="Selected" />
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
                <td colSpan={7} className="curator-empty-state">
                  {summary.totalClusters
                    ? `No clusters have at least ${normalizeMinimumSpikeCount(minimumSpikeCount).toLocaleString()} spikes.`
                    : 'Load a cluster file to inspect clusters.'}
                </td>
              </tr>
            )}
            {sortedClusters.map((cluster) => {
              const selected = selectedClusters.some(
                (clusterId) => String(clusterId) === String(cluster.id)
              );

              return (
                <tr
                  key={cluster.id}
                  className={selected ? 'selected' : ''}
                  onClick={(event) => handleClusterSelect(cluster, event)}
                >
                <td>
                  <input
                    type="checkbox"
                    checked={selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => handleClusterSelect(cluster, event, true)}
                    aria-label={`Select cluster ${cluster.id}`}
                  />
                </td>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CuratorWidget;
