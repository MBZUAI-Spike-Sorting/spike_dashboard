import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import './ClusterComparisonWidget.css';

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeCluster = (cluster, index) => {
  const rawSpikeTimes = cluster?.spikeTimes ?? cluster?.spike_times ?? cluster?.times ?? [];
  const spikeTimes = Array.isArray(rawSpikeTimes)
    ? rawSpikeTimes.map(toNumber).filter((value) => value !== null)
    : [];

  return {
    id: String(cluster?.id ?? cluster?.clusterId ?? cluster?.cluster_id ?? index),
    primaryChannel: cluster?.primaryChannel ?? cluster?.primary_channel ?? null,
    spikeTimes: spikeTimes.sort((a, b) => a - b)
  };
};

const normalizeDataset = (dataset, fallbackName) => {
  const payload = dataset?.data && typeof dataset.data === 'object' ? dataset.data : dataset;
  const metadata = dataset?.metadata && typeof dataset.metadata === 'object' ? dataset.metadata : {};
  const clusters = Array.isArray(payload?.clusters)
    ? payload.clusters
        .map(normalizeCluster)
        .filter((cluster) => cluster.spikeTimes.length > 0)
    : [];

  return {
    algorithmName:
      payload?.algorithmName ||
      payload?.algorithm_name ||
      metadata.algorithmName ||
      metadata.algorithm_name ||
      metadata.source ||
      fallbackName,
    clusters
  };
};

