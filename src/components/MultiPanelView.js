import React, {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo
} from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import DockableWidget from './DockableWidget';
import WidgetBank, { WIDGET_DEFINITIONS } from './WidgetBank';
import RightSideMenu from './RightSideMenu';
import { STORAGE_KEY, CURRENT_VIEW_KEY } from './ViewManager';
import './MultiPanelView.css';
import AmplitudeProfileWidget from './AmplitudeProfileWidget';
import ClusterComparisonWidget from './ClusterComparisonWidget';
import CuratorWidget from './CuratorWidget';
import RasterPlotWidget from './RasterPlotWidget';
import CorrelogramWidget from './CorrelogramWidget';
import IsiHistogramWidget from './IsiHistogramWidget';
import AmplitudeTimeWidget from './AmplitudeTimeWidget';
import apiClient from '../api/client';

const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null, type: 'clusterList' },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null, type: 'spikeList' },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null, type: 'clusterStats' },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null, type: 'signalView' },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null, type: 'dimReduction' },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null, type: 'waveform' },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null, type: 'amplitudeProfile' },
  clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null, type: 'clusterComparison' },
  curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null, type: 'curator' },
  rasterPlot: { visible: false, minimized: false, maximized: false, order: 10, position: null, size: null, type: 'rasterPlot' },
  correlogram: { visible: false, minimized: false, maximized: false, order: 11, position: null, size: null, type: 'correlogram' },
  isiHistogram: { visible: false, minimized: false, maximized: false, order: 12, position: null, size: null, type: 'isiHistogram' },
  amplitudeTime: { visible: false, minimized: false, maximized: false, order: 13, position: null, size: null, type: 'amplitudeTime' }
};

const mergeWidgetStateDefaults = (states = {}) => {
  const merged = Object.fromEntries(Object.entries(DEFAULT_WIDGET_STATES).map(([widgetId, defaults]) => [
    widgetId,
    { ...defaults, ...(states?.[widgetId] || {}) },
  ]));
  Object.entries(states || {}).forEach(([widgetId, state]) => {
    if (!merged[widgetId]) merged[widgetId] = state;
  });
  return merged;
};

