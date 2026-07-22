import React, { useEffect, useMemo, useRef, useState } from 'react';
import './RasterPlotWidget.css';

const MAX_RENDERED_EVENTS = 50000;
const LEFT_GUTTER = 72;
const RIGHT_GUTTER = 16;
const TOP_GUTTER = 18;
const BOTTOM_GUTTER = 30;
const MIN_ROW_HEIGHT = 18;

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

const shouldIncludeCluster = (clusterId, filterSet, filterIsActive = false) => (
  (!filterIsActive && filterSet.size === 0) || filterSet.has(String(clusterId))
);

const normalizeEventsFromClusters = (clusters = [], filterSet, filterIsActive = false) => {
  const events = [];

  clusters.forEach((cluster, clusterIndex) => {
    const clusterId = getClusterId(cluster, clusterIndex);
    if (!shouldIncludeCluster(clusterId, filterSet, filterIsActive)) return;

    const spikeTimes = cluster?.spikeTimes || cluster?.spike_times || cluster?.times || [];
    const spikeChannels = cluster?.spikeChannels || cluster?.spike_channels || [];

    spikeTimes.forEach((time, pointIndex) => {
      const numericTime = toFiniteNumber(time);
      if (numericTime === null) return;

      events.push({
        time: numericTime,
        clusterId,
        channel: spikeChannels[pointIndex] ?? cluster?.primaryChannel ?? cluster?.primary_channel ?? cluster?.channelId ?? cluster?.channel,
        pointIndex
      });
    });
  });

  return events;
};

