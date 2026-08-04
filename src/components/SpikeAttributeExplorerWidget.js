import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from '../utils/diagnosticClusterSelection';
import {
  buildLocalSpikeAttributePayload,
  getSpikeAttributeSelection,
} from '../utils/spikeAttributes';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';
import DiagnosticClusterPicker from './DiagnosticClusterPicker';
import './ClusterDiagnosticWidgets.css';
import './SpikeAttributeExplorerWidget.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 72%, 64%)`;

const SpikeAttributeExplorerWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  clusterData = null,
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  curationSpikeSelection = [],
  onCurationSelectionChange,
  onSpikeSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [clusterIds, setClusterIds] = useState([]);
  const [attributeId, setAttributeId] = useState('');
  const [maxSpikes, setMaxSpikes] = useState(5000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sampleRateHz = Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000);
  const allClusterIds = useMemo(() => getAvailableDiagnosticClusterIds({
    availableClusterIds,
    clusterData,
    clusteringResults,
  }), [availableClusterIds, clusterData, clusteringResults]);

  useEffect(() => {
    setClusterIds([]);
    setAttributeId('');
  }, [selectedAlgorithm]);
  useEffect(() => {
    setClusterIds((current) => reconcileDiagnosticClusterIds(current, allClusterIds, 12));
  }, [allClusterIds]);
  useEffect(() => {
    const linkedIds = getLinkedDiagnosticClusterIds(linkedSelectedClusters, allClusterIds, 12);
    if (linkedIds) setClusterIds(linkedIds);
  }, [allClusterIds, linkedSelectedClusters]);
  useEffect(() => {
    onLoadingChange?.('spikeAttributeExplorer', loading, 'Loading spike attribute…');
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (clusterIds.length === 0) {
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
          'spike-attribute-explorer',
          clusterIds,
          attributeId,
          maxSpikes,
          demoMode ? getSessionObjectId(clusteringResults || clusterData) : selectedAlgorithm,
        ]);
        const payload = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildLocalSpikeAttributePayload({
              clusterIds,
              clusterData,
              clusteringResults,
              attributeId,
              sampleRateHz,
              maxSpikesPerCluster: maxSpikes,
            })
          : apiClient.getSpikeAttributes({
              clusterIds,
              algorithm: selectedAlgorithm,
              attributeId,
              maxSpikesPerCluster: maxSpikes,
            }));
        if (!cancelled) {
          setResult(payload);
          setAttributeId(payload.selectedAttributeId || '');
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load spike attributes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [
    attributeId,
    clusterData,
    clusterIds,
    clusteringResults,
    dataCacheScope,
    demoMode,
    maxSpikes,
    sampleRateHz,
    selectedAlgorithm,
  ]);

  const definition = result?.attributeDefinition;
  const selectedIds = useMemo(() => new Set(curationSpikeSelection.map((point) => (
    point.spikeId || `${point.clusterId}:${point.spikeIndex ?? point.pointIndex}`
  ))), [curationSpikeSelection]);
  const traces = useMemo(() => (result?.series || []).map((series) => {
    const points = series.points || [];
    const selectedpoints = selectedIds.size > 0
      ? points.map((point, index) => selectedIds.has(point.spikeId) ? index : null)
        .filter((index) => index !== null)
      : undefined;
    const scalar = definition?.shape === 'scalar';
    return {
      x: points.map((point) => scalar ? point.timeSeconds : point.values.x),
      y: points.map((point) => scalar ? point.values.value : point.values.y),
      customdata: points,
      selectedpoints,
      type: 'scattergl',
      mode: 'markers',
      name: `Cluster ${series.clusterId}`,
      marker: { color: colorFor(series.clusterId), size: 5, opacity: 0.72 },
      selected: { marker: { color: '#ffffff', size: 9, opacity: 1 } },
      unselected: { marker: { opacity: 0.38 } },
      hovertemplate: `Cluster ${series.clusterId}<br>%{customdata.spikeId}<br>%{x:.4g}, %{y:.4g}<extra></extra>`,
    };
  }), [definition, result, selectedIds]);
  const source = definition?.provenance?.source?.replace(/_/g, ' ') || 'no compatible attribute';
  const xLabel = definition?.shape === 'scalar'
    ? 'Recording time (s)'
    : definition?.dimensions?.[0]?.label || 'X';
  const yDimension = definition?.shape === 'scalar'
    ? definition?.dimensions?.[0]
    : definition?.dimensions?.[1];
  const yLabel = yDimension
    ? `${yDimension.label}${yDimension.unit ? ` (${yDimension.unit})` : ''}`
    : 'Value';

  return (
    <div className="cluster-diagnostic-widget spike-attribute-widget">
      <div className="diagnostic-toolbar spike-attribute-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={12}
          onChange={setClusterIds}
        />
        <label>Attribute
          <select value={attributeId} onChange={(event) => setAttributeId(event.target.value)}>
            {(result?.attributeDefinitions || []).map((attribute) => (
              <option key={attribute.id} value={attribute.id}>{attribute.label}</option>
            ))}
          </select>
        </label>
        <label>Max / cluster
          <select value={maxSpikes} onChange={(event) => setMaxSpikes(Number(event.target.value))}>
            <option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option><option value={20000}>20,000</option>
          </select>
        </label>
        <button type="button" onClick={() => onCurationSelectionChange?.([])}>Clear points</button>
        <span className="diagnostic-summary">{source} · {curationSpikeSelection.length} selected</span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0 ? <div className="diagnostic-empty">Choose clusters to discover retained spike attributes.</div>
          : error ? <div className="diagnostic-error">{error}</div>
          : loading && !result ? <div className="diagnostic-loading">Loading spike attribute…</div>
          : !definition ? <div className="diagnostic-empty">No compatible scalar or two-dimensional spike attributes were retained.</div>
          : <div className="spike-attribute-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: `${clusterIds.join(',')}:${attributeId}`,
                dragmode: 'lasso',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 62, r: 18, t: 24, b: 54 },
                xaxis: { title: xLabel, gridcolor: 'rgba(148,163,184,.13)' },
                yaxis: { title: yLabel, gridcolor: 'rgba(148,163,184,.13)' },
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onSelected={(plotEvent) => onCurationSelectionChange?.(
                getSpikeAttributeSelection(plotEvent)
              )}
              onDeselect={() => onCurationSelectionChange?.([])}
              onClick={(plotEvent) => {
                const point = plotEvent?.points?.[0]?.customdata;
                if (!point?.spikeId) return;
                onCurationSelectionChange?.([point]);
                onSpikeSelect?.({ ...point, time: point.timeSamples });
              }}
            />
          </div>}
      </div>
    </div>
  );
};

export default SpikeAttributeExplorerWidget;
