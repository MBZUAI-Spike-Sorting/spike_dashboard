import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { buildLocalCorrelograms, collectClusterEvents } from '../utils/clusterDiagnostics';
import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from '../utils/diagnosticClusterSelection';
import DiagnosticClusterPicker from './DiagnosticClusterPicker';
import './ClusterDiagnosticWidgets.css';

const PLOT_COLORS = ['#40e0d0', '#a78bfa', '#fb7185', '#fbbf24'];

const CorrelogramWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  spikes = [],
  clusterData = null,
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  onClusterSelect,
  onClusterPairSelect,
}) => {
  const [binSizeMs, setBinSizeMs] = useState(1);
  const [windowSizeMs, setWindowSizeMs] = useState(50);
  const [maxSpikesPerCluster, setMaxSpikesPerCluster] = useState(25000);
  const [refractoryPeriodMs, setRefractoryPeriodMs] = useState(2);
  const [displayMode, setDisplayMode] = useState('count');
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
    setClusterIds((current) => reconcileDiagnosticClusterIds(current, allClusterIds, 4));
  }, [allClusterIds]);

  useEffect(() => {
    const linkedIds = getLinkedDiagnosticClusterIds(linkedSelectedClusters, allClusterIds, 4);
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
          ? buildLocalCorrelograms({
              events: collectClusterEvents({ spikes, clusterData, clusteringResults, selectedClusters: clusterIds }),
              clusterIds,
              sampleRateHz,
              binSizeMs,
              windowSizeMs,
            })
          : await apiClient.getClusterCorrelograms({
              clusterIds,
              algorithm: selectedAlgorithm,
              binSizeMs,
              windowSizeMs,
              maxSpikesPerCluster,
            });
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to calculate correlograms.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [binSizeMs, clusterData, clusterIds, clusteringResults, demoMode, maxSpikesPerCluster, sampleRateHz, selectedAlgorithm, spikes, windowSizeMs]);

  const pairLookup = useMemo(() => new Map(
    (result?.pairs || []).map((pair) => [`${pair.row}:${pair.column}`, pair])
  ), [result]);

  return (
    <div className="cluster-diagnostic-widget">
      <div className="diagnostic-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={4}
          onChange={setClusterIds}
        />
        <label>Bin ms
          <input type="number" min="0.05" max="20" step="0.5" value={binSizeMs} onChange={(event) => setBinSizeMs(Math.max(0.05, Number(event.target.value) || 1))} />
        </label>
        <label>Window ±ms
          <input type="number" min="1" max="1000" step="5" value={windowSizeMs} onChange={(event) => setWindowSizeMs(Math.max(1, Number(event.target.value) || 50))} />
        </label>
        <label>Max spikes
          <select value={maxSpikesPerCluster} onChange={(event) => setMaxSpikesPerCluster(Number(event.target.value))}>
            <option value={5000}>5k</option><option value={25000}>25k</option><option value={100000}>100k</option>
          </select>
        </label>
        <label>Refractory ms
          <input type="number" min="0" max="20" step="0.5" value={refractoryPeriodMs} onChange={(event) => setRefractoryPeriodMs(Math.max(0, Number(event.target.value) || 0))} />
        </label>
        <label>Display
          <select value={displayMode} onChange={(event) => setDisplayMode(event.target.value)}>
            <option value="count">Count</option><option value="rate">Rate</option><option value="baseline">Baseline ratio</option>
          </select>
        </label>
        <span className="diagnostic-summary">{clusterIds.length} clusters · double-click a panel to select its pair</span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0 ? (
          <div className="diagnostic-empty">Choose up to four clusters to inspect auto- and cross-correlograms.</div>
        ) : error ? (
          <div className="diagnostic-error">{error}</div>
        ) : loading && !result ? (
          <div className="diagnostic-loading">Calculating correlograms…</div>
        ) : (
          <div className="correlogram-matrix" style={{ gridTemplateColumns: `repeat(${clusterIds.length}, 190px)` }}>
            {clusterIds.flatMap((sourceId, row) => clusterIds.map((targetId, column) => {
              const pair = pairLookup.get(`${row}:${column}`) || {};
              const counts = pair.counts || [];
              const sourceCount = Number(result?.sampledSpikeCounts?.[String(sourceId)] || 1);
              const binSeconds = Number(result?.binSizeMs || binSizeMs) / 1000;
              const expected = Number(pair.baselineCount || 0);
              const values = displayMode === 'rate'
                ? counts.map((count) => count / Math.max(sourceCount * binSeconds, 1e-12))
                : displayMode === 'baseline'
                  ? counts.map((count) => expected > 0 ? count / expected : 0)
                  : counts;
              const baseline = displayMode === 'rate'
                ? expected / Math.max(sourceCount * binSeconds, 1e-12)
                : displayMode === 'baseline' ? 1 : expected;
              return (
                <div
                  className="correlogram-cell"
                  key={`${sourceId}:${targetId}`}
                  onDoubleClick={() => {
                    if (onClusterPairSelect) onClusterPairSelect(sourceId, targetId);
                    else onClusterSelect?.(targetId, { additive: false });
                  }}
                >
                  <Plot
                    data={[{
                      x: result?.binCentersMs || [],
                      y: values,
                      type: 'bar',
                      marker: { color: PLOT_COLORS[column % PLOT_COLORS.length], line: { width: 0 } },
                      hovertemplate: `%{x:.2f} ms<br>%{y:.3g} ${displayMode}<extra></extra>`,
                    }]}
                    layout={{
                      autosize: true,
                      paper_bgcolor: 'rgba(0,0,0,0)',
                      plot_bgcolor: 'rgba(0,0,0,0.18)',
                      font: { color: '#cbd5e1', size: 9 },
                      title: { text: `${sourceId} → ${targetId}`, font: { size: 10 }, y: 0.96 },
                      margin: { l: 34, r: 6, t: 24, b: 27 },
                      bargap: 0.04,
                      xaxis: { title: row === clusterIds.length - 1 ? 'lag (ms)' : '', gridcolor: 'rgba(148,163,184,.11)', zerolinecolor: '#f8fafc' },
                      yaxis: { title: column === 0 ? displayMode : '', gridcolor: 'rgba(148,163,184,.11)', rangemode: 'tozero' },
                      shapes: [
                        { type: 'line', x0: -refractoryPeriodMs, x1: -refractoryPeriodMs, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(251,113,133,.65)', dash: 'dot', width: 1 } },
                        { type: 'line', x0: refractoryPeriodMs, x1: refractoryPeriodMs, y0: 0, y1: 1, yref: 'paper', line: { color: 'rgba(251,113,133,.65)', dash: 'dot', width: 1 } },
                        { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: baseline, y1: baseline, line: { color: 'rgba(226,232,240,.45)', dash: 'dash', width: 1 } },
                      ],
                      showlegend: false,
                    }}
                    config={{ responsive: true, displayModeBar: false }}
                    useResizeHandler
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              );
            }))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CorrelogramWidget;
