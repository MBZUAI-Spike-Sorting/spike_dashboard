import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import useFeatureViewData from '../hooks/useFeatureViewData';
import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from '../utils/diagnosticClusterSelection';
import DiagnosticClusterPicker from './DiagnosticClusterPicker';
import { getFeatureSelectionFromPlotEvent } from '../utils/featureViews';
import './ClusterDiagnosticWidgets.css';
import './FeatureViews.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 72%, 64%)`;

const TemplateFeaturePairWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  selectedChannels = [],
  clusterData = null,
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  curationSpikeSelection = [],
  onCurationSelectionChange,
  onSpikeSelect,
  onClusterPairSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [clusterIds, setClusterIds] = useState([]);
  const [maxSpikes, setMaxSpikes] = useState(5000);
  const allClusterIds = useMemo(() => getAvailableDiagnosticClusterIds({
    availableClusterIds,
    clusterData,
    clusteringResults,
  }), [availableClusterIds, clusterData, clusteringResults]);

  useEffect(() => { setClusterIds([]); }, [selectedAlgorithm]);
  useEffect(() => {
    setClusterIds((current) => reconcileDiagnosticClusterIds(current, allClusterIds, 2));
  }, [allClusterIds]);
  useEffect(() => {
    const linkedIds = getLinkedDiagnosticClusterIds(linkedSelectedClusters, allClusterIds, 2);
    if (linkedIds) setClusterIds(linkedIds);
  }, [allClusterIds, linkedSelectedClusters]);

  const changePair = (next) => {
    setClusterIds(next);
    if (next.length === 2) onClusterPairSelect?.(next[0], next[1]);
  };
  const { result, loading, error } = useFeatureViewData({
    widgetId: 'templateFeaturePair',
    loadingMessage: 'Extracting pair features…',
    clusterIds,
    selectedChannels,
    maxSpikesPerCluster: maxSpikes,
    includeBackground: false,
    clusterData,
    clusteringResults,
    selectedAlgorithm,
    datasetInfo,
    demoMode,
    dataCacheScope,
    onLoadingChange,
  });

  const dimensionIds = useMemo(() => new Set(
    (result?.dimensions || []).map((dimension) => dimension.id)
  ), [result]);
  const axes = useMemo(() => {
    if (dimensionIds.has('templateFeature1') && dimensionIds.has('templateFeature2')) {
      return ['templateFeature1', 'templateFeature2'];
    }
    const x = dimensionIds.has('pairProjection') ? 'pairProjection' : 'pc1';
    const y = dimensionIds.has('pc2') ? 'pc2'
      : dimensionIds.has('timeSeconds') ? 'timeSeconds'
      : [...dimensionIds].find((id) => id !== x);
    return [x, y];
  }, [dimensionIds]);
  const metadata = useMemo(() => Object.fromEntries(
    (result?.dimensions || []).map((dimension) => [dimension.id, dimension])
  ), [result]);
  const selectedSpikeIds = useMemo(() => new Set(
    curationSpikeSelection.map((spike) => spike.spikeId || `${spike.clusterId}:${spike.spikeIndex ?? spike.pointIndex}`)
  ), [curationSpikeSelection]);
  const traces = useMemo(() => (result?.series || []).map((series) => ({
    x: (series.points || []).map((point) => point.values[axes[0]] ?? null),
    y: (series.points || []).map((point) => point.values[axes[1]] ?? null),
    customdata: series.points || [],
    selectedpoints: selectedSpikeIds.size > 0
      ? (series.points || [])
          .map((point, index) => selectedSpikeIds.has(point.spikeId) ? index : null)
          .filter((index) => index !== null)
      : undefined,
    type: 'scattergl',
    mode: 'markers',
    name: `Cluster ${series.clusterId}`,
    marker: { color: colorFor(series.clusterId), size: 5, opacity: 0.7 },
    selected: { marker: { color: '#ffffff', size: 9, opacity: 1 } },
    unselected: { marker: { opacity: 0.35 } },
    hovertemplate: `Cluster ${series.clusterId}<br>%{customdata.spikeId}<br>%{x:.4g}, %{y:.4g}<extra></extra>`,
  })), [axes, result, selectedSpikeIds]);

  const publishSelection = (plotEvent) => {
    onCurationSelectionChange?.(getFeatureSelectionFromPlotEvent(plotEvent));
  };
  const sourceLabel = result?.pairFeatureSource === 'retained_template_features'
    ? 'Retained sorter template features'
    : result?.pairFeatureSource === 'pca_centroid_axis'
    ? 'Deterministic PCA pair axis'
    : 'Available retained features';

  return (
    <div className="cluster-diagnostic-widget feature-view-widget">
      <div className="diagnostic-toolbar feature-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={2}
          onChange={changePair}
        />
        <label>Max spikes
          <select value={maxSpikes} onChange={(event) => setMaxSpikes(Number(event.target.value))}>
            <option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option>
          </select>
        </label>
        <button type="button" onClick={() => onCurationSelectionChange?.([])}>Clear points</button>
        <span className="diagnostic-summary">{sourceLabel} · {curationSpikeSelection.length} selected</span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length !== 2 ? <div className="diagnostic-empty">Choose exactly two clusters for pairwise feature review.</div>
          : error ? <div className="diagnostic-error">{error}</div>
          : loading && !result ? <div className="diagnostic-loading">Extracting pair features…</div>
          : !axes[0] || !axes[1] ? <div className="diagnostic-empty">This result has fewer than two retained feature dimensions.</div>
          : <div className="feature-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: clusterIds.join(','),
                dragmode: 'lasso',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 58, r: 16, t: 24, b: 52 },
                xaxis: { title: metadata[axes[0]]?.label || axes[0], gridcolor: 'rgba(148,163,184,.13)' },
                yaxis: { title: metadata[axes[1]]?.label || axes[1], gridcolor: 'rgba(148,163,184,.13)' },
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onSelected={publishSelection}
              onDeselect={() => onCurationSelectionChange?.([])}
              onClick={(event) => {
                const point = event?.points?.[0]?.customdata;
                if (point?.spikeId) onSpikeSelect?.({ ...point, time: point.timeSamples });
              }}
            />
          </div>}
      </div>
    </div>
  );
};

export default TemplateFeaturePairWidget;
