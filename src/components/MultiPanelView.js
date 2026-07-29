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
import {
  STORAGE_KEY,
  CURRENT_VIEW_KEY,
  getScopedStorageKey,
} from './ViewManager';
import './MultiPanelView.css';
import AmplitudeProfileWidget from './AmplitudeProfileWidget';
import ClusterComparisonWidget from './ClusterComparisonWidget';
import CuratorWidget from './CuratorWidget';
import RasterPlotWidget from './RasterPlotWidget';
import CorrelogramWidget from './CorrelogramWidget';
import IsiHistogramWidget from './IsiHistogramWidget';
import AmplitudeTimeWidget from './AmplitudeTimeWidget';
import CanvasMinimap from './CanvasMinimap';
import apiClient from '../api/client';
import {
  DEFAULT_DISPLAY_SETTINGS,
  normalizeDisplaySettings,
  readDisplaySettings,
} from '../utils/displaySettings';
import {
  createDashboardDataFromCuratorDataset,
  createWaveformPcaClusterData,
  normalizeCuratorDatasetTimes,
  reconcileCuratorClusterSelection,
} from '../utils/curatorDataset';
import {
  createDashboardPipelineVariables,
  mergeWidgetInputBindings,
} from '../widgets/dataContracts';
import {
  getViewportCenteredWidgetPosition,
  screenToCanvasPoint,
  zoomViewportAtPoint,
} from '../utils/canvasViewport';
import {
  CANVAS_WHEEL_ACTIONS,
  getCanvasWheelAction,
} from '../utils/canvasWheel';
import {
  clearSessionCache,
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';

const DISPLAY_SETTINGS_STORAGE_KEY = 'spikescope_display_settings:v1';
const WIDGET_BINDINGS_STORAGE_KEY = 'spikescope_widget_input_bindings:v1';
const CANVAS_OVERLAY_IDLE_MS = 3000;

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
  onStopAlgorithm,
  isRunningAlgorithm,
  pipelineJob,
  pipelineStatus,
  pipelineMessage,
  pipelineError,
  onOpenParameters,
  customPipelines = [],
  isLoadingCustomPipelines = false,
  customPipelineError = null,
  onAddCustomPipeline,
  onDeleteCustomPipeline,
  canManageCustomPipelines = false,
  savedViews,
  savedCurrentViewId,
  onPersistViews,
  layoutStorageScope,
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
  const [curatorDataset, setCuratorDataset] = useState(null);
  const [waveformViewMode, setWaveformViewMode] = useState('single');
  const [displaySettings, setDisplaySettings] = useState(() => (
    readDisplaySettings(window.localStorage, DISPLAY_SETTINGS_STORAGE_KEY)
  ));
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isCanvasPanning, setIsCanvasPanning] = useState(false);
  const canvasPanRef = useRef(null);
  const dashboardCanvasRef = useRef(null);
  const zoomIndicatorTimerRef = useRef(null);
  const minimapTimerRef = useRef(null);
  const [isZoomIndicatorVisible, setIsZoomIndicatorVisible] = useState(true);
  const [isMinimapVisible, setIsMinimapVisible] = useState(true);
  const [canvasGeometry, setCanvasGeometry] = useState({
    width: 0,
    height: 0,
    widgets: [],
  });
  const [widgetLoading, setWidgetLoading] = useState({});
  const sessionCacheInputsRef = useRef({
    clusteringResults,
    curatorDataset,
    selectedAlgorithm,
    selectedDataset,
  });
  const [widgetInputBindings, setWidgetInputBindings] = useState(() => {
    try {
      const saved = localStorage.getItem(WIDGET_BINDINGS_STORAGE_KEY);
      return mergeWidgetInputBindings(saved ? JSON.parse(saved) : {});
    } catch (error) {
      return mergeWidgetInputBindings();
    }
  });

  const annotationStorageKey = useMemo(() => {
    const datasetKey = selectedDataset?.id || selectedDataset?.name || selectedDataset || (demoMode ? 'demo' : 'default');
    return `spikescope_cluster_annotations:${String(datasetKey)}:${selectedAlgorithm || 'none'}`;
  }, [demoMode, selectedAlgorithm, selectedDataset]);

  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
  const [currentViewId, setCurrentViewId] = useState(() => (
    savedCurrentViewId ||
    localStorage.getItem(getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope)) ||
    'default'
  ));

  const isDefaultView = currentViewId === 'default';
  const dataCacheScope = useMemo(() => createSessionCacheKey('data-scope', [
    selectedDataset?.id || selectedDataset?.name || selectedDataset || (demoMode ? 'demo' : 'default'),
    selectedAlgorithm || 'none',
    getSessionObjectId(clusteringResults),
    getSessionObjectId(curatorDataset),
  ]), [
    clusteringResults,
    curatorDataset,
    demoMode,
    selectedAlgorithm,
    selectedDataset,
  ]);

  const [widgetStates, setWidgetStates] = useState(() => {
    const localCurrentView =
      localStorage.getItem(getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope)) ||
      'default';
    const initialCurrentView = savedCurrentViewId || localCurrentView;
    const accountViews = Array.isArray(savedViews) ? savedViews : [];
    const accountView = accountViews.find((view) => view.id === initialCurrentView);

    if (accountView?.widgetStates) {
      return mergeWidgetStateDefaults(accountView.widgetStates);
    }

    const localViews = localStorage.getItem(
      getScopedStorageKey(STORAGE_KEY, layoutStorageScope)
    );

    if (initialCurrentView && localViews) {
      try {
        const views = JSON.parse(localViews);
        const currentView = views.find((view) => view.id === initialCurrentView);
        if (currentView?.widgetStates) {
          return mergeWidgetStateDefaults(currentView.widgetStates);
        }
      } catch (e) {
        console.error('Error loading widget states:', e);
      }
    }
    return DEFAULT_WIDGET_STATES;
  });
  const hasMaximizedWidget = Object.values(widgetStates).some(
    (state) => state.visible && state.maximized
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(annotationStorageKey);
      const annotations = saved ? JSON.parse(saved) : {};
      const layoutGroups = widgetStates.clusterList?.clusterGroups || {};
      Object.entries(layoutGroups).forEach(([clusterId, group]) => {
        annotations[clusterId] = {
          ...(annotations[clusterId] || {}),
          group,
        };
      });
      setClusterAnnotations(annotations);
    } catch (error) {
      console.error('Error loading cluster annotations:', error);
      setClusterAnnotations({});
    }
  }, [annotationStorageKey, widgetStates.clusterList?.clusterGroups]);

  useEffect(() => {
    localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(displaySettings));
  }, [displaySettings]);

  useEffect(() => {
    localStorage.setItem(WIDGET_BINDINGS_STORAGE_KEY, JSON.stringify(widgetInputBindings));
  }, [widgetInputBindings]);

  const handleWidgetLoadingChange = useCallback((widgetId, loading, label = '') => {
    setWidgetLoading((current) => {
      const nextValue = loading ? { loading: true, label } : null;
      if (
        current[widgetId]?.loading === Boolean(nextValue?.loading) &&
        current[widgetId]?.label === (nextValue?.label || '')
      ) {
        return current;
      }
      return { ...current, [widgetId]: nextValue };
    });
  }, []);

  useEffect(() => {
    const previous = sessionCacheInputsRef.current;
    const dataChanged =
      previous.clusteringResults !== clusteringResults ||
      previous.curatorDataset !== curatorDataset ||
      previous.selectedAlgorithm !== selectedAlgorithm ||
      previous.selectedDataset !== selectedDataset;

    sessionCacheInputsRef.current = {
      clusteringResults,
      curatorDataset,
      selectedAlgorithm,
      selectedDataset,
    };

    if (dataChanged) clearSessionCache('widget-data');
  }, [clusteringResults, curatorDataset, selectedAlgorithm, selectedDataset]);

  const revealZoomIndicator = useCallback(() => {
    setIsZoomIndicatorVisible(true);
    if (zoomIndicatorTimerRef.current) {
      clearTimeout(zoomIndicatorTimerRef.current);
    }
    zoomIndicatorTimerRef.current = setTimeout(() => {
      setIsZoomIndicatorVisible(false);
    }, CANVAS_OVERLAY_IDLE_MS);
  }, []);

  const revealMinimap = useCallback(() => {
    setIsMinimapVisible(true);
    if (minimapTimerRef.current) {
      clearTimeout(minimapTimerRef.current);
    }
    minimapTimerRef.current = setTimeout(() => {
      setIsMinimapVisible(false);
    }, CANVAS_OVERLAY_IDLE_MS);
  }, []);

  useEffect(() => {
    revealZoomIndicator();
    revealMinimap();

    return () => {
      if (zoomIndicatorTimerRef.current) clearTimeout(zoomIndicatorTimerRef.current);
      if (minimapTimerRef.current) clearTimeout(minimapTimerRef.current);
    };
  }, [revealMinimap, revealZoomIndicator]);

  const measureCanvasGeometry = useCallback(() => {
    const container = containerRef.current;
    const canvas = dashboardCanvasRef.current;
    if (!container || !canvas) return;

    const widgets = Array.from(canvas.querySelectorAll('.panel')).map((panel) => {
      const widget = panel.querySelector('.dockable-widget');
      if (!widget) return null;
      const panelStyle = window.getComputedStyle(panel);
      const widgetRect = widget.getBoundingClientRect();

      return {
        id: widget.dataset.widgetId,
        x: Number.isFinite(panel.offsetLeft)
          ? panel.offsetLeft
          : parseFloat(panelStyle.left) || 0,
        y: Number.isFinite(panel.offsetTop)
          ? panel.offsetTop
          : parseFloat(panelStyle.top) || 0,
        width: widget.offsetWidth || widgetRect.width / displaySettings.scale,
        height: widget.offsetHeight || widgetRect.height / displaySettings.scale,
      };
    }).filter(Boolean);
    const nextGeometry = {
      width: container.clientWidth || container.getBoundingClientRect().width,
      height: container.clientHeight || container.getBoundingClientRect().height,
      widgets,
    };

    setCanvasGeometry((current) => (
      JSON.stringify(current) === JSON.stringify(nextGeometry)
        ? current
        : nextGeometry
    ));
  }, [displaySettings.scale]);

  useEffect(() => {
    measureCanvasGeometry();
    const container = containerRef.current;
    const canvas = dashboardCanvasRef.current;
    if (!container || !canvas) return undefined;

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measureCanvasGeometry);
    observer?.observe(container);
    canvas.querySelectorAll('.dockable-widget').forEach((widget) => observer?.observe(widget));
    window.addEventListener('resize', measureCanvasGeometry);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measureCanvasGeometry);
    };
  }, [measureCanvasGeometry, widgetStates]);

  const setCanvasZoom = useCallback((requestedScale, point) => {
    revealZoomIndicator();
    revealMinimap();
    const nextSettings = normalizeDisplaySettings({
      ...displaySettings,
      scale: requestedScale,
    });
    const rect = containerRef.current?.getBoundingClientRect();
    const anchor = point || {
      x: (rect?.width || 0) / 2,
      y: (rect?.height || 0) / 2,
    };
    const nextView = zoomViewportAtPoint(
      { ...canvasOffset, zoom: displaySettings.scale },
      nextSettings.scale,
      anchor
    );

    setCanvasOffset({ x: nextView.x, y: nextView.y });
    setDisplaySettings(nextSettings);
  }, [canvasOffset, displaySettings, revealMinimap, revealZoomIndicator]);

  const handleDisplaySettingsChange = useCallback((patch) => {
    if (patch.scale !== undefined) {
      setCanvasZoom(patch.scale);
      return;
    }
    setDisplaySettings((current) => normalizeDisplaySettings({ ...current, ...patch }));
  }, [setCanvasZoom]);

  const handleResetDisplaySettings = useCallback(() => {
    setDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS });
    setCanvasOffset({ x: 0, y: 0 });
    revealZoomIndicator();
    revealMinimap();
  }, [revealMinimap, revealZoomIndicator]);

  const handleResetCanvasView = useCallback(() => {
    setDisplaySettings((current) => ({ ...current, scale: 1 }));
    setCanvasOffset({ x: 0, y: 0 });
    revealZoomIndicator();
    revealMinimap();
  }, [revealMinimap, revealZoomIndicator]);

  const handleCanvasMouseMove = useCallback((event) => {
    const pan = canvasPanRef.current;
    if (!pan) return;
    revealMinimap();
    setCanvasOffset({
      x: pan.offsetX + event.clientX - pan.clientX,
      y: pan.offsetY + event.clientY - pan.clientY,
    });
  }, [revealMinimap]);

  const handleCanvasMouseUp = useCallback(() => {
    canvasPanRef.current = null;
    setIsCanvasPanning(false);
    document.removeEventListener('mousemove', handleCanvasMouseMove);
    document.removeEventListener('mouseup', handleCanvasMouseUp);
  }, [handleCanvasMouseMove]);

  const handleCanvasMouseDown = useCallback((event) => {
    const isMiddleButton = event.button === 1;
    const isCanvasBackground = event.button === 0
      && !event.target.closest('.dockable-widget')
      && !event.target.closest('.dashboard-overlay');
    if (!isMiddleButton && !isCanvasBackground) return;

    event.preventDefault();
    revealMinimap();
    canvasPanRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: canvasOffset.x,
      offsetY: canvasOffset.y,
    };
    setIsCanvasPanning(true);
    document.addEventListener('mousemove', handleCanvasMouseMove);
    document.addEventListener('mouseup', handleCanvasMouseUp);
  }, [canvasOffset, handleCanvasMouseMove, handleCanvasMouseUp, revealMinimap]);

  useEffect(() => () => {
    document.removeEventListener('mousemove', handleCanvasMouseMove);
    document.removeEventListener('mouseup', handleCanvasMouseUp);
  }, [handleCanvasMouseMove, handleCanvasMouseUp]);

  const handleCanvasWheel = useCallback((event) => {
    const action = getCanvasWheelAction(event);
    if (action === CANVAS_WHEEL_ACTIONS.IGNORE) return;

    event.preventDefault();
    if (action === CANVAS_WHEEL_ACTIONS.PREVENT_BROWSER_ZOOM) return;
    revealMinimap();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (action === CANVAS_WHEEL_ACTIONS.ZOOM) {
      const zoomFactor = Math.exp(-event.deltaY * 0.002);
      setCanvasZoom(displaySettings.scale * zoomFactor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      return;
    }

    setCanvasOffset((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }, [displaySettings.scale, revealMinimap, setCanvasZoom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    container.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleCanvasWheel);
  }, [handleCanvasWheel]);

  const handleWidgetBindingChange = useCallback((widgetId, inputId, variableId) => {
    setWidgetInputBindings((current) => mergeWidgetInputBindings({
      ...current,
      [widgetId]: {
        ...(current[widgetId] || {}),
        [inputId]: variableId,
      },
    }));
  }, []);

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
    handleWidgetLoadingChange('clusterList', true, 'Loading clusters…');
    handleWidgetLoadingChange('dimReduction', true, 'Updating cluster projection…');

    const clearClusterState = (preserveSelection = false) => {
      setCuratorDataset(null);
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
      } finally {
        if (!cancelled) {
          handleWidgetLoadingChange('clusterList', false);
          handleWidgetLoadingChange('dimReduction', false);
        }
      }
    };

    loadClusterList();
    return () => {
      cancelled = true;
    };
  }, [
    clusteringResults,
    demoMode,
    handleWidgetLoadingChange,
    selectedAlgorithm,
    selectedDataset,
  ]);

  useEffect(() => {
    if (demoMode) return undefined;

    if (selectedClusters.length === 0) {
      setSpikes([]);
      setClusterWaveforms({});
      handleWidgetLoadingChange('waveform', false);
      handleWidgetLoadingChange('amplitudeProfile', false);
      if (curatorDataset) handleWidgetLoadingChange('dimReduction', false);
      return undefined;
    }

    let cancelled = false;
    handleWidgetLoadingChange('waveform', true, 'Loading waveforms…');
    handleWidgetLoadingChange('amplitudeProfile', true, 'Updating amplitudes…');
    if (curatorDataset) {
      handleWidgetLoadingChange('dimReduction', true, 'Updating cluster projection…');
    }

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
        const selectedIds = new Set(selectedClusters.map(String));
        const explicitClusters = curatorDataset
          ? curatorDataset.clusters.filter((cluster) => selectedIds.has(String(cluster.id)))
          : [];
        const requestParams = {
          clusterIds: curatorDataset ? [] : selectedClusters,
          clusters: explicitClusters,
          maxWaveforms: curatorDataset ? 30 : 100,
          algorithm: selectedAlgorithm,
          includeSpikeIndices: highlightedSpikes,
        };
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          'waveforms',
          selectedClusters,
          requestParams.maxWaveforms,
          selectedAlgorithm,
          highlightedSpikes,
        ]);
        const waveformsData = await getOrLoadSessionCache(
          cacheKey,
          () => apiClient.getClusterWaveforms(requestParams)
        );

        if (!cancelled) {
          const embeddedWaveforms = createDashboardDataFromCuratorDataset(
            curatorDataset
          ).clusterWaveforms;
          const extractedWaveforms = waveformsData.waveforms || {};
          const nonEmptyExtracted = Object.fromEntries(
            Object.entries(extractedWaveforms).filter(([, waveforms]) => (
              Array.isArray(waveforms) && waveforms.length > 0
            ))
          );
          setClusterWaveforms({
            ...nonEmptyExtracted,
            ...embeddedWaveforms,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching selected cluster details:', error);
        }
      } finally {
        if (!cancelled) {
          handleWidgetLoadingChange('waveform', false);
          handleWidgetLoadingChange('amplitudeProfile', false);
          if (curatorDataset) handleWidgetLoadingChange('dimReduction', false);
        }
      }
    };

    loadSelectedClusterDetails();
    return () => {
      cancelled = true;
    };
  }, [
    clusterData,
    curatorDataset,
    dataCacheScope,
    demoMode,
    handleWidgetLoadingChange,
    highlightedSpikes,
    selectedAlgorithm,
    selectedClusters,
  ]);

  useEffect(() => {
    if (demoMode) return undefined;
    if (curatorDataset) return undefined;
    const clusterIds = clusterData?.clusterIds || [];
    if (clusterIds.length === 0) {
      setClusterStats({});
      handleWidgetLoadingChange('clusterStats', false);
      return undefined;
    }

    let cancelled = false;
    handleWidgetLoadingChange('clusterStats', true, 'Loading statistics…');
    apiClient.getClusterStatistics(clusterIds, selectedAlgorithm)
      .then((statisticsData) => {
        if (!cancelled) setClusterStats(statisticsData.statistics || {});
      })
      .catch((error) => {
        if (!cancelled) console.error('Error fetching cluster statistics:', error);
      })
      .finally(() => {
        if (!cancelled) handleWidgetLoadingChange('clusterStats', false);
      });

    return () => { cancelled = true; };
  }, [
    clusterData,
    curatorDataset,
    demoMode,
    handleWidgetLoadingChange,
    selectedAlgorithm,
  ]);

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

  const handleCuratorDatasetChange = useCallback((dataset) => {
    if (!dataset || !Array.isArray(dataset.clusters)) return;

    const normalizedDataset = normalizeCuratorDatasetTimes(dataset, datasetInfo);
    const dashboardData = createDashboardDataFromCuratorDataset(normalizedDataset);
    const clusterIds = dashboardData.clusterData.clusterIds;

    setCuratorDataset(normalizedDataset);
    setClusters(dashboardData.clusters);
    setClusterData(dashboardData.clusterData);
    setClusterStats(dashboardData.clusterStats);
    setSpikes([]);
    setSelectedSpike(null);
    setClusterWaveforms(dashboardData.clusterWaveforms);
    setHighlightedSpikes([]);
    setFocusedTimeRange(null);
    setVisibleClusterOrder(clusterIds);
    setSelectedClusters((previous) => (
      reconcileCuratorClusterSelection(previous, clusterIds)
    ));
  }, [datasetInfo]);

  const handleCuratorSelectionChange = useCallback((clusterIds) => {
    setSelectedClusters(Array.isArray(clusterIds) ? clusterIds : []);
  }, []);

  const pcaClusterData = useMemo(() => (
    curatorDataset
      ? createWaveformPcaClusterData(clusterData, clusterWaveforms)
      : clusterData
  ), [clusterData, clusterWaveforms, curatorDataset]);

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
    if (patch.group) {
      setWidgetStates((previous) => ({
        ...previous,
        clusterList: {
          ...previous.clusterList,
          clusterGroups: {
            ...(previous.clusterList?.clusterGroups || {}),
            [String(clusterId)]: patch.group,
          },
        },
      }));
    }
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

  const handleWidgetLayoutChange = useCallback((widgetId, layout) => {
    revealMinimap();
    setWidgetStates((prev) => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        position: layout.position ? { ...layout.position } : prev[widgetId].position,
        size: layout.size ? { ...layout.size } : prev[widgetId].size
      }
    }));
  }, [revealMinimap]);

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

  const handleViewChange = useCallback((newWidgetStates, nextViewId) => {
    setWidgetStates(mergeWidgetStateDefaults(JSON.parse(JSON.stringify(newWidgetStates))));
    setCurrentViewId(
      nextViewId ||
      localStorage.getItem(getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope)) ||
      'default'
    );
  }, [layoutStorageScope]);

  const handleAddWidget = useCallback((widget) => {
    const definition = WIDGET_DEFINITIONS[widget.id];
    const container = containerRef.current;

    setWidgetStates((prev) => {
      const existing = prev[widget.id] || {};
      const size = existing.size || definition?.defaultSize || { width: 300, height: 220 };
      const rect = container?.getBoundingClientRect();
      const focusedPosition = rect
        ? getViewportCenteredWidgetPosition({
            containerWidth: rect.width,
            containerHeight: rect.height,
            widgetWidth: size.width,
            widgetHeight: size.height,
            viewport: {
              ...canvasOffset,
              zoom: displaySettings.scale,
            },
          })
        : { top: 80, left: 80 };
      return {
        ...prev,
        [widget.id]: {
          ...existing,
          visible: true,
          minimized: false,
          maximized: false,
          position: dropPosition || focusedPosition,
          size
        }
      };
    });

    setDropPosition(null);
  }, [canvasOffset, displaySettings.scale, dropPosition]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isDefaultView) return;

    setIsDragOver(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasPoint = screenToCanvasPoint({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }, {
        ...canvasOffset,
        zoom: displaySettings.scale,
      });
      setDropPosition({
        top: canvasPoint.top - 25,
        left: canvasPoint.left - 100,
      });
    }
  }, [canvasOffset, displaySettings.scale, isDefaultView]);

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
    const state = widgetStates[widgetId];
    if (!state?.position) return {};

    return {
      top: `${state.position.top}px`,
      left: `${state.position.left}px`
    };
  }, [widgetStates]);

  const getWidgetStyle = useCallback((widgetId) => {
    const state = widgetStates[widgetId];
    if (!state?.size) return {};

    return {
      width: `${state.size.width}px`,
      height: `${state.size.height}px`,
      flex: 'none'
    };
  }, [widgetStates]);

  const pipelineVariables = useMemo(() => createDashboardPipelineVariables({
    clusters,
    selectedClusters,
    visibleClusterOrder,
    spikes,
    highlightedSpikes,
    clusterStats,
    clusterAnnotations,
    clusterData,
    clusterWaveforms,
    clusteringResults,
    signalData: demoSignalData,
    datasetInfo,
    focusedTimeRange,
  }), [
    clusterAnnotations,
    clusterData,
    clusterStats,
    clusterWaveforms,
    clusteringResults,
    clusters,
    datasetInfo,
    demoSignalData,
    focusedTimeRange,
    highlightedSpikes,
    selectedClusters,
    spikes,
    visibleClusterOrder,
  ]);
  const minimapViewport = useMemo(() => {
    const zoom = hasMaximizedWidget ? 1 : displaySettings.scale;
    const offset = hasMaximizedWidget ? { x: 0, y: 0 } : canvasOffset;

    return {
      x: -offset.x / zoom,
      y: -offset.y / zoom,
      width: canvasGeometry.width / zoom,
      height: canvasGeometry.height / zoom,
    };
  }, [
    canvasGeometry.height,
    canvasGeometry.width,
    canvasOffset,
    displaySettings.scale,
    hasMaximizedWidget,
  ]);

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
          interactionScale={state.maximized ? 1 : displaySettings.scale}
          layoutPosition={state.position}
          style={getWidgetStyle(widgetId)}
          isLoading={Boolean(widgetLoading[widgetId]?.loading)}
          loadingLabel={widgetLoading[widgetId]?.label}
        >
          {body}
        </DockableWidget>
      </div>
    );
  };

  return (
    <div
      className={`multi-panel-view density-${displaySettings.density} ${isDragOver ? 'drag-over' : ''} ${isCanvasPanning ? 'canvas-panning' : ''}`}
      ref={containerRef}
      style={{
        '--canvas-zoom': displaySettings.scale,
        '--canvas-offset-x': `${canvasOffset.x}px`,
        '--canvas-offset-y': `${canvasOffset.y}px`,
      }}
      onMouseDown={handleCanvasMouseDown}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dashboard-overlay">
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
          demoMode={demoMode}
          isWidgetBankOpen={isWidgetBankOpen}
          onWidgetBankToggle={() => setIsWidgetBankOpen(!isWidgetBankOpen)}
          widgetStates={widgetStates}
          onViewChange={handleViewChange}
          getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
          algorithms={algorithms}
          selectedAlgorithm={selectedAlgorithm}
          onAlgorithmChange={onAlgorithmChange}
          onRunAlgorithm={onRunAlgorithm}
          onStopAlgorithm={onStopAlgorithm}
          isRunningAlgorithm={isRunningAlgorithm}
          pipelineJob={pipelineJob}
          pipelineStatus={pipelineStatus}
          pipelineMessage={pipelineMessage}
          pipelineError={pipelineError}
          onOpenParameters={onOpenParameters}
          pipelineVariables={pipelineVariables}
          widgetInputBindings={widgetInputBindings}
          onWidgetBindingChange={handleWidgetBindingChange}
          displaySettings={displaySettings}
          onDisplaySettingsChange={handleDisplaySettingsChange}
          onResetDisplaySettings={handleResetDisplaySettings}
          customPipelines={customPipelines}
          isLoadingCustomPipelines={isLoadingCustomPipelines}
          customPipelineError={customPipelineError}
          onAddCustomPipeline={onAddCustomPipeline}
          onDeleteCustomPipeline={onDeleteCustomPipeline}
          canManageCustomPipelines={canManageCustomPipelines}
          savedViews={savedViews}
          savedCurrentViewId={savedCurrentViewId}
          onPersistViews={onPersistViews}
          layoutStorageScope={layoutStorageScope}
        />

        <div
          className={`canvas-zoom-controls ${isZoomIndicatorVisible ? 'is-visible' : ''}`}
          aria-label="Canvas zoom controls"
          onMouseEnter={revealZoomIndicator}
        >
          <button type="button" onClick={() => setCanvasZoom(displaySettings.scale - 0.1)} aria-label="Zoom out">−</button>
          <button type="button" onClick={handleResetCanvasView} title="Reset canvas position and zoom">
            {Math.round(displaySettings.scale * 100)}%
          </button>
          <button type="button" onClick={() => setCanvasZoom(displaySettings.scale + 0.1)} aria-label="Zoom in">+</button>
        </div>

        <CanvasMinimap
          viewport={minimapViewport}
          widgets={canvasGeometry.widgets}
          isVisible={isMinimapVisible}
          alwaysVisible={displaySettings.minimapAlwaysVisible}
          onActivity={revealMinimap}
          onAlwaysVisibleChange={(minimapAlwaysVisible) => {
            handleDisplaySettingsChange({ minimapAlwaysVisible });
            revealMinimap();
          }}
        />
      </div>

      <div
        className="dashboard-canvas"
        ref={dashboardCanvasRef}
        style={{
          transform: hasMaximizedWidget
            ? 'translate(0, 0) scale(1)'
            : `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${displaySettings.scale})`,
        }}
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
    waveforms={clusterWaveforms}
    clusterData={clusterData}
    clusteringResults={curatorDataset ? null : clusteringResults}
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
    onLoadingChange={handleWidgetLoadingChange}
  />,
  'panel-cluster-comparison'
)}

