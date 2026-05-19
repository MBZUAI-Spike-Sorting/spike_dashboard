import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import AmplitudeProfileWidget from './AmplitudeProfileWidget';
import DockableWidget from './DockableWidget';
import WidgetBank from './WidgetBank';
import RightSideMenu from './RightSideMenu';
import { STORAGE_KEY, CURRENT_VIEW_KEY } from './ViewManager';
import './MultiPanelView.css';

const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null }
};

const PANEL_CLASS_MAP = {
  clusterList: 'panel-cluster-list',
  spikeList: 'panel-spike-list',
  clusterStats: 'panel-cluster-stats',
  signalView: 'panel-signal-view',
  dimReduction: 'panel-dim-reduction',
  waveform: 'panel-waveform',
  amplitudeProfile: 'panel-amplitude-profile'
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
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY);
    const savedViews = localStorage.getItem(STORAGE_KEY);

    if (savedCurrentView && savedViews) {
      try {
        const views = JSON.parse(savedViews);
        const currentView = views.find((v) => v.id === savedCurrentView);
        if (currentView && currentView.widgetStates) {
          return mergeWidgetStateDefaults(currentView.widgetStates);
        }
      } catch (e) {
        console.error('Error loading saved widget states:', e);
      }
    }

    return mergeWidgetStateDefaults(DEFAULT_WIDGET_STATES);
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const lastSavedPositionsRef = useRef(null);

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

      positionsAndSizes[widgetId] = liveLayout[widgetId] || {
        position: widgetStates[widgetId].position || null,
        size: widgetStates[widgetId].size || null
      };
    });

    return positionsAndSizes;
  }, [widgetStates]);

  const mergeLiveLayoutIntoStates = useCallback((states) => {
    const liveLayout = readWidgetLayoutFromDom(Object.keys(states));

    return Object.entries(states).reduce((acc, [widgetId, state]) => {
      const layout = liveLayout[widgetId];

      acc[widgetId] = layout
        ? {
            ...state,
            position: layout.position || state.position,
            size: layout.size || state.size
          }
        : state;

      return acc;
    }, {});
  }, []);

  const saveCurrentState = useCallback(() => {
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY);
    if (!savedCurrentView || savedCurrentView === 'default') return;

    try {
      const savedViews = localStorage.getItem(STORAGE_KEY);
      if (!savedViews) return;

      const views = JSON.parse(savedViews);
      const viewIndex = views.findIndex((v) => v.id === savedCurrentView);

      if (viewIndex === -1) return;

      const positionsAndSizes = getCurrentPositionsAndSizes();

      const updatedWidgetStates = {};
      Object.keys(widgetStates).forEach((key) => {
        updatedWidgetStates[key] = {
          ...widgetStates[key],
          position: positionsAndSizes[key]?.position || null,
          size: positionsAndSizes[key]?.size || null
        };
      });

      const newPositionsStr = JSON.stringify(positionsAndSizes);
      if (lastSavedPositionsRef.current === newPositionsStr) return;
      lastSavedPositionsRef.current = newPositionsStr;

      views[viewIndex] = {
        ...views[viewIndex],
        widgetStates: updatedWidgetStates,
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    } catch (e) {
      console.error('Error auto-saving view:', e);
    }
  }, [widgetStates, getCurrentPositionsAndSizes]);

  useEffect(() => {
    if (!isInitialized) return;
    saveCurrentState();
  }, [widgetStates, isInitialized, saveCurrentState]);

  useEffect(() => {
    if (!isInitialized) return;

    const intervalId = setInterval(() => {
      saveCurrentState();
    }, 2000);

    const handleMouseUp = () => {
      setTimeout(saveCurrentState, 100);
    };

    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isInitialized, saveCurrentState]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveCurrentState]);

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

        const panelClass =
          widgetId === 'clusterList' ? 'panel-cluster-list' :
          widgetId === 'spikeList' ? 'panel-spike-list' :
          widgetId === 'clusterStats' ? 'panel-cluster-stats' :
          widgetId === 'signalView' ? 'panel-signal-view' :
          widgetId === 'dimReduction' ? 'panel-dim-reduction' :
          widgetId === 'waveform' ? 'panel-waveform' :
          widgetId === 'amplitudeProfile' ? 'panel-amplitude-profile' : '';

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
      const next = mergeLiveLayoutIntoStates(prev);

      return {
        ...next,
        [widgetId]: {
          ...next[widgetId],
          visible: !next[widgetId].visible,
          minimized: false
        }
      };
    });
  };

  const handleMinimizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const next = mergeLiveLayoutIntoStates(prev);

      return {
        ...next,
        [widgetId]: {
          ...next[widgetId],
          minimized: !next[widgetId].minimized,
          maximized: false
        }
      };
    });
  };

  const handleMaximizeWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const next = mergeLiveLayoutIntoStates(prev);

      return {
        ...next,
        [widgetId]: {
          ...next[widgetId],
          maximized: !next[widgetId].maximized,
          minimized: false
        }
      };
    });
  };

  const handleCloseWidget = (widgetId) => {
    setWidgetStates((prev) => {
      const next = mergeLiveLayoutIntoStates(prev);

      return {
        ...next,
        [widgetId]: {
          ...next[widgetId],
          visible: false
        }
      };
    });
  };

  const handleResetLayout = () => {
    setWidgetStates(DEFAULT_WIDGET_STATES);

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
  };

  const getWidgetPositionsAndSizes = useCallback(() => {
    const result = {};
    const liveLayout = readWidgetLayoutFromDom(Object.keys(widgetStates));

    Object.keys(widgetStates).forEach((widgetId) => {
      if (!widgetStates[widgetId].visible) return;

      result[widgetId] = liveLayout[widgetId] || {
        position: widgetStates[widgetId].position || null,
        size: widgetStates[widgetId].size || null
      };
    });

    return result;
  }, [widgetStates]);

  const handleViewChange = useCallback((newWidgetStates) => {
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
  }, []);

  const handleAddWidget = useCallback((widget) => {
    setWidgetStates((prev) => {
      const next = mergeLiveLayoutIntoStates(prev);
      const currentState = next[widget.id] || DEFAULT_WIDGET_STATES[widget.id] || {};
      const position = dropPosition || currentState.position || { top: 100, left: 100 };

      return {
        ...next,
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
  }, [dropPosition, mergeLiveLayoutIntoStates]);

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
    { id: 'amplitudeProfile', name: 'Amplitude Profile', visible: widgetStates.amplitudeProfile.visible }
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
        isRunningAlgorithm={isRunningAlgorithm}
        onOpenParameters={onOpenParameters}
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
              isMinimized={widgetStates.clusterList.minimized}
              isMaximized={widgetStates.clusterList.maximized}
            >
              <ClusterListTable
                clusters={clusters}
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
              isMinimized={widgetStates.spikeList.minimized}
              isMaximized={widgetStates.spikeList.maximized}
            >
              <SpikeListTable
                spikes={spikes}
                selectedSpike={selectedSpike}
                onSpikeSelect={handleSpikeSelect}
                selectedClusters={selectedClusters}
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
              isMinimized={widgetStates.clusterStats.minimized}
              isMaximized={widgetStates.clusterStats.maximized}
            >
              <ClusterStatisticsWindow
                selectedClusters={selectedClusters}
                clusterStats={clusterStats}
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
              isMinimized={widgetStates.signalView.minimized}
              isMaximized={widgetStates.signalView.maximized}
            >
              <SignalViewPanel
                demoMode={demoMode}
                highlightedSpikes={highlightedSpikes}
                datasetInfo={datasetInfo}
                demoSignalData={demoSignalData}
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
              isMinimized={widgetStates.dimReduction.minimized}
              isMaximized={widgetStates.dimReduction.maximized}
            >
              <DimensionalityReductionPanel
                clusterData={clusterData}
                selectedClusters={selectedClusters}
                clusteringResults={clusteringResults}
                selectedAlgorithm={selectedAlgorithm}
                selectedSpike={
                  highlightedSpikes.length > 0
                    ? {
                        clusterId: highlightedSpikes[0].clusterId,
                        pointIndex: highlightedSpikes[0].pointIndex
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
              isMinimized={widgetStates.amplitudeProfile.minimized}
              isMaximized={widgetStates.amplitudeProfile.maximized}
            >
              <AmplitudeProfileWidget
                selectedClusters={selectedClusters}
                clusterWaveforms={clusterWaveforms}
                clusterData={clusterData}
                clusteringResults={clusteringResults}
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
                  selectedClusters={selectedClusters}
                  clusterWaveforms={clusterWaveforms}
                  highlightedSpike={
                    highlightedSpikes.length > 0
                      ? {
                          clusterId: highlightedSpikes[0].clusterId,
                          waveformIdx: highlightedSpikes[0].pointIndex
                        }
                      : null
                  }
                />
              ) : (
               <WaveformNeighboringChannelsView
  selectedClusters={selectedClusters}
  selectedAlgorithm={selectedAlgorithm}
  demoMode={demoMode}
  demoWaveforms={demoWaveforms}
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
