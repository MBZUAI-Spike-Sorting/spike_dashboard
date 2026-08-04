import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { buildLocalClusterSimilarities } from '../utils/clusterDiagnostics';
import { getAvailableDiagnosticClusterIds } from '../utils/diagnosticClusterSelection';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';
import './SimilarityTableWidget.css';

const SOURCE_LABELS = {
  sorter_template: 'Sorter template similarity',
  mean_waveform_channel: 'Mean waveform + channel distance',
  feature_centroid_channel: 'Feature centroid + channel distance',
  channel_distance: 'Channel distance fallback',
  mixed_fallback: 'Mixed available fallbacks',
  unavailable: 'Unavailable',
};

const formatScore = (value) => (
  Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—'
);

const SimilarityTableWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  clusterData = null,
  clusterWaveforms = {},
  clusteringResults = null,
  clusterStats = {},
  clusterAnnotations = {},
  selectedAlgorithm = '',
  demoMode = false,
  onClusterPairSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const allClusterIds = useMemo(() => getAvailableDiagnosticClusterIds({
    availableClusterIds,
    clusterData,
    clusteringResults,
  }), [availableClusterIds, clusterData, clusteringResults]);
  const [primaryClusterId, setPrimaryClusterId] = useState(null);
  const [maxCandidates, setMaxCandidates] = useState(20);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const secondaryClusterId = linkedSelectedClusters[1];

  useEffect(() => {
    onLoadingChange?.('similarityTable', loading, 'Ranking similar clusters…');
  }, [loading, onLoadingChange]);

  useEffect(() => {
    setPrimaryClusterId(null);
  }, [selectedAlgorithm]);

  useEffect(() => {
    const available = new Set(allClusterIds.map(String));
    setPrimaryClusterId((current) => (
      current !== null && available.has(String(current))
        ? current
        : allClusterIds[0] ?? null
    ));
  }, [allClusterIds]);

  useEffect(() => {
    const linkedPrimary = linkedSelectedClusters[0];
    if (
      linkedPrimary !== undefined
      && allClusterIds.some((clusterId) => String(clusterId) === String(linkedPrimary))
    ) {
      setPrimaryClusterId(linkedPrimary);
    }
  }, [allClusterIds, linkedSelectedClusters]);

  useEffect(() => {
    if (primaryClusterId === null || primaryClusterId === undefined) {
      setResult(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          'cluster-similarity',
          primaryClusterId,
          allClusterIds,
          maxCandidates,
          selectedAlgorithm,
          demoMode ? getSessionObjectId(clusterWaveforms || clusterData) : 'api',
        ]);
        const next = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildLocalClusterSimilarities({
              clusterData,
              clusterWaveforms,
              primaryClusterId,
              candidateClusterIds: allClusterIds,
              maxCandidates,
            })
          : apiClient.getClusterSimilarities({
              primaryClusterId,
              candidateClusterIds: allClusterIds,
              algorithm: selectedAlgorithm,
              maxCandidates,
              maxSpikesPerCluster: 100,
              windowSamples: 15,
            }));
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to rank similar clusters.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [
    allClusterIds,
    clusterData,
    clusterWaveforms,
    dataCacheScope,
    demoMode,
    maxCandidates,
    primaryClusterId,
    selectedAlgorithm,
  ]);

  const choosePair = (candidateId) => {
    if (primaryClusterId === null || candidateId === undefined) return;
    onClusterPairSelect?.(primaryClusterId, candidateId);
  };

  return (
    <div className="similarity-table-widget">
      <div className="similarity-toolbar">
        <label>Primary
          <select
            value={primaryClusterId ?? ''}
            onChange={(event) => {
              const selected = allClusterIds.find(
                (clusterId) => String(clusterId) === event.target.value
              );
              setPrimaryClusterId(selected ?? null);
            }}
          >
            {allClusterIds.map((clusterId) => (
              <option key={clusterId} value={String(clusterId)}>Cluster {clusterId}</option>
            ))}
          </select>
        </label>
        <label>Show
          <select value={maxCandidates} onChange={(event) => setMaxCandidates(Number(event.target.value))}>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
          </select>
        </label>
        <span className="similarity-source">
          {SOURCE_LABELS[result?.source] || result?.source || 'Waiting for data'}
        </span>
      </div>

      <div className="similarity-table-content">
        {primaryClusterId === null ? (
          <div className="similarity-message">Choose a primary cluster to rank merge candidates.</div>
        ) : error ? (
          <div className="similarity-message similarity-error">{error}</div>
        ) : loading && !result ? (
          <div className="similarity-message">Ranking similar clusters…</div>
        ) : !(result?.candidates || []).length ? (
          <div className="similarity-message">No candidate clusters are available.</div>
        ) : (
          <table className="similarity-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cluster</th>
                <th>Similarity</th>
                <th>Waveform</th>
                <th>Feature</th>
                <th>Δ channel</th>
                <th>Spikes</th>
                <th>Group</th>
                <th aria-label="Review action" />
              </tr>
            </thead>
            <tbody>
              {result.candidates.map((candidate, index) => {
                const isSecondary = String(candidate.clusterId) === String(secondaryClusterId);
                const stats = clusterStats[candidate.clusterId] || clusterStats[String(candidate.clusterId)] || {};
                const annotation = clusterAnnotations[candidate.clusterId] || clusterAnnotations[String(candidate.clusterId)] || {};
                return (
                  <tr
                    key={candidate.clusterId}
                    className={isSecondary ? 'similarity-row-selected' : ''}
                    onClick={() => choosePair(candidate.clusterId)}
                  >
                    <td>{index + 1}</td>
                    <td><strong>C{candidate.clusterId}</strong></td>
                    <td>
                      <div className="similarity-score-cell">
                        <span>{formatScore(candidate.similarity)}</span>
                        <span className="similarity-meter" aria-hidden="true">
                          <span style={{ width: `${Math.max(0, Math.min(100, Number(candidate.similarity || 0) * 100))}%` }} />
                        </span>
                      </div>
                    </td>
                    <td>{formatScore(candidate.waveformSimilarity ?? candidate.sorterSimilarity)}</td>
                    <td>{formatScore(candidate.featureSimilarity)}</td>
                    <td>{candidate.channelDistance ?? '—'}</td>
                    <td>{candidate.numSpikes ?? stats.numSpikes ?? '—'}</td>
                    <td>{annotation.group || stats.group || stats.quality || '—'}</td>
                    <td><button type="button" onClick={(event) => { event.stopPropagation(); choosePair(candidate.clusterId); }}>Compare</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="similarity-footer">
        Pair: C{primaryClusterId ?? '—'} → C{secondaryClusterId ?? '—'} · selecting a row updates linked diagnostics
      </div>
    </div>
  );
};

export default SimilarityTableWidget;