{renderDockable(
  'curator',
  'Curator',
  <CuratorWidget
    initialDataset={curatorDataset}
    onDatasetChange={handleCuratorDatasetChange}
    selectedClusters={selectedClusters}
    onClusterSelect={(cluster, options) => handleClusterSelect(cluster.id, options)}
    onSelectedClustersChange={handleCuratorSelectionChange}
    onLoadingChange={handleWidgetLoadingChange}
    sessionCacheScope={layoutStorageScope}
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
    curatorDataset={curatorDataset}
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
          availableClusterIds={clusterData?.clusterIds || clusters.map((cluster) => cluster.id)}
          linkedSelectedClusters={selectedClusters}
          spikes={spikes}
          clusterData={clusterData}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          datasetInfo={datasetInfo}
          demoMode={demoMode}
          onClusterSelect={handleClusterSelect}
          onClusterPairSelect={handleClusterPairSelect}
          dataCacheScope={dataCacheScope}
          onLoadingChange={handleWidgetLoadingChange}
        />,
        'panel-correlogram'
      )}

      {renderDockable(
        'isiHistogram',
        'Inter-Spike Interval Histogram',
        <IsiHistogramWidget
          availableClusterIds={clusterData?.clusterIds || clusters.map((cluster) => cluster.id)}
          linkedSelectedClusters={selectedClusters}
          spikes={spikes}
          clusterData={clusterData}
          clusteringResults={clusteringResults}
          selectedAlgorithm={selectedAlgorithm}
          datasetInfo={datasetInfo}
          demoMode={demoMode}
          onClusterSelect={handleClusterSelect}
          dataCacheScope={dataCacheScope}
          onLoadingChange={handleWidgetLoadingChange}
        />,
        'panel-isi-histogram'
      )}

      {renderDockable(
        'amplitudeTime',
        'Amplitude vs Time / Drift',
        <AmplitudeTimeWidget
          availableClusterIds={clusterData?.clusterIds || clusters.map((cluster) => cluster.id)}
          linkedSelectedClusters={selectedClusters}
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
          dataCacheScope={dataCacheScope}
          onLoadingChange={handleWidgetLoadingChange}
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
          dataCacheScope={dataCacheScope}
          onLoadingChange={handleWidgetLoadingChange}
        />,
        'panel-signal-view'
      )}

      {renderDockable(
        'dimReduction',
        'Dimensionality Reduction Plot View (PCA)',
        <DimensionalityReductionPanel
          clusterData={pcaClusterData}
          selectedClusters={selectedClusters}
          clusteringResults={curatorDataset ? null : clusteringResults}
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
              clusterLookup={curatorDataset?.clusterLookup}
              dataCacheScope={dataCacheScope}
              onLoadingChange={handleWidgetLoadingChange}
            />
          )}
        </>,
        'panel-waveform'
      )}
      </div>
    </div>
  );
});

MultiPanelView.displayName = 'MultiPanelView';
export default MultiPanelView;
