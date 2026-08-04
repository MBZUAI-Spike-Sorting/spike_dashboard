import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import apiClient from '../api/client';
import { buildFallbackProbeGeometry } from '../utils/spatialViews';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';
import './SpatialViews.css';

const colorFor = (clusterId) => `hsl(${(Number(clusterId) * 137) % 360}, 75%, 62%)`;

const ProbeMapWidget = ({
  selectedClusters = [],
  selectedChannels = [],
  clusterData = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  demoMode = false,
  onChannelSelect,
  onSelectedChannelsChange,
  onClusterSelect,
  dataCacheScope = '',
  onLoadingChange,
}) => {
  const [geometry, setGeometry] = useState(null);
  const [showLabels, setShowLabels] = useState(false);
  const [showDisconnected, setShowDisconnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const totalChannels = Number(datasetInfo?.totalChannels || 0);

  useEffect(() => {
    onLoadingChange?.('probeMap', loading, 'Loading probe geometry…');
  }, [loading, onLoadingChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          'probe-geometry',
          selectedClusters,
          selectedAlgorithm,
          totalChannels,
          demoMode ? getSessionObjectId(clusterData) : 'api',
        ]);
        const next = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildFallbackProbeGeometry({
              totalChannels,
              clusterData,
              clusterIds: selectedClusters,
            })
          : apiClient.getProbeGeometry({
              clusterIds: selectedClusters,
              algorithm: selectedAlgorithm,
            }));
        if (!cancelled) setGeometry(next);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load probe geometry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [clusterData, dataCacheScope, demoMode, selectedAlgorithm, selectedClusters, totalChannels]);

  const plotData = useMemo(() => {
    const channels = (geometry?.channels || []).filter(
      (channel) => showDisconnected || channel.connected !== false
    );
    const primaryFootprint = (geometry?.clusterFootprints || []).find(
      (footprint) => String(footprint.clusterId) === String(selectedClusters[0])
    );
    const weightLookup = new Map(
      (primaryFootprint?.channels || []).map((entry) => [String(entry.channelId), entry.weight])
    );
    const selectedSet = new Set(selectedChannels.map(String));
    const traces = [{
      x: channels.map((channel) => channel.x),
      y: channels.map((channel) => channel.y),
      text: channels.map((channel) => showLabels ? `CH${channel.channelId}` : ''),
      customdata: channels.map((channel) => ({ kind: 'channel', ...channel })),
      type: 'scattergl',
      mode: showLabels ? 'markers+text' : 'markers',
      textposition: 'middle right',
      marker: {
        size: channels.map((channel) => selectedSet.has(String(channel.channelId)) ? 13 : 8),
        color: channels.map((channel) => weightLookup.get(String(channel.channelId)) || 0),
        colorscale: [[0, '#334155'], [0.25, '#0f766e'], [1, '#5eead4']],
        cmin: 0,
        cmax: 1,
        line: {
          color: channels.map((channel) => selectedSet.has(String(channel.channelId)) ? '#f8fafc' : 'rgba(148,163,184,.45)'),
          width: channels.map((channel) => selectedSet.has(String(channel.channelId)) ? 2 : 0.5),
        },
      },
      hovertemplate: 'CH%{customdata.channelId}<br>x=%{x:.1f}, depth=%{y:.1f}<br>shank %{customdata.shank}<extra></extra>',
      name: 'Channels',
    }];

    (geometry?.clusterFootprints || []).forEach((footprint) => {
      const peak = channels.find((channel) => String(channel.channelId) === String(footprint.peakChannel));
      if (!peak) return;
      traces.push({
        x: [peak.x],
        y: [peak.y],
        customdata: [{
          kind: 'cluster',
          clusterId: footprint.clusterId,
          channelId: footprint.peakChannel,
        }],
        type: 'scatter',
        mode: 'markers',
        marker: {
          size: 17,
          symbol: 'star',
          color: colorFor(footprint.clusterId),
          line: { color: '#f8fafc', width: 1 },
        },
        name: `C${footprint.clusterId} · CH${footprint.peakChannel ?? '—'}`,
        hovertemplate: `Cluster ${footprint.clusterId}<br>Peak CH${footprint.peakChannel ?? '—'}<extra></extra>`,
      });
    });
    return traces;
  }, [geometry, selectedChannels, selectedClusters, showDisconnected, showLabels]);

  return (
    <div className="spatial-view-widget">
      <div className="spatial-toolbar">
        <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} /> Labels</label>
        <label><input type="checkbox" checked={showDisconnected} onChange={(event) => setShowDisconnected(event.target.checked)} /> Disconnected</label>
        <button type="button" onClick={() => onSelectedChannelsChange?.([])}>Clear channels</button>
        <span>Click channels; Shift/Ctrl-click adds or removes.</span>
        <span className="spatial-summary">{geometry?.source === 'physical_probe' ? 'Physical geometry' : 'Fallback geometry'}</span>
      </div>
      <div className="spatial-content">
        {error ? <div className="spatial-message spatial-error">{error}</div>
          : loading && !geometry ? <div className="spatial-message">Loading probe geometry…</div>
          : !(geometry?.channels || []).length ? <div className="spatial-message">No channels are available.</div>
          : <Plot
              data={plotData}
              layout={{
                autosize: true,
                uirevision: geometry?.source || 'probe',
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 55, r: 20, t: 16, b: 42 },
                xaxis: { title: 'Probe x', gridcolor: 'rgba(148,163,184,.12)', zeroline: false },
                yaxis: { title: 'Depth', gridcolor: 'rgba(148,163,184,.12)', zeroline: false, scaleanchor: 'x' },
                legend: { orientation: 'h', x: 0, y: 1.08, bgcolor: 'rgba(0,0,0,0)' },
                hovermode: 'closest',
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onClick={(event) => {
                const point = event?.points?.[0]?.customdata;
                if (!point) return;
                const additive = Boolean(event?.event?.shiftKey || event?.event?.ctrlKey || event?.event?.metaKey);
                if (point.kind === 'cluster') onClusterSelect?.(point.clusterId, { additive: false });
                if (point.channelId !== undefined) onChannelSelect?.(point.channelId, { additive });
              }}
            />}
      </div>
    </div>
  );
};

export default ProbeMapWidget;
