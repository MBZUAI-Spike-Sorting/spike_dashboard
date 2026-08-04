import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { synthesizeChannelTrace } from '../data/demoDashboardData';
import { buildLocalTraceHeatmap, chooseHeatmapChannels } from '../utils/spatialViews';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
} from '../utils/sessionCache';
import './SpatialViews.css';

const TraceHeatmapWidget = ({
  selectedChannels = [],
  linkedTimeRange = null,
  datasetInfo = null,
  demoMode = false,
  onChannelSelect,
  onTimeRangeSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const totalSamples = Math.max(1, Number(datasetInfo?.totalDataPoints || 4000));
  const totalChannels = Math.max(1, Number(datasetInfo?.totalChannels || 1));
  const sampleRateHz = Math.max(1, Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000));
  const initialEnd = Math.min(totalSamples, sampleRateHz);
  const [timeRange, setTimeRange] = useState({ start: 0, end: initialEnd });
  const [channelMode, setChannelMode] = useState('all');
  const [maxChannels, setMaxChannels] = useState(128);
  const [maxTimeBins, setMaxTimeBins] = useState(1000);
  const [normalization, setNormalization] = useState('robust_zscore');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    onLoadingChange?.('traceHeatmap', loading, 'Loading trace heatmap…');
  }, [loading, onLoadingChange]);

  useEffect(() => {
    const start = Number(linkedTimeRange?.start);
    const end = Number(linkedTimeRange?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    setTimeRange({
      start: Math.max(0, Math.floor(start)),
      end: Math.min(totalSamples, Math.ceil(end)),
    });
  }, [linkedTimeRange, totalSamples]);

  const channelIds = useMemo(() => {
    if (channelMode === 'selected' && selectedChannels.length) {
      return selectedChannels.slice(0, maxChannels);
    }
    return chooseHeatmapChannels(totalChannels, maxChannels);
  }, [channelMode, maxChannels, selectedChannels, totalChannels]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          'trace-heatmap',
          timeRange,
          channelIds,
          maxTimeBins,
          normalization,
          demoMode ? 'demo' : 'api',
        ]);
        const next = await getOrLoadSessionCache(cacheKey, () => {
          if (!demoMode) {
            return apiClient.getTraceHeatmap({
              startSample: timeRange.start,
              endSample: timeRange.end,
              channelIds,
              maxTimeBins,
              maxChannels,
              normalization,
            });
          }
          const channelSeries = Object.fromEntries(channelIds.map((channelId) => [
            channelId,
            synthesizeChannelTrace(channelId, totalSamples).data,
          ]));
          return buildLocalTraceHeatmap({
            channelSeries,
            channelIds,
            startSample: timeRange.start,
            endSample: timeRange.end,
            maxTimeBins,
            normalization,
            sampleRateHz,
          });
        });
        if (!cancelled) setResult(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load trace heatmap.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channelIds, dataCacheScope, demoMode, maxChannels, maxTimeBins, normalization, sampleRateHz, timeRange, totalSamples]);

  const applyTimeRange = (start, end, publish = true) => {
    const nextStart = Math.max(0, Math.min(Math.floor(Number(start) || 0), totalSamples - 1));
    const nextEnd = Math.min(totalSamples, Math.max(nextStart + 1, Math.ceil(Number(end) || nextStart + 1)));
    setTimeRange({ start: nextStart, end: nextEnd });
    if (publish) onTimeRangeSelect?.({ start: nextStart, end: nextEnd });
  };

  return (
    <div className="spatial-view-widget">
      <div className="spatial-toolbar spatial-toolbar-wrap">
        <label>Start <input type="number" min="0" max={totalSamples - 1} value={timeRange.start} onChange={(event) => setTimeRange((current) => ({ ...current, start: Number(event.target.value) }))} /></label>
        <label>End <input type="number" min="1" max={totalSamples} value={timeRange.end} onChange={(event) => setTimeRange((current) => ({ ...current, end: Number(event.target.value) }))} /></label>
        <button type="button" onClick={() => applyTimeRange(timeRange.start, timeRange.end)}>Apply</button>
        <label>Channels
          <select value={channelMode} onChange={(event) => setChannelMode(event.target.value)}>
            <option value="all">All sampled</option>
            <option value="selected">Selected only</option>
          </select>
        </label>
        <label>Max channels
          <select value={maxChannels} onChange={(event) => setMaxChannels(Number(event.target.value))}>
            <option value={64}>64</option><option value={128}>128</option><option value={256}>256</option><option value={512}>512</option>
          </select>
        </label>
        <label>Time bins
          <select value={maxTimeBins} onChange={(event) => setMaxTimeBins(Number(event.target.value))}>
            <option value={500}>500</option><option value={1000}>1,000</option><option value={2000}>2,000</option>
          </select>
        </label>
        <label>Scale
          <select value={normalization} onChange={(event) => setNormalization(event.target.value)}>
            <option value="robust_zscore">Per-channel robust z</option><option value="raw">Raw</option>
          </select>
        </label>
        <span className="spatial-summary">{result?.channelIds?.length || 0} × {result?.timeBinCentersSamples?.length || 0}</span>
      </div>
      <div className="spatial-content">
        {error ? <div className="spatial-message spatial-error">{error}</div>
          : loading && !result ? <div className="spatial-message">Loading trace heatmap…</div>
          : !(result?.values || []).length ? <div className="spatial-message">No trace data are available.</div>
          : <Plot
              data={[{
                x: result.timeBinCentersSeconds,
                y: result.channelIds,
                z: result.values,
                type: 'heatmapgl',
                colorscale: 'RdBu',
                reversescale: true,
                zmid: 0,
                colorbar: { title: result.valueUnit === 'raw' ? 'raw' : 'robust z', thickness: 10 },
                hovertemplate: 'CH%{y}<br>%{x:.4f} s<br>%{z:.3f}<extra></extra>',
              }]}
              layout={{
                autosize: true,
                uirevision: `${channelMode}:${normalization}`,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 60, r: 48, t: 16, b: 48 },
                xaxis: { title: 'Recording time (s)', gridcolor: 'rgba(148,163,184,.1)' },
                yaxis: { title: 'Channel', autorange: 'reversed', dtick: Math.max(1, Math.round((result.channelIds.length || 1) / 12)) },
              }}
              config={{ responsive: true, displaylogo: false, scrollZoom: true }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onClick={(event) => {
                const point = event?.points?.[0];
                if (!point) return;
                onChannelSelect?.(point.y, { additive: false });
                const center = Number(point.x) * (result.sampleRateHz || sampleRateHz);
                const halfWindow = Math.max(1, Math.round((timeRange.end - timeRange.start) / 20));
                applyTimeRange(center - halfWindow, center + halfWindow);
              }}
              onRelayout={(event) => {
                const startSeconds = Number(event?.['xaxis.range[0]']);
                const endSeconds = Number(event?.['xaxis.range[1]']);
                if (Number.isFinite(startSeconds) && Number.isFinite(endSeconds)) {
                  applyTimeRange(
                    startSeconds * (result.sampleRateHz || sampleRateHz),
                    endSeconds * (result.sampleRateHz || sampleRateHz)
                  );
                }
              }}
            />}
      </div>
    </div>
  );
};

export default TraceHeatmapWidget;
