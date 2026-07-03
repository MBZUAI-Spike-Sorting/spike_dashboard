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
  createDashboardPipelineVariables,
  mergeWidgetInputBindings
} from '../widgets/dataContracts';
import { useAuth } from '../context/AuthContext';
import './MultiPanelView.css';

const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null },
  clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null },
  curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null }
};

const WIDGET_BINDINGS_STORAGE_KEY = 'spike_dashboard_widget_input_bindings';

const PANEL_CLASS_MAP = {
  clusterList: 'panel-cluster-list',
  spikeList: 'panel-spike-list',
  clusterStats: 'panel-cluster-stats',
  signalView: 'panel-signal-view',
  dimReduction: 'panel-dim-reduction',
  waveform: 'panel-waveform',
  amplitudeProfile: 'panel-amplitude-profile',
  clusterComparison: 'panel-cluster-comparison',
  curator: 'panel-curator'
};

const mergeWidgetStateDefaults = (widgetStates = {}) => {
  return Object.entries(DEFAULT_WIDGET_STATES).reduce((acc, [widgetId, defaultState]) => {
    acc[widgetId] = {
      ...defaultState,
      ...(widgetStates[widgetId] || {})
    };
    return acc;
  }, {});
};

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
    if (!panelClass) return;

    const panel = document.querySelector(`.${panelClass}`);
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
  const [waveformViewMode, setWaveformViewMode] = useState('single');

  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
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
      signalData: signalData || demoSignalData,
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
    demoSignalData,
    datasetInfo
  ]);

  useEffect(() => {
    localStorage.setItem(
      WIDGET_BINDINGS_STORAGE_KEY,
      JSON.stringify(widgetInputBindings)
    );
  }, [widgetInputBindings]);

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
        positionsAndSizes[widgetId] = { position: null, size: null };
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
    if (
      (selectedAlgorithm === 'preprocessed_torchbci' || selectedAlgorithm === 'preprocessed_kilosort4') &&
      clusters.length > 0 &&
      selectedClusters.length === 0
    ) {
      const defaultClusters = [0, 1, 2].filter((id) => clusters.some((c) => c.id === id));
      if (defaultClusters.length > 0) {
        setSelectedClusters(defaultClusters);
      }
    }
  }, [clusters, selectedAlgorithm, selectedClusters.length]);

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
  }, [selectedClusters, clusterData, clusteringResults, demoMode]);

  useEffect(() => {
    const applyLayoutFromState = () => {
      Object.entries(widgetStates).forEach(([widgetId, state]) => {
        if (!state.visible) return;

        const panelClass = PANEL_CLASS_MAP[widgetId] || '';

        const panel = document.querySelector(`.${panelClass}`);
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
          const clusterList = clusteringResults.clusters.map((clusterSummary) => ({
            id: clusterSummary.clusterId,
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
        const clusterList = data.clusterIds.map((id) => ({ id }));
        setClusters(clusterList);
      }
    } catch (error) {
      console.error('Error fetching cluster list:', error);
    }
  };

  const fetchSpikesForClusters = async () => {
    try {
      if (
        (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') &&
        clusteringResults &&
        clusteringResults.available
      ) {
        const allSpikes = [];

        selectedClusters.forEach((clusterId) => {
          if (clusterId < clusteringResults.fullData.length) {
            const clusterSpikes = clusteringResults.fullData[clusterId];
            clusterSpikes.forEach((spike) => {
              allSpikes.push({
                time: spike.time,
                clusterId,
                channel: spike.channel
              });
            });
          }
        });

        allSpikes.sort((a, b) => a.time - b.time);
        setSpikes(allSpikes);
        return;
      }

      if (!clusterData || !clusterData.clusters) return;

      const allSpikes = [];

      selectedClusters.forEach((clusterId) => {
        const cluster = clusterData.clusters.find((c) => c.clusterId === clusterId);
        if (cluster && cluster.spikeTimes) {
          cluster.spikeTimes.forEach((time) => {
            if (time !== null) {
              allSpikes.push({
                time,
                clusterId
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
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/cluster-waveforms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clusterIds: selectedClusters,
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

    let pointIndex = -1;
    const spikeTimeNum = Number(spike.time);

    if (
      (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') &&
      clusteringResults &&
      clusteringResults.available
    ) {
      if (clusteringResults.fullData && clusteringResults.fullData[spike.clusterId]) {
        const clusterSpikes = clusteringResults.fullData[spike.clusterId];
        pointIndex = clusterSpikes.findIndex((s) => Math.abs(Number(s.time) - spikeTimeNum) < 0.01);
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find((c) => c.clusterId === spike.clusterId);
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
      if (clusteringResults.fullData && clusteringResults.fullData[clusterId] && clusteringResults.fullData[clusterId][pointIndex]) {
        spikeTime = clusteringResults.fullData[clusterId][pointIndex].time;
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find((c) => c.clusterId === clusterId);
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
      return {
        ...prev,
        [widgetId]: {
          ...prev[widgetId],
          visible: !prev[widgetId].visible,
          minimized: false
        }
      };
    });
  };

  const handleMinimizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      return {
        ...prev,
        [widgetId]: {
          ...prev[widgetId],
          minimized: !prev[widgetId].minimized,
          maximized: false
        }
      };
    });
  };

  const handleMaximizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      return {
        ...prev,
        [widgetId]: {
          ...prev[widgetId],
          maximized: !prev[widgetId].maximized,
          minimized: false
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
      if (!widgetStates[widgetId].visible) return;

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

  const getBoundWidgetValue = useCallback((widgetId, inputId, fallbackValue) => {
    const variableId = widgetInputBindings[widgetId]?.[inputId];
    const variable = pipelineVariables[variableId];

    if (!variable || !variable.isAvailable || !variable.isFormatValid) {
      return fallbackValue;
    }

    return variable.value;
  }, [pipelineVariables, widgetInputBindings]);

  const handleAddWidget = useCallback((widget) => {
    setWidgetStates((prev) => {
      const currentState = prev[widget.id] || DEFAULT_WIDGET_STATES[widget.id] || {};
      const position = dropPosition || currentState.position || { top: 100, left: 100 };

      return {
        ...prev,
        [widget.id]: {
          ...currentState,
          visible: true,
          minimized: false,
          maximized: false,
          position
        }
      };
    });

    setDropPosition(null);
  }, [dropPosition]);

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

  const getWidgetList = () => [
    { id: 'clusterList', name: 'Cluster List', visible: widgetStates.clusterList.visible },
    { id: 'spikeList', name: 'Spike List Table', visible: widgetStates.spikeList.visible },
    { id: 'clusterStats', name: 'Cluster Statistics Window', visible: widgetStates.clusterStats.visible },
    { id: 'signalView', name: 'Signal View', visible: widgetStates.signalView.visible },
    { id: 'dimReduction', name: 'Dimensionality Reduction Plot View (PCA)', visible: widgetStates.dimReduction.visible },
    { id: 'waveform', name: 'Waveform View', visible: widgetStates.waveform.visible },
    { id: 'amplitudeProfile', name: 'Amplitude Profile', visible: widgetStates.amplitudeProfile.visible },
    { id: 'clusterComparison', name: 'Cluster Comparison', visible: widgetStates.clusterComparison.visible },
    { id: 'curator', name: 'Curator', visible: widgetStates.curator.visible }
  ];

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

  const getPanelStyle = (widgetId) => {
    const state = widgetStates[widgetId];
    if (state?.position) {
      return {
        top: typeof state.position.top === 'number' ? `${state.position.top}px` : state.position.top,
        left: typeof state.position.left === 'number' ? `${state.position.left}px` : state.position.left
      };
    }
    return {};
  };

  const clusterListClusters = getBoundWidgetValue('clusterList', 'clusters', clusters);
  const spikeListSpikes = getBoundWidgetValue('spikeList', 'spikes', spikes);
  const spikeListSelectedClusters = getBoundWidgetValue('spikeList', 'selectedClusters', selectedClusters);
  const statsSelectedClusters = getBoundWidgetValue('clusterStats', 'selectedClusters', selectedClusters);
  const statsData = getBoundWidgetValue('clusterStats', 'statistics', clusterStats);
  const signalDatasetInfo = getBoundWidgetValue('signalView', 'datasetInfo', datasetInfo);
  const signalHighlightedSpikes = getBoundWidgetValue('signalView', 'highlightedSpikes', highlightedSpikes);
  const signalTrace = getBoundWidgetValue('signalView', 'signal', demoSignalData);
  const dimReductionSource = getBoundWidgetValue('dimReduction', 'clusterData', clusterData);
  const dimReductionSelectedClusters = getBoundWidgetValue('dimReduction', 'selectedClusters', selectedClusters);
  const dimReductionHighlightedSpikes = getBoundWidgetValue('dimReduction', 'highlightedSpikes', highlightedSpikes);
  const dimReductionClusterData = dimReductionSource?.clusterIds ? dimReductionSource : clusterData;
  const dimReductionClusteringResults = dimReductionSource?.available !== undefined ? dimReductionSource : clusteringResults;
  const waveformSelectedClusters = getBoundWidgetValue('waveform', 'selectedClusters', selectedClusters);
  const waveformData = getBoundWidgetValue('waveform', 'waveforms', clusterWaveforms);
  const waveformHighlightedSpikes = getBoundWidgetValue('waveform', 'highlightedSpikes', highlightedSpikes);
  const amplitudeSelectedClusters = getBoundWidgetValue('amplitudeProfile', 'selectedClusters', selectedClusters);
  const amplitudeWaveforms = getBoundWidgetValue('amplitudeProfile', 'waveforms', clusterWaveforms);
  const amplitudeClusterData = getBoundWidgetValue('amplitudeProfile', 'clusterData', clusterData);
  const amplitudeClusteringResults = getBoundWidgetValue('amplitudeProfile', 'clusteringResults', clusteringResults);
  const curatorClusterSet = getBoundWidgetValue('curator', 'clusterSetData', null);
  const curatorSignalData = getBoundWidgetValue('curator', 'signalData', signalData || demoSignalData);

  const handleCuratorClusterSelect = useCallback((cluster) => {
    const numericClusterId = Number(cluster.id);
    const clusterId = Number.isFinite(numericClusterId) ? numericClusterId : cluster.id;
    const spikeTimes = Array.isArray(cluster.spikeTimes) ? cluster.spikeTimes : [];
    const firstSpikeTime = spikeTimes.find((time) => Number.isFinite(Number(time)));

    setSelectedClusters([clusterId]);
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
  }, []);

  return (
    <div
      className={`multi-panel-view ${isDragOver ? 'drag-over' : ''}`}
      ref={containerRef}
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
        customPipelines={customPipelines}
        isLoadingCustomPipelines={isLoadingCustomPipelines}
        customPipelineError={customPipelineError}
        onAddCustomPipeline={onAddCustomPipeline}
        onDeleteCustomPipeline={onDeleteCustomPipeline}
        canManageCustomPipelines={canManageCustomPipelines}
      />

      <div className="panel-row panel-row-top">
        {widgetStates.clusterList.visible && (
          <div className="panel panel-cluster-list" style={getPanelStyle('clusterList')}>
            <DockableWidget
              id="clusterList"
              title="Cluster List"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-spike-list" style={getPanelStyle('spikeList')}>
            <DockableWidget
              id="spikeList"
              title="Spike List Table"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-cluster-stats" style={getPanelStyle('clusterStats')}>
            <DockableWidget
              id="clusterStats"
              title="Cluster Statistics Window"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-signal-view" style={getPanelStyle('signalView')}>
            <DockableWidget
              id="signalView"
              title="Signal View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-dim-reduction" style={getPanelStyle('dimReduction')}>
            <DockableWidget
              id="dimReduction"
              title="Dimensionality Reduction Plot View (PCA)"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-amplitude-profile" style={getPanelStyle('amplitudeProfile')}>
            <DockableWidget
              id="amplitudeProfile"
              title="Amplitude Profile"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
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
          <div className="panel panel-cluster-comparison" style={getPanelStyle('clusterComparison')}>
            <DockableWidget
              id="clusterComparison"
              title="Cluster Comparison"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              isMinimized={widgetStates.clusterComparison.minimized}
              isMaximized={widgetStates.clusterComparison.maximized}
            >
              <ClusterComparisonWidget />
            </DockableWidget>
          </div>
        )}

        {widgetStates.curator.visible && (
          <div className="panel panel-curator" style={getPanelStyle('curator')}>
            <DockableWidget
              id="curator"
              title="Curator"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              isMinimized={widgetStates.curator.minimized}
              isMaximized={widgetStates.curator.maximized}
            >
              <CuratorWidget
                clusterSetData={curatorClusterSet}
                signalData={curatorSignalData}
                onClusterSelect={handleCuratorClusterSelect}
              />
            </DockableWidget>
          </div>
        )}

        {widgetStates.waveform.visible && (
          <div className="panel panel-waveform" style={getPanelStyle('waveform')}>
            <DockableWidget
              id="waveform"
              title="Waveform View"
              onClose={handleCloseWidget}
              onMinimize={handleMinimizeWidget}
              onMaximize={handleMaximizeWidget}
              onLayoutChange={handleWidgetLayoutChange}
              isMinimized={widgetStates.waveform.minimized}
              isMaximized={widgetStates.waveform.maximized}
            >
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
                  selectedClusters={waveformSelectedClusters}
                  clusterWaveforms={waveformData}
                  highlightedSpike={
                    waveformHighlightedSpikes.length > 0
                      ? {
                          clusterId: waveformHighlightedSpikes[0].clusterId,
                          waveformIdx: waveformHighlightedSpikes[0].pointIndex
                        }
                      : null
                  }
                />
              ) : (
                <WaveformNeighboringChannelsView
                  selectedClusters={waveformSelectedClusters}
                  selectedAlgorithm={selectedAlgorithm}
                  demoMode={demoMode}
                  demoWaveforms={waveformData}
                />
              )}
            </DockableWidget>
          </div>
        )}
      </div>
    </div>
  );
});

MultiPanelView.displayName = 'MultiPanelView';

export default MultiPanelView;
