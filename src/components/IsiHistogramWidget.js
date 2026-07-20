import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { buildLocalIsiHistograms, collectClusterEvents } from '../utils/clusterDiagnostics';
import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from '../utils/diagnosticClusterSelection';
import DiagnosticClusterPicker from './DiagnosticClusterPicker';
import './ClusterDiagnosticWidgets.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 72%, 64%)`;
const fillColorFor = (clusterId) => `hsla(${(Number(clusterId) * 137) % 360}, 72%, 64%, 0.12)`;

const IsiHistogramWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  spikes = [],
  clusterData = null,
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  onClusterSelect,
}) => {
  const [binSizeMs, setBinSizeMs] = useState(0.5);
  const [windowSizeMs, setWindowSizeMs] = useState(100);
  const [refractoryPeriodMs, setRefractoryPeriodMs] = useState(2);
  const [xScale, setXScale] = useState('linear');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const allClusterIds = useMemo(() => getAvailableDiagnosticClusterIds({
    availableClusterIds,
    clusterData,
    clusteringResults,
  }), [availableClusterIds, clusterData, clusteringResults]);
  const [clusterIds, setClusterIds] = useState([]);
  const sampleRateHz = Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000);

  useEffect(() => {
    setClusterIds([]);
  }, [selectedAlgorithm]);

  useEffect(() => {
    setClusterIds((current) => reconcileDiagnosticClusterIds(current, allClusterIds, 12));
  }, [allClusterIds]);

  useEffect(() => {
    const linkedIds = getLinkedDiagnosticClusterIds(linkedSelectedClusters, allClusterIds, 12);
    if (linkedIds) setClusterIds(linkedIds);
  }, [allClusterIds, linkedSelectedClusters]);

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
        const next = demoMode
          ? buildLocalIsiHistograms({
              events: collectClusterEvents({ spikes, clusterData, clusteringResults, selectedClusters: clusterIds }),
              clusterIds,
              sampleRateHz,
              binSizeMs,
              windowSizeMs,
              refractoryPeriodMs,
            })
          : await apiClient.getClusterIsiHistograms({
              clusterIds,
              algorithm: selectedAlgorithm,
              binSizeMs,
              windowSizeMs,
              refractoryPeriodMs,
            });
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to calculate ISI histograms.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [binSizeMs, clusterData, clusterIds, clusteringResults, demoMode, refractoryPeriodMs, sampleRateHz, selectedAlgorithm, spikes, windowSizeMs]);

  const traces = useMemo(() => (result?.series || []).map((series) => ({
    x: result.binCentersMs || [],
    y: series.counts || [],
    customdata: (series.counts || []).map(() => series.clusterId),
    type: 'scatter',
    mode: 'lines',
    fill: 'tozeroy',
    name: `C${series.clusterId} · ${(Number(series.violationRate || 0) * 100).toFixed(2)}%`,
    line: { color: colorFor(series.clusterId), width: 1.7 },
    fillcolor: fillColorFor(series.clusterId),
    hovertemplate: `Cluster ${series.clusterId}<br>%{x:.2f} ms<br>%{y} intervals<extra></extra>`,
  })), [result]);

  return (
    <div className="cluster-diagnostic-widget">
      <div className="diagnostic-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={12}
          onChange={setClusterIds}
        />
        <label>Bin ms <input type="number" min="0.05" max="50" step="0.25" value={binSizeMs} onChange={(event) => setBinSizeMs(Math.max(0.05, Number(event.target.value) || 0.5))} /></label>
        <label>Max ms <input type="number" min="1" max="10000" step="10" value={windowSizeMs} onChange={(event) => setWindowSizeMs(Math.max(1, Number(event.target.value) || 100))} /></label>
        <label>Refractory ms <input type="number" min="0" max="100" step="0.5" value={refractoryPeriodMs} onChange={(event) => setRefractoryPeriodMs(Math.max(0, Number(event.target.value) || 0))} /></label>
        <label>X scale
          <select value={xScale} onChange={(event) => setXScale(event.target.value)}>
            <option value="linear">Linear</option><option value="log">Log</option>
          </select>
        </label>
        <span className="diagnostic-summary">Violation rate shown in legend</span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0 ? <div className="diagnostic-empty">Choose clusters to inspect their inter-spike intervals.</div>
          : error ? <div className="diagnostic-error">{error}</div>
          : loading && !result ? <div className="diagnostic-loading">Calculating ISIs…</div>
          : <div className="isi-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: `${clusterIds.join(',')}:${windowSizeMs}`,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 52, r: 14, t: 16, b: 48 },
                hovermode: 'x unified',
                xaxis: {
                  title: 'Inter-spike interval (ms)',
                  type: xScale,
                  range: xScale === 'linear' ? [0, result?.windowSizeMs || windowSizeMs] : undefined,
                  gridcolor: 'rgba(148,163,184,.13)',
                },
                yaxis: { title: 'Count', rangemode: 'tozero', gridcolor: 'rgba(148,163,184,.13)' },
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
                shapes: refractoryPeriodMs > 0 ? [{
                  type: 'rect',
                  x0: xScale === 'log' ? Math.max(binSizeMs / 2, 0.001) : 0,
                  x1: refractoryPeriodMs,
                  y0: 0,
                  y1: 1,
                  yref: 'paper',
                  fillcolor: 'rgba(251,113,133,.14)',
                  line: { width: 0 },
                  layer: 'below',
                }] : [],
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onClick={(event) => {
                const clusterId = event?.points?.[0]?.customdata;
                if (clusterId !== undefined) onClusterSelect?.(clusterId, { additive: false });
              }}
            />
          </div>}
      </div>
    </div>
  );
};

export default IsiHistogramWidget;