const countMatches = (leftTimes, rightTimes, windowSamples) => {
  let leftIndex = 0;
  let rightIndex = 0;
  let matches = 0;

  while (leftIndex < leftTimes.length && rightIndex < rightTimes.length) {
    const left = leftTimes[leftIndex];
    const right = rightTimes[rightIndex];
    const difference = left - right;

    if (Math.abs(difference) <= windowSamples) {
      matches += 1;
      leftIndex += 1;
      rightIndex += 1;
    } else if (difference < 0) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return matches;
};

const canCompareByChannel = (leftCluster, rightCluster) => {
  if (leftCluster.primaryChannel === null || leftCluster.primaryChannel === undefined) {
    return true;
  }
  if (rightCluster.primaryChannel === null || rightCluster.primaryChannel === undefined) {
    return true;
  }
  return String(leftCluster.primaryChannel) === String(rightCluster.primaryChannel);
};

const getChannelLabel = (leftCluster, rightCluster) => {
  const channel = leftCluster?.primaryChannel ?? rightCluster?.primaryChannel;
  return channel === null || channel === undefined || channel === '' ? 'Any' : String(channel);
};

const calculateMetrics = (matchingSpikes, referenceTotal, comparisonTotal) => {
  const unmatchedReference = Math.max(0, referenceTotal - matchingSpikes);
  const unmatchedComparison = Math.max(0, comparisonTotal - matchingSpikes);
  const union = matchingSpikes + unmatchedReference + unmatchedComparison;

  return {
    matchingSpikes,
    unmatchedReference,
    unmatchedComparison,
    precision: comparisonTotal > 0 ? matchingSpikes / comparisonTotal : 0,
    recall: referenceTotal > 0 ? matchingSpikes / referenceTotal : 0,
    agreement: union > 0 ? matchingSpikes / union : 0
  };
};

const compareDatasets = ({ algorithmA, algorithmB, reference, windowSamples }) => {
  const referenceDataset = reference === 'b' ? algorithmB : algorithmA;
  const comparisonDataset = reference === 'b' ? algorithmA : algorithmB;
  const comparisonUsed = new Set();
  const rows = [];

  referenceDataset.clusters.forEach((referenceCluster) => {
    let best = null;

    comparisonDataset.clusters.forEach((candidateCluster) => {
      if (comparisonUsed.has(candidateCluster.id)) return;
      if (!canCompareByChannel(referenceCluster, candidateCluster)) return;

      const matchingSpikes = countMatches(
        referenceCluster.spikeTimes,
        candidateCluster.spikeTimes,
        windowSamples
      );
      const metrics = calculateMetrics(
        matchingSpikes,
        referenceCluster.spikeTimes.length,
        candidateCluster.spikeTimes.length
      );

      if (
        !best ||
        metrics.agreement > best.metrics.agreement ||
        (
          metrics.agreement === best.metrics.agreement &&
          matchingSpikes > best.metrics.matchingSpikes
        )
      ) {
        best = {
          cluster: candidateCluster,
          metrics
        };
      }
    });

    if (best && best.metrics.matchingSpikes > 0) {
      comparisonUsed.add(best.cluster.id);
      rows.push({
        id: `${referenceCluster.id}-${best.cluster.id}`,
        channel: getChannelLabel(referenceCluster, best.cluster),
        referenceCluster,
        comparisonCluster: best.cluster,
        ...best.metrics,
        matched: true
      });
    } else {
      rows.push({
        id: `${referenceCluster.id}-unmatched`,
        channel: getChannelLabel(referenceCluster, null),
        referenceCluster,
        comparisonCluster: null,
        ...calculateMetrics(0, referenceCluster.spikeTimes.length, 0),
        matched: false
      });
    }
  });

  comparisonDataset.clusters.forEach((comparisonCluster) => {
    if (comparisonUsed.has(comparisonCluster.id)) return;

    rows.push({
      id: `unmatched-${comparisonCluster.id}`,
      channel: getChannelLabel(null, comparisonCluster),
      referenceCluster: null,
      comparisonCluster,
      ...calculateMetrics(0, 0, comparisonCluster.spikeTimes.length),
      matched: false
    });
  });

  return rows.sort((left, right) => {
    if (left.channel !== right.channel) {
      return String(left.channel).localeCompare(String(right.channel), undefined, { numeric: true });
    }
    return right.agreement - left.agreement;
  });
};

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;

const SORT_COLUMNS = [
  { key: 'channel', label: 'Channel', type: 'string' },
  { key: 'referenceClusterId', label: 'Reference', type: 'string' },
  { key: 'comparisonClusterId', label: 'Comparison', type: 'string' },
  { key: 'matchingSpikes', label: 'Matches', type: 'number' },
  { key: 'unmatchedReference', label: 'Ref-only', type: 'number' },
  { key: 'unmatchedComparison', label: 'Comp-only', type: 'number' },
  { key: 'precision', label: 'Precision', type: 'number' },
  { key: 'recall', label: 'Recall', type: 'number' },
  { key: 'agreement', label: 'Agreement', type: 'number' }
];

const getSortValue = (row, key) => {
  if (key === 'referenceClusterId') return row.referenceCluster?.id || '';
  if (key === 'comparisonClusterId') return row.comparisonCluster?.id || '';
  return row[key];
};

const ClusterComparisonWidget = ({
  algorithmAData,
  algorithmBData
}) => {
  const [algorithmA, setAlgorithmA] = useState(() =>
    normalizeDataset(algorithmAData, 'Algorithm 1')
  );
  const [algorithmB, setAlgorithmB] = useState(() =>
    normalizeDataset(algorithmBData, 'Algorithm 2')
  );
  const [reference, setReference] = useState('a');
  const [windowSamples, setWindowSamples] = useState(2);
  const [sortConfig, setSortConfig] = useState({ key: 'agreement', direction: 'desc' });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (algorithmAData) {
      setAlgorithmA(normalizeDataset(algorithmAData, 'Algorithm 1'));
    }
  }, [algorithmAData]);

  useEffect(() => {
    if (algorithmBData) {
      setAlgorithmB(normalizeDataset(algorithmBData, 'Algorithm 2'));
    }
  }, [algorithmBData]);

  const rows = useMemo(() => {
    if (algorithmA.clusters.length === 0 || algorithmB.clusters.length === 0) {
      return [];
    }

    return compareDatasets({
      algorithmA,
      algorithmB,
      reference,
      windowSamples: Math.max(0, Number(windowSamples) || 0)
    });
  }, [algorithmA, algorithmB, reference, windowSamples]);

  const summary = useMemo(() => {
    const matchingSpikes = rows.reduce((sum, row) => sum + row.matchingSpikes, 0);
    const unmatchedReference = rows.reduce((sum, row) => sum + row.unmatchedReference, 0);
    const unmatchedComparison = rows.reduce((sum, row) => sum + row.unmatchedComparison, 0);
    const matchedRows = rows.filter((row) => row.matched).length;
    const totals = calculateMetrics(
      matchingSpikes,
      matchingSpikes + unmatchedReference,
      matchingSpikes + unmatchedComparison
    );

    return {
      matchedRows,
      ...totals
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const column = SORT_COLUMNS.find((item) => item.key === sortConfig.key);
    if (!column) return rows;

    return [...rows].sort((left, right) => {
      const leftValue = getSortValue(left, column.key);
      const rightValue = getSortValue(right, column.key);
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (column.type === 'number') {
        return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
      }

      return String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
        sensitivity: 'base'
      }) * direction;
    });
  }, [rows, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleFileUpload = (side) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await apiClient.parseClusterComparisonFile(file);
      const dataset = normalizeDataset(response.data?.dataset, file.name);

      if (side === 'a') {
        setAlgorithmA(dataset);
      } else {
        setAlgorithmB(dataset);
      }
    } catch (uploadError) {
      setError(uploadError.message || 'Failed to parse cluster file');
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  };

  const referenceDataset = reference === 'a' ? algorithmA : algorithmB;
  const comparisonDataset = reference === 'a' ? algorithmB : algorithmA;

  return (
    <div className="cluster-comparison-widget">
      <div className="cluster-comparison-toolbar">
        <label className="cluster-file-picker">
          <span>Algorithm 1</span>
          <input
            type="file"
            accept=".json,.mat"
            onChange={handleFileUpload('a')}
            disabled={isUploading}
          />
          <strong>{algorithmA.algorithmName}</strong>
          <em>{algorithmA.clusters.length} clusters</em>
        </label>

        <label className="cluster-file-picker">
          <span>Algorithm 2</span>
          <input
            type="file"
            accept=".json,.mat"
            onChange={handleFileUpload('b')}
            disabled={isUploading}
          />
          <strong>{algorithmB.algorithmName}</strong>
          <em>{algorithmB.clusters.length} clusters</em>
        </label>

        <label className="cluster-window-control">
          <span>Window</span>
          <input
            type="number"
            min="0"
            step="1"
            value={windowSamples}
            onChange={(event) => setWindowSamples(event.target.value)}
          />
        </label>

        <div className="cluster-reference-control">
          <span>Reference</span>
          <label>
            <input
              type="radio"
              name="cluster-comparison-reference"
              value="a"
              checked={reference === 'a'}
              onChange={() => setReference('a')}
            />
            Algorithm 1
          </label>
          <label>
            <input
              type="radio"
              name="cluster-comparison-reference"
              value="b"
              checked={reference === 'b'}
              onChange={() => setReference('b')}
            />
            Algorithm 2
          </label>
        </div>
      </div>

      {error && <div className="cluster-comparison-error">{error}</div>}

      <div className="cluster-comparison-summary">
        <div>
          <span>Reference</span>
          <strong>{referenceDataset.algorithmName}</strong>
        </div>
        <div>
          <span>Compared with</span>
          <strong>{comparisonDataset.algorithmName}</strong>
        </div>
        <div>
          <span>Matched pairs</span>
          <strong>{summary.matchedRows}</strong>
        </div>
        <div>
          <span>Precision</span>
          <strong>{formatPercent(summary.precision)}</strong>
        </div>
        <div>
          <span>Recall</span>
          <strong>{formatPercent(summary.recall)}</strong>
        </div>
        <div>
          <span>Agreement</span>
          <strong>{formatPercent(summary.agreement)}</strong>
        </div>
      </div>

      <div className="cluster-comparison-table-wrap">
        <table className="cluster-comparison-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  aria-sort={
                    sortConfig.key === column.key
                      ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="cluster-comparison-sort"
                    onClick={() => handleSort(column.key)}
                  >
                    <span>
                      {column.key === 'referenceClusterId'
                        ? referenceDataset.algorithmName
                        : column.key === 'comparisonClusterId'
                          ? comparisonDataset.algorithmName
                          : column.label}
                    </span>
                    <span className="cluster-comparison-sort-icon">
                      {sortConfig.key === column.key
                        ? (sortConfig.direction === 'asc' ? 'Up' : 'Down')
                        : 'Sort'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={SORT_COLUMNS.length} className="cluster-comparison-empty">
                  Load two cluster files to compare.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className={row.matched ? 'matched' : 'unmatched'}>
                  <td>{row.channel}</td>
                  <td>{row.referenceCluster?.id || '-'}</td>
                  <td>{row.comparisonCluster?.id || '-'}</td>
                  <td>{row.matchingSpikes}</td>
                  <td>{row.unmatchedReference}</td>
                  <td>{row.unmatchedComparison}</td>
                  <td>{formatPercent(row.precision)}</td>
                  <td>{formatPercent(row.recall)}</td>
                  <td>{formatPercent(row.agreement)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClusterComparisonWidget;
