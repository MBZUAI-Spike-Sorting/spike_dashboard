import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import ClusterListTable from './ClusterListTable';
import SpikeListTable from './SpikeListTable';
import ClusterStatisticsWindow from './ClusterStatisticsWindow';
import SignalViewPanel from './SignalViewPanel';
import DimensionalityReductionPanel from './DimensionalityReductionPanel';
import WaveformSingleChannelView from './WaveformSingleChannelView';
import WaveformNeighboringChannelsView from './WaveformNeighboringChannelsView';
import DockableWidget from './DockableWidget';
import WidgetBank from './WidgetBank';
import RightSideMenu from './RightSideMenu';
import { STORAGE_KEY, CURRENT_VIEW_KEY } from './ViewManager';
import './MultiPanelView.css';

// Default widget states
const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null }
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
  // State management
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
 useEffect(() => {
  if (!demoMode) return;

  // 1) Group flat PCA points by clusterId
  const grouped = {};
  (demoClusterPlotData || []).forEach((point) => {
    const cid = point.clusterId;
    if (!grouped[cid]) grouped[cid] = [];
    grouped[cid].push(point);
  });

  const clusterIds = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

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

  // 2) Cluster list for ClusterListTable
  setClusters(
    normalizedClusters.map((cluster) => ({
      id: cluster.clusterId,
      size: cluster.pointCount
    }))
  );

  // 3) PCA / dimensionality reduction data
  setClusterData({
    clusters: normalizedClusters,
    clusterIds,
    numClusters: normalizedClusters.length,
    totalPoints: normalizedClusters.reduce((sum, c) => sum + c.pointCount, 0)
  });

  // 4) Preselect first 3 clusters
  setSelectedClusters(clusterIds.slice(0, 3));

  // 5) Normalize spike table shape
  const normalizedSpikes = (demoSpikeTable || []).map((row) => ({
    time: row.spikeTime,
    clusterId: row.assignedClusterId
  }));
  setSpikes(normalizedSpikes);

  // 6) Normalize stats into lookup object
  const normalizedStats = {};
  (demoClusterStats || []).forEach((row) => {
    normalizedStats[row.clusterId] = {
      count: row.count,
      meanAmplitude: row.meanAmplitude
    };
  });
  setClusterStats(normalizedStats);

  // 7) Keep waveforms as-is
  setClusterWaveforms(demoWaveforms || {});
}, [
  demoMode,
  demoClusterPlotData,
  demoSpikeTable,
  demoClusterStats,
  demoWaveforms
]);
useEffect(() => {
  if (!demoMode) return;
  console.log('DEMO clusters:', clusters);
  console.log('DEMO spikes:', spikes);
  console.log('DEMO clusterStats:', clusterStats);
  console.log('DEMO clusterData:', clusterData);
  console.log('DEMO waveforms:', clusterWaveforms);
}, [demoMode, clusters, spikes, clusterStats, clusterData, clusterWaveforms]);
  // Widget Bank state
  const [isWidgetBankOpen, setIsWidgetBankOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropPosition, setDropPosition] = useState(null);
  const containerRef = useRef(null);

  // Widget state management with positions
  const [widgetStates, setWidgetStates] = useState(() => {
    // Try to load saved view on mount
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY);
    const savedViews = localStorage.getItem(STORAGE_KEY);
    
    if (savedCurrentView && savedViews) {
      try {
        const views = JSON.parse(savedViews);
        const currentView = views.find(v => v.id === savedCurrentView);
        if (currentView && currentView.widgetStates) {
          return currentView.widgetStates;
        }
      } catch (e) {
        console.error('Error loading saved widget states:', e);
      }
    }
    return DEFAULT_WIDGET_STATES;
  });

  // Track if initial load is complete
  const [isInitialized, setIsInitialized] = useState(false);
  const lastSavedPositionsRef = useRef(null);

  // Mark as initialized after first render
  useEffect(() => {
    const timer = setTimeout(() => setIsInitialized(true), 500);
    return () => clearTimeout(timer);
  }, []);

  // Helper function to get current positions and sizes from DOM
  const getCurrentPositionsAndSizes = useCallback(() => {
    const positionsAndSizes = {};
    const panelClassMap = {
      clusterList: 'panel-cluster-list',
      spikeList: 'panel-spike-list',
      clusterStats: 'panel-cluster-stats',
      signalView: 'panel-signal-view',
      dimReduction: 'panel-dim-reduction',
      waveform: 'panel-waveform'
    };
    
    Object.keys(widgetStates).forEach(widgetId => {
      if (!widgetStates[widgetId].visible) {
        positionsAndSizes[widgetId] = { position: null, size: null };
        return;
      }
      
      const panelClass = panelClassMap[widgetId];
      const panel = document.querySelector(`.${panelClass}`);
      const widget = panel?.querySelector('.dockable-widget');
      
      if (panel && widget) {
        const panelStyle = window.getComputedStyle(panel);
        const widgetRect = widget.getBoundingClientRect();
        const left = parseFloat(panelStyle.left);
        const top = parseFloat(panelStyle.top);
        
        positionsAndSizes[widgetId] = {
          position: {
            left: isNaN(left) ? null : Math.round(left),
            top: isNaN(top) ? null : Math.round(top)
          },
          size: {
            width: Math.round(widgetRect.width),
            height: Math.round(widgetRect.height)
          }
        };
      }
    });
    
    return positionsAndSizes;
  }, [widgetStates]);

  // Helper function to save current state to localStorage
  const saveCurrentState = useCallback(() => {
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY);
    // Don't save changes to the default view
    if (!savedCurrentView || savedCurrentView === 'default') return;
    
    try {
      const savedViews = localStorage.getItem(STORAGE_KEY);
      if (!savedViews) return;
      
      const views = JSON.parse(savedViews);
      const viewIndex = views.findIndex(v => v.id === savedCurrentView);
      
      if (viewIndex === -1) return;
      
      const positionsAndSizes = getCurrentPositionsAndSizes();
      
      // Build updated widget states with positions
      const updatedWidgetStates = {};
      Object.keys(widgetStates).forEach(key => {
        updatedWidgetStates[key] = {
          ...widgetStates[key],
          position: positionsAndSizes[key]?.position || null,
          size: positionsAndSizes[key]?.size || null
        };
      });
      
      // Check if anything actually changed
      const newPositionsStr = JSON.stringify(positionsAndSizes);
      if (lastSavedPositionsRef.current === newPositionsStr) {
        return; // No changes, skip save
      }
      lastSavedPositionsRef.current = newPositionsStr;
      
      // Update the view in localStorage
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

  // Auto-save on widget state changes (visibility, minimize, maximize)
  useEffect(() => {
    if (!isInitialized) return;
    saveCurrentState();
  }, [widgetStates, isInitialized, saveCurrentState]);

  // Periodic auto-save to capture position/size changes from drag/resize
  useEffect(() => {
    if (!isInitialized) return;
    
    // Save every 2 seconds if there are changes
    const intervalId = setInterval(() => {
      saveCurrentState();
    }, 2000);
    
    // Also save on mouseup (when user finishes dragging/resizing)
    const handleMouseUp = () => {
      setTimeout(saveCurrentState, 100);
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isInitialized, saveCurrentState]);

  // Save before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveCurrentState();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveCurrentState]);

  // Clear all data when algorithm changes
  useEffect(() => {
    console.log(`[${selectedAlgorithm}] Algorithm changed, clearing all data`);
    setClusters([]);
    setSelectedClusters([]);
    setSpikes([]);
    setSelectedSpike(null);
    setClusterStats({});
    setClusterData(null);
    setClusterWaveforms({});
    setNeighboringChannels({});
    setHighlightedSpikes([]);
  }, [selectedAlgorithm]);

  // Fetch cluster list on mount or when clustering results change
  useEffect(() => {
    if (demoMode) return;
    fetchClusterList() ;
  }, [selectedDataset, clusteringResults, selectedAlgorithm]);

  // Auto-select clusters 0, 1, 2 for preprocessed algorithms
  useEffect(() => {
    if ((selectedAlgorithm === 'preprocessed_torchbci' || selectedAlgorithm === 'preprocessed_kilosort4') && clusters.length > 0 && selectedClusters.length === 0) {
      const defaultClusters = [0, 1, 2].filter(id => clusters.some(c => c.id === id));
      if (defaultClusters.length > 0) {
        setSelectedClusters(defaultClusters);
        console.log('Auto-selected clusters:', defaultClusters);
      }
    }
  }, [clusters, selectedAlgorithm]);

  // Cleanup Plotly instances on unmount
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

  // Fetch spikes when clusters are selected or when clusterData becomes available
  useEffect(() => {
    if (selectedClusters.length > 0) {
      if (demoMode) return;
      fetchSpikesForClusters();
      if (demoMode) return;
      fetchClusterStatistics();
      if (demoMode) return;
      fetchClusterWaveforms();
    } else {
      setSpikes([]);
      setClusterStats({});
      setClusterWaveforms({});
    }
  }, [selectedClusters, clusterData, clusteringResults]);

  // Apply saved positions and sizes when widgetStates change
  useEffect(() => {
    // Apply saved positions and sizes to DOM elements
    const applyLayoutFromState = () => {
      Object.entries(widgetStates).forEach(([widgetId, state]) => {
        if (!state.visible) return;
        
        // Convert camelCase to kebab-case for CSS class
        const panelClass = widgetId === 'clusterList' ? 'panel-cluster-list' :
                          widgetId === 'spikeList' ? 'panel-spike-list' :
                          widgetId === 'clusterStats' ? 'panel-cluster-stats' :
                          widgetId === 'signalView' ? 'panel-signal-view' :
                          widgetId === 'dimReduction' ? 'panel-dim-reduction' :
                          widgetId === 'waveform' ? 'panel-waveform' : '';
        
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
    
    // Multiple attempts to ensure DOM is ready
    const timer1 = setTimeout(applyLayoutFromState, 50);
    const timer2 = setTimeout(applyLayoutFromState, 200);
    const timer3 = setTimeout(applyLayoutFromState, 500);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [widgetStates]);

  // Fetch cluster list from API
  const fetchClusterList = async () => {
    try {
      console.log(`[${selectedAlgorithm}] Fetching cluster list...`);
      
      if (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') {
        if (clusteringResults && clusteringResults.available) {
          console.log(`Using ${selectedAlgorithm} results for cluster list`);
          
          const clusterList = clusteringResults.clusters.map((clusterSummary) => ({
            id: clusterSummary.clusterId,
            size: clusterSummary.numSpikes
          }));
          
          setClusters(clusterList);
          console.log(`Loaded ${clusterList.length} clusters from ${selectedAlgorithm}`);
        } else {
          console.log(`${selectedAlgorithm} selected but not run yet - keeping cluster list empty`);
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
        const clusterList = data.clusterIds.map(id => ({ id }));
        setClusters(clusterList);
        console.log(`Loaded ${clusterList.length} clusters`);
      }
    } catch (error) {
      console.error('Error fetching cluster list:', error);
    }
  };

  // Fetch spikes for selected clusters
  const fetchSpikesForClusters = async () => {
    try {
      console.log(`[${selectedAlgorithm}] Fetching spikes for clusters:`, selectedClusters);
      
      if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
        console.log(`Using ${selectedAlgorithm} results for spike list`);
        
        const allSpikes = [];
        
        selectedClusters.forEach(clusterId => {
          if (clusterId < clusteringResults.fullData.length) {
            const clusterSpikes = clusteringResults.fullData[clusterId];
            clusterSpikes.forEach((spike) => {
              allSpikes.push({
                time: spike.time,
                clusterId: clusterId,
                channel: spike.channel
              });
            });
          }
        });
        
        allSpikes.sort((a, b) => a.time - b.time);
        setSpikes(allSpikes);
        console.log(`Loaded ${allSpikes.length} spikes from JimsAlgorithm for ${selectedClusters.length} clusters`);
        return;
      }
      
      if (!clusterData || !clusterData.clusters) return;

      const allSpikes = [];

      selectedClusters.forEach(clusterId => {
        const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
        if (cluster && cluster.spikeTimes) {
          cluster.spikeTimes.forEach(time => {
            if (time !== null) {
              allSpikes.push({
                time: time,
                clusterId: clusterId
              });
            }
          });
        }
      });

      allSpikes.sort((a, b) => a.time - b.time);
      setSpikes(allSpikes);
      console.log(`Loaded ${allSpikes.length} spikes for ${selectedClusters.length} clusters`);
    } catch (error) {
      console.error('Error fetching spikes:', error);
    }
  };

  // Fetch cluster statistics
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
        console.log(`[${selectedAlgorithm}] Loaded cluster statistics:`, data.statistics);
      }
    } catch (error) {
      console.error('Error fetching cluster statistics:', error);
    }
  };

  // Fetch cluster waveforms
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
        console.log(`[${selectedAlgorithm}] Loaded cluster waveforms:`, Object.keys(data.waveforms || {}).length, 'clusters');
      }
    } catch (error) {
      console.error('Error fetching cluster waveforms:', error);
    }
  };

  // Handle cluster selection toggle
  const handleClusterToggle = (clusterId) => {
    setSelectedClusters(prev => {
      if (prev.includes(clusterId)) {
        return prev.filter(id => id !== clusterId);
      } else {
        return [...prev, clusterId];
      }
    });
  };

  // Handle spike selection from table
  const handleSpikeSelect = (index, spike) => {
    setSelectedSpike(index);

    let pointIndex = -1;
    const spikeTimeNum = Number(spike.time);

    if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
      if (clusteringResults.fullData && clusteringResults.fullData[spike.clusterId]) {
        const clusterSpikes = clusteringResults.fullData[spike.clusterId];
        pointIndex = clusterSpikes.findIndex(s => Math.abs(Number(s.time) - spikeTimeNum) < 0.01);
        
        if (pointIndex === -1) {
          console.warn(`Could not find spike at time ${spikeTimeNum} in cluster ${spike.clusterId}`);
        }
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find(c => c.clusterId === spike.clusterId);
      if (cluster && cluster.spikeTimes) {
        pointIndex = cluster.spikeTimes.findIndex(t => Math.abs(Number(t) - spikeTimeNum) < 0.01);
        
        if (pointIndex === -1) {
          console.warn(`Could not find spike at time ${spikeTimeNum} in cluster ${spike.clusterId}`);
        }
      }
    }

    if (pointIndex !== -1) {
      setHighlightedSpikes([{
        clusterId: spike.clusterId,
        pointIndex: pointIndex,
        time: spike.time
      }]);

      const newStart = Math.max(0, spike.time - 500);
      const newEnd = spike.time + 500;
      setTimeRange({ start: newStart, end: newEnd });
    } else {
      console.error(`Failed to find point index for spike at time ${spikeTimeNum}, cluster ${spike.clusterId}`);
    }
  };

  // Handle spike click from dimensionality reduction plot
  const handleDimReductionSpikeClick = (clusterId, pointIndex) => {
    let spikeTime = null;

    if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
      if (clusteringResults.fullData && clusteringResults.fullData[clusterId] && clusteringResults.fullData[clusterId][pointIndex]) {
        spikeTime = clusteringResults.fullData[clusterId][pointIndex].time;
      }
    } else if (clusterData && clusterData.clusters) {
      const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
      if (cluster && cluster.spikeTimes && cluster.spikeTimes[pointIndex]) {
        spikeTime = cluster.spikeTimes[pointIndex];
      }
    }

    if (spikeTime !== null) {
      const spikeTimeNum = Number(spikeTime);
      const spikeIndex = spikes.findIndex(s => 
        s.clusterId === clusterId && Math.abs(Number(s.time) - spikeTimeNum) < 0.01
      );
      
      if (spikeIndex !== -1) {
        handleSpikeSelect(spikeIndex, spikes[spikeIndex]);
      } else {
        console.warn(`Could not find spike in spike list at time ${spikeTimeNum}, cluster ${clusterId}`);
      }
    }
  };

  // Widget management handlers
  const handleToggleWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: !prev[widgetId].visible,
        minimized: false
      }
    }));
  };

  const handleMinimizeWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        minimized: !prev[widgetId].minimized,
        maximized: false
      }
    }));
  };

  const handleMaximizeWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        maximized: !prev[widgetId].maximized,
        minimized: false
      }
    }));
  };

  const handleCloseWidget = (widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: false
      }
    }));
  };

  const handleResetLayout = () => {
    setWidgetStates(DEFAULT_WIDGET_STATES);
    
    // Reset widget sizes and positions by removing inline styles
    document.querySelectorAll('.dockable-widget').forEach(widget => {
      widget.style.width = '';
      widget.style.height = '';
      widget.style.flex = '';
      widget.style.zIndex = '';
    });
    
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.left = '';
      panel.style.top = '';
    });
  };

  // Get widget positions and sizes from DOM
  const getWidgetPositionsAndSizes = useCallback(() => {
    const result = {};
    
    const panelClassMap = {
      clusterList: 'panel-cluster-list',
      spikeList: 'panel-spike-list',
      clusterStats: 'panel-cluster-stats',
      signalView: 'panel-signal-view',
      dimReduction: 'panel-dim-reduction',
      waveform: 'panel-waveform'
    };
    
    Object.keys(widgetStates).forEach(widgetId => {
      if (!widgetStates[widgetId].visible) return;
      
      const panelClass = panelClassMap[widgetId];
      const panel = document.querySelector(`.${panelClass}`);
      const widget = panel?.querySelector('.dockable-widget');
      
      if (panel && widget) {
        const panelStyle = window.getComputedStyle(panel);
        const widgetRect = widget.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        
        // Calculate position relative to container
        const left = parseFloat(panelStyle.left);
        const top = parseFloat(panelStyle.top);
        
        result[widgetId] = {
          position: {
            left: isNaN(left) ? null : left,
            top: isNaN(top) ? null : top
          },
          size: {
            width: widgetRect.width,
            height: widgetRect.height
          }
        };
      }
    });
    
    return result;
  }, [widgetStates]);

  // Handle view change from ViewManager
  const handleViewChange = useCallback((newWidgetStates) => {
    // First reset all styles
    document.querySelectorAll('.dockable-widget').forEach(widget => {
      widget.style.width = '';
      widget.style.height = '';
      widget.style.flex = '';
    });
    
    document.querySelectorAll('.panel').forEach(panel => {
      panel.style.left = '';
      panel.style.top = '';
    });
    
    // Deep clone to avoid reference issues
    const clonedStates = JSON.parse(JSON.stringify(newWidgetStates));
    
    // Then apply new states
    setWidgetStates(clonedStates);
  }, []);

  // Handle adding widget from Widget Bank
  const handleAddWidget = useCallback((widget) => {
    const position = dropPosition || { top: 100, left: 100 };
    
    setWidgetStates(prev => ({
      ...prev,
      [widget.id]: {
        ...prev[widget.id],
        visible: true,
        minimized: false,
        maximized: false,
        position: position
      }
    }));
    
    setDropPosition(null);
  }, [dropPosition]);

  // Drag and drop handlers
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

  // Get widget list for toolbar
  const getWidgetList = () => [
    { id: 'clusterList', name: 'Cluster List', visible: widgetStates.clusterList.visible },
    { id: 'spikeList', name: 'Spike List Table', visible: widgetStates.spikeList.visible },
    { id: 'clusterStats', name: 'Cluster Statistics Window', visible: widgetStates.clusterStats.visible },
    { id: 'signalView', name: 'Signal View', visible: widgetStates.signalView.visible },
    { id: 'dimReduction', name: 'Dimensionality Reduction Plot View (PCA)', visible: widgetStates.dimReduction.visible },
    { id: 'waveform', name: 'Waveform View', visible: widgetStates.waveform.visible }
  ];

  // Expose methods and state to parent component via ref
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

  // Trigger resize event for child components when widget size changes
  useEffect(() => {
    const handleWidgetResize = () => {
      window.dispatchEvent(new Event('resize'));
    };
    
    const timer = setTimeout(handleWidgetResize, 100);
    return () => clearTimeout(timer);
  }, [widgetStates]);

  // Generate panel style with custom position
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
      {/* Drop indicator */}
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

      {/* Widget Bank */}
      <WidgetBank
        isOpen={isWidgetBankOpen}
        onClose={() => setIsWidgetBankOpen(false)}
        widgetStates={widgetStates}
        onAddWidget={handleAddWidget}
        onToggleWidget={handleToggleWidget}
      />

      {/* Right Side Menu */}
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

      {/* Top Row */}
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

      {/* Bottom Row */}
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
                selectedSpike={highlightedSpikes.length > 0 ? {
                  clusterId: highlightedSpikes[0].clusterId,
                  pointIndex: highlightedSpikes[0].pointIndex
                } : null}
                onSpikeClick={handleDimReductionSpikeClick}
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
                  highlightedSpike={highlightedSpikes.length > 0 ? {
                    clusterId: highlightedSpikes[0].clusterId,
                    waveformIdx: highlightedSpikes[0].pointIndex
                  } : null}
                />
              ) : (
                <WaveformNeighboringChannelsView
                  selectedClusters={selectedClusters}
                  selectedAlgorithm={selectedAlgorithm}
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
