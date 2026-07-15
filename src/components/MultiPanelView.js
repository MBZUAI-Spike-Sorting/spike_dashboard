import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback, useMemo } from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import AmplitudeProfileWidget from './AmplitudeProfileWidget';
import ClusterComparisonWidget from './ClusterComparisonWidget';
import CuratorWidget from './CuratorWidget';
import RasterPlotWidget from './RasterPlotWidget';
import DockableWidget from './DockableWidget';
import WidgetBank from './WidgetBank';
import RightSideMenu from './RightSideMenu';
import {
  STORAGE_KEY,
  CURRENT_VIEW_KEY,
  PROFILE_VIEWS_KEY,
  PROFILE_CURRENT_VIEW_KEY,
  getScopedStorageKey
} from './ViewManager';
import {
  createDefaultWidgetInputBindings,
  createDashboardPipelineVariables,
  mergeWidgetInputBindings
} from '../widgets/dataContracts';
import { useAuth } from '../context/AuthContext';
import './MultiPanelView.css';

const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: false, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null },
  clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null },
  curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null },
  rasterPlot: { visible: false, minimized: false, maximized: false, order: 10, position: null, size: null }
};

const WIDGET_BINDINGS_STORAGE_KEY = 'spike_dashboard_widget_input_bindings';
const DISPLAY_SETTINGS_STORAGE_KEY = 'spike_dashboard_display_settings';
const DEFAULT_DISPLAY_SETTINGS = {
  scale: 1,
  density: 'standard'
};
const DISPLAY_DENSITY_FACTORS = {
  compact: 0.84,
  standard: 1,
  comfortable: 1.12
};

const PANEL_CLASS_MAP = {
  clusterList: 'panel-cluster-list',
  spikeList: 'panel-spike-list',
  clusterStats: 'panel-cluster-stats',
  signalView: 'panel-signal-view',
  dimReduction: 'panel-dim-reduction',
  waveform: 'panel-waveform',
  amplitudeProfile: 'panel-amplitude-profile',
  clusterComparison: 'panel-cluster-comparison',
  curator: 'panel-curator',
  rasterPlot: 'panel-raster-plot'
};

const mergeWidgetStateDefaults = (widgetStates = {}) => {
  const merged = Object.entries(DEFAULT_WIDGET_STATES).reduce((acc, [widgetId, defaultState]) => {
    acc[widgetId] = {
      ...defaultState,
      ...(widgetStates[widgetId] || {})
    };
    return acc;
  }, {});

  Object.entries(widgetStates || {}).forEach(([widgetId, state]) => {
    if (!merged[widgetId]) {
      merged[widgetId] = state;
    }
  });

  return merged;
};

const getWidgetType = (widgetId, state) => state?.type || widgetId.split('__')[0];

const createWidgetInstanceId = (widgetType, widgetStates = {}) => {
  if (!widgetStates[widgetType]?.visible) {
    return widgetType;
  }

  let index = 2;
  let candidateId = `${widgetType}__${index}`;

  while (widgetStates[candidateId]) {
    index += 1;
    candidateId = `${widgetType}__${index}`;
  }

  return candidateId;
};

const getWidgetPanelClass = (widgetId, state) => (
  PANEL_CLASS_MAP[widgetId] ||
  PANEL_CLASS_MAP[getWidgetType(widgetId, state)] ||
  'panel-custom-widget'
);

const clampNumber = (value, min, max) => {
  const lowerBound = Number.isFinite(min) ? min : value;
  const upperBound = Number.isFinite(max) ? max : value;
  return Math.max(lowerBound, Math.min(upperBound, value));
};

const getMaxWidgetOrder = (widgetStates = {}) => (
  Object.values(widgetStates).reduce((maxOrder, state) => {
    const order = Number(state?.order);
    return Number.isFinite(order) ? Math.max(maxOrder, order) : maxOrder;
  }, 0)
);

const normalizeDisplaySettings = (value) => {
  const normalizedScale = Number(value?.scale);
  const density = value?.density;

  return {
    scale: clampNumber(Number.isFinite(normalizedScale) ? normalizedScale : DEFAULT_DISPLAY_SETTINGS.scale, 0.85, 1.25),
    density: DISPLAY_DENSITY_FACTORS[density] ? density : DEFAULT_DISPLAY_SETTINGS.density
  };
};

const readDisplaySettings = (storageKey) => {
  if (!storageKey) {
    return DEFAULT_DISPLAY_SETTINGS;
  }

  try {
    const savedValue = localStorage.getItem(storageKey);
    if (!savedValue) {
      return DEFAULT_DISPLAY_SETTINGS;
    }

    return normalizeDisplaySettings(JSON.parse(savedValue));
  } catch (error) {
    console.error('Error loading display settings:', error);
    return DEFAULT_DISPLAY_SETTINGS;
  }
};

const buildDisplayStyle = (displaySettings) => {
  const scale = displaySettings.scale;
  const densityFactor = DISPLAY_DENSITY_FACTORS[displaySettings.density] || DISPLAY_DENSITY_FACTORS.standard;
  const compactFactor = scale * densityFactor;
  const toPx = (value) => `${Math.round(value)}px`;
  const toRem = (value) => `${value.toFixed(3)}rem`;

  return {
    '--dashboard-container-padding': toPx(8 * densityFactor),
    '--dashboard-shell-padding': toPx(10 * compactFactor),
    '--dashboard-panel-gap': toPx(8 * compactFactor),
    '--dashboard-compact-gap': toPx(6 * compactFactor),
    '--dashboard-control-gap': toPx(4 * compactFactor),
    '--dashboard-font-xs': toRem(0.72 * scale),
    '--dashboard-font-sm': toRem(0.82 * scale),
    '--dashboard-font-base': toRem(0.92 * scale),
    '--dashboard-font-lg': toRem(1.02 * scale),
    '--dashboard-control-font-size': toRem(0.8 * scale),
    '--dashboard-widget-header-pad-y': toPx(6 * compactFactor),
    '--dashboard-widget-header-pad-x': toPx(10 * compactFactor),
    '--dashboard-widget-header-height': toPx(36 * compactFactor),
    '--dashboard-widget-control-size': toPx(22 * compactFactor),
    '--dashboard-widget-minimized-height': toPx(42 * compactFactor),
    '--dashboard-table-cell-pad-y': toPx(7 * compactFactor),
    '--dashboard-table-cell-pad-x': toPx(8 * compactFactor),
    '--dashboard-toolbar-control-height': toPx(28 * compactFactor),
    '--dashboard-sidebar-width': toPx(104 * compactFactor),
    '--dashboard-summary-card-padding': toPx(12 * compactFactor),
    '--dashboard-row-min-height': toPx(22 * compactFactor)
  };
};

const findClusterById = (clusters = [], clusterId) => {
  const clusterIdString = String(clusterId);
  const clusterIdNumber = Number(clusterId);

  return clusters.find((cluster) => {
    const candidate = cluster?.clusterId ?? cluster?.id;
    if (String(candidate) === clusterIdString) return true;
    return Number.isFinite(clusterIdNumber) && Number(candidate) === clusterIdNumber;
  });
};

const getClusterId = (cluster, fallback) => {
  const rawId = cluster?.clusterId ?? cluster?.id ?? fallback;
  const numericId = Number(rawId);
  return Number.isFinite(numericId) ? numericId : rawId;
};

const getClusteringResultSpikes = (clusteringResults, clusterId) => {
  const fullData = clusteringResults?.fullData;
  if (!fullData) return [];

  if (!Array.isArray(fullData)) {
    return fullData[clusterId] || fullData[String(clusterId)] || [];
  }

  const clusterIndex = Array.isArray(clusteringResults?.clusters)
    ? clusteringResults.clusters.findIndex((cluster, index) => (
        String(getClusterId(cluster, index)) === String(clusterId)
      ))
    : -1;

  if (clusterIndex >= 0 && Array.isArray(fullData[clusterIndex])) {
    return fullData[clusterIndex];
  }

  const numericClusterId = Number(clusterId);
  if (Number.isInteger(numericClusterId) && Array.isArray(fullData[numericClusterId])) {
    return fullData[numericClusterId];
  }

  return [];
};

