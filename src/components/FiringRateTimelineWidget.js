import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { buildLocalFiringRates, collectClusterEvents } from '../utils/clusterDiagnostics';
import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from '../utils/diagnosticClusterSelection';
import DiagnosticClusterPicker from './DiagnosticClusterPicker';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';
import './ClusterDiagnosticWidgets.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 72%, 64%)`;

const FiringRateTimelineWidget = ({
  availableClusterIds = [],
  linkedSelectedClusters = [],
  spikes = [],
  clusterData = null,
  clusteringResults = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  linkedTimeRange = null,
  onTimeRangeSelect,
  onClusterSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [binSizeSeconds, setBinSizeSeconds] = useState(1);
  const [valueMode, setValueMode] = useState('rate');
  const [viewMode, setViewMode] = useState('overlay');
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
  const recordingDurationSamples = Number(datasetInfo?.totalDataPoints);

  useEffect(() => {
    onLoadingChange?.('firingRateTimeline', loading, 'Calculating firing rates…');
  }, [loading, onLoadingChange]);

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
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          'firing-rate-timeline',
          clusterIds,
          binSizeSeconds,
          sampleRateHz,
          Number.isFinite(recordingDurationSamples) ? recordingDurationSamples : null,
          demoMode ? getSessionObjectId(clusterData || clusteringResults || spikes) : 'api',
        ]);
        const next = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildLocalFiringRates({
              events: collectClusterEvents({
                spikes,
                clusterData,
                clusteringResults,
                selectedClusters: clusterIds,
              }),
              clusterIds,
              sampleRateHz,
              binSizeSeconds,
              recordingDurationSamples: Number.isFinite(recordingDurationSamples)
                ? recordingDurationSamples
                : null,
              maxBins: 5000,
            })
          : apiClient.getClusterFiringRates({
              clusterIds,
              algorithm: selectedAlgorithm,
              binSizeSeconds,
              maxBins: 5000,
            }));
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to calculate firing rates.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [
    binSizeSeconds,
    clusterData,
    clusterIds,
    clusteringResults,
    dataCacheScope,
    demoMode,
    recordingDurationSamples,
    sampleRateHz,
    selectedAlgorithm,
    spikes,
  ]);

  const traces = useMemo(() => (result?.series || []).map((series, index) => {
    const values = valueMode === 'rate' ? series.rateHz || [] : series.counts || [];
    const edges = result?.binEdgesSamples || [];
    return {
      x: result?.binCentersSeconds || [],
      y: values,
      customdata: values.map((_, binIndex) => ({
        clusterId: series.clusterId,
        startSamples: edges[binIndex],
        endSamples: edges[binIndex + 1],
        count: series.counts?.[binIndex] || 0,
        rateHz: series.rateHz?.[binIndex] || 0,
      })),
      type: 'scattergl',
      mode: 'lines+markers',
      name: `C${series.clusterId} · mean ${Number(series.meanRateHz || 0).toFixed(2)} Hz`,
      yaxis: viewMode === 'smallMultiples' && index > 0 ? `y${index + 1}` : 'y',
      line: { color: colorFor(series.clusterId), width: 1.7, shape: 'hv' },
      marker: { color: colorFor(series.clusterId), size: 3 },
      showlegend: viewMode === 'overlay',
      hovertemplate: [
        `Cluster ${series.clusterId}`,
        '%{x:.3f} s',
        '%{customdata.count} spikes',
        '%{customdata.rateHz:.3f} Hz',
        '<extra></extra>',
      ].join('<br>'),
    };
  }), [result, valueMode, viewMode]);

  const yAxisLayout = useMemo(() => {
    const axisTitle = valueMode === 'rate' ? 'Firing rate (Hz)' : 'Spike count';
    if (viewMode !== 'smallMultiples' || !result?.series?.length) {
      return {
        yaxis: {
          title: axisTitle,
          rangemode: 'tozero',
          gridcolor: 'rgba(148,163,184,.13)',
        },
      };
    }

    const rowCount = result.series.length;
    const gap = Math.min(0.012, 0.12 / rowCount);
    return result.series.reduce((axes, series, index) => {
      const axisKey = index === 0 ? 'yaxis' : `yaxis${index + 1}`;
      const upper = (rowCount - index) / rowCount - gap;
      const lower = (rowCount - index - 1) / rowCount + gap;
      axes[axisKey] = {
        domain: [lower, upper],
        anchor: 'x',
        title: { text: `C${series.clusterId}`, font: { size: 9 }, standoff: 4 },
        rangemode: 'tozero',
        gridcolor: 'rgba(148,163,184,.10)',
        tickfont: { size: 8 },
        zeroline: false,
      };
      return axes;
    }, {});
  }, [result, valueMode, viewMode]);

  const rangeShape = linkedTimeRange
    && Number.isFinite(Number(linkedTimeRange.start))
    && Number.isFinite(Number(linkedTimeRange.end))
    ? [{
        type: 'rect',
        x0: Number(linkedTimeRange.start) / (result?.sampleRateHz || sampleRateHz),
        x1: Number(linkedTimeRange.end) / (result?.sampleRateHz || sampleRateHz),
        y0: 0,
        y1: 1,
        yref: 'paper',
        fillcolor: 'rgba(64,224,208,.08)',
        line: { color: 'rgba(64,224,208,.45)', width: 1 },
        layer: 'below',
      }]
    : [];

  const publishTimeRange = (startSamples, endSamples) => {
    const duration = Number(result?.recordingDurationSamples);
    const start = Math.max(0, Math.min(Number(startSamples), Number(endSamples)));
    const unclampedEnd = Math.max(Number(startSamples), Number(endSamples));
    const end = Number.isFinite(duration) ? Math.min(duration, unclampedEnd) : unclampedEnd;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      onTimeRangeSelect?.({ start: Math.round(start), end: Math.round(end) });
    }
  };

  const selectTimeRange = (plotEvent) => {
    const selectedX = plotEvent?.range?.x;
    const resultSampleRate = result?.sampleRateHz || sampleRateHz;
    if (
      Array.isArray(selectedX)
      && Number.isFinite(Number(selectedX[0]))
      && Number.isFinite(Number(selectedX[1]))
    ) {
      publishTimeRange(Number(selectedX[0]) * resultSampleRate, Number(selectedX[1]) * resultSampleRate);
      return;
    }

    const selectedBins = (plotEvent?.points || [])
      .map((point) => point.customdata)
      .filter((bin) => Number.isFinite(Number(bin?.startSamples)) && Number.isFinite(Number(bin?.endSamples)));
    if (selectedBins.length) {
      publishTimeRange(
        Math.min(...selectedBins.map((bin) => Number(bin.startSamples))),
        Math.max(...selectedBins.map((bin) => Number(bin.endSamples)))
      );
    }
  };

  return (
    <div className="cluster-diagnostic-widget">
      <div className="diagnostic-toolbar">
        <DiagnosticClusterPicker
          availableClusterIds={allClusterIds}
          selectedClusterIds={clusterIds}
          maxClusters={12}
          onChange={setClusterIds}
        />
        <label>Bin s
          <input
            type="number"
            min="0.001"
            max="3600"
            step="0.1"
            value={binSizeSeconds}
            onChange={(event) => setBinSizeSeconds(Math.max(0.001, Number(event.target.value) || 1))}
          />
        </label>
        <label>Value
          <select value={valueMode} onChange={(event) => setValueMode(event.target.value)}>
            <option value="rate">Rate (Hz)</option>
            <option value="count">Count</option>
          </select>
        </label>
        <label>Layout
          <select value={viewMode} onChange={(event) => setViewMode(event.target.value)}>
            <option value="overlay">Overlay</option>
            <option value="smallMultiples">Small multiples</option>
          </select>
        </label>
        <span>Box a time interval to focus linked views.</span>
        <span className="diagnostic-summary">
          {result?.binSizeAdjusted
            ? `Bin raised to ${Number(result.binSizeSeconds).toPrecision(3)} s (5,000-bin limit)`
            : `${result?.series?.length || 0} clusters`}
        </span>
      </div>
      <div className="diagnostic-content">
        {clusterIds.length === 0
          ? <div className="diagnostic-empty">Choose clusters to inspect firing stability through recording time.</div>
          : error
          ? <div className="diagnostic-error">{error}</div>
          : loading && !result
          ? <div className="diagnostic-loading">Calculating firing rates…</div>
          : <div className="firing-rate-plot-shell">
            <Plot
              data={traces}
              layout={{
                autosize: true,
                uirevision: `${clusterIds.join(',')}:${binSizeSeconds}:${valueMode}:${viewMode}`,
                dragmode: 'select',
                selectdirection: 'h',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 58, r: 18, t: 18, b: 50 },
                hovermode: 'x unified',
                xaxis: {
                  title: 'Recording time (s)',
                  range: [0, result?.recordingDurationSeconds || undefined],
                  gridcolor: 'rgba(148,163,184,.13)',
                },
                ...yAxisLayout,
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
                shapes: rangeShape,
              }}
              config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['autoScale2d'] }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onSelected={selectTimeRange}
              onClick={(event) => {
                const bin = event?.points?.[0]?.customdata;
                if (!bin) return;
                onClusterSelect?.(bin.clusterId, { additive: false });
                publishTimeRange(bin.startSamples, bin.endSamples);
              }}
            />
          </div>}
      </div>
      {result?.series?.length > 0 && <div className="firing-rate-summary-strip">
        {result.series.map((series) => (
          <span key={series.clusterId}>
            <strong>C{series.clusterId}</strong> mean {Number(series.meanRateHz || 0).toFixed(2)} Hz · peak {Number(series.maxRateHz || 0).toFixed(2)} Hz
          </span>
        ))}
      </div>}
    </div>
  );
};

export default FiringRateTimelineWidget;
