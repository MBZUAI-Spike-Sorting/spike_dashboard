import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import VisualizationArea from './components/VisualizationArea';
import ClusterView from './components/ClusterView';
import MultiPanelView from './components/MultiPanelView';
import RuntimeAnalysisView from './components/RuntimeAnalysisView';
import Upload from './components/Upload';
import ConfirmDialog from './components/ConfirmDialog';
import AlgorithmParametersMenu from './components/AlgorithmParametersMenu';
import ErrorBoundary from './components/ErrorBoundary';
import LRUCache from './utils/LRUCache';
import { getDefaultAlgorithmParameters } from './utils/hyperparameters';
import apiClient from './api/client';
import { useAuth } from './context/AuthContext';
import {
  DEFAULT_CHANNELS,
  DEFAULT_TIME_RANGE,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_SPIKE_THRESHOLD,
  DEFAULT_FILTER_TYPE,
  DEFAULT_DATA_TYPE,
  DEFAULT_VIEW,
  DEFAULT_DATASET,
  CACHE_SIZE,
  FETCH_DEBOUNCE_MS,
  FILTERED_LINE_COLOR,
} from './constants/config';
import {
  demoDatasets,
  demoClusterPlotData,
  demoSpikeTable,
  demoClusterStats,
  demoWaveforms,
  demoSignalData,
  synthesizeChannelTrace,
  applyDemoFilter
} from './data/demoDashboardData';
import './App.css';

const DEMO_ALGORITHMS = [
  {
    name: 'kilosort4',
    displayName: 'Kilosort4',
    available: true,
    requiresRun: true
  },
  {
    name: 'mountainsort5',
    displayName: 'MountainSort5',
    available: true,
    requiresRun: true
  },
  {
    name: 'rtsort',
    displayName: 'RTSort',
    available: true,
    requiresRun: true
  }
];

const PIPELINE_ACTIVE_STATUSES = new Set(['running', 'cancel_requested']);
const PIPELINE_TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled']);

const buildDemoClusteringResults = () => {
  const grouped = {};
  demoClusterPlotData.forEach((point) => {
    if (!grouped[point.clusterId]) grouped[point.clusterId] = [];
    grouped[point.clusterId].push(point);
  });

  const clusterIds = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  const fullData = clusterIds.map((clusterId, clusterIndex) =>
    grouped[clusterId].map((p, pointIndex) => ({
      x: p.x,
      y: p.y,
      time: 100 + pointIndex * 20,
      channel: [179, 181, 183][clusterIndex % 3]
    }))
  );

  const clusters = clusterIds.map((clusterId) => ({
    clusterId,
    numSpikes: grouped[clusterId].length
  }));

  return {
    demo: true,
    available: true,
    fullData,
    clusters,
    numClusters: clusterIds.length,
    totalSpikes: demoClusterPlotData.length
  };
};

