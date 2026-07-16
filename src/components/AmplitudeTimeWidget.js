import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { buildLocalAmplitudeSeries, collectClusterEvents } from '../utils/clusterDiagnostics';
import './ClusterDiagnosticWidgets.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 72%, 64%)`;

const AmplitudeTimeWidget = ({
  selectedClusters = [],
  spikes = [],
  clusterData = null,
  clusterWaveforms = {},
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  highlightedSpikes = [],
  linkedTimeRange = null,
  onTimeRangeSelect,
  onSpikeSelect,
  onSummaryChange,
}) => {
  const [maxSpikes, setMaxSpikes] = useState(5000);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const clusterIds = useMemo(() => selectedClusters.slice(0, 12), [selectedClusters]);
  const sampleRateHz = Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000);

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
          ? buildLocalAmplitudeSeries({
              clusterWaveforms,
              events: collectClusterEvents({ spikes, clusterData, clusteringResults, selectedClusters: clusterIds }),
              clusterIds,
              sampleRateHz,
            })
          : await apiClient.getClusterAmplitudes({
              clusterIds,
              algorithm: selectedAlgorithm,
              maxSpikesPerCluster: maxSpikes,
              includeBackground: true,
              maxBackgroundSpikes: 5000,
            });
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to extract spike amplitudes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [clusterData, clusterIds, clusterWaveforms, clusteringResults, demoMode, maxSpikes, sampleRateHz, selectedAlgorithm, spikes]);

  useEffect(() => {
    if (!result?.series || !onSummaryChange) return;
    const summaries = {};
    result.series.forEach((series) => { summaries[series.clusterId] = series.summary || {}; });
    onSummaryChange(summaries);
  }, [onSummaryChange, result]);

  const highlightedSet = useMemo(() => new Set(highlightedSpikes.map((spike) => `${spike.clusterId}:${spike.pointIndex}`)), [highlightedSpikes]);
  const traces = useMemo(() => {
    const next = [];
    const backgroundPoints = result?.backgroundPoints || [];
    if (backgroundPoints.length) {
      next.push({
        x: backgroundPoints.map((point) => point.timeSeconds),
        y: backgroundPoints.map((point) => point.amplitude),
        customdata: backgroundPoints,
        type: 'scattergl',
        mode: 'markers',
        name: 'Same-channel background',
        marker: { color: 'rgba(148,163,184,.28)', size: 3 },
        hovertemplate: 'Background C%{customdata.clusterId}<br>%{x:.3f} s<br>%{y:.3f}<extra></extra>',
      });
    }

    (result?.series || []).forEach((series) => {
      const regular = [];
      const highlighted = [];
      (series.points || []).forEach((point) => {
        const key = `${series.clusterId}:${point.pointIndex ?? point.spikeIndex}`;
        (highlightedSet.has(key) ? highlighted : regular).push(point);
      });
      const toTrace = (points, isHighlighted) => ({
        x: points.map((point) => point.timeSeconds),
        y: points.map((point) => point.amplitude),
        customdata: points.map((point) => ({ ...point, clusterId: series.clusterId })),
        type: 'scattergl',
        mode: 'markers',
        name: isHighlighted ? `C${series.clusterId} selected` : `Cluster ${series.clusterId}`,
        showlegend: !isHighlighted,
        marker: {
          color: isHighlighted ? '#ffffff' : colorFor(series.clusterId),
          size: isHighlighted ? 10 : 4,
          opacity: isHighlighted ? 1 : 0.68,
          symbol: isHighlighted ? 'star' : 'circle',
        },
        hovertemplate: `Cluster ${series.clusterId}<br>%{x:.3f} s<br>%{y:.3f}<extra></extra>`,
      });
      next.push(toTrace(regular, false));
      if (highlighted.length) next.push(toTrace(highlighted, true));
      next.push({
        y: (series.points || []).map((point) => point.amplitude),
        type: 'histogram',
        orientation: 'h',
        xaxis: 'x2',
        yaxis: 'y',
        nbinsy: 36,
        marker: { color: colorFor(series.clusterId) },
        opacity: 0.28,
        showlegend: false,
        hovertemplate: `Cluster ${series.clusterId}<br>%{y:.3f}<br>%{x} spikes<extra></extra>`,
      });
    });
    return next;
  }, [highlightedSet, result]);

  const rangeShape = linkedTimeRange && Number.isFinite(Number(linkedTimeRange.start)) && Number.isFinite(Number(linkedTimeRange.end))
    ? [{ type: 'rect', x0: Number(linkedTimeRange.start) / (result?.sampleRateHz || sampleRateHz), x1: Number(linkedTimeRange.end) / (result?.sampleRateHz || sampleRateHz), y0: 0, y1: 1, yref: 'paper', fillcolor: 'rgba(64,224,208,.08)', line: { color: 'rgba(64,224,208,.45)', width: 1 }, layer: 'below' }]
    : [];

  const selectTimeRange = (plotEvent) => {
    const points = plotEvent?.points || [];
    const samples = points.map((point) => Number(point.customdata?.timeSamples)).filter(Number.isFinite);
    if (samples.length) {
      const start = Math.min(...samples);
      const end = Math.max(...samples);
      const padding = start === end ? Math.max(150, Math.round((result?.sampleRateHz || sampleRateHz) * 0.02)) : 0;
      onTimeRangeSelect?.({ start: Math.max(0, start - padding), end: end + padding });
    }
  };

  return (
    <div className="cluster-diagnostic-widget">
      <div className="diagnostic-toolbar">
        <label>Source
          <select value="raw" disabled title="Sorter/template amplitudes are not retained yet">
            <option value="raw">Raw PTP</option>
          </select>
        </label>
        <label>Max spikes
          <select value={maxSpikes} onChange={(event) => setMaxSpikes(Number(event.target.value))}>
            <option value={1000}>1,000</option><option value={5000}>5,000</option><option value={10000}>10,000</option><option value={20000}>20,000</option>
          </select>
        </label>
        <span>Box/lasso points to focus the signal view.</span>
        <span className="diagnostic-summary">{result?.amplitudeUnit || 'raw'} amplitude</span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0 ? <div className="diagnostic-empty">Select clusters to inspect amplitude drift through recording time.</div>
          : error ? <div className="diagnostic-error">{error}</div>
          : loading && !result ? <div className="diagnostic-loading">Extracting amplitudes…</div>
          : <div className="amplitude-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: clusterIds.join(','),
                dragmode: 'select',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 58, r: 15, t: 18, b: 50 },
                hovermode: 'closest',
                xaxis: { title: 'Recording time (s)', domain: [0, 0.80], gridcolor: 'rgba(148,163,184,.13)' },
                xaxis2: { title: 'Count', domain: [0.84, 1], showgrid: false, zeroline: false },
                yaxis: { title: `Peak-to-peak amplitude (${result?.amplitudeUnit || 'raw'})`, gridcolor: 'rgba(148,163,184,.13)', rangemode: 'tozero' },
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
                shapes: rangeShape,
              }}
              config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['autoScale2d'] }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onSelected={selectTimeRange}
              onClick={(event) => {
                const point = event?.points?.[0]?.customdata;
                if (!point) return;
                onSpikeSelect?.({ ...point, time: point.timeSamples });
                const halfWindow = Math.max(150, Math.round((result?.sampleRateHz || sampleRateHz) * 0.02));
                onTimeRangeSelect?.({ start: Math.max(0, point.timeSamples - halfWindow), end: point.timeSamples + halfWindow });
              }}
            />
          </div>}
      </div>
      {result?.series?.length > 0 && <div className="amplitude-summary-strip">
        {result.series.map((series) => <span key={series.clusterId}><strong>C{series.clusterId}</strong> n={series.summary?.count || 0} · mean {Number.isFinite(Number(series.summary?.meanAmplitude)) ? Number(series.summary.meanAmplitude).toFixed(2) : '—'}</span>)}
      </div>}
    </div>
  );
};

export default AmplitudeTimeWidget;
