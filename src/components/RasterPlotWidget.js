import React, { useEffect, useMemo, useRef, useState } from 'react';
import './RasterPlotWidget.css';

const MAX_RENDERED_EVENTS = 50000;
const LEFT_GUTTER = 72;
const RIGHT_GUTTER = 16;
const TOP_GUTTER = 18;
const BOTTOM_GUTTER = 30;

const toFiniteNumber = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const getEventColor = (value) => {
  const numeric = Number(value);
  const hue = Number.isFinite(numeric)
    ? (numeric * 137) % 360
    : String(value ?? 'unknown').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return `hsl(${hue}, 74%, 62%)`;
};

const getClusterId = (cluster, fallback) => {
  const rawId = cluster?.clusterId ?? cluster?.id ?? fallback;
  const numericId = Number(rawId);
  return Number.isFinite(numericId) ? numericId : rawId;
};

const findClusterIndex = (clusters = [], clusterId) => (
  clusters.findIndex((cluster, index) => (
    String(getClusterId(cluster, index)) === String(clusterId)
  ))
);

const getClusteringResultSpikes = (clusteringResults, clusterId) => {
  const fullData = clusteringResults?.fullData;
  if (!fullData) return [];

  if (!Array.isArray(fullData)) {
    return fullData[clusterId] || fullData[String(clusterId)] || [];
  }

  const clusterIndex = findClusterIndex(clusteringResults?.clusters || [], clusterId);
  if (clusterIndex >= 0 && Array.isArray(fullData[clusterIndex])) {
    return fullData[clusterIndex];
  }

  const numericClusterId = Number(clusterId);
  if (Number.isInteger(numericClusterId) && Array.isArray(fullData[numericClusterId])) {
    return fullData[numericClusterId];
  }

  return [];
};

const selectedSetFrom = (selectedClusters = []) => (
  new Set(selectedClusters.map((clusterId) => String(clusterId)))
);

const shouldIncludeCluster = (clusterId, selectedSet) => (
  selectedSet.size === 0 || selectedSet.has(String(clusterId))
);

const normalizeEventsFromClusters = (clusters = [], selectedSet) => {
  const events = [];

  clusters.forEach((cluster, clusterIndex) => {
    const clusterId = getClusterId(cluster, clusterIndex);
    if (!shouldIncludeCluster(clusterId, selectedSet)) return;

    const spikeTimes = cluster?.spikeTimes || cluster?.spike_times || cluster?.times || [];
    const spikeChannels = cluster?.spikeChannels || cluster?.spike_channels || [];

    spikeTimes.forEach((time, pointIndex) => {
      const numericTime = toFiniteNumber(time);
      if (numericTime === null) return;

      events.push({
        time: numericTime,
        clusterId,
        channel: spikeChannels[pointIndex] ?? cluster?.primaryChannel ?? cluster?.primary_channel ?? cluster?.channel,
        pointIndex
      });
    });
  });

  return events;
};

const buildRasterEvents = ({
  spikes,
  selectedClusters,
  clusteringResults,
  clusterData,
  curatorDataset
}) => {
  const selectedSet = selectedSetFrom(selectedClusters);
  let events = [];

  if (Array.isArray(spikes) && spikes.length > 0) {
    events = spikes
      .map((spike, index) => {
        const time = toFiniteNumber(spike.time ?? spike.spikeTime);
        if (time === null) return null;

        return {
          time,
          clusterId: spike.clusterId ?? spike.cluster_id ?? spike.cluster ?? 'unassigned',
          channel: spike.channel ?? spike.channelId ?? spike.primaryChannel,
          pointIndex: spike.pointIndex ?? index,
          amplitude: spike.amplitude
        };
      })
      .filter(Boolean)
      .filter((event) => shouldIncludeCluster(event.clusterId, selectedSet));
  }

  if (events.length === 0 && Array.isArray(curatorDataset?.clusters)) {
    events = normalizeEventsFromClusters(curatorDataset.clusters, selectedSet);
  }

  if (events.length === 0 && Array.isArray(clusterData?.clusters)) {
    events = normalizeEventsFromClusters(clusterData.clusters, selectedSet);
  }

  if (events.length === 0 && Array.isArray(clusteringResults?.clusters)) {
    clusteringResults.clusters.forEach((cluster, index) => {
      const clusterId = getClusterId(cluster, index);
      if (!shouldIncludeCluster(clusterId, selectedSet)) return;

      getClusteringResultSpikes(clusteringResults, clusterId).forEach((spike, pointIndex) => {
        const time = toFiniteNumber(spike?.time);
        if (time === null) return;

        events.push({
          time,
          clusterId,
          channel: spike.channel,
          pointIndex,
          amplitude: spike.amplitude
        });
      });
    });
  }

  if (events.length > MAX_RENDERED_EVENTS) {
    const stride = Math.ceil(events.length / MAX_RENDERED_EVENTS);
    events = events.filter((_, index) => index % stride === 0);
  }

  return events.sort((left, right) => left.time - right.time);
};

