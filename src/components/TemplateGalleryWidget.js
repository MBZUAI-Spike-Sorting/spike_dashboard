import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { buildLocalTemplateGallery } from '../utils/templateGallery';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';
import './PopulationViews.css';

const MAX_GALLERY_CLUSTERS = 500;

export const buildTemplatePath = (values, width = 180, height = 78) => {
  if (!Array.isArray(values) || values.length < 2) return '';
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, 1e-9);
  return values.map((value, index) => {
    const x = index * width / (values.length - 1);
    const y = height - 6 - ((value - low) / span) * (height - 12);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
};

const TemplateGalleryWidget = ({
  visibleClusterIds = [],
  selectedClusters = [],
  clusterData = null,
  clusterWaveforms = {},
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  onClusterSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [windowSamples, setWindowSamples] = useState(30);
  const [maxWaveforms, setMaxWaveforms] = useState(64);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestedIds = useMemo(() => visibleClusterIds.slice(0, MAX_GALLERY_CLUSTERS), [visibleClusterIds]);
  const selectedKeys = useMemo(() => new Set(selectedClusters.map(String)), [selectedClusters]);
  const sampleRateHz = Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000);

  useEffect(() => {
    onLoadingChange?.('templateGallery', loading, 'Building template gallery…');
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (requestedIds.length === 0) {
      setResult({ clusterIds: [], templates: [] });
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
          'template-gallery',
          requestedIds,
          windowSamples,
          maxWaveforms,
          demoMode ? getSessionObjectId(clusterWaveforms || clusterData) : selectedAlgorithm,
        ]);
        const payload = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildLocalTemplateGallery({
              clusterIds: requestedIds,
              clusterData,
              clusterWaveforms,
              sampleRateHz,
            })
          : apiClient.getClusterTemplates({
              clusterIds: requestedIds,
              algorithm: selectedAlgorithm,
              windowSamples,
              maxWaveforms,
            }));
        if (!cancelled) setResult(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to build template gallery.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [
    clusterData,
    clusterWaveforms,
    dataCacheScope,
    demoMode,
    maxWaveforms,
    requestedIds,
    sampleRateHz,
    selectedAlgorithm,
    windowSamples,
  ]);

  const templatesById = useMemo(() => new Map(
    (result?.templates || []).map((template) => [String(template.clusterId), template])
  ), [result]);
  const templates = requestedIds.map((clusterId) => templatesById.get(String(clusterId)) || {
    clusterId,
    template: [],
    source: 'unavailable',
  });

  return (
    <div className="population-view-widget">
      <div className="population-toolbar">
        <label>Window
          <select value={windowSamples} onChange={(event) => setWindowSamples(Number(event.target.value))}>
            <option value={15}>±15 samples</option><option value={30}>±30 samples</option><option value={60}>±60 samples</option>
          </select>
        </label>
        <label>Mean from
          <select value={maxWaveforms} onChange={(event) => setMaxWaveforms(Number(event.target.value))}>
            <option value={16}>16 spikes</option><option value={64}>64 spikes</option><option value={128}>128 spikes</option>
          </select>
        </label>
        <span>Order and membership follow the Cluster Curation Table.</span>
        <span className="population-summary">
          {visibleClusterIds.length > requestedIds.length ? `first ${requestedIds.length} / ` : ''}{visibleClusterIds.length} clusters
        </span>
      </div>
      <div className="population-content">
        {error ? <div className="population-message population-error">{error}</div>
          : requestedIds.length === 0 ? <div className="population-message">No clusters match the current table filter.</div>
          : loading && !result ? <div className="population-message">Building template gallery…</div>
          : <div className="template-gallery-grid">
            {templates.map((template) => {
              const selected = selectedKeys.has(String(template.clusterId));
              const path = buildTemplatePath(template.template);
              return (
                <button
                  key={String(template.clusterId)}
                  type="button"
                  className={`template-gallery-card ${selected ? 'selected' : ''}`}
                  onClick={(event) => onClusterSelect?.(template.clusterId, {
                    additive: Boolean(event.ctrlKey || event.metaKey || event.shiftKey),
                  })}
                >
                  <span className="template-card-heading">
                    <strong>Cluster {template.clusterId}</strong>
                    <span>ch {template.peakChannel ?? '—'}</span>
                  </span>
                  <svg viewBox="0 0 180 78" preserveAspectRatio="none" role="img" aria-label={`Template for cluster ${template.clusterId}`}>
                    <line x1="0" x2="180" y1="39" y2="39" />
                    {path ? <path d={path} /> : <text x="90" y="43">No waveform</text>}
                  </svg>
                  <span className="template-card-footer">
                    <span>{template.source === 'retained_template' ? 'retained template' : template.source === 'unavailable' ? 'unavailable' : 'mean waveform'}</span>
                    <span>n={Number(template.numSpikes || 0).toLocaleString()}</span>
                  </span>
                </button>
              );
            })}
          </div>}
      </div>
    </div>
  );
};

export default TemplateGalleryWidget;