const buildRasterEvents = ({
  spikes,
  selectedClusters,
  visibleClusterIds,
  clusteringResults,
  clusterData,
  curatorDataset
}) => {
  const filterIsActive = Array.isArray(visibleClusterIds);
  const filterSet = selectedSetFrom(filterIsActive ? visibleClusterIds : selectedClusters);
  let events = [];

  if (filterIsActive && Array.isArray(clusterData?.clusters)) {
    events = normalizeEventsFromClusters(clusterData.clusters, filterSet, true);
  }

  if (events.length === 0 && !filterIsActive && Array.isArray(spikes) && spikes.length > 0) {
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
      .filter((event) => shouldIncludeCluster(event.clusterId, filterSet, filterIsActive));
  }

  if (events.length === 0 && Array.isArray(curatorDataset?.clusters)) {
    events = normalizeEventsFromClusters(curatorDataset.clusters, filterSet, filterIsActive);
  }

  if (events.length === 0 && Array.isArray(clusterData?.clusters)) {
    events = normalizeEventsFromClusters(clusterData.clusters, filterSet, filterIsActive);
  }

  if (events.length === 0 && Array.isArray(clusteringResults?.clusters)) {
    clusteringResults.clusters.forEach((cluster, index) => {
      const clusterId = getClusterId(cluster, index);
      if (!shouldIncludeCluster(clusterId, filterSet, filterIsActive)) return;

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

const getDomainSpan = (domain) => Math.max(1, domain.end - domain.start);

const fitDomainWithin = (start, span, fullDomain) => {
  const fullSpan = getDomainSpan(fullDomain);
  if (span >= fullSpan) return null;

  const clampedStart = Math.min(
    Math.max(start, fullDomain.start),
    fullDomain.end - span
  );
  return { start: clampedStart, end: clampedStart + span };
};

export const zoomTimeDomain = (activeDomain, fullDomain, factor, anchorRatio = 0.5) => {
  const span = getDomainSpan(activeDomain);
  const nextSpan = Math.max(1, span * factor);
  const ratio = Math.min(1, Math.max(0, anchorRatio));
  const anchor = activeDomain.start + span * ratio;

  return fitDomainWithin(anchor - nextSpan * ratio, nextSpan, fullDomain);
};

export const panTimeDomain = (activeDomain, fullDomain, delta) => (
  fitDomainWithin(activeDomain.start + delta, getDomainSpan(activeDomain), fullDomain)
);

const RasterPlotWidget = ({
  spikes = [],
  selectedClusters = [],
  visibleClusterIds = null,
  clusterOrder = [],
  clusteringResults = null,
  clusterData = null,
  curatorDataset = null,
  highlightedSpikes = [],
  linkedTimeRange = null,
  onEventSelect
}) => {
  const canvasRef = useRef(null);
  const shellRef = useRef(null);
  const eventPositionsRef = useRef([]);
  const panStateRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [groupBy, setGroupBy] = useState('cluster');
  const [size, setSize] = useState({ width: 600, height: 320 });
  const [timeDomain, setTimeDomain] = useState(null);
  const [hover, setHover] = useState(null);
  const [rowScrollTop, setRowScrollTop] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  const events = useMemo(() => buildRasterEvents({
    spikes,
    selectedClusters,
    visibleClusterIds,
    clusteringResults,
    clusterData,
    curatorDataset
  }), [spikes, selectedClusters, visibleClusterIds, clusteringResults, clusterData, curatorDataset]);

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
  const selectedClusterSet = useMemo(() => selectedSetFrom(selectedClusters), [selectedClusters]);

  const rowValues = useMemo(() => {
    const values = new Set();
    events.forEach((event) => {
      const rowValue = groupBy === 'channel'
        ? event.channel ?? 'unknown'
        : event.clusterId ?? 'unassigned';
      values.add(String(rowValue));
    });

    const order = new Map((clusterOrder || []).map((clusterId, index) => [String(clusterId), index]));
    return Array.from(values).sort((left, right) => {
      if (groupBy === 'cluster' && order.size > 0) {
        const leftOrder = order.get(String(left));
        const rightOrder = order.get(String(right));
        if (leftOrder !== undefined || rightOrder !== undefined) {
          return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
        }
      }
      return String(left).localeCompare(String(right), undefined, { numeric: true });
    });
  }, [clusterOrder, events, groupBy]);

  const contentHeight = Math.max(
    size.height,
    TOP_GUTTER + BOTTOM_GUTTER + rowValues.length * MIN_ROW_HEIGHT
  );

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;

    const updateSize = () => {
      setSize({
        width: Math.max(320, Math.round(shell.clientWidth)),
        height: Math.max(220, Math.round(shell.clientHeight))
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
    if (shellRef.current) shellRef.current.scrollTop = 0;
    setRowScrollTop(0);
  }, [groupBy]);

  useEffect(() => {
    if (!events.length) return;

    const linkedStart = toFiniteNumber(linkedTimeRange?.start);
    const linkedEnd = toFiniteNumber(linkedTimeRange?.end);
    if (linkedStart !== null && linkedEnd !== null && linkedEnd > linkedStart) {
      const clampedStart = Math.max(fullDomain.start, linkedStart);
      const clampedEnd = Math.min(fullDomain.end, linkedEnd);
      setTimeDomain(clampedEnd > clampedStart
        ? { start: clampedStart, end: clampedEnd }
        : null);
      return;
    }

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
  }, [events, fullDomain, highlightedSpikes, linkedTimeRange, selectedClusters]);

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
    const plotHeight = Math.max(1, contentHeight - TOP_GUTTER - BOTTOM_GUTTER);
    const domainSpan = Math.max(1, activeDomain.end - activeDomain.start);
    const rowHeight = rowValues.length > 0 ? plotHeight / rowValues.length : plotHeight;
    const rowIndexMap = new Map(rowValues.map((row, index) => [row, index]));
    const positions = [];

    context.strokeStyle = 'rgba(148, 163, 184, 0.18)';
    context.lineWidth = 1;
    rowValues.forEach((row, rowIndex) => {
      const y = TOP_GUTTER + rowIndex * rowHeight + rowHeight / 2 - rowScrollTop;
      if (y < TOP_GUTTER - rowHeight || y > size.height - BOTTOM_GUTTER + rowHeight) return;
      context.beginPath();
      context.moveTo(LEFT_GUTTER, y);
      context.lineTo(size.width - RIGHT_GUTTER, y);
      context.stroke();

      if (rowHeight >= 12 || rowIndex % Math.ceil(14 / Math.max(rowHeight, 1)) === 0) {
        const selectedRow = groupBy === 'cluster' && selectedClusterSet.has(String(row));
        context.fillStyle = selectedRow ? '#7ddfd8' : 'rgba(226, 232, 240, 0.72)';
        context.font = `${selectedRow ? '600 ' : ''}11px system-ui, sans-serif`;
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
      const y = TOP_GUTTER + rowIndex * rowHeight + rowHeight / 2 - rowScrollTop;
      if (y < TOP_GUTTER || y > size.height - BOTTOM_GUTTER) return;
      const colorKey = groupBy === 'channel' ? event.clusterId : event.channel;
      const isHighlighted = highlightedSet.has(`${event.clusterId}:${event.pointIndex}`);
      const clusterSelected = selectedClusterSet.has(String(event.clusterId));
      const tickHalfHeight = Math.max(2, Math.min(8, rowHeight * 0.42));

      context.strokeStyle = isHighlighted ? '#ffffff' : getEventColor(colorKey ?? event.clusterId);
      context.lineWidth = isHighlighted ? 2.5 : (clusterSelected ? 1.5 : 1);
      context.beginPath();
      context.moveTo(x, y - tickHalfHeight);
      context.lineTo(x, y + tickHalfHeight);
      context.stroke();

      positions.push({ x, y, event });
    });

    eventPositionsRef.current = positions;

    context.strokeStyle = 'rgba(125, 223, 216, 0.45)';
    context.lineWidth = 1;
    context.strokeRect(LEFT_GUTTER, TOP_GUTTER, plotWidth, size.height - TOP_GUTTER - BOTTOM_GUTTER);

    context.fillStyle = 'rgba(226, 232, 240, 0.72)';
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (let tick = 0; tick <= 4; tick += 1) {
      const x = LEFT_GUTTER + (plotWidth * tick) / 4;
      const value = activeDomain.start + (domainSpan * tick) / 4;
      context.fillText(formatNumber(value), x, size.height - BOTTOM_GUTTER + 9);
    }
  }, [activeDomain, contentHeight, events, groupBy, highlightedSet, rowScrollTop, rowValues, selectedClusterSet, size]);

  const updateZoom = (factor, anchorRatio = 0.5) => {
    setTimeDomain(zoomTimeDomain(activeDomain, fullDomain, factor, anchorRatio));
  };

  const handlePointerMove = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (panStateRef.current) {
      const panState = panStateRef.current;
      const dx = x - panState.startX;
      if (Math.abs(dx) > 2) panState.moved = true;
      const plotWidth = Math.max(1, size.width - LEFT_GUTTER - RIGHT_GUTTER);
      const delta = -(dx / plotWidth) * getDomainSpan(panState.domain);
      setTimeDomain(panTimeDomain(panState.domain, fullDomain, delta));
      setHover(null);
      return;
    }

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
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (hover?.event && typeof onEventSelect === 'function') {
      onEventSelect(hover.event);
    }
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 || !timeDomain) return;
    const rect = canvasRef.current.getBoundingClientRect();
    panStateRef.current = {
      startX: event.clientX - rect.left,
      domain: activeDomain,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPanning(true);
  };

  const handlePointerUp = (event) => {
    if (!panStateRef.current) return;
    suppressClickRef.current = panStateRef.current.moved;
    panStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setIsPanning(false);
  };

  const handleWheel = (event) => {
    const plotWidth = Math.max(1, size.width - LEFT_GUTTER - RIGHT_GUTTER);

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const anchorRatio = (event.clientX - rect.left - LEFT_GUTTER) / plotWidth;
      updateZoom(Math.exp(event.deltaY * 0.002), anchorRatio);
      return;
    }

    if (timeDomain && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
      event.preventDefault();
      const pixels = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const delta = (pixels / plotWidth) * getDomainSpan(activeDomain);
      setTimeDomain(panTimeDomain(activeDomain, fullDomain, delta));
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
          <button type="button" onClick={() => updateZoom(0.5)} title="Zoom into the time axis">Zoom in</button>
          <button type="button" onClick={() => updateZoom(2)} title="Zoom out of the time axis">Zoom out</button>
          <button type="button" onClick={() => setTimeDomain(null)}>Fit</button>
        </div>

        <div className="raster-summary">
          <span>{events.length.toLocaleString()} events</span>
          <span>{rowValues.length.toLocaleString()} rows</span>
        </div>
      </div>

      <div
        className="raster-canvas-shell"
        ref={shellRef}
        onScroll={(event) => {
          setRowScrollTop(event.currentTarget.scrollTop);
          setHover(null);
        }}
      >
        {events.length === 0 ? (
          <div className="raster-empty">No spike events available.</div>
        ) : (
          <div className="raster-scroll-content" style={{ height: contentHeight }}>
            <div className="raster-canvas-layer" style={{ height: size.height }}>
              <canvas
                ref={canvasRef}
                className={`raster-canvas ${timeDomain ? 'pannable' : ''} ${isPanning ? 'panning' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => {
                  if (!panStateRef.current) setHover(null);
                }}
                onWheel={handleWheel}
                onClick={handleClick}
                title="Scroll rows vertically. Ctrl+wheel to zoom time; Shift+wheel or drag to pan."
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RasterPlotWidget;