const formatNumber = (value) => (
  Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : '-'
);

const RasterPlotWidget = ({
  spikes = [],
  selectedClusters = [],
  clusteringResults = null,
  clusterData = null,
  curatorDataset = null,
  highlightedSpikes = [],
  onEventSelect
}) => {
  const canvasRef = useRef(null);
  const shellRef = useRef(null);
  const eventPositionsRef = useRef([]);
  const [groupBy, setGroupBy] = useState('cluster');
  const [size, setSize] = useState({ width: 600, height: 320 });
  const [timeDomain, setTimeDomain] = useState(null);
  const [hover, setHover] = useState(null);

  const events = useMemo(() => buildRasterEvents({
    spikes,
    selectedClusters,
    clusteringResults,
    clusterData,
    curatorDataset
  }), [spikes, selectedClusters, clusteringResults, clusterData, curatorDataset]);

  const fullDomain = useMemo(() => {
    if (!events.length) return { start: 0, end: 1 };
    return {
      start: events[0].time,
      end: events[events.length - 1].time
    };
  }, [events]);

  const activeDomain = timeDomain || fullDomain;
  const highlightedSet = useMemo(() => (
    new Set((highlightedSpikes || []).map((spike) => (
      `${spike.clusterId}:${spike.pointIndex}`
    )))
  ), [highlightedSpikes]);

  const rowValues = useMemo(() => {
    const values = new Set();
    events.forEach((event) => {
      const rowValue = groupBy === 'channel'
        ? event.channel ?? 'unknown'
        : event.clusterId ?? 'unassigned';
      values.add(String(rowValue));
    });

    return Array.from(values).sort((left, right) => (
      String(left).localeCompare(String(right), undefined, { numeric: true })
    ));
  }, [events, groupBy]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    const updateSize = () => {
      const rect = shell.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(220, Math.round(rect.height))
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTimeDomain(null);
  }, [events]);

  useEffect(() => {
    if (!events.length) return;

    const highlightedTimes = (highlightedSpikes || [])
      .map((spike) => toFiniteNumber(spike?.time))
      .filter((value) => value !== null);

    if (highlightedTimes.length > 0) {
      const center = highlightedTimes[0];
      const minTime = Math.min(...highlightedTimes);
      const maxTime = Math.max(...highlightedTimes);
      const paddedSpan = Math.max(600, (maxTime - minTime) + 400);
      const start = Math.max(fullDomain.start, center - paddedSpan / 2);
      const end = Math.min(fullDomain.end, start + paddedSpan);

      setTimeDomain({
        start: Math.max(fullDomain.start, end - paddedSpan),
        end
      });
      return;
    }

    if (selectedClusters.length === 1) {
      const selectedEvents = events.filter((event) => (
        String(event.clusterId) === String(selectedClusters[0])
      ));

      if (selectedEvents.length > 0) {
        const minTime = selectedEvents[0].time;
        const maxTime = selectedEvents[selectedEvents.length - 1].time;
        const paddedSpan = Math.max(1000, (maxTime - minTime) + 800);
        const center = minTime + (maxTime - minTime) / 2;
        const start = Math.max(fullDomain.start, center - paddedSpan / 2);
        const end = Math.min(fullDomain.end, start + paddedSpan);

        setTimeDomain({
          start: Math.max(fullDomain.start, end - paddedSpan),
          end
        });
      }
    }
  }, [events, fullDomain, highlightedSpikes, selectedClusters]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * pixelRatio);
    canvas.height = Math.floor(size.height * pixelRatio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = '#080d1f';
    context.fillRect(0, 0, size.width, size.height);

    const plotWidth = Math.max(1, size.width - LEFT_GUTTER - RIGHT_GUTTER);
    const plotHeight = Math.max(1, size.height - TOP_GUTTER - BOTTOM_GUTTER);
    const domainSpan = Math.max(1, activeDomain.end - activeDomain.start);
    const rowHeight = rowValues.length > 0 ? plotHeight / rowValues.length : plotHeight;
    const rowIndexMap = new Map(rowValues.map((row, index) => [row, index]));
    const positions = [];

    context.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    context.lineWidth = 1;
    rowValues.forEach((row, rowIndex) => {
      const y = TOP_GUTTER + rowIndex * rowHeight + rowHeight / 2;
      context.beginPath();
      context.moveTo(LEFT_GUTTER, y);
      context.lineTo(size.width - RIGHT_GUTTER, y);
      context.stroke();

      if (rowHeight >= 12 || rowIndex % Math.ceil(14 / Math.max(rowHeight, 1)) === 0) {
        context.fillStyle = 'rgba(226, 232, 240, 0.72)';
        context.font = '11px system-ui, sans-serif';
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        context.fillText(row, LEFT_GUTTER - 8, y);
      }
    });

    const visibleEvents = events.filter((event) => (
      event.time >= activeDomain.start && event.time <= activeDomain.end
    ));

    visibleEvents.forEach((event) => {
      const rowValue = String(groupBy === 'channel'
        ? event.channel ?? 'unknown'
        : event.clusterId ?? 'unassigned');
      const rowIndex = rowIndexMap.get(rowValue);
      if (rowIndex === undefined) return;

      const x = LEFT_GUTTER + ((event.time - activeDomain.start) / domainSpan) * plotWidth;
      const y = TOP_GUTTER + rowIndex * rowHeight + rowHeight / 2;
      const colorKey = groupBy === 'channel' ? event.clusterId : event.channel;
      const isHighlighted = highlightedSet.has(`${event.clusterId}:${event.pointIndex}`);
      const tickHalfHeight = Math.max(2, Math.min(8, rowHeight * 0.42));

      context.strokeStyle = isHighlighted ? '#ffffff' : getEventColor(colorKey ?? event.clusterId);
      context.lineWidth = isHighlighted ? 2 : 1;
      context.beginPath();
      context.moveTo(x, y - tickHalfHeight);
      context.lineTo(x, y + tickHalfHeight);
      context.stroke();

      positions.push({ x, y, event });
    });

    eventPositionsRef.current = positions;

    context.strokeStyle = 'rgba(125, 223, 216, 0.45)';
    context.lineWidth = 1;
    context.strokeRect(LEFT_GUTTER, TOP_GUTTER, plotWidth, plotHeight);

    context.fillStyle = 'rgba(226, 232, 240, 0.72)';
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let tick = 0; tick <= 4; tick += 1) {
      const x = LEFT_GUTTER + (plotWidth * tick) / 4;
      const value = activeDomain.start + (domainSpan * tick) / 4;
      context.fillText(formatNumber(value), x, size.height - BOTTOM_GUTTER + 9);
    }
  }, [activeDomain, events, groupBy, highlightedSet, rowValues, size]);

  const updateZoom = (factor) => {
    const span = Math.max(1, activeDomain.end - activeDomain.start);
    const center = activeDomain.start + span / 2;
    const nextSpan = Math.max(1, span * factor);
    const fullSpan = Math.max(1, fullDomain.end - fullDomain.start);

    if (nextSpan >= fullSpan) {
      setTimeDomain(null);
      return;
    }

    const start = Math.max(fullDomain.start, center - nextSpan / 2);
    const end = Math.min(fullDomain.end, start + nextSpan);
    setTimeDomain({
      start: Math.max(fullDomain.start, end - nextSpan),
      end
    });
  };

  const handlePointerMove = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let nearest = null;
    let nearestDistance = Infinity;

    eventPositionsRef.current.forEach((item) => {
      const distance = Math.abs(item.x - x) + Math.abs(item.y - y) * 0.8;
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    });

    if (!nearest || nearestDistance > 12) {
      setHover(null);
      return;
    }

    setHover({
      x: nearest.x,
      y: nearest.y,
      event: nearest.event
    });
  };

  const handleClick = () => {
    if (hover?.event && typeof onEventSelect === 'function') {
      onEventSelect(hover.event);
    }
  };

  return (
    <div className="raster-plot-widget">
      <div className="raster-toolbar">
        <div className="raster-group-toggle" aria-label="Raster row grouping">
          <button
            type="button"
            className={groupBy === 'cluster' ? 'active' : ''}
            onClick={() => setGroupBy('cluster')}
          >
            Clusters
          </button>
          <button
            type="button"
            className={groupBy === 'channel' ? 'active' : ''}
            onClick={() => setGroupBy('channel')}
          >
            Channels
          </button>
        </div>

        <div className="raster-actions">
          <button type="button" onClick={() => updateZoom(0.5)}>Zoom in</button>
          <button type="button" onClick={() => updateZoom(2)}>Zoom out</button>
          <button type="button" onClick={() => setTimeDomain(null)}>Fit</button>
        </div>

        <div className="raster-summary">
          <span>{events.length.toLocaleString()} events</span>
          <span>{rowValues.length.toLocaleString()} rows</span>
        </div>
      </div>

      <div className="raster-canvas-shell" ref={shellRef}>
        {events.length === 0 ? (
          <div className="raster-empty">No spike events available.</div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="raster-canvas"
              onMouseMove={handlePointerMove}
              onMouseLeave={() => setHover(null)}
              onClick={handleClick}
            />
            {hover && (
              <div
                className="raster-tooltip"
                style={{
                  left: Math.min(size.width - 180, hover.x + 12),
                  top: Math.max(8, hover.y - 40)
                }}
              >
                <strong>Cluster {hover.event.clusterId ?? '-'}</strong>
                <span>Time {formatNumber(hover.event.time)}</span>
                <span>Channel {hover.event.channel ?? '-'}</span>
                <span>Spike {hover.event.pointIndex ?? '-'}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RasterPlotWidget;