const buildSpikesFromCuratorCluster = (cluster) => {
  const clusterId = getClusterId(cluster, cluster?.id);
  const channel = cluster?.primaryChannel;

  return (cluster?.spikeTimes || [])
    .filter((time) => Number.isFinite(Number(time)))
    .map((time, pointIndex) => ({
      time,
      clusterId,
      channel,
      pointIndex
    }));
};

const buildCuratorStats = (cluster) => {
  const clusterId = getClusterId(cluster, cluster?.id);
  const spikeTimes = (cluster?.spikeTimes || [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return {
    [clusterId]: {
      numSpikes: spikeTimes.length,
      peakChannel: cluster?.primaryChannel ?? null,
      firstSpike: spikeTimes[0] ?? null,
      lastSpike: spikeTimes[spikeTimes.length - 1] ?? null,
      source: cluster?.datasetName || 'Curator',
      metadata: cluster?.metadata || {}
    }
  };
};

const buildCuratorWaveformRequestCluster = (cluster) => ({
  id: getClusterId(cluster, cluster?.id),
  spikeTimes: Array.isArray(cluster?.spikeTimes) ? cluster.spikeTimes : [],
  primaryChannel: cluster?.primaryChannel ?? cluster?.channel ?? null
});

const getWidgetStatesFromViewSnapshot = (views, currentViewId) => {
  if (!Array.isArray(views) || views.length === 0) {
    return null;
  }

  const validViews = views.filter((view) => view && typeof view === 'object');
  const currentView = validViews.find((view) => view.id === currentViewId);
  const fallbackView = validViews.find((view) => view.id === 'default') || validViews[0];
  const viewToUse = currentView || fallbackView;

  if (viewToUse?.id === 'default') {
    return mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES);
  }

  return viewToUse?.widgetStates
    ? mergeWidgetStateDefaults(viewToUse.widgetStates)
    : null;
};

const readWidgetLayoutFromDom = (widgetIds) => {
  const layout = {};

  widgetIds.forEach((widgetId) => {
    const panelClass = PANEL_CLASS_MAP[widgetId];

    const panel = document.querySelector(`[data-widget-panel-id="${widgetId}"]`) ||
      (panelClass ? document.querySelector(`.${panelClass}`) : null);
    const widget = panel?.querySelector('.dockable-widget');

    if (!panel || !widget) return;

    const panelStyle = window.getComputedStyle(panel);
    const widgetRect = widget.getBoundingClientRect();
    const left = parseFloat(panelStyle.left);
    const top = parseFloat(panelStyle.top);

    layout[widgetId] = {
      position: {
        left: isNaN(left) ? null : Math.round(left),
        top: isNaN(top) ? null : Math.round(top)
      },
      size: {
        width: Math.round(widgetRect.width),
        height: Math.round(widgetRect.height)
      }
    };
  });

  return layout;
};

const isSameLayoutValue = (first, second) => {
  return JSON.stringify(first || null) === JSON.stringify(second || null);
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
  demoClusterPlotData = [],
  demoSpikeTable = [],
  demoClusterStats = [],
  demoWaveforms = {},
  demoSignalData = null
}, ref) => {
  const { user, profile, isAuthenticated, updateProfile } = useAuth();
  const profilePreferences = useMemo(() => profile?.preferences || {}, [profile?.preferences]);
  const layoutStorageScope = useMemo(() => {
    if (demoMode) return 'demo';

    const accountKey = user?.id ?? user?.username ?? user?.email;
    return accountKey ? `user_${accountKey}` : 'guest';
  }, [demoMode, user?.email, user?.id, user?.username]);
  const layoutViewsStorageKey = getScopedStorageKey(STORAGE_KEY, layoutStorageScope);
  const layoutCurrentViewStorageKey = getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope);
  const displaySettingsStorageKey = getScopedStorageKey(DISPLAY_SETTINGS_STORAGE_KEY, layoutStorageScope);
  const [clusters, setClusters] = useState([]);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [selectedSpike, setSelectedSpike] = useState(null);
  const [clusterStats, setClusterStats] = useState({});
  const [clusterData, setClusterData] = useState(null);
  const [clusterWaveforms, setClusterWaveforms] = useState({});
  const [neighboringChannels, setNeighboringChannels] = useState({});
  const [signalData, setSignalData] = useState(null);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 1000 });
  const [highlightedSpikes, setHighlightedSpikes] = useState([]);
  const [waveformViewModes, setWaveformViewModes] = useState({ waveform: 'single' });
  const [curatorDataset, setCuratorDataset] = useState(null);
  const defaultSignalData = demoMode ? demoSignalData : null;

  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
  const [displaySettings, setDisplaySettings] = useState(() => readDisplaySettings(displaySettingsStorageKey));
  const containerRef = useRef(null);

  const [widgetStates, setWidgetStates] = useState(() => {
    const accountWidgetStates = getWidgetStatesFromViewSnapshot(
      profilePreferences[PROFILE_VIEWS_KEY],
      profilePreferences[PROFILE_CURRENT_VIEW_KEY]
    );

    if (accountWidgetStates) {
      return accountWidgetStates;
    }

    const savedCurrentView = localStorage.getItem(layoutCurrentViewStorageKey);
    const savedViews = localStorage.getItem(layoutViewsStorageKey);

    if (savedCurrentView && savedViews) {
      try {
        const views = JSON.parse(savedViews);
        const currentView = views.find((v) => v.id === savedCurrentView);
        if (currentView?.id === 'default') {
          return mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES);
        }
        if (currentView && currentView.widgetStates) {
          return mergeWidgetStateDefaults(currentView.widgetStates);
        }
      } catch (e) {
        console.error('Error loading saved widget states:', e);
      }
    }

    return mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES);
  });

  const [widgetInputBindings, setWidgetInputBindings] = useState(() => {
    const savedBindings = localStorage.getItem(WIDGET_BINDINGS_STORAGE_KEY);

    if (savedBindings) {
      try {
        return mergeWidgetInputBindings(JSON.parse(savedBindings));
      } catch (error) {
        console.error('Error loading widget input bindings:', error);
      }
    }

    return mergeWidgetInputBindings();
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const activeViewIdRef = useRef(
    profilePreferences[PROFILE_CURRENT_VIEW_KEY] ||
    localStorage.getItem(layoutCurrentViewStorageKey) ||
    'default'
  );
  const isApplyingViewRef = useRef(false);
  const profilePreferencesRef = useRef(profilePreferences);
  const accountViewSaveTimeoutRef = useRef(null);
  const lastPersistedAccountViewsRef = useRef(null);

  useEffect(() => {
    profilePreferencesRef.current = profile?.preferences || {};
  }, [profile?.preferences]);

  const persistViewsToAccount = useCallback((views, currentViewId) => {
    if (demoMode || !isAuthenticated || !Array.isArray(views)) {
      return;
    }

    const normalizedCurrentViewId = currentViewId || 'default';
    const snapshotKey = JSON.stringify({
      views,
      currentViewId: normalizedCurrentViewId
    });

    if (lastPersistedAccountViewsRef.current === snapshotKey) {
      return;
    }

    lastPersistedAccountViewsRef.current = snapshotKey;

    if (accountViewSaveTimeoutRef.current) {
      clearTimeout(accountViewSaveTimeoutRef.current);
    }

    accountViewSaveTimeoutRef.current = setTimeout(() => {
      updateProfile({
        preferences: {
          ...(profilePreferencesRef.current || {}),
          [PROFILE_VIEWS_KEY]: views,
          [PROFILE_CURRENT_VIEW_KEY]: normalizedCurrentViewId
        }
      }).catch((error) => {
        console.error('Error saving dashboard layout preferences:', error);
        lastPersistedAccountViewsRef.current = null;
      });
    }, 600);
  }, [demoMode, isAuthenticated, updateProfile]);

  useEffect(() => {
    return () => {
      if (accountViewSaveTimeoutRef.current) {
        clearTimeout(accountViewSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    lastPersistedAccountViewsRef.current = null;

    const accountWidgetStates = getWidgetStatesFromViewSnapshot(
      profilePreferences[PROFILE_VIEWS_KEY],
      profilePreferences[PROFILE_CURRENT_VIEW_KEY]
    );

    if (accountWidgetStates) {
      activeViewIdRef.current = profilePreferences[PROFILE_CURRENT_VIEW_KEY] || 'default';
      isApplyingViewRef.current = true;
      setWidgetStates(accountWidgetStates);
      setTimeout(() => {
        isApplyingViewRef.current = false;
      }, 250);
      return;
    }

    const savedCurrentView = localStorage.getItem(layoutCurrentViewStorageKey);
    const savedViews = localStorage.getItem(layoutViewsStorageKey);

    if (savedCurrentView && savedViews) {
      try {
        const views = JSON.parse(savedViews);
        const currentView = views.find((v) => v.id === savedCurrentView);
        if (currentView?.id === 'default') {
          activeViewIdRef.current = 'default';
          isApplyingViewRef.current = true;
          setWidgetStates(mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES));
          setTimeout(() => {
            isApplyingViewRef.current = false;
          }, 250);
          return;
        }
        if (currentView && currentView.widgetStates) {
          activeViewIdRef.current = savedCurrentView;
          isApplyingViewRef.current = true;
          setWidgetStates(mergeWidgetStateDefaults(currentView.widgetStates));
          setTimeout(() => {
            isApplyingViewRef.current = false;
          }, 250);
          return;
        }
      } catch (error) {
        console.error('Error loading scoped widget states:', error);
      }
    }

    activeViewIdRef.current = 'default';
    isApplyingViewRef.current = true;
    setWidgetStates(mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES));
    setTimeout(() => {
      isApplyingViewRef.current = false;
    }, 250);
  }, [
    isInitialized,
    layoutCurrentViewStorageKey,
    layoutViewsStorageKey,
    layoutStorageScope
  ]);

  const pipelineVariables = useMemo(() => {
    return createDashboardPipelineVariables({
      clusters,
      selectedClusters,
      spikes,
      highlightedSpikes,
      clusterStats,
      clusterData,
      clusterWaveforms,
      clusteringResults,
      signalData: signalData || defaultSignalData,
      datasetInfo
    });
  }, [
    clusters,
    selectedClusters,
    spikes,
    highlightedSpikes,
    clusterStats,
    clusterData,
    clusterWaveforms,
    clusteringResults,
    signalData,
    defaultSignalData,
    datasetInfo
  ]);

  useEffect(() => {
    localStorage.setItem(
      WIDGET_BINDINGS_STORAGE_KEY,
      JSON.stringify(widgetInputBindings)
    );
  }, [widgetInputBindings]);

  useEffect(() => {
    setDisplaySettings(readDisplaySettings(displaySettingsStorageKey));
  }, [displaySettingsStorageKey]);

  useEffect(() => {
    localStorage.setItem(
      displaySettingsStorageKey,
      JSON.stringify(displaySettings)
    );
  }, [displaySettings, displaySettingsStorageKey]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== displaySettingsStorageKey || !event.newValue) {
        return;
      }

      try {
        setDisplaySettings(normalizeDisplaySettings(JSON.parse(event.newValue)));
      } catch (error) {
        console.error('Error syncing display settings:', error);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [displaySettingsStorageKey]);

  const curatorClusterMap = useMemo(() => {
    return (curatorDataset?.clusters || []).reduce((map, cluster) => {
      map.set(String(getClusterId(cluster, cluster.id)), cluster);
      return map;
    }, new Map());
  }, [curatorDataset]);

  const displayStyle = useMemo(() => buildDisplayStyle(displaySettings), [displaySettings]);

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

    const normalizedSpikes = (demoSpikeTable || []).map((row) => ({
      time: row.spikeTime,
      clusterId: row.assignedClusterId
    }));
    setSpikes(normalizedSpikes);

    const normalizedStats = {};
    (demoClusterStats || []).forEach((row) => {
      normalizedStats[row.clusterId] = {
        count: row.count,
        meanAmplitude: row.meanAmplitude
      };
    });
    setClusterStats(normalizedStats);

    setClusterWaveforms(demoWaveforms || {});
  }, [
    demoMode,
    demoClusterPlotData,
    demoSpikeTable,
    demoClusterStats,
    demoWaveforms
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitialized(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const getCurrentPositionsAndSizes = useCallback(() => {
    const positionsAndSizes = {};
    const liveLayout = readWidgetLayoutFromDom(Object.keys(widgetStates));

    Object.keys(widgetStates).forEach((widgetId) => {
      if (!widgetStates[widgetId].visible) {
        positionsAndSizes[widgetId] = {
          position: widgetStates[widgetId].position || null,
          size: widgetStates[widgetId].size || null
        };
        return;
      }

      if (widgetStates[widgetId].minimized) {
        positionsAndSizes[widgetId] = {
          position: widgetStates[widgetId].position || null,
          size: widgetStates[widgetId].size || null
        };
        return;
      }

      positionsAndSizes[widgetId] = liveLayout[widgetId] || {
        position: widgetStates[widgetId].position || null,
        size: widgetStates[widgetId].size || null
      };
    });

    return positionsAndSizes;
  }, [widgetStates]);

  const handleWidgetLayoutChange = useCallback((widgetId, layout) => {
    if (isApplyingViewRef.current || !layout) {
      return;
    }

    setWidgetStates((prev) => {
      const current = prev[widgetId];

      if (!current) {
        return prev;
      }

      const nextPosition = layout.position || current.position || null;
      const nextSize = current.minimized
        ? current.size || null
        : layout.size || current.size || null;

      if (
        isSameLayoutValue(current.position, nextPosition) &&
        isSameLayoutValue(current.size, nextSize)
      ) {
        return prev;
      }

      return {
        ...prev,
        [widgetId]: {
          ...current,
          position: nextPosition,
          size: nextSize
        }
      };
    });
  }, []);

  useEffect(() => {
    if (demoMode) return;

    setClusters([]);
    setSelectedClusters([]);
    setSpikes([]);
    setSelectedSpike(null);
    setClusterStats({});
    setClusterData(null);
    setClusterWaveforms({});
    setNeighboringChannels({});
    setHighlightedSpikes([]);
  }, [selectedAlgorithm, demoMode]);

  useEffect(() => {
    if (demoMode) return;
    fetchClusterList();
  }, [selectedDataset, clusteringResults, selectedAlgorithm, demoMode]);

  useEffect(() => {
    return () => {
      const plotlyElements = document.querySelectorAll('.js-plotly-plot');
      plotlyElements.forEach((el) => {
        if (window.Plotly && window.Plotly.purge) {
          window.Plotly.purge(el);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (demoMode) return;

    if (selectedClusters.length > 0) {
      fetchSpikesForClusters();
      fetchClusterStatistics();
      fetchClusterWaveforms();
    } else {
      setSpikes([]);
      setClusterStats({});
      setClusterWaveforms({});
    }
  }, [selectedClusters, clusterData, clusteringResults, curatorClusterMap, demoMode]);

  useEffect(() => {
    const applyLayoutFromState = () => {
      Object.entries(widgetStates).forEach(([widgetId, state]) => {
        if (!state.visible) return;

        const panelClass = getWidgetPanelClass(widgetId, state);
        const panel = document.querySelector(`[data-widget-panel-id="${widgetId}"]`) ||
          document.querySelector(`.${panelClass}`);
        const widget = panel?.querySelector('.dockable-widget');

        if (panel && state.position && (state.position.left !== null || state.position.top !== null)) {
          if (state.position.left !== null) {
            panel.style.left = typeof state.position.left === 'number' ? `${state.position.left}px` : state.position.left;
          }
          if (state.position.top !== null) {
            panel.style.top = typeof state.position.top === 'number' ? `${state.position.top}px` : state.position.top;
          }
        }

        if (widget && state.size && (state.size.width || state.size.height)) {
          if (state.size.width) {
            widget.style.width = typeof state.size.width === 'number' ? `${state.size.width}px` : state.size.width;
          }
          if (state.size.height) {
            widget.style.height = typeof state.size.height === 'number' ? `${state.size.height}px` : state.size.height;
          }
          widget.style.flex = 'none';
        }
      });
    };

    const timer1 = setTimeout(applyLayoutFromState, 50);
    const timer2 = setTimeout(applyLayoutFromState, 200);
    const timer3 = setTimeout(applyLayoutFromState, 500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [widgetStates]);

  const fetchClusterList = async () => {
    try {
      if (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') {
        if (clusteringResults && clusteringResults.available) {
          const clusterList = (clusteringResults.clusters || []).map((clusterSummary, index) => ({
            id: getClusterId(clusterSummary, index),
            size: clusterSummary.numSpikes
          }));
          setClusters(clusterList);
        } else {
          setClusters([]);
        }
        return;
      }

      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/cluster-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'real',
          channelMapping: {},
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterData(data);
        const clusterList = (data.clusterIds || []).map((id) => ({ id }));
        setClusters(clusterList);
      }
    } catch (error) {
      console.error('Error fetching cluster list:', error);
    }
  };

  const fetchSpikesForClusters = async () => {
    try {
      const curatorSpikes = [];

      selectedClusters.forEach((clusterId) => {
        const curatorCluster = curatorClusterMap.get(String(clusterId));
        if (curatorCluster) {
          curatorSpikes.push(...buildSpikesFromCuratorCluster(curatorCluster));
        }
      });

      if (curatorSpikes.length > 0) {
        curatorSpikes.sort((a, b) => Number(a.time) - Number(b.time));
        setSpikes(curatorSpikes);
        return;
      }

      if (
        (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') &&
        clusteringResults &&
        clusteringResults.available
      ) {
        const allSpikes = [];

        selectedClusters.forEach((clusterId) => {
          const clusterSpikes = getClusteringResultSpikes(clusteringResults, clusterId);
          clusterSpikes.forEach((spike, pointIndex) => {
            allSpikes.push({
              time: spike.time,
              clusterId,
              channel: spike.channel,
              pointIndex
            });
          });
        });

        allSpikes.sort((a, b) => a.time - b.time);
        setSpikes(allSpikes);
        return;
      }

      if (!clusterData || !clusterData.clusters) return;

      const allSpikes = [];

      selectedClusters.forEach((clusterId) => {
        const cluster = findClusterById(clusterData.clusters, clusterId);
        if (cluster && cluster.spikeTimes) {
          cluster.spikeTimes.forEach((time, pointIndex) => {
            if (time !== null) {
              allSpikes.push({
                time,
                clusterId,
                channel: cluster.primaryChannel ?? cluster.channel,
                pointIndex
              });
            }
          });
        }
      });

      allSpikes.sort((a, b) => a.time - b.time);
      setSpikes(allSpikes);
    } catch (error) {
      console.error('Error fetching spikes:', error);
    }
  };

  const fetchClusterStatistics = async () => {
    try {
      const curatorStatistics = {};

      selectedClusters.forEach((clusterId) => {
        const curatorCluster = curatorClusterMap.get(String(clusterId));
        if (curatorCluster) {
          Object.assign(curatorStatistics, buildCuratorStats(curatorCluster));
        }
      });

      if (Object.keys(curatorStatistics).length > 0) {
        setClusterStats(curatorStatistics);
        return;
      }

      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/cluster-statistics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterIds: selectedClusters,
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterStats(data.statistics || {});
      }
    } catch (error) {
      console.error('Error fetching cluster statistics:', error);
    }
  };

  const fetchClusterWaveforms = async () => {
    try {
      const explicitClusters = selectedClusters
        .map((clusterId) => curatorClusterMap.get(String(clusterId)))
        .filter(Boolean)
        .map(buildCuratorWaveformRequestCluster);

      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/cluster-waveforms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterIds: selectedClusters,
          clusters: explicitClusters,
          maxWaveforms: 50,
          windowSize: 30,
          algorithm: selectedAlgorithm
        })
      });

      if (response.ok) {
        const data = await response.json();
        setClusterWaveforms(data.waveforms || {});
      }
    } catch (error) {
      console.error('Error fetching cluster waveforms:', error);
    }
  };

  const handleClusterToggle = (clusterId) => {
    setSelectedClusters((prev) => {
      if (prev.includes(clusterId)) {
        return prev.filter((id) => id !== clusterId);
      } else {
        return [...prev, clusterId];
      }
    });
  };

  const handleSpikeSelect = (index, spike) => {
    setSelectedSpike(index);

    let pointIndex = Number.isInteger(spike.pointIndex) ? spike.pointIndex : -1;
    const spikeTimeNum = Number(spike.time);

    if (
      (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') &&
      clusteringResults &&
      clusteringResults.available
    ) {
      const clusterSpikes = getClusteringResultSpikes(clusteringResults, spike.clusterId);
      if (clusterSpikes.length > 0) {
        pointIndex = clusterSpikes.findIndex((s) => Math.abs(Number(s.time) - spikeTimeNum) < 0.01);
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = findClusterById(clusterData.clusters, spike.clusterId);
      if (cluster && cluster.spikeTimes) {
        pointIndex = cluster.spikeTimes.findIndex((t) => Math.abs(Number(t) - spikeTimeNum) < 0.01);
      }
    }

    if (pointIndex !== -1) {
      setHighlightedSpikes([{
        clusterId: spike.clusterId,
        pointIndex,
        time: spike.time
      }]);

      const newStart = Math.max(0, spike.time - 500);
      const newEnd = spike.time + 500;
      setTimeRange({ start: newStart, end: newEnd });
    }
  };

  const handleDimReductionSpikeClick = (clusterId, pointIndex) => {
    let spikeTime = null;

    if (
      (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') &&
      clusteringResults &&
      clusteringResults.available
    ) {
      const clusterSpikes = getClusteringResultSpikes(clusteringResults, clusterId);
      if (clusterSpikes[pointIndex]) {
        spikeTime = clusterSpikes[pointIndex].time;
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = findClusterById(clusterData.clusters, clusterId);
      if (cluster && cluster.spikeTimes && cluster.spikeTimes[pointIndex]) {
        spikeTime = cluster.spikeTimes[pointIndex];
      }
    }

    if (spikeTime !== null) {
      const spikeTimeNum = Number(spikeTime);
      const spikeIndex = spikes.findIndex((s) =>
        s.clusterId === clusterId && Math.abs(Number(s.time) - spikeTimeNum) < 0.01
      );

      if (spikeIndex !== -1) {
        handleSpikeSelect(spikeIndex, spikes[spikeIndex]);
      }
    }
  };

  const handleToggleWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const currentState = prev[widgetId];
      const nextVisible = !currentState?.visible;
      const nextOrder = nextVisible ? getMaxWidgetOrder(prev) + 1 : currentState?.order;
      return {
        ...prev,
        [widgetId]: {
          ...currentState,
          visible: nextVisible,
          minimized: false,
          order: nextOrder
        }
      };
    });
  };

  const handleMinimizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const currentState = prev[widgetId];
      const nextOrder = getMaxWidgetOrder(prev) + 1;
      return {
        ...prev,
        [widgetId]: {
          ...currentState,
          minimized: !currentState.minimized,
          maximized: false,
          order: nextOrder
        }
      };
    });
  };

  const handleMaximizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const currentState = prev[widgetId];
      const nextOrder = getMaxWidgetOrder(prev) + 1;
      return {
        ...prev,
        [widgetId]: {
          ...currentState,
          maximized: !currentState.maximized,
          minimized: false,
          order: nextOrder
        }
      };
    });
  };

  const handleCloseWidget = (widgetId) => {
    setWidgetStates((prev) => {
      return {
        ...prev,
        [widgetId]: {
          ...prev[widgetId],
          visible: false
        }
      };
    });
  };

  const handleResetLayout = () => {
    activeViewIdRef.current = 'default';
    isApplyingViewRef.current = true;
    setWidgetStates(mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES));

    document.querySelectorAll('.dockable-widget').forEach((widget) => {
      widget.style.width = '';
      widget.style.height = '';
      widget.style.flex = '';
      widget.style.zIndex = '';
    });

    document.querySelectorAll('.panel').forEach((panel) => {
      panel.style.left = '';
      panel.style.top = '';
    });

    setTimeout(() => {
      isApplyingViewRef.current = false;
    }, 250);
  };

  const getWidgetPositionsAndSizes = useCallback(() => {
    const result = {};
    const liveLayout = readWidgetLayoutFromDom(Object.keys(widgetStates));

    Object.keys(widgetStates).forEach((widgetId) => {
      if (!widgetStates[widgetId].visible) {
        result[widgetId] = {
          position: widgetStates[widgetId].position || null,
          size: widgetStates[widgetId].size || null
        };
        return;
      }

      if (widgetStates[widgetId].minimized) {
        result[widgetId] = {
          position: widgetStates[widgetId].position || null,
          size: widgetStates[widgetId].size || null
        };
        return;
      }

      result[widgetId] = liveLayout[widgetId] || {
        position: widgetStates[widgetId].position || null,
        size: widgetStates[widgetId].size || null
      };
    });

    return result;
  }, [widgetStates]);

  const handleViewChange = useCallback((newWidgetStates, viewId) => {
    if (viewId) {
      activeViewIdRef.current = viewId;
    }

    isApplyingViewRef.current = true;

    document.querySelectorAll('.dockable-widget').forEach((widget) => {
      widget.style.width = '';
      widget.style.height = '';
      widget.style.flex = '';
    });

    document.querySelectorAll('.panel').forEach((panel) => {
      panel.style.left = '';
      panel.style.top = '';
    });

    const clonedStates = mergeWidgetStateDefaults(JSON.parse(JSON.stringify(newWidgetStates)));
    setWidgetStates(clonedStates);

    setTimeout(() => {
      isApplyingViewRef.current = false;
    }, 250);
  }, []);

  const handleWidgetBindingChange = useCallback((widgetId, inputId, variableId) => {
    setWidgetInputBindings((prev) => {
      const next = {
        ...prev,
        [widgetId]: {
          ...(prev[widgetId] || {}),
          [inputId]: variableId
        }
      };

      return mergeWidgetInputBindings(next);
    });
  }, []);

  const handleDisplaySettingsChange = useCallback((nextPartialSettings) => {
    setDisplaySettings((prev) => normalizeDisplaySettings({
      ...prev,
      ...nextPartialSettings
    }));
  }, []);

  const handleResetDisplaySettings = useCallback(() => {
    setDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  }, []);

  const handleActivateWidget = useCallback((widgetId) => {
    setWidgetStates((prev) => {
      const currentState = prev[widgetId];
      if (!currentState) {
        return prev;
      }

      const nextOrder = getMaxWidgetOrder(prev) + 1;
      if (currentState.order === nextOrder) {
        return prev;
      }

      return {
        ...prev,
        [widgetId]: {
          ...currentState,
          order: nextOrder
        }
      };
    });
  }, []);

  const getBoundWidgetValue = useCallback((widgetId, inputId, fallbackValue) => {
    const widgetType = getWidgetType(widgetId, widgetStates[widgetId]);
    const variableId = widgetInputBindings[widgetId]?.[inputId] ||
      widgetInputBindings[widgetType]?.[inputId];
    const variable = pipelineVariables[variableId];

    if (!variable || !variable.isAvailable || !variable.isFormatValid) {
      return fallbackValue;
    }

    return variable.value;
  }, [pipelineVariables, widgetInputBindings, widgetStates]);

  const handleAddWidget = useCallback((widget) => {
    const widgetId = createWidgetInstanceId(widget.id, widgetStates);
    const isDuplicate = widgetId !== widget.id;
    const duplicateNumber = isDuplicate ? widgetId.split('__')[1] : null;
    const defaultBindings = createDefaultWidgetInputBindings();

    setWidgetStates((prev) => {
      const currentState = prev[widgetId] || DEFAULT_WIDGET_STATES[widget.id] || {};
      const position = dropPosition ||
        currentState.position ||
        { top: 100 + (Number(duplicateNumber || 1) - 1) * 28, left: 100 + (Number(duplicateNumber || 1) - 1) * 28 };
      const nextOrder = getMaxWidgetOrder(prev) + 1;

      return {
        ...prev,
        [widgetId]: {
          ...currentState,
          ...(isDuplicate ? { type: widget.id, title: `${widget.name} ${duplicateNumber}` } : {}),
          visible: true,
          minimized: false,
          maximized: false,
          order: nextOrder,
          position,
          size: currentState.size || widget.defaultSize || null
        }
      };
    });

    setWidgetInputBindings((prev) => mergeWidgetInputBindings({
      ...prev,
      [widgetId]: prev[widgetId] || prev[widget.id] || defaultBindings[widget.id] || {}
    }));

    setDropPosition(null);
  }, [dropPosition, widgetStates]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropPosition({
        top: e.clientY - rect.top - 25,
        left: e.clientX - rect.left - 100
      });
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    setDropPosition(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const widgetData = JSON.parse(e.dataTransfer.getData('application/json'));
      if (widgetData && widgetData.id) {
        handleAddWidget(widgetData);
      }
    } catch (error) {
      console.error('Error handling drop:', error);
    }

    setDropPosition(null);
  }, [handleAddWidget]);

  const getWidgetList = () => {
    const names = {
      clusterList: 'Cluster Selector',
      spikeList: 'Spike List Table',
      clusterStats: 'Cluster Statistics Window',
      signalView: 'Signal View',
      dimReduction: 'Dimensionality Reduction Plot View (PCA)',
      waveform: 'Waveform View',
      amplitudeProfile: 'Amplitude Profile',
      clusterComparison: 'Cluster Comparison',
      curator: 'Curator',
      rasterPlot: 'Raster Plot'
    };

    return Object.entries(widgetStates).map(([widgetId, state]) => {
      const widgetType = getWidgetType(widgetId, state);
      return {
        id: widgetId,
        type: widgetType,
        name: state.title || names[widgetType] || widgetId,
        visible: Boolean(state.visible)
      };
    });
  };

  useImperativeHandle(ref, () => ({
    getWidgetList,
    handleToggleWidget,
    handleResetLayout,
    handleViewChange,
    getWidgetPositionsAndSizes,
    widgetStates,
    isWidgetBankOpen,
    setIsWidgetBankOpen
  }), [widgetStates, isWidgetBankOpen, handleViewChange, getWidgetPositionsAndSizes]);

  useEffect(() => {
    const handleWidgetResize = () => {
      window.dispatchEvent(new Event('resize'));
    };

    const timer = setTimeout(handleWidgetResize, 100);
    return () => clearTimeout(timer);
  }, [widgetStates]);

  const getWidgetRectWithinContainer = useCallback((widgetId) => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const panelClass = getWidgetPanelClass(widgetId, widgetStates[widgetId]);
    const panel = document.querySelector(`[data-widget-panel-id="${widgetId}"]`) ||
      document.querySelector(`.${panelClass}`);
    const widget = panel?.querySelector('.dockable-widget');

    if (!panel || !widget) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const widgetRect = widget.getBoundingClientRect();

    return {
      left: widgetRect.left - containerRect.left,
      top: widgetRect.top - containerRect.top,
      width: widgetRect.width,
      height: widgetRect.height
    };
  }, [widgetStates]);

  const getRecommendedRevealLayouts = useCallback((sourceWidgetId = 'curator') => {
    const container = containerRef.current;
    if (!container) {
      return {};
    }

    const margin = 12;
    const gap = 14;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const sourceRect = getWidgetRectWithinContainer(sourceWidgetId) || {
      left: margin,
      top: margin,
      width: Math.min(840, containerWidth * 0.54),
      height: Math.min(500, containerHeight * 0.52)
    };

    const sourceLeft = clampNumber(sourceRect.left, margin, Math.max(margin, containerWidth - 360));
    const sourceTop = clampNumber(sourceRect.top, margin, Math.max(margin, containerHeight - 240));
    const sourceWidth = clampNumber(sourceRect.width, 360, Math.max(360, containerWidth - (margin * 2)));
    const sourceHeight = clampNumber(sourceRect.height, 240, Math.max(240, containerHeight - (margin * 2)));
    const rightColumnWidth = clampNumber(
      containerWidth - (sourceLeft + sourceWidth) - margin - gap,
      320,
      500
    );
    const rightColumnLeft = clampNumber(
      containerWidth - margin - rightColumnWidth,
      margin,
      Math.max(margin, containerWidth - rightColumnWidth - margin)
    );
    const rightStackHeight = clampNumber(
      (containerHeight - (margin * 2) - gap) / 2,
      220,
      340
    );
    const bottomTop = clampNumber(
      sourceTop + sourceHeight + gap,
      margin,
      Math.max(margin, containerHeight - 240)
    );
    const bottomHeight = clampNumber(containerHeight - bottomTop - margin, 220, 320);
    const bottomWidth = clampNumber(
      Math.min(sourceWidth, containerWidth - (margin * 2)),
      360,
      containerWidth - (margin * 2)
    );
    const bottomSplitWidth = clampNumber((bottomWidth - gap) / 2, 280, 520);
    const overlayWidth = clampNumber(Math.min(220, sourceWidth - (gap * 2)), 180, 220);

    return {
      clusterStats: {
        position: {
          left: clampNumber(sourceLeft + sourceWidth - overlayWidth - gap, margin, containerWidth - overlayWidth - margin),
          top: clampNumber(sourceTop + gap, margin, containerHeight - 190)
        },
        size: {
          width: overlayWidth,
          height: clampNumber(Math.min(200, sourceHeight - (gap * 2)), 170, 200)
        }
      },
      signalView: {
        position: { left: rightColumnLeft, top: margin },
        size: { width: rightColumnWidth, height: rightStackHeight }
      },
      waveform: {
        position: {
          left: rightColumnLeft,
          top: clampNumber(margin + rightStackHeight + gap, margin, containerHeight - rightStackHeight - margin)
        },
        size: { width: rightColumnWidth, height: rightStackHeight }
      },
      rasterPlot: {
        position: { left: sourceLeft, top: bottomTop },
        size: { width: bottomSplitWidth, height: bottomHeight }
      },
      amplitudeProfile: {
        position: {
          left: clampNumber(sourceLeft + bottomSplitWidth + gap, margin, containerWidth - bottomSplitWidth - margin),
          top: bottomTop
        },
        size: { width: bottomSplitWidth, height: bottomHeight }
      }
    };
  }, [getWidgetRectWithinContainer]);

  const getPanelStyle = (widgetId) => {
    const state = widgetStates[widgetId];
    const panelStyle = {
      zIndex: state?.maximized ? 5000 : (state?.order || DEFAULT_WIDGET_STATES[getWidgetType(widgetId, state)]?.order || 1)
    };

    if (state?.position) {
      panelStyle.top = typeof state.position.top === 'number' ? `${state.position.top}px` : state.position.top;
      panelStyle.left = typeof state.position.left === 'number' ? `${state.position.left}px` : state.position.left;
    }

    return panelStyle;
  };

  const clusterListClusters = getBoundWidgetValue('clusterList', 'clusters', clusters);
  const spikeListSpikes = getBoundWidgetValue('spikeList', 'spikes', spikes);
  const spikeListSelectedClusters = getBoundWidgetValue('spikeList', 'selectedClusters', selectedClusters);
  const statsSelectedClusters = getBoundWidgetValue('clusterStats', 'selectedClusters', selectedClusters);
  const statsData = getBoundWidgetValue('clusterStats', 'statistics', clusterStats);
  const signalDatasetInfo = getBoundWidgetValue('signalView', 'datasetInfo', datasetInfo);
  const signalHighlightedSpikes = getBoundWidgetValue('signalView', 'highlightedSpikes', highlightedSpikes);
  const signalTrace = getBoundWidgetValue('signalView', 'signal', defaultSignalData);
  const dimReductionSource = getBoundWidgetValue('dimReduction', 'clusterData', clusterData);
  const dimReductionSelectedClusters = getBoundWidgetValue('dimReduction', 'selectedClusters', selectedClusters);
  const dimReductionHighlightedSpikes = getBoundWidgetValue('dimReduction', 'highlightedSpikes', highlightedSpikes);
  const dimReductionClusterData = dimReductionSource?.clusterIds ? dimReductionSource : clusterData;
  const dimReductionClusteringResults = dimReductionSource?.available !== undefined ? dimReductionSource : clusteringResults;
  const amplitudeSelectedClusters = getBoundWidgetValue('amplitudeProfile', 'selectedClusters', selectedClusters);
  const amplitudeWaveforms = getBoundWidgetValue('amplitudeProfile', 'waveforms', clusterWaveforms);
  const amplitudeClusterData = getBoundWidgetValue('amplitudeProfile', 'clusterData', clusterData);
  const amplitudeClusteringResults = getBoundWidgetValue('amplitudeProfile', 'clusteringResults', clusteringResults);
  const curatorClusterSet = getBoundWidgetValue('curator', 'clusterSetData', null);
  const curatorSignalData = getBoundWidgetValue('curator', 'signalData', signalData || defaultSignalData);
  const rasterSpikes = getBoundWidgetValue('rasterPlot', 'spikes', spikes);
  const rasterSelectedClusters = getBoundWidgetValue('rasterPlot', 'selectedClusters', selectedClusters);
  const rasterClusterSource = getBoundWidgetValue('rasterPlot', 'clusterData', clusterData);

  const revealWidgetsForCluster = useCallback((sourceWidgetId = 'curator') => {
    const recommendedLayouts = getRecommendedRevealLayouts(sourceWidgetId);

    setWidgetStates((prevStates) => {
      const widgetIdsToReveal = ['clusterStats', 'signalView', 'waveform', 'amplitudeProfile', 'rasterPlot'];
      let hasChanges = false;
      const nextStates = { ...prevStates };
      let nextOrder = getMaxWidgetOrder(prevStates);

      widgetIdsToReveal.forEach((widgetId) => {
        const currentState = nextStates[widgetId] || DEFAULT_WIDGET_STATES[widgetId];

        if (!currentState || (currentState.visible && !currentState.minimized)) {
          return;
        }

        const recommendedLayout = recommendedLayouts[widgetId];
        nextOrder += 1;
        nextStates[widgetId] = {
          ...currentState,
          visible: true,
          minimized: false,
          maximized: false,
          order: nextOrder,
          position: recommendedLayout?.position || currentState.position || null,
          size: recommendedLayout?.size || currentState.size || null
        };
        hasChanges = true;
      });

      return hasChanges ? mergeWidgetStateDefaults(nextStates) : prevStates;
    });
  }, [getRecommendedRevealLayouts]);

  const handleCuratorDatasetChange = useCallback((nextDataset) => {
    setCuratorDataset(nextDataset);
  }, []);

  const handleCuratorClusterSelect = useCallback((cluster) => {
    const numericClusterId = Number(cluster.id);
    const clusterId = Number.isFinite(numericClusterId) ? numericClusterId : cluster.id;
    const spikeTimes = Array.isArray(cluster.spikeTimes) ? cluster.spikeTimes : [];
    const firstSpikeTime = spikeTimes.find((time) => Number.isFinite(Number(time)));

    setSelectedClusters([clusterId]);
    setSpikes(buildSpikesFromCuratorCluster(cluster));
    setClusterStats(buildCuratorStats(cluster));
    setHighlightedSpikes(
      spikeTimes.slice(0, 25).map((time, pointIndex) => ({
        clusterId,
        pointIndex,
        time
      }))
    );

    if (Number.isFinite(Number(firstSpikeTime))) {
      const start = Math.max(0, Number(firstSpikeTime) - 500);
      setTimeRange({ start, end: start + 1000 });
    }

    revealWidgetsForCluster('curator');
  }, [revealWidgetsForCluster]);

  const handleRasterEventSelect = useCallback((event) => {
    const clusterId = getClusterId(event, event?.clusterId);
    const spikeTime = Number(event?.time);
    const pointIndex = Number.isInteger(event?.pointIndex) ? event.pointIndex : 0;

    setSelectedClusters([clusterId]);
    setHighlightedSpikes([{
      clusterId,
      pointIndex,
      time: event?.time
    }]);

    if (Number.isFinite(spikeTime)) {
      const start = Math.max(0, spikeTime - 500);
      setTimeRange({ start, end: start + 1000 });
    }

    revealWidgetsForCluster('rasterPlot');
  }, [revealWidgetsForCluster]);

  const renderWidgetContent = (widgetId) => {
    const state = widgetStates[widgetId] || {};
    const widgetType = getWidgetType(widgetId, state);

    switch (widgetType) {
      case 'clusterList':
        return (
          <ClusterListTable
            clusters={getBoundWidgetValue(widgetId, 'clusters', clusters)}
            selectedClusters={selectedClusters}
            onClusterToggle={handleClusterToggle}
          />
        );
      case 'spikeList':
        return (
          <SpikeListTable
            spikes={getBoundWidgetValue(widgetId, 'spikes', spikes)}
            selectedSpike={selectedSpike}
            onSpikeSelect={handleSpikeSelect}
            selectedClusters={getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters)}
          />
        );
      case 'clusterStats':
        return (
          <ClusterStatisticsWindow
            selectedClusters={getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters)}
            clusterStats={getBoundWidgetValue(widgetId, 'statistics', clusterStats)}
          />
        );
      case 'signalView':
        return (
          <SignalViewPanel
            demoMode={demoMode}
            highlightedSpikes={getBoundWidgetValue(widgetId, 'highlightedSpikes', highlightedSpikes)}
            datasetInfo={getBoundWidgetValue(widgetId, 'datasetInfo', datasetInfo)}
            demoSignalData={getBoundWidgetValue(widgetId, 'signal', defaultSignalData)}
          />
        );
      case 'dimReduction': {
        const source = getBoundWidgetValue(widgetId, 'clusterData', clusterData);
        const selected = getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters);
        const highlighted = getBoundWidgetValue(widgetId, 'highlightedSpikes', highlightedSpikes);
        return (
          <DimensionalityReductionPanel
            clusterData={source?.clusterIds ? source : clusterData}
            selectedClusters={selected}
            clusteringResults={source?.available !== undefined ? source : clusteringResults}
            selectedAlgorithm={selectedAlgorithm}
            selectedSpike={
              highlighted.length > 0
                ? {
                    clusterId: highlighted[0].clusterId,
                    pointIndex: highlighted[0].pointIndex
                  }
                : null
            }
            onSpikeClick={handleDimReductionSpikeClick}
          />
        );
      }
      case 'waveform': {
        const selected = getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters);
        const waveforms = getBoundWidgetValue(widgetId, 'waveforms', clusterWaveforms);
        const highlighted = getBoundWidgetValue(widgetId, 'highlightedSpikes', highlightedSpikes);
        const waveformViewMode = waveformViewModes[widgetId] || 'single';

        return (
          <>
            <div className="waveform-view-toggle">
              <button
                className={waveformViewMode === 'single' ? 'active' : ''}
                onClick={() => setWaveformViewModes((prev) => ({ ...prev, [widgetId]: 'single' }))}
              >
                Single Channel
              </button>
              <button
                className={waveformViewMode === 'neighboring' ? 'active' : ''}
                onClick={() => setWaveformViewModes((prev) => ({ ...prev, [widgetId]: 'neighboring' }))}
              >
                Multi Channel
              </button>
            </div>

            {waveformViewMode === 'single' ? (
              <WaveformSingleChannelView
                selectedClusters={selected}
                clusterWaveforms={waveforms}
                highlightedSpike={
                  highlighted.length > 0
                    ? {
                        clusterId: highlighted[0].clusterId,
                        waveformIdx: highlighted[0].pointIndex
                      }
                    : null
                }
              />
            ) : (
              <WaveformNeighboringChannelsView
                selectedClusters={selected}
                selectedAlgorithm={selectedAlgorithm}
                demoMode={demoMode}
                demoWaveforms={waveforms}
                clusterLookup={curatorClusterMap}
              />
            )}
          </>
        );
      }
      case 'amplitudeProfile':
        return (
          <AmplitudeProfileWidget
            selectedClusters={getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters)}
            clusterWaveforms={getBoundWidgetValue(widgetId, 'waveforms', clusterWaveforms)}
            clusterData={getBoundWidgetValue(widgetId, 'clusterData', clusterData)}
            clusteringResults={getBoundWidgetValue(widgetId, 'clusteringResults', clusteringResults)}
          />
        );
      case 'clusterComparison':
        return <ClusterComparisonWidget />;
      case 'curator':
        return (
          <CuratorWidget
            clusterSetData={getBoundWidgetValue(widgetId, 'clusterSetData', null)}
            signalData={getBoundWidgetValue(widgetId, 'signalData', signalData || defaultSignalData)}
            onClusterSelect={handleCuratorClusterSelect}
            onDatasetChange={handleCuratorDatasetChange}
          />
        );
      case 'rasterPlot': {
        const source = getBoundWidgetValue(widgetId, 'clusterData', clusterData);
        return (
          <RasterPlotWidget
            spikes={getBoundWidgetValue(widgetId, 'spikes', spikes)}
            selectedClusters={getBoundWidgetValue(widgetId, 'selectedClusters', selectedClusters)}
            clusteringResults={source?.available !== undefined ? source : clusteringResults}
            clusterData={source?.clusterIds ? source : clusterData}
            curatorDataset={curatorDataset}
            highlightedSpikes={highlightedSpikes}
            onEventSelect={handleRasterEventSelect}
          />
        );
      }
      default:
        return null;
    }
  };

  const renderExtraWidgetPanel = (widgetId) => {
    const state = widgetStates[widgetId];
    if (!state?.visible || DEFAULT_WIDGET_STATES[widgetId]) {
      return null;
    }

    const widgetType = getWidgetType(widgetId, state);
    const title = state.title || getWidgetList().find((widget) => widget.id === widgetId)?.name || widgetType;

    return (
      <div
        key={widgetId}
        className={`panel ${getWidgetPanelClass(widgetId, state)}`}
        data-widget-panel-id={widgetId}
        style={getPanelStyle(widgetId)}
      >
        <DockableWidget
          id={widgetId}
          title={title}
          onClose={handleCloseWidget}
          onMinimize={handleMinimizeWidget}
          onMaximize={handleMaximizeWidget}
          onLayoutChange={handleWidgetLayoutChange}
          onActivate={handleActivateWidget}
          isMinimized={state.minimized}
          isMaximized={state.maximized}
        >
          {renderWidgetContent(widgetId)}
        </DockableWidget>
      </div>
    );
  };

  return (
    <div
      className={`multi-panel-view ${isDragOver ? 'drag-over' : ''}`}
      ref={containerRef}
      style={displayStyle}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && dropPosition && (
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
        type="button"
        className={`widget-bank-floating-toggle ${isWidgetBankOpen ? 'active' : ''}`}
        onClick={() => setIsWidgetBankOpen((open) => !open)}
        aria-controls="widget-bank"
        aria-expanded={isWidgetBankOpen}
        title={isWidgetBankOpen ? 'Close Widget Bank' : 'Open Widget Bank'}
      >
        <span className="widget-bank-floating-icon">{isWidgetBankOpen ? '<' : '>'}</span>
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
        widgetStates={widgetStates}
        onViewChange={handleViewChange}
        getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
        savedViews={profilePreferences[PROFILE_VIEWS_KEY]}
        savedCurrentViewId={profilePreferences[PROFILE_CURRENT_VIEW_KEY]}
        onPersistViews={persistViewsToAccount}
        layoutStorageScope={layoutStorageScope}
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
      />

      <div className="panel-row panel-row-top">
        {widgetStates.clusterList.visible && (
          <div className="panel panel-cluster-list" data-widget-panel-id="clusterList" style={getPanelStyle('clusterList')}>
            <DockableWidget
              id="clusterList"
              title="Cluster Selector"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.clusterList.minimized}
              isMaximized={widgetStates.clusterList.maximized}
            >
              <ClusterListTable
                clusters={clusterListClusters}
                selectedClusters={selectedClusters}
                onClusterToggle={handleClusterToggle}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.spikeList.visible && (
          <div className="panel panel-spike-list" data-widget-panel-id="spikeList" style={getPanelStyle('spikeList')}>
            <DockableWidget
              id="spikeList"
              title="Spike List Table"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.spikeList.minimized}
              isMaximized={widgetStates.spikeList.maximized}
            >
              <SpikeListTable
                spikes={spikeListSpikes}
                selectedSpike={selectedSpike}
                onSpikeSelect={handleSpikeSelect}
                selectedClusters={spikeListSelectedClusters}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.clusterStats.visible && (
          <div className="panel panel-cluster-stats" data-widget-panel-id="clusterStats" style={getPanelStyle('clusterStats')}>
            <DockableWidget
              id="clusterStats"
              title="Cluster Statistics Window"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.clusterStats.minimized}
              isMaximized={widgetStates.clusterStats.maximized}
            >
              <ClusterStatisticsWindow
                selectedClusters={statsSelectedClusters}
                clusterStats={statsData}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.signalView.visible && (
          <div className="panel panel-signal-view" data-widget-panel-id="signalView" style={getPanelStyle('signalView')}>
            <DockableWidget
              id="signalView"
              title="Signal View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.signalView.minimized}
              isMaximized={widgetStates.signalView.maximized}
            >
              <SignalViewPanel
                demoMode={demoMode}
                highlightedSpikes={signalHighlightedSpikes}
                datasetInfo={signalDatasetInfo}
                demoSignalData={signalTrace}
              />
            </DockableWidget>
          </div>
        )}
      </div>

      <div className="panel-row panel-row-bottom">
        {widgetStates.dimReduction.visible && (
          <div className="panel panel-dim-reduction" data-widget-panel-id="dimReduction" style={getPanelStyle('dimReduction')}>
            <DockableWidget
              id="dimReduction"
              title="Dimensionality Reduction Plot View (PCA)"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.dimReduction.minimized}
              isMaximized={widgetStates.dimReduction.maximized}
            >
              <DimensionalityReductionPanel
                clusterData={dimReductionClusterData}
                selectedClusters={dimReductionSelectedClusters}
                clusteringResults={dimReductionClusteringResults}
                selectedAlgorithm={selectedAlgorithm}
                selectedSpike={
                  dimReductionHighlightedSpikes.length > 0
                    ? {
                        clusterId: dimReductionHighlightedSpikes[0].clusterId,
                        pointIndex: dimReductionHighlightedSpikes[0].pointIndex
                      }
                    : null
                }
                onSpikeClick={handleDimReductionSpikeClick}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.amplitudeProfile.visible && (
          <div className="panel panel-amplitude-profile" data-widget-panel-id="amplitudeProfile" style={getPanelStyle('amplitudeProfile')}>
            <DockableWidget
              id="amplitudeProfile"
              title="Amplitude Profile"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.amplitudeProfile.minimized}
              isMaximized={widgetStates.amplitudeProfile.maximized}
            >
              <AmplitudeProfileWidget
                selectedClusters={amplitudeSelectedClusters}
                clusterWaveforms={amplitudeWaveforms}
                clusterData={amplitudeClusterData}
                clusteringResults={amplitudeClusteringResults}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.clusterComparison.visible && (
          <div className="panel panel-cluster-comparison" data-widget-panel-id="clusterComparison" style={getPanelStyle('clusterComparison')}>
            <DockableWidget
              id="clusterComparison"
              title="Cluster Comparison"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.clusterComparison.minimized}
              isMaximized={widgetStates.clusterComparison.maximized}
            >
              <ClusterComparisonWidget />
            </DockableWidget>
          </div>
        )}

        {widgetStates.curator.visible && (
          <div className="panel panel-curator" data-widget-panel-id="curator" style={getPanelStyle('curator')}>
            <DockableWidget
              id="curator"
              title="Curator"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.curator.minimized}
              isMaximized={widgetStates.curator.maximized}
            >
              <CuratorWidget
                clusterSetData={curatorClusterSet}
                signalData={curatorSignalData}
                onClusterSelect={handleCuratorClusterSelect}
                onDatasetChange={handleCuratorDatasetChange}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.rasterPlot.visible && (
          <div className="panel panel-raster-plot" data-widget-panel-id="rasterPlot" style={getPanelStyle('rasterPlot')}>
            <DockableWidget
              id="rasterPlot"
              title="Raster Plot"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.rasterPlot.minimized}
              isMaximized={widgetStates.rasterPlot.maximized}
            >
              <RasterPlotWidget
                spikes={rasterSpikes}
                selectedClusters={rasterSelectedClusters}
                clusteringResults={rasterClusterSource?.available !== undefined ? rasterClusterSource : clusteringResults}
                clusterData={rasterClusterSource?.clusterIds ? rasterClusterSource : clusterData}
                curatorDataset={curatorDataset}
                highlightedSpikes={highlightedSpikes}
                onEventSelect={handleRasterEventSelect}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.waveform.visible && (
          <div className="panel panel-waveform" data-widget-panel-id="waveform" style={getPanelStyle('waveform')}>
            <DockableWidget
              id="waveform"
              title="Waveform View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              onActivate={handleActivateWidget}
              isMinimized={widgetStates.waveform.minimized}
              isMaximized={widgetStates.waveform.maximized}
            >
              {renderWidgetContent('waveform')}
            </DockableWidget>
          </div>
        )}

        {Object.keys(widgetStates).map(renderExtraWidgetPanel)}
      </div>
    </div>
  );
});

MultiPanelView.displayName = 'MultiPanelView';

export default MultiPanelView;
