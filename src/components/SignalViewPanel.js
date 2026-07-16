import React, { useState, useEffect, useRef } from 'react';
import SpikeGrid from './SpikeGrid';
import Timeline from './Timeline';
import { synthesizeChannelTrace, applyDemoFilter } from '../data/demoDashboardData';
import './SignalViewPanel.css';

const SignalViewPanel = ({
  demoMode = false,
  highlightedSpikes,
  linkedTimeRange,
  onTimeRangeChange,
  datasetInfo,
  demoSignalData,
}) => {
  // State management - exact copy from App.js pattern
  const [selectedChannels, setSelectedChannels] = useState([179, 181, 183]);
  const [channelScrollOffset, setChannelScrollOffset] = useState(0);
  const [spikeData, setSpikeData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState({ start: 0, end: 1000 });
  const [windowSize, setWindowSize] = useState(1000);
  const [spikeThreshold, setSpikeThreshold] = useState(-25);
  const [invertData, setInvertData] = useState(false);
  const [usePrecomputedSpikes, setUsePrecomputedSpikes] = useState(false);
  const [precomputedAvailable] = useState(false);
  const [selectedDataType, setSelectedDataType] = useState('raw');
  const [filterType, setFilterType] = useState('none');
  const [filteredLineColor, setFilteredLineColor] = useState('#FFD700');
  
  // Use datasetInfo from props, fallback to defaults
  const totalDataPoints = datasetInfo?.totalDataPoints || 3500000;
  const totalChannels = datasetInfo?.totalChannels || 385;

  const dataCache = useRef({});
  const windowSizeRef = useRef(windowSize);

  useEffect(() => {
    windowSizeRef.current = windowSize;
  }, [windowSize]);

  useEffect(() => {
    const firstSpike = Array.isArray(highlightedSpikes) ? highlightedSpikes[0] : null;
    const spikeTime = Number(firstSpike?.time);

    if (!Number.isFinite(spikeTime)) {
      return;
    }

    const activeWindowSize = windowSizeRef.current;
    const nextStart = Math.max(0, Math.floor(spikeTime - activeWindowSize / 2));
    setTimeRange({
      start: nextStart,
      end: nextStart + activeWindowSize
    });
    const spikeChannel = Number(firstSpike?.channel);
    if (Number.isFinite(spikeChannel)) {
      setSelectedChannels((previous) => [
        spikeChannel,
        ...previous.filter((channelId) => String(channelId) !== String(spikeChannel)),
      ]);
      setChannelScrollOffset(0);
    }
  }, [highlightedSpikes]);

  useEffect(() => {
    const start = Number(linkedTimeRange?.start);
    const end = Number(linkedTimeRange?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

    const boundedStart = Math.max(0, Math.floor(start));
    const boundedEnd = Math.min(totalDataPoints, Math.ceil(end));
    const nextWindowSize = Math.max(1, Math.min(10000, boundedEnd - boundedStart));
    setWindowSize(nextWindowSize);
    setTimeRange({ start: boundedStart, end: boundedStart + nextWindowSize });
  }, [linkedTimeRange, totalDataPoints]);

  useEffect(() => {
    onTimeRangeChange?.(timeRange);
  }, [onTimeRangeChange, timeRange]);

  // Demo synthesis: produce plottable data for any selected channel without
  // touching the backend.
  useEffect(() => {
    if (!demoMode) return;
    if (selectedChannels.length === 0) {
      setSpikeData({});
      return;
    }

    const synthesized = {};
    selectedChannels.forEach((channelId) => {
      const trace = synthesizeChannelTrace(channelId, 4000);
      const baseData = invertData ? trace.data.map((v) => -v) : trace.data;
      const filtered = applyDemoFilter(baseData, filterType);

      let renderedData = baseData;
      if (selectedDataType === 'filtered') renderedData = filtered;
      else if (selectedDataType === 'spikes' && filterType !== 'none') renderedData = filtered;

      const threshold = spikeThreshold ?? -2.0;
      const isSpike = renderedData.map((v) =>
        invertData ? v >= -threshold : v <= threshold
      );

      synthesized[channelId] = {
        data: renderedData,
        filteredData: filtered,
        isSpike,
        spikePeaks: trace.spikePeaks,
        startTime: 0,
        endTime: renderedData.length
      };
    });
    setSpikeData(synthesized);
  }, [demoMode, selectedChannels, selectedDataType, filterType, spikeThreshold, invertData]);

  // Fetch signal data when parameters change
  useEffect(() => {
    if (demoMode) return;
    if (selectedChannels.length === 0) return;

    const fetchSignalData = async () => {
      const buffer = windowSize;
      const fetchStart = Math.max(0, Math.floor(timeRange.start) - buffer);
      const fetchEnd = Math.min(totalDataPoints, Math.ceil(timeRange.end) + buffer);

      const cacheKey = `${fetchStart}-${fetchEnd}-${spikeThreshold}-${invertData}-${usePrecomputedSpikes}-${selectedDataType}-${filterType}`;
      const needsFetch = selectedChannels.some(ch => !dataCache.current[`${ch}-${cacheKey}`]);

      if (!needsFetch) {
        const cachedData = {};
        selectedChannels.forEach(ch => {
          cachedData[ch] = dataCache.current[`${ch}-${cacheKey}`];
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
            spikeThreshold: spikeThreshold,
            invertData: invertData,
            startTime: fetchStart,
            endTime: fetchEnd,
            usePrecomputed: usePrecomputedSpikes,
            dataType: selectedDataType,
            filterType: filterType
          })
        });

        if (response.ok) {
          const data = await response.json();
          selectedChannels.forEach(ch => {
            if (data[ch]) {
              dataCache.current[`${ch}-${cacheKey}`] = data[ch];
            }
          });
          setSpikeData(data);
        }
      } catch (error) {
        console.error('Error fetching signal data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignalData();
  }, [selectedChannels, timeRange.start, timeRange.end, spikeThreshold, invertData,
      usePrecomputedSpikes, selectedDataType, filterType, totalDataPoints, windowSize, demoMode]);

  const handleChannelToggle = (channelId) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
    setChannelScrollOffset(0);
  };

  const handleTimeRangeChange = (newRange) => {
    setTimeRange(newRange);
  };

  const handleWindowSizeChange = (newSize) => {
    const currentStart = timeRange.start;
    setWindowSize(newSize);
    setTimeRange({ start: currentStart, end: currentStart + newSize });
  };

  const handleChannelScroll = (newOffset) => {
    setChannelScrollOffset(newOffset);
  };

  const handleSpikeThresholdChange = (value) => {
    setSpikeThreshold(value);
  };

  const handleInvertDataChange = (checked) => {
    setInvertData(checked);
  };

  const handleUsePrecomputedChange = (checked) => {
    setUsePrecomputedSpikes(checked);
  };

  const handleFilterTypeChange = (value) => {
    setFilterType(value);
  };

  const handleFilteredLineColorChange = (value) => {
    setFilteredLineColor(value);
  };

  return (
    <div className="signal-view-panel">
      {/* Header with controls - exact copy of VisualizationArea */}
      <div className="viz-header">
        <div className="time-controls">
          <label>Data Type:</label>
          <select
            className="data-type-select"
            value={selectedDataType}
            onChange={(e) => setSelectedDataType(e.target.value)}
          >
            <option value="raw">Raw Data</option>
            <option value="filtered">Filtered View</option>
            <option value="spikes">Detected Spikes View</option>
          </select>
          <label>Time Range:</label>
          <input
            type="number"
            className="time-input"
            value={Math.floor(timeRange.start)}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value)) {
                handleTimeRangeChange({ start: value, end: value + windowSize });
              }
            }}
            placeholder="Start"
          />
          <span>to</span>
          <input
            type="number"
            className="time-input"
            value={Math.floor(timeRange.end)}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value)) {
                handleTimeRangeChange({ start: value - windowSize, end: value });
              }
            }}
            placeholder="End"
          />
          <label>Window Size:</label>
          <input
            type="number"
            className="window-input"
            value={windowSize}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value) && value > 0 && value <= 10000) {
                handleWindowSizeChange(value);
              }
            }}
            min="1"
            max="10000"
            placeholder="Window"
          />
          {selectedDataType === 'filtered' && (
            <>
              <label>Filter Type:</label>
              <select
                className="filter-type-select"
                value={filterType}
                onChange={(e) => handleFilterTypeChange(e.target.value)}
              >
                <option value="highpass">High-pass (300 Hz)</option>
                <option value="lowpass">Low-pass (3000 Hz)</option>
                <option value="bandpass">Band-pass (300-3000 Hz)</option>
                <option value="none">None</option>
              </select>
              <label>Line Color:</label>
              <select
                className="filter-color-select"
                value={filteredLineColor}
                onChange={(e) => handleFilteredLineColorChange(e.target.value)}
              >
                <option value="#FFD700">Gold</option>
                <option value="#FF6B6B">Red</option>
                <option value="#4ECDC4">Teal</option>
                <option value="#95E1D3">Mint</option>
                <option value="#FF8C42">Orange</option>
                <option value="#C77DFF">Purple</option>
                <option value="#7FFF00">Chartreuse</option>
                <option value="#FF1493">Deep Pink</option>
                <option value="#00CED1">Dark Turquoise</option>
                <option value="#FFFFFF">White</option>
              </select>
            </>
          )}
          {selectedDataType === 'spikes' && (
            <>
              <label>Filter Type:</label>
              <select
                className="filter-type-select"
                value={filterType}
                onChange={(e) => handleFilterTypeChange(e.target.value)}
              >
                <option value="none">None (Raw Data)</option>
                <option value="highpass">High-pass (300 Hz)</option>
                <option value="lowpass">Low-pass (3000 Hz)</option>
                <option value="bandpass">Band-pass (300-3000 Hz)</option>
              </select>
              <label>Spike Threshold:</label>
              <input
                type="number"
                className="threshold-input"
                value={spikeThreshold ?? ''}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue === '') {
                    handleSpikeThresholdChange(null);
                  } else {
                    const value = parseFloat(inputValue);
                    if (!isNaN(value)) {
                      handleSpikeThresholdChange(value);
                    }
                  }
                }}
                step="1"
              />
            </>
          )}
          <label className="invert-checkbox">
            <input
              type="checkbox"
              checked={invertData}
              onChange={(e) => handleInvertDataChange(e.target.checked)}
            />
            <span>Invert Data</span>
          </label>
          {selectedDataType === 'spikes' && !demoMode && (
            <label className="precomputed-checkbox" style={{ opacity: precomputedAvailable ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={usePrecomputedSpikes}
                onChange={(e) => handleUsePrecomputedChange(e.target.checked)}
                disabled={!precomputedAvailable}
              />
              <span>Use Pre-computed Spikes {!precomputedAvailable && '(No spike times loaded)'}</span>
            </label>
          )}
        </div>
      </div>

      <div className="signal-content">
        {/* Channel Sidebar */}
        <div className="signal-sidebar">
          <div className="sidebar-header">
            <span>Channels ({selectedChannels.length}/{totalChannels})</span>
          </div>
          <div className="channel-grid">
            {Array.from({ length: totalChannels }, (_, i) => (
              <button
                key={i}
                className={`channel-button ${selectedChannels.includes(i) ? 'selected' : ''}`}
                onClick={() => handleChannelToggle(i)}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* Main Signal Display Area */}
        <div className="signal-main-area">
          {/* SpikeGrid - single channel view for multi-panel */}
          <SpikeGrid
            spikeData={spikeData}
            selectedChannels={selectedChannels}
            channelScrollOffset={channelScrollOffset}
            timeRange={timeRange}
            windowSize={windowSize}
            onChannelScroll={handleChannelScroll}
            isLoading={isLoading}
            selectedDataType={selectedDataType}
            filteredLineColor={filteredLineColor}
            usePrecomputedSpikes={usePrecomputedSpikes}
            onSpikeNavigation={null}
            filterType={filterType}
            channelsPerView={1}
            highlightedSpikes={highlightedSpikes}
          />

          {/* Timeline - exact same as VisualizationArea */}
          <Timeline
            timeRange={timeRange}
            windowSize={windowSize}
            totalDataRange={totalDataPoints}
            onTimeRangeChange={handleTimeRangeChange}
          />
        </div>
      </div>
    </div>
  );
};

export default SignalViewPanel;
