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

const FeatureMatrixWidget = ({
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
  onSelectedChannelsChange,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [clusterIds, setClusterIds] = useState([]);
  const [maxSpikes, setMaxSpikes] = useState(5000);
  const [dimensionIds, setDimensionIds] = useState([]);
  const [knownChannels, setKnownChannels] = useState([]);
  const allClusterIds = useMemo(() => getAvailableDiagnosticClusterIds({
    availableClusterIds,
    clusterData,
    clusteringResults,
  }), [availableClusterIds, clusterData, clusteringResults]);

  useEffect(() => { setClusterIds([]); }, [selectedAlgorithm]);
  useEffect(() => {
    setClusterIds((current) => reconcileDiagnosticClusterIds(current, allClusterIds, 6));
  }, [allClusterIds]);
  useEffect(() => {
    const linkedIds = getLinkedDiagnosticClusterIds(linkedSelectedClusters, allClusterIds, 6);
    if (linkedIds) setClusterIds(linkedIds);
  }, [allClusterIds, linkedSelectedClusters]);

  const { result, loading, error } = useFeatureViewData({
    widgetId: 'featureMatrix',
    loadingMessage: 'Extracting feature matrix…',
    clusterIds,
    selectedChannels,
    maxSpikesPerCluster: maxSpikes,
    includeBackground: true,
    clusterData,
    clusteringResults,
    selectedAlgorithm,
    datasetInfo,
    demoMode,
    dataCacheScope,
    onLoadingChange,
  });

  useEffect(() => {
    const available = (result?.dimensions || []).map((dimension) => dimension.id);
    setDimensionIds((current) => {
      const retained = current.filter((id) => available.includes(id));
      return retained.length >= 2 ? retained : available.slice(0, 4);
    });
    const channels = [
      ...(result?.series || []).flatMap((series) => series.points || []),
      ...(result?.backgroundPoints || []),
    ].map((point) => point.channel).filter(Number.isFinite);
    setKnownChannels((current) => [...new Set([...current, ...selectedChannels, ...channels])]
      .sort((left, right) => left - right));
  }, [result, selectedChannels]);

  const selectedSpikeIds = useMemo(() => new Set(
    curationSpikeSelection.map((spike) => spike.spikeId || `${spike.clusterId}:${spike.spikeIndex ?? spike.pointIndex}`)
  ), [curationSpikeSelection]);
  const dimensions = useMemo(() => (result?.dimensions || [])
    .filter((dimension) => dimensionIds.includes(dimension.id)), [dimensionIds, result]);

  const makeTrace = (points, options) => ({
    type: 'splom',
    name: options.name,
    showlegend: options.showlegend,
    dimensions: dimensions.map((dimension) => ({
      label: dimension.label,
      values: points.map((point) => point.values[dimension.id] ?? null),
    })),
    customdata: points,
    selectedpoints: selectedSpikeIds.size > 0
      ? points
          .map((point, index) => selectedSpikeIds.has(point.spikeId) ? index : null)
          .filter((index) => index !== null)
      : undefined,
    marker: {
      color: options.color,
      size: options.size,
      opacity: options.opacity,
      line: { width: 0 },
    },
    selected: { marker: { color: '#ffffff', size: 8, opacity: 1 } },
    unselected: { marker: { opacity: options.opacity * 0.7 } },
    diagonal: { visible: false },
    hovertemplate: `${options.name}<br>%{customdata.spikeId}<extra></extra>`,
  });

  const traces = useMemo(() => {
    if (dimensions.length < 2) return [];
    const next = [];
    if (result?.backgroundPoints?.length) {
      next.push(makeTrace(result.backgroundPoints, {
        name: 'Unselected clusters', color: 'rgba(148,163,184,.28)', size: 2, opacity: 0.3, showlegend: true,
      }));
    }
    (result?.series || []).forEach((series) => next.push(makeTrace(series.points || [], {
      name: `Cluster ${series.clusterId}`,
      color: colorFor(series.clusterId),
      size: 4,
      opacity: 0.72,
      showlegend: true,
    })));
    return next;
  // makeTrace is intentionally scoped to the current dimensions and selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensions, result, selectedSpikeIds]);

  const publishSelection = (plotEvent) => {
    onCurationSelectionChange?.(getFeatureSelectionFromPlotEvent(plotEvent));
  };

  const updateChannels = (event) => {
    const next = Array.from(event.target.selectedOptions).map((option) => Number(option.value));
    onSelectedChannelsChange?.(next);
  };

  return (
    <div className="cluster-diagnostic-widget feature-view-widget">
      <div className="diagnostic-toolbar feature-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={6}
          onChange={setClusterIds}
        />
        <label>Max spikes
          <select value={maxSpikes} onChange={(event) => setMaxSpikes(Number(event.target.value))}>
            <option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option>
          </select>
        </label>
        <label>Channels
          <select
            multiple
            className="feature-channel-select"
            aria-label="Filter feature matrix channels"
            value={selectedChannels.map(String)}
            onChange={updateChannels}
          >
            {knownChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => onSelectedChannelsChange?.([])}>All channels</button>
        <button type="button" onClick={() => onCurationSelectionChange?.([])}>Clear points</button>
        <span className="diagnostic-summary">{curationSpikeSelection.length} selected</span>
      </div>
      <div className="feature-dimension-strip" aria-label="Feature dimensions">
        {(result?.dimensions || []).map((dimension) => (
          <label key={dimension.id} title={dimension.source}>
            <input
              type="checkbox"
              checked={dimensionIds.includes(dimension.id)}
              onChange={() => setDimensionIds((current) => current.includes(dimension.id)
                ? current.filter((id) => id !== dimension.id)
                : [...current, dimension.id])}
            />
            {dimension.label}{dimension.unit ? ` (${dimension.unit})` : ''}
          </label>
        ))}
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0 ? <div className="diagnostic-empty">Choose clusters to inspect their spike features.</div>
          : error ? <div className="diagnostic-error">{error}</div>
          : loading && !result ? <div className="diagnostic-loading">Extracting feature matrix…</div>
          : dimensions.length < 2 ? <div className="diagnostic-empty">Select at least two available dimensions.</div>
          : <div className="feature-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: `${clusterIds.join(',')}:${dimensionIds.join(',')}`,
                dragmode: 'lasso',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 9 },
                margin: { l: 45, r: 16, t: 18, b: 42 },
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

export default FeatureMatrixWidget;