const MultiPanelView = forwardRef(({
  demoMode = false,
  selectedDataset,
  clusteringResults,
  selectedAlgorithm,
  datasetInfo,
  algorithms,
  onAlgorithmChange,
  onRunAlgorithm,
  isRunningAlgorithm,
  onOpenParameters,
  demoClusterPlotData = [],
  demoSpikeTable = [],
  demoClusterStats = [],
  demoWaveforms = {},
  demoSignalData = null
}, ref) => {
  const containerRef = useRef(null);

  const [clusters, setClusters] = useState([]);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [selectedSpike, setSelectedSpike] = useState(null);
  const [clusterStats, setClusterStats] = useState({});
  const [clusterData, setClusterData] = useState(null);
  const [clusterWaveforms, setClusterWaveforms] = useState({});
  const [highlightedSpikes, setHighlightedSpikes] = useState([]);
  const [focusedTimeRange, setFocusedTimeRange] = useState(null);
  const [clusterAnnotations, setClusterAnnotations] = useState({});
  const [visibleClusterOrder, setVisibleClusterOrder] = useState([]);
  const [waveformViewMode, setWaveformViewMode] = useState('single');

  const annotationStorageKey = useMemo(() => {
    const datasetKey = selectedDataset?.id || selectedDataset?.name || selectedDataset || (demoMode ? 'demo' : 'default');
    return `spikescope_cluster_annotations:${String(datasetKey)}:${selectedAlgorithm || 'none'}`;
  }, [demoMode, selectedAlgorithm, selectedDataset]);

  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
  const [currentViewId, setCurrentViewId] = useState(() => localStorage.getItem(CURRENT_VIEW_KEY) || 'default');

  const isDefaultView = currentViewId === 'default';

  const [widgetStates, setWidgetStates] = useState(() => {
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY) || 'default';
    const savedViews = localStorage.getItem(STORAGE_KEY);

    if (savedCurrentView && savedViews) {
      try {
        const views = JSON.parse(savedViews);
        const currentView = views.find(v => v.id === savedCurrentView);
        if (currentView?.widgetStates) {
          return mergeWidgetStateDefaults(currentView.widgetStates);
        }
      } catch (e) {
        console.error('Error loading widget states:', e);
      }
    }
    return DEFAULT_WIDGET_STATES;
  });

  useEffect(() => {
    const syncCurrentView = () => {
      const id = localStorage.getItem(CURRENT_VIEW_KEY) || 'default';
      setCurrentViewId(id);

      const savedViews = localStorage.getItem(STORAGE_KEY);
      if (id && savedViews) {
        try {
          const views = JSON.parse(savedViews);
          const currentView = views.find(v => v.id === id);
          if (currentView?.widgetStates) {
            setWidgetStates(mergeWidgetStateDefaults(currentView.widgetStates));
            return;
          }
        } catch (e) {
          console.error('Error syncing widget states:', e);
        }
      }

      setWidgetStates(DEFAULT_WIDGET_STATES);
    };

    syncCurrentView();
    window.addEventListener('storage', syncCurrentView);
    window.addEventListener('focus', syncCurrentView);

    return () => {
      window.removeEventListener('storage', syncCurrentView);
      window.removeEventListener('focus', syncCurrentView);
    };
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(annotationStorageKey);
      setClusterAnnotations(saved ? JSON.parse(saved) : {});
    } catch (error) {
      console.error('Error loading cluster annotations:', error);
      setClusterAnnotations({});
    }
  }, [annotationStorageKey]);

  useEffect(() => {
    if (!demoMode) return;

    const grouped = {};
    (demoClusterPlotData || []).forEach((point) => {
      const cid = point.clusterId;
      if (!grouped[cid]) grouped[cid] = [];
      grouped[cid].push(point);
    });

    const clusterIds = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    const normalizedClusters = clusterIds.map((clusterId, clusterIdx) => {
      const pointsArray = grouped[clusterId] || [];
      return {
        clusterId,
        clusterLabel: `Cluster ${clusterId}`,
        points: pointsArray.map((p) => [p.x, p.y]),
        spikeTimes: pointsArray.map((_, pointIdx) => 100 + pointIdx * 20),
        spikeChannels: pointsArray.map(() => [179, 181, 183][clusterIdx % 3]),
        pointCount: pointsArray.length
      };
    });

    setClusters(
      normalizedClusters.map((cluster) => ({
        id: cluster.clusterId,
        size: cluster.pointCount
      }))
    );

    setClusterData({
      clusters: normalizedClusters,
      clusterIds,
      numClusters: normalizedClusters.length,
      totalPoints: normalizedClusters.reduce((sum, c) => sum + c.pointCount, 0)
    });

    setSelectedClusters(clusterIds.slice(0, 3));

    setSpikes((demoSpikeTable || []).map((row) => ({
      time: row.spikeTime,
      clusterId: row.assignedClusterId
    })));

    const normalizedStats = {};
    (demoClusterStats || []).forEach((row) => {
      normalizedStats[row.clusterId] = {
        clusterId: row.clusterId,
        count: row.count,
        numSpikes: row.count,
        peakChannel: [179, 181, 183][(row.clusterId - 1) % 3],
        firingRateHz: row.count / 8,
        isiViolationRate: ((row.clusterId * 7) % 13) / 1000,
        meanAmplitude: row.meanAmplitude
      };
    });
    setClusterStats(normalizedStats);
    setClusterWaveforms(demoWaveforms || {});
  }, [demoMode, demoClusterPlotData, demoSpikeTable, demoClusterStats, demoWaveforms]);

  useEffect(() => {
    if (demoMode) return undefined;

    let cancelled = false;

    const clearClusterState = (preserveSelection = false) => {
      setClusters([]);
      if (!preserveSelection) setSelectedClusters([]);
      setSpikes([]);
      setSelectedSpike(null);
      setClusterStats({});
      setClusterData(null);
      setClusterWaveforms({});
      setHighlightedSpikes([]);
      setFocusedTimeRange(null);
    };

    const applyClusterData = (data) => {
      const normalizedClusters = Array.isArray(data?.clusters) ? data.clusters : [];
      const clusterIds = normalizedClusters.map((cluster, index) =>
        cluster.clusterId ?? cluster.id ?? index
      );

      setClusterData({
        ...data,
        clusters: normalizedClusters,
        clusterIds
      });
      setClusters(normalizedClusters.map((cluster, index) => ({
        id: cluster.clusterId ?? cluster.id ?? index,
        size: cluster.pointCount ?? cluster.numSpikes ?? cluster.points?.length ?? 0
      })));
      setSelectedClusters((previous) => {
        const availableIds = new Set(clusterIds.map(String));
        const stillAvailable = previous.filter((id) => availableIds.has(String(id)));
        return stillAvailable.length > 0 ? stillAvailable : clusterIds.slice(0, 3);
      });
    };

    const loadClusterList = async () => {
      clearClusterState(true);

      try {
        if (selectedAlgorithm === 'preprocessed_torchbci' || selectedAlgorithm === 'preprocessed_kilosort4') {
          const apiUrl = process.env.REACT_APP_API_URL || '';
          const response = await fetch(`${apiUrl}/api/cluster-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mode: 'real',
              channelMapping: {},
              algorithm: selectedAlgorithm
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to load cluster data (${response.status})`);
          }

          const data = await response.json();
          if (!cancelled) applyClusterData(data);
          return;
        }

        if (clusteringResults?.available) {
          const resultClusters = Array.isArray(clusteringResults.fullData)
            ? clusteringResults.fullData.map((clusterSpikes, index) => {
                const summary = clusteringResults.clusters?.[index] || {};
                const clusterId = summary.clusterId ?? index;
                return {
                  clusterId,
                  points: (clusterSpikes || []).map((spike) => [spike.x, spike.y]),
                  spikeTimes: (clusterSpikes || []).map((spike) => spike.time),
                  spikeChannels: (clusterSpikes || []).map((spike) => spike.channel),
                  pointCount: summary.numSpikes ?? clusterSpikes?.length ?? 0
                };
              })
            : (clusteringResults.clusters || []);

          if (!cancelled) {
            applyClusterData({
              ...clusteringResults,
              clusters: resultClusters
            });
          }
          return;
        }

        if (!cancelled) setSelectedClusters([]);
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching cluster list:', error);
          clearClusterState(false);
        }
      }
    };

    loadClusterList();
    return () => {
      cancelled = true;
    };
  }, [demoMode, selectedDataset, selectedAlgorithm, clusteringResults]);

  useEffect(() => {
    if (demoMode) return undefined;

    if (selectedClusters.length === 0) {
      setSpikes([]);
      setClusterWaveforms({});
      return undefined;
    }

    let cancelled = false;

    const loadSelectedClusterDetails = async () => {
      const clusterLookup = new Map(
        (clusterData?.clusters || []).map((cluster, index) => [
          String(cluster.clusterId ?? cluster.id ?? index),
          cluster
        ])
      );
      const nextSpikes = [];

      selectedClusters.forEach((clusterId) => {
        const cluster = clusterLookup.get(String(clusterId));
        (cluster?.spikeTimes || []).forEach((time, pointIndex) => {
          nextSpikes.push({
            time,
            clusterId,
            pointIndex,
            channel: cluster.spikeChannels?.[pointIndex] ?? cluster.channelId
          });
        });
      });

      nextSpikes.sort((a, b) => Number(a.time) - Number(b.time));
      setSpikes(nextSpikes);

      try {
        const waveformsData = await apiClient.getClusterWaveforms({
          clusterIds: selectedClusters,
          algorithm: selectedAlgorithm,
          includeSpikeIndices: highlightedSpikes,
        });

        if (!cancelled) {
          setClusterWaveforms(waveformsData.waveforms || {});
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching selected cluster details:', error);
        }
      }
    };

    loadSelectedClusterDetails();
    return () => {
      cancelled = true;
    };
  }, [demoMode, selectedClusters, clusterData, selectedAlgorithm, highlightedSpikes]);

  useEffect(() => {
    if (demoMode) return undefined;
    const clusterIds = clusterData?.clusterIds || [];
    if (clusterIds.length === 0) {
      setClusterStats({});
      return undefined;
    }

    let cancelled = false;
    apiClient.getClusterStatistics(clusterIds, selectedAlgorithm)
      .then((statisticsData) => {
        if (!cancelled) setClusterStats(statisticsData.statistics || {});
      })
      .catch((error) => {
        if (!cancelled) console.error('Error fetching cluster statistics:', error);
      });

    return () => { cancelled = true; };
  }, [clusterData, demoMode, selectedAlgorithm]);

  const handleClusterSelect = useCallback((clusterId, options = {}) => {
    const additive = Boolean(options.additive);
    setSelectedClusters((previous) => {
      if (!additive) return [clusterId];
      const alreadySelected = previous.some((id) => String(id) === String(clusterId));
      return alreadySelected
        ? previous.filter((id) => String(id) !== String(clusterId))
        : [...previous, clusterId];
    });
  }, []);

  const handleClusterPairSelect = useCallback((primaryClusterId, secondaryClusterId) => {
    setSelectedClusters(String(primaryClusterId) === String(secondaryClusterId)
      ? [primaryClusterId]
      : [primaryClusterId, secondaryClusterId]);
  }, []);

  const handleSpikeHighlight = useCallback((clusterOrEvent, pointIndex) => {
    const suppliedEvent = clusterOrEvent && typeof clusterOrEvent === 'object' ? clusterOrEvent : null;
    const clusterId = suppliedEvent?.clusterId ?? clusterOrEvent;
    const resolvedPointIndex = suppliedEvent?.pointIndex ?? suppliedEvent?.spikeIndex ?? pointIndex;
    const cluster = (clusterData?.clusters || []).find((candidate, index) => (
      String(candidate.clusterId ?? candidate.id ?? index) === String(clusterId)
    ));
    const event = {
      clusterId,
      pointIndex: Number.isFinite(Number(resolvedPointIndex)) ? Number(resolvedPointIndex) : 0,
      time: suppliedEvent?.time ?? suppliedEvent?.timeSamples ?? cluster?.spikeTimes?.[resolvedPointIndex],
      channel: suppliedEvent?.channel ?? cluster?.spikeChannels?.[resolvedPointIndex] ?? cluster?.channelId,
    };

    setHighlightedSpikes([event]);
    setSelectedClusters((previous) => previous.some((id) => String(id) === String(clusterId))
      ? previous
      : [clusterId, ...previous]);
  }, [clusterData]);

  useEffect(() => {
    setHighlightedSpikes((previous) => previous.filter((spike) => (
      selectedClusters.some((clusterId) => String(clusterId) === String(spike.clusterId))
    )));
  }, [selectedClusters]);

  const handleAnnotationChange = useCallback((clusterId, patch) => {
    setClusterAnnotations((previous) => {
      const key = String(clusterId);
      const next = {
        ...previous,
        [key]: { ...(previous[key] || {}), ...patch },
      };
      localStorage.setItem(annotationStorageKey, JSON.stringify(next));
      return next;
    });
  }, [annotationStorageKey]);

  const handleVisibleClusterOrderChange = useCallback((clusterIds) => {
    setVisibleClusterOrder((previous) => {
      if (previous.length === clusterIds.length && previous.every((id, index) => String(id) === String(clusterIds[index]))) {
        return previous;
      }
      return clusterIds;
    });
  }, []);

  const handleAmplitudeSummaries = useCallback((summaries) => {
    setClusterStats((previous) => {
      let changed = false;
      const next = { ...previous };
      Object.entries(summaries || {}).forEach(([clusterId, summary]) => {
        const meanAmplitude = Number(summary?.meanAmplitude);
        if (!Number.isFinite(meanAmplitude)) return;
        const current = previous[clusterId] || {};
        if (current.meanAmplitude === meanAmplitude) return;
        next[clusterId] = { ...current, meanAmplitude };
        changed = true;
      });
      return changed ? next : previous;
    });
  }, []);

  const handleTimeRangeSelect = useCallback((range) => {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const orderedStart = Math.max(0, Math.min(start, end));
    const orderedEnd = Math.max(start, end);
    const next = {
      start: orderedStart,
      end: orderedEnd > orderedStart ? orderedEnd : orderedStart + 1,
    };
    setFocusedTimeRange((previous) => {
      if (previous?.start === next.start && previous?.end === next.end) return previous;
      return next;
    });
  }, []);

  const persistCurrentView = useCallback((nextWidgetStates) => {
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY) || 'default';
    if (!savedCurrentView || savedCurrentView === 'default') return;

    try {
      const savedViews = localStorage.getItem(STORAGE_KEY);
      if (!savedViews) return;

      const views = JSON.parse(savedViews);
      const viewIndex = views.findIndex(v => v.id === savedCurrentView);
      if (viewIndex === -1) return;

      views[viewIndex] = {
        ...views[viewIndex],
        widgetStates: nextWidgetStates,
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch (e) {
      console.error('Error saving widget states:', e);
    }
  }, []);

  useEffect(() => {
    if (!isDefaultView) {
      persistCurrentView(widgetStates);
    }
  }, [widgetStates, persistCurrentView, isDefaultView]);

  const handleWidgetLayoutChange = useCallback((widgetId, layout) => {
    if (isDefaultView) return;

    setWidgetStates((prev) => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        position: layout.position ? { ...layout.position } : prev[widgetId].position,
        size: layout.size ? { ...layout.size } : prev[widgetId].size
      }
    }));
  }, [isDefaultView]);

  const handleToggleWidget = useCallback((widgetId) => {
    setWidgetStates((prev) => {
      const next = {
        ...prev,
        [widgetId]: {
          ...prev[widgetId],
          visible: !prev[widgetId].visible,
          minimized: false
        }
      };
      return next;
    });
  }, []);

  const handleMinimizeWidget = useCallback((widgetId) => {
    setWidgetStates((prev) => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        minimized: !prev[widgetId].minimized,
        maximized: false
      }
    }));
  }, []);

  const handleMaximizeWidget = useCallback((widgetId) => {
    setWidgetStates((prev) => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        maximized: !prev[widgetId].maximized,
        minimized: false
      }
    }));
  }, []);

  const handleCloseWidget = useCallback((widgetId) => {
    setWidgetStates((prev) => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: false
      }
    }));
  }, []);

  const handleResetLayout = useCallback(() => {
    if (isDefaultView) {
      setWidgetStates(DEFAULT_WIDGET_STATES);
      return;
    }

    setWidgetStates((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = {
          ...next[key],
          position: null,
          size: null
        };
      });
      return next;
    });
  }, [isDefaultView]);

  const handleViewChange = useCallback((newWidgetStates) => {
    setWidgetStates(mergeWidgetStateDefaults(JSON.parse(JSON.stringify(newWidgetStates))));
    const id = localStorage.getItem(CURRENT_VIEW_KEY) || 'default';
    setCurrentViewId(id);
  }, []);

  const handleAddWidget = useCallback((widget) => {
    const definition = WIDGET_DEFINITIONS[widget.id];
    const fallbackPosition = dropPosition || { top: 80, left: 80 };

    setWidgetStates((prev) => {
      const existing = prev[widget.id] || {};
      return {
        ...prev,
        [widget.id]: {
          ...existing,
          visible: true,
          minimized: false,
          maximized: false,
          position: isDefaultView
            ? existing.position || null
            : existing.position || fallbackPosition,
          size: isDefaultView
            ? existing.size || null
            : existing.size || definition?.defaultSize || { width: 300, height: 220 }
        }
      };
    });

    setDropPosition(null);
  }, [dropPosition, isDefaultView]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDefaultView) return;

    setIsDragOver(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropPosition({
        top: e.clientY - rect.top - 25,
        left: e.clientX - rect.left - 100
      });
    }
  }, [isDefaultView]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    if (isDefaultView) return;
    setIsDragOver(false);
    setDropPosition(null);
  }, [isDefaultView]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDefaultView) return;

    setIsDragOver(false);

    try {
      const widgetData = JSON.parse(e.dataTransfer.getData('application/json'));
      if (widgetData?.id) {
        handleAddWidget(widgetData);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }

    setDropPosition(null);
  }, [handleAddWidget, isDefaultView]);

  const getWidgetPositionsAndSizes = useCallback(() => widgetStates, [widgetStates]);

  useImperativeHandle(ref, () => ({
    handleToggleWidget,
    handleResetLayout,
    handleViewChange,
    getWidgetPositionsAndSizes,
    widgetStates,
    isWidgetBankOpen,
    setIsWidgetBankOpen
  }), [
    handleToggleWidget,
    handleResetLayout,
    handleViewChange,
    getWidgetPositionsAndSizes,
    widgetStates,
    isWidgetBankOpen
  ]);

  const getPanelStyle = useCallback((widgetId) => {
    if (isDefaultView) return {};

    const state = widgetStates[widgetId];
    if (!state?.position) return {};

    return {
      top: `${state.position.top}px`,
      left: `${state.position.left}px`
    };
  }, [isDefaultView, widgetStates]);

  const getWidgetStyle = useCallback((widgetId) => {
    if (isDefaultView) return {};

    const state = widgetStates[widgetId];
    if (!state?.size) return {};

    return {
      width: `${state.size.width}px`,
      height: `${state.size.height}px`,
      flex: 'none'
    };
  }, [isDefaultView, widgetStates]);

  const renderDockable = (widgetId, title, body, panelClassName) => {
    const state = widgetStates[widgetId];
    if (!state?.visible) return null;

    return (
      <div className={`panel ${panelClassName}`} style={getPanelStyle(widgetId)}>
        <DockableWidget
          id={widgetId}
          title={title}
          onClose={handleCloseWidget}
          onMinimize={handleMinimizeWidget}
          onMaximize={handleMaximizeWidget}
          onLayoutChange={handleWidgetLayoutChange}
          isMinimized={state.minimized}
          isMaximized={state.maximized}
          draggable={!isDefaultView ? true : true}
          resizable={!isDefaultView ? true : true}
          style={getWidgetStyle(widgetId)}
        >
          {body}
        </DockableWidget>
      </div>
    );
  };

  return (
    <div
      className={`multi-panel-view ${isDragOver ? 'drag-over' : ''}`}
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {!isDefaultView && isDragOver && dropPosition && (
        <div
          className="drop-indicator"
          style={{
            top: dropPosition.top,
            left: dropPosition.left
          }}
        >
          <span className="drop-indicator-icon">📥</span>
          <span>Drop widget here</span>
        </div>
      )}

      <button
        className={`widget-bank-floating-toggle ${isWidgetBankOpen ? 'active' : ''}`}
        onClick={() => setIsWidgetBankOpen((prev) => !prev)}
        type="button"
        title="Open widgets"
      >
        <span className="widget-bank-floating-icon">+</span>
        <span className="widget-bank-floating-text">Widgets</span>
      </button>

      <WidgetBank
        isOpen={isWidgetBankOpen}
        onClose={() => setIsWidgetBankOpen(false)}
        widgetStates={widgetStates}
        onAddWidget={handleAddWidget}
        onToggleWidget={handleToggleWidget}
      />

      <RightSideMenu
        isWidgetBankOpen={isWidgetBankOpen}
        onWidgetBankToggle={() => setIsWidgetBankOpen(!isWidgetBankOpen)}
        widgetStates={widgetStates}
        onViewChange={handleViewChange}
        getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
        algorithms={algorithms}
        selectedAlgorithm={selectedAlgorithm}
        onAlgorithmChange={onAlgorithmChange}
        onRunAlgorithm={onRunAlgorithm}
        isRunningAlgorithm={isRunningAlgorithm}
        onOpenParameters={onOpenParameters}
      />

      {renderDockable(
        'clusterList',
        'Cluster Curation Table',
        <ClusterListTable
          clusters={clusters}
          selectedClusters={selectedClusters}
          clusterStats={clusterStats}
          clusterAnnotations={clusterAnnotations}
          onClusterSelect={handleClusterSelect}
          onAnnotationChange={handleAnnotationChange}
          onVisibleClustersChange={handleVisibleClusterOrderChange}
        />,
        'panel-cluster-list'
      )}
      {renderDockable(
  'amplitudeProfile',
  'Amplitude Distribution',
  <AmplitudeProfileWidget
    selectedClusters={selectedClusters}
    clusterWaveforms={clusterWaveforms}
    clusteringResults={clusteringResults}
    selectedAlgorithm={selectedAlgorithm}
    demoMode={demoMode}
  />,
  'panel-amplitude-profile'
)}

{renderDockable(
  'clusterComparison',
  'Cluster Comparison',
  <ClusterComparisonWidget
    selectedDataset={selectedDataset}
    clusteringResults={clusteringResults}
    selectedAlgorithm={selectedAlgorithm}
    selectedClusters={selectedClusters}
    demoMode={demoMode}
  />,
  'panel-cluster-comparison'
)}

{renderDockable(
  'curator',
  'Curator',
  <CuratorWidget
    selectedDataset={selectedDataset}
    clusteringResults={clusteringResults}
    selectedAlgorithm={selectedAlgorithm}
    selectedClusters={selectedClusters}
    clusterStats={clusterStats}
    spikes={spikes}
    demoMode={demoMode}
  />,
  'panel-curator'
)}

{renderDockable(
  'rasterPlot',
  'Raster Plot',
  <RasterPlotWidget
    spikes={spikes}
    selectedClusters={selectedClusters}
    selectedAlgorithm={selectedAlgorithm}
    clusteringResults={clusteringResults}
    clusterData={clusterData}
    visibleClusterIds={visibleClusterOrder}
    clusterOrder={visibleClusterOrder}
    highlightedSpikes={highlightedSpikes}
    linkedTimeRange={focusedTimeRange}
    onEventSelect={handleSpikeHighlight}
    demoMode={demoMode}
  />,
  'panel-raster-plot'
)}
      {renderDockable(
        'correlogram',
        'Correlogram Matrix',
        <CorrelogramWidget
          selectedClusters={selectedClusters}
          spikes={spikes}
          clusterData={clusterData}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          datasetInfo={datasetInfo}
          demoMode={demoMode}
          onClusterSelect={handleClusterSelect}
          onClusterPairSelect={handleClusterPairSelect}
        />,
        'panel-correlogram'
      )}

      {renderDockable(
        'isiHistogram',
        'Inter-Spike Interval Histogram',
        <IsiHistogramWidget
          selectedClusters={selectedClusters}
          spikes={spikes}
          clusterData={clusterData}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          datasetInfo={datasetInfo}
          demoMode={demoMode}
          onClusterSelect={handleClusterSelect}
        />,
        'panel-isi-histogram'
      )}

      {renderDockable(
        'amplitudeTime',
        'Amplitude vs Time / Drift',
        <AmplitudeTimeWidget
          selectedClusters={selectedClusters}
          spikes={spikes}
          clusterData={clusterData}
          clusterWaveforms={clusterWaveforms}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          datasetInfo={datasetInfo}
          demoMode={demoMode}
          highlightedSpikes={highlightedSpikes}
          linkedTimeRange={focusedTimeRange}
          onTimeRangeSelect={handleTimeRangeSelect}
          onSpikeSelect={handleSpikeHighlight}
          onSummaryChange={handleAmplitudeSummaries}
        />,
        'panel-amplitude-time'
      )}
      {renderDockable(
        'spikeList',
        'Spike List Table',
        <SpikeListTable
          spikes={spikes}
          selectedSpike={selectedSpike}
          onSpikeSelect={(index, spike) => {
            setSelectedSpike(index);
            handleSpikeHighlight(spike);
          }}
          selectedClusters={selectedClusters}
        />,
        'panel-spike-list'
      )}

      {renderDockable(
        'clusterStats',
        'Cluster Statistics Window',
        <ClusterStatisticsWindow
          selectedClusters={selectedClusters}
          clusterStats={clusterStats}
        />,
        'panel-cluster-stats'
      )}

      {renderDockable(
        'signalView',
        'Signal View',
        <SignalViewPanel
          demoMode={demoMode}
          highlightedSpikes={highlightedSpikes}
          linkedTimeRange={focusedTimeRange}
          onTimeRangeChange={handleTimeRangeSelect}
          datasetInfo={datasetInfo}
          demoSignalData={demoSignalData}
        />,
        'panel-signal-view'
      )}

      {renderDockable(
        'dimReduction',
        'Dimensionality Reduction Plot View (PCA)',
        <DimensionalityReductionPanel
          clusterData={clusterData}
          selectedClusters={selectedClusters}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          selectedSpike={highlightedSpikes.length > 0 ? {
            clusterId: highlightedSpikes[0].clusterId,
            pointIndex: highlightedSpikes[0].pointIndex
          } : null}
          onSpikeClick={handleSpikeHighlight}
        />,
        'panel-dim-reduction'
      )}

      {renderDockable(
        'waveform',
        'Waveform View',
        <>
          <div className="waveform-view-toggle">
            <button
              className={waveformViewMode === 'single' ? 'active' : ''}
              onClick={() => setWaveformViewMode('single')}
            >
              Single Channel
            </button>
            <button
              className={waveformViewMode === 'neighboring' ? 'active' : ''}
              onClick={() => setWaveformViewMode('neighboring')}
            >
              Multi Channel
            </button>
          </div>

          {waveformViewMode === 'single' ? (
            <WaveformSingleChannelView
              selectedClusters={selectedClusters}
              clusterWaveforms={clusterWaveforms}
              highlightedSpike={highlightedSpikes.length > 0 ? {
                clusterId: highlightedSpikes[0].clusterId,
                spikeIndex: highlightedSpikes[0].pointIndex
              } : null}
            />
          ) : (
            <WaveformNeighboringChannelsView
              selectedClusters={selectedClusters}
              selectedAlgorithm={selectedAlgorithm}
              demoMode={demoMode}
              demoWaveforms={demoWaveforms}
            />
          )}
        </>,
        'panel-waveform'
      )}
    </div>
  );
});

MultiPanelView.displayName = 'MultiPanelView';
export default MultiPanelView;