function App({ demoMode = false }) {
  const { hasAlgorithmAccess } = useAuth();

  const [selectedChannels, setSelectedChannels] = useState(DEFAULT_CHANNELS);
  const [channelScrollOffset, setChannelScrollOffset] = useState(0);

  const [spikeData, setSpikeData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState(DEFAULT_TIME_RANGE);
  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW_SIZE);
  const [spikeThreshold, setSpikeThreshold] = useState(DEFAULT_SPIKE_THRESHOLD);
  const [invertData, setInvertData] = useState(false);

  const [datasetInfo, setDatasetInfo] = useState({ totalDataPoints: 3500000, totalChannels: 385 });
  const [datasets, setDatasets] = useState([]);
  const [currentDataset, setCurrentDataset] = useState(DEFAULT_DATASET);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [usePrecomputedSpikes, setUsePrecomputedSpikes] = useState(false);
  const [precomputedAvailable, setPrecomputedAvailable] = useState(false);

  const [selectedView, setSelectedView] = useState(demoMode ? 'multipanel' : DEFAULT_VIEW);
  const [selectedDataType, setSelectedDataType] = useState(DEFAULT_DATA_TYPE);
  const [filterType, setFilterType] = useState(DEFAULT_FILTER_TYPE);
  const [filteredLineColor, setFilteredLineColor] = useState(FILTERED_LINE_COLOR);

  const [allAlgorithms, setAllAlgorithms] = useState([]);
  const [customPipelines, setCustomPipelines] = useState([]);
  const [isLoadingCustomPipelines, setIsLoadingCustomPipelines] = useState(false);
  const [customPipelineError, setCustomPipelineError] = useState(null);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('');
  const [isRunningAlgorithm, setIsRunningAlgorithm] = useState(false);
  const [pipelineJob, setPipelineJob] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState('idle');
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [pipelineError, setPipelineError] = useState(null);
  const [clusteringResults, setClusteringResults] = useState(null);
  const [showParametersMenu, setShowParametersMenu] = useState(false);
  const [algorithmParameters, setAlgorithmParameters] = useState(() =>
    getDefaultAlgorithmParameters('torchbci_jims')
  );

  const dataCache = React.useRef(new LRUCache(CACHE_SIZE));
  const fetchTimeoutRef = React.useRef(null);
  const multiPanelViewRef = React.useRef(null);

  const algorithms = useMemo(() => {
    if (demoMode) return DEMO_ALGORITHMS;
    if (!allAlgorithms || allAlgorithms.length === 0) return [];
    return allAlgorithms.filter(
      (algo) => algo.kind === 'custom' || hasAlgorithmAccess(algo.name)
    );
  }, [allAlgorithms, hasAlgorithmAccess, demoMode]);

  useEffect(() => {
    if (demoMode) {
      setDatasets(demoDatasets);
      setCurrentDataset(demoDatasets[0]?.name || 'synthetic_demo_recording');
      setDatasetInfo({
        totalDataPoints: 4000,
        totalChannels: 385
      });
      setSelectedChannels([179, 181, 183]);
      setSelectedView('multipanel');
      setAllAlgorithms(DEMO_ALGORITHMS);
      setSelectedAlgorithm(DEMO_ALGORITHMS[0].name);
      setAlgorithmParameters(getDefaultAlgorithmParameters(DEMO_ALGORITHMS[0].name));
      setPrecomputedAvailable(false);
      setUsePrecomputedSpikes(false);
      setClusteringResults(buildDemoClusteringResults());
      return;
    }

    const initializeApp = async () => {
      await fetchDatasets();
      await fetchCustomPipelines();
      await fetchAlgorithms();
      await handleDatasetChange('c46_data_5percent.pt');
    };

    initializeApp();
  }, [demoMode]);

  useEffect(() => {
    if (selectedChannels.length > 0) {
      dataCache.current.clear();
      fetchSpikeData();
    }
  }, [
    selectedChannels,
    spikeThreshold,
    invertData,
    usePrecomputedSpikes,
    selectedDataType,
    filterType,
    demoMode
  ]);

  useEffect(() => {
    if (selectedChannels.length > 0) {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }

      fetchTimeoutRef.current = setTimeout(() => {
        fetchSpikeData();
      }, FETCH_DEBOUNCE_MS);

      return () => {
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
      };
    }
  }, [timeRange, demoMode]);

  const fetchDatasets = async () => {
    if (demoMode) return;
    try {
      const data = await apiClient.getDatasets();
      setDatasets(data.datasets);
      setCurrentDataset(data.current);
    } catch (error) {
      console.error('Error fetching datasets:', error);
    }
  };

  const fetchCustomPipelines = async () => {
    if (demoMode) return;
    setIsLoadingCustomPipelines(true);

    try {
      const data = await apiClient.getCustomPipelines();
      setCustomPipelines(data.pipelines || []);
      setCustomPipelineError(null);
    } catch (error) {
      console.error('Error fetching custom pipelines:', error);
      setCustomPipelineError(error.message);
    } finally {
      setIsLoadingCustomPipelines(false);
    }
  };

  const fetchAlgorithms = async () => {
    if (demoMode) return;
    try {
      const data = await apiClient.getAlgorithms();
      setAllAlgorithms(data.algorithms || []);

      const userAlgorithms = (data.algorithms || []).filter(
        (a) => a.kind === 'custom' || hasAlgorithmAccess(a.name)
      );

      const selectedMeta = userAlgorithms.find((a) => a.name === selectedAlgorithm);
      if (selectedMeta && selectedMeta.available) {
        return;
      }

      const firstAvailable = userAlgorithms.find((a) => a.available);
      if (firstAvailable) {
        setSelectedAlgorithm(firstAvailable.name);
        setAlgorithmParameters(getDefaultAlgorithmParameters(firstAvailable.name));
      }
    } catch (error) {
      console.error('Error fetching algorithms:', error);
    }
  };

  const handleAddCustomPipeline = async (pipeline) => {
    if (demoMode) return null;
    setCustomPipelineError(null);

    try {
      const response = await apiClient.addCustomPipeline(pipeline);
      await fetchCustomPipelines();
      await fetchAlgorithms();
      return response.pipeline;
    } catch (error) {
      console.error('Error adding custom pipeline:', error);
      setCustomPipelineError(error.message);
      throw error;
    }
  };

  const handleDeleteCustomPipeline = async (pipelineId) => {
    if (demoMode) return;
    setCustomPipelineError(null);

    try {
      await apiClient.deleteCustomPipeline(pipelineId);
      if (selectedAlgorithm === `custom:${pipelineId}`) {
        setSelectedAlgorithm('');
      }
      await fetchCustomPipelines();
      await fetchAlgorithms();
    } catch (error) {
      console.error('Error deleting custom pipeline:', error);
      setCustomPipelineError(error.message);
      throw error;
    }
  };

  const handleAlgorithmChange = (algorithmName) => {
    setSelectedAlgorithm(algorithmName);
    setAlgorithmParameters(getDefaultAlgorithmParameters(algorithmName));
  };

  const fetchClusteringResults = async () => {
    if (demoMode) {
      return clusteringResults;
    }

    try {
      const data = await apiClient.getClusteringResults();
      if (data.available) {
        setClusteringResults(data);
        return data;
      } else {
        setClusteringResults(null);
        return null;
      }
    } catch (error) {
      console.error('Error fetching clustering results:', error);
      setClusteringResults(null);
      return null;
    }
  };

  const updatePipelineState = (job) => {
    const nextStatus = job?.status || 'idle';
    setPipelineJob(job || null);
    setPipelineStatus(nextStatus);
    setPipelineMessage(job?.message || '');
    setPipelineError(job?.error || null);
    setIsRunningAlgorithm(PIPELINE_ACTIVE_STATUSES.has(nextStatus));
  };

  useEffect(() => {
    if (demoMode || !PIPELINE_ACTIVE_STATUSES.has(pipelineStatus)) return;

    let isCancelled = false;

    const pollPipelineStatus = async () => {
      try {
        const statusResponse = await apiClient.getSpikeSortingPipelineStatus();
        const job = statusResponse.job;
        if (isCancelled) return;

        updatePipelineState(job);

        if (PIPELINE_TERMINAL_STATUSES.has(job?.status)) {
          if (job.status === 'completed') {
            await fetchClusteringResults();
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error polling pipeline status:', error);
          setPipelineError(error.message);
        }
      }
    };

    const intervalId = setInterval(pollPipelineStatus, 1500);
    pollPipelineStatus();

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [demoMode, pipelineStatus]);

  const handleRunAlgorithm = async () => {
    if (demoMode) {
      return;
    }

    if (!selectedAlgorithm || isRunningAlgorithm) {
      console.warn('Cannot run algorithm: missing requirements');
      return;
    }

    const selectedAlgorithmMeta = algorithms.find((algo) => algo.name === selectedAlgorithm);
    if (
      !selectedAlgorithmMeta?.available ||
      selectedAlgorithmMeta.requiresRun === false ||
      selectedAlgorithmMeta.kind === 'custom'
    ) {
      setPipelineStatus('idle');
      setPipelineMessage('Selected algorithm cannot be run from this backend yet.');
      return;
    }

    setIsRunningAlgorithm(true);
    setPipelineStatus('running');
    setPipelineMessage('Starting pipeline...');
    setPipelineError(null);

    try {
      const response = await apiClient.startSpikeSortingPipeline(selectedAlgorithm, algorithmParameters);
      updatePipelineState(response.job);
    } catch (error) {
      console.error('Error starting pipeline:', error);
      setPipelineStatus('failed');
      setPipelineMessage('Failed to start pipeline.');
      setPipelineError(error.message);
      setIsRunningAlgorithm(false);
    }
  };

  const handleStopAlgorithm = async () => {
    if (demoMode || !isRunningAlgorithm) return;

    setPipelineStatus('cancel_requested');
    setPipelineMessage('Stop requested...');

    try {
      const response = await apiClient.stopSpikeSortingPipeline();
      updatePipelineState(response.job);
    } catch (error) {
      console.error('Error stopping pipeline:', error);
      setPipelineError(error.message);
    }
  };

  const handleOpenParameters = () => {
    if (demoMode) return;
    setShowParametersMenu(true);
  };

  const handleCloseParameters = () => {
    setShowParametersMenu(false);
  };

  const handleSaveParameters = (newParameters) => {
    setAlgorithmParameters(newParameters);
  };

  const fetchDatasetInfo = async () => {
    if (demoMode) return;
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/dataset-info`);

      if (response.ok) {
        const info = await response.json();
        setDatasetInfo(info);
      }
    } catch (error) {
      console.error('Error fetching dataset info:', error);
    }
  };

  const checkSpikeTimesAvailable = async () => {
    if (demoMode) {
      setPrecomputedAvailable(false);
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/spike-times-available`);

      if (response.ok) {
        const data = await response.json();
        setPrecomputedAvailable(data.available);
        if (!data.available) {
          setUsePrecomputedSpikes(false);
        }
      }
    } catch (error) {
      console.error('Error checking spike times:', error);
      setPrecomputedAvailable(false);
    }
  };

  const handleDatasetChange = async (datasetName) => {
    if (demoMode) {
      setCurrentDataset(datasetName);
      setDatasetInfo({
        totalChannels: 385,
        totalDataPoints: 4000
      });
      setSelectedChannels([179, 181, 183]);
      dataCache.current.clear();
      fetchSpikeData();
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/dataset/set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: datasetName })
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentDataset(datasetName);
        setDatasetInfo({
          totalChannels: result.totalChannels,
          totalDataPoints: result.totalDataPoints
        });

        if (datasetName === 'c46_data_5percent.pt') {
          setSelectedChannels([179, 181, 183]);
        }

        dataCache.current.clear();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await checkSpikeTimesAvailable();
        fetchSpikeData();
      }
    } catch (error) {
      console.error('Error changing dataset:', error);
    }
  };

  const handleUploadComplete = (uploadResult) => {
    if (demoMode) return;
    console.log('Upload complete:', uploadResult);
    setShowUploadModal(false);
    fetchDatasets();
    setTimeout(() => {
      checkSpikeTimesAvailable();
    }, 1000);
  };

  const [datasetToDelete, setDatasetToDelete] = React.useState(null);

  const handleDatasetDelete = (datasetName) => {
    if (demoMode) return;
    setDatasetToDelete(datasetName);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (demoMode || !datasetToDelete) return;

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/dataset/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataset: datasetToDelete })
      });

      const result = await response.json();

      if (response.ok) {
        setShowDeleteConfirm(false);
        setDatasetToDelete(null);

        await fetchDatasets();

        if (datasetToDelete === currentDataset) {
          await fetchDatasetInfo();
        }
      } else {
        alert(`Error: ${result.error}`);
        setShowDeleteConfirm(false);
        setDatasetToDelete(null);
      }
    } catch (error) {
      console.error('Error deleting dataset:', error);
      alert('Failed to delete dataset');
      setShowDeleteConfirm(false);
      setDatasetToDelete(null);
    }
  };

  const fetchSpikeData = async () => {
    if (demoMode) {
      const syntheticData = {};
      selectedChannels.forEach((channelId) => {
        const trace =
          demoSignalData.traces.find((t) => t.channel === channelId) ||
          synthesizeChannelTrace(channelId, 4000);

        const filtered = applyDemoFilter(trace.data, filterType);

        syntheticData[channelId] = {
          data: trace.data,
          filteredData: filtered,
          isSpike: trace.isSpike,
          spikePeaks: trace.spikePeaks,
          startTime: trace.startTime ?? 0,
          endTime: trace.endTime ?? trace.data.length
        };
      });

      setSpikeData(syntheticData);
      setIsLoading(false);
      return;
    }

    const buffer = windowSize;
    const fetchStart = Math.max(0, Math.floor(timeRange.start) - buffer);
    const fetchEnd = Math.min(datasetInfo.totalDataPoints, Math.ceil(timeRange.end) + buffer);

    const cacheKey = `${fetchStart}-${fetchEnd}-${spikeThreshold}-${invertData}-${usePrecomputedSpikes}-${selectedDataType}-${filterType}`;
    const needsFetch = selectedChannels.some((ch) => !dataCache.current.has(`${ch}-${cacheKey}`));

    if (!needsFetch) {
      const cachedData = {};
      selectedChannels.forEach((ch) => {
        cachedData[ch] = dataCache.current.get(`${ch}-${cacheKey}`);
      });
      setSpikeData(cachedData);
      return;
    }

    setIsLoading(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/spike-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channels: selectedChannels,
          spikeThreshold,
          invertData,
          startTime: fetchStart,
          endTime: fetchEnd,
          usePrecomputed: usePrecomputedSpikes,
          dataType: selectedDataType,
          filterType
        })
      });

      if (response.ok) {
        const data = await response.json();

        selectedChannels.forEach((ch) => {
          if (data[ch]) {
            dataCache.current.set(`${ch}-${cacheKey}`, data[ch]);
          }
        });

        setSpikeData(data);
      } else {
        console.error('Failed to fetch spike data');
      }
    } catch (error) {
      console.error('Error fetching spike data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChannelToggle = (channelId) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
    setChannelScrollOffset(0);
  };

  const handleChannelScroll = (newOffset) => {
    setChannelScrollOffset(newOffset);
  };

  const handleWindowSizeChange = (newSize) => {
    const currentStart = timeRange.start;
    setWindowSize(newSize);
    setTimeRange({ start: currentStart, end: currentStart + newSize });
  };

  const handleInvertDataChange = (newInvertState) => {
    setInvertData(newInvertState);
    if (spikeThreshold !== null) {
      setSpikeThreshold(-spikeThreshold);
    }
  };

  const handleNavigateToSpike = async (spikeTime, channelId, allClusterChannels = null) => {
    try {
      setSelectedView('signal');
      setSelectedDataType('spikes');

      if (!demoMode) {
        setUsePrecomputedSpikes(true);
      }

      if (allClusterChannels) {
        setSelectedChannels(allClusterChannels);
      } else {
        setSelectedChannels([channelId]);
      }

      const halfWindow = Math.floor(windowSize / 2);
      const newStart = Math.max(0, spikeTime - halfWindow);
      const newEnd = Math.min(datasetInfo.totalDataPoints, spikeTime + halfWindow);

      setTimeRange({ start: newStart, end: newEnd });
    } catch (error) {
      console.error('Error navigating to spike:', error);
    }
  };

  const handleSpikeNavigation = async (direction) => {
    if (demoMode) return;
    if (!usePrecomputedSpikes) return;

    try {
      const currentCenter = Math.floor((timeRange.start + timeRange.end) / 2);

      const apiUrl = process.env.REACT_APP_API_URL || '';
      const response = await fetch(`${apiUrl}/api/navigate-spike`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentTime: currentCenter,
          direction,
          channels: selectedChannels
        })
      });

      if (response.ok) {
        const data = await response.json();
        const targetSpike = data.spikeTime;

        const halfWindow = Math.floor(windowSize / 2);
        const newStart = Math.max(0, targetSpike - halfWindow);
        const newEnd = Math.min(datasetInfo.totalDataPoints, newStart + windowSize);
        setTimeRange({ start: newStart, end: newEnd });
      } else {
        console.error('Failed to navigate spike');
      }
    } catch (error) {
      console.error('Error navigating spike:', error);
    }
  };

  return (
    <div className="app">
      <Header
        demoMode={demoMode}
        datasets={datasets}
        currentDataset={currentDataset}
        onDatasetChange={handleDatasetChange}
        onUploadClick={() => {
          if (!demoMode) setShowUploadModal(true);
        }}
        onDatasetDelete={demoMode ? () => {} : handleDatasetDelete}
        selectedView={selectedView}
        onViewChange={setSelectedView}
        selectedSignalType={selectedDataType}
        onSignalTypeChange={setSelectedDataType}
      />

      <div className="main-container">
        {selectedView === 'multipanel' ? (
          <MultiPanelView
            ref={multiPanelViewRef}
            demoMode={demoMode}
            selectedDataset={currentDataset}
            clusteringResults={clusteringResults}
            selectedAlgorithm={selectedAlgorithm}
            datasetInfo={datasetInfo}
            algorithms={algorithms}
            onAlgorithmChange={handleAlgorithmChange}
            onRunAlgorithm={handleRunAlgorithm}
            onStopAlgorithm={handleStopAlgorithm}
            isRunningAlgorithm={isRunningAlgorithm}
            pipelineJob={pipelineJob}
            pipelineStatus={pipelineStatus}
            pipelineMessage={pipelineMessage}
            pipelineError={pipelineError}
            onOpenParameters={handleOpenParameters}
            customPipelines={customPipelines}
            isLoadingCustomPipelines={isLoadingCustomPipelines}
            customPipelineError={customPipelineError}
            onAddCustomPipeline={handleAddCustomPipeline}
            onDeleteCustomPipeline={handleDeleteCustomPipeline}
            demoClusterPlotData={demoClusterPlotData}
            demoSpikeTable={demoSpikeTable}
            demoClusterStats={demoClusterStats}
            demoWaveforms={demoWaveforms}
            demoSignalData={demoSignalData}
          />
        ) : selectedView === 'runtime' ? (
          <RuntimeAnalysisView />
        ) : (
          <>
            {selectedView === 'signal' && (
              <Sidebar
                selectedChannels={selectedChannels}
                onChannelToggle={handleChannelToggle}
              />
            )}

            {selectedView === 'clusters' ? (
              <ClusterView
                demoMode={demoMode}
                selectedDataset={currentDataset}
                onNavigateToSpike={handleNavigateToSpike}
                clusteringResults={clusteringResults}
                selectedAlgorithm={selectedAlgorithm}
                demoClusterPlotData={demoClusterPlotData}
                demoSignalData={demoSignalData}
              />
            ) : selectedView === 'signal' ? (
              <VisualizationArea
                demoMode={demoMode}
                spikeData={spikeData}
                selectedChannels={selectedChannels}
                channelScrollOffset={channelScrollOffset}
                timeRange={timeRange}
                windowSize={windowSize}
                spikeThreshold={spikeThreshold}
                invertData={invertData}
                totalDataPoints={datasetInfo.totalDataPoints}
                onTimeRangeChange={setTimeRange}
                onWindowSizeChange={handleWindowSizeChange}
                onChannelScroll={handleChannelScroll}
                onSpikeThresholdChange={setSpikeThreshold}
                onInvertDataChange={handleInvertDataChange}
                isLoading={isLoading}
                usePrecomputedSpikes={usePrecomputedSpikes}
                onUsePrecomputedChange={setUsePrecomputedSpikes}
                precomputedAvailable={precomputedAvailable}
                selectedDataType={selectedDataType}
                filterType={filterType}
                onFilterTypeChange={setFilterType}
                filteredLineColor={filteredLineColor}
                onFilteredLineColorChange={setFilteredLineColor}
                onSpikeNavigation={handleSpikeNavigation}
              />
            ) : null}
          </>
        )}
      </div>

      {!demoMode && showUploadModal && (
        <Upload
          onUploadComplete={handleUploadComplete}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Dataset"
        message={`Are you sure you want to delete "${datasetToDelete}"? This action cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDatasetToDelete(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
      />

      <AlgorithmParametersMenu
        isOpen={showParametersMenu}
        onClose={handleCloseParameters}
        parameters={algorithmParameters}
        onSave={handleSaveParameters}
        algorithm={selectedAlgorithm}
      />
    </div>
  );
}

function AppWithErrorBoundary(props) {
  return (
    <ErrorBoundary message="An error occurred in the Spike Dashboard. Please try refreshing the page.">
      <App {...props} />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
