import React from 'react';
import SpikeGrid from './SpikeGrid';
import Timeline from './Timeline';
import './VisualizationArea.css';

const VisualizationArea = ({ 
  demoMode = false,
  spikeData, 
  selectedChannels, 
  channelScrollOffset,
  timeRange, 
  windowSize,
  spikeThreshold,
  invertData,
  totalDataPoints,
  onTimeRangeChange,
  onWindowSizeChange,
  onChannelScroll,
  onSpikeThresholdChange,
  onInvertDataChange,
  isLoading,
  usePrecomputedSpikes,
  onUsePrecomputedChange,
  precomputedAvailable,
  selectedDataType,
  filterType,
  onFilterTypeChange,
  filteredLineColor,
  onFilteredLineColorChange,
  onSpikeNavigation
}) => {
  return (
    <div className="visualization-area">
      <div className="viz-header">
        <h2>Raw Data Visualization</h2>
        <div className="time-controls">
          <label>Time Range:</label>
          <input 
            type="number" 
            className="time-input" 
            value={Math.floor(timeRange.start)}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              if (!isNaN(value)) {
                onTimeRangeChange({ start: value, end: value + windowSize });
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
                onTimeRangeChange({ start: value - windowSize, end: value });
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
                onWindowSizeChange(value);
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
                onChange={(e) => onFilterTypeChange(e.target.value)}
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
                onChange={(e) => onFilteredLineColorChange(e.target.value)}
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
                onChange={(e) => onFilterTypeChange(e.target.value)}
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
                    onSpikeThresholdChange(null);
                  } else {
                    const value = parseFloat(inputValue);
                    if (!isNaN(value)) {
                      onSpikeThresholdChange(value);
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
              onChange={(e) => onInvertDataChange(e.target.checked)}
            />
            <span>Invert Data</span>
          </label>
          {selectedDataType === 'spikes' && !demoMode && (
  <label className="precomputed-checkbox" style={{ opacity: precomputedAvailable ? 1 : 0.5 }}>
    <input
      type="checkbox"
      checked={usePrecomputedSpikes}
      onChange={(e) => onUsePrecomputedChange(e.target.checked)}
      disabled={!precomputedAvailable}
    />
    <span>Use Pre-computed Spikes {!precomputedAvailable && '(No spike times loaded)'}</span>
  </label>
)}
        </div>
      </div>

       <SpikeGrid 
         spikeData={spikeData}
         selectedChannels={selectedChannels}
         channelScrollOffset={channelScrollOffset}
         timeRange={timeRange}
         windowSize={windowSize}
         onChannelScroll={onChannelScroll}
         isLoading={isLoading}
         selectedDataType={selectedDataType}
         filteredLineColor={filteredLineColor}
         usePrecomputedSpikes={usePrecomputedSpikes}
         onSpikeNavigation={onSpikeNavigation}
         filterType={filterType}
       />

      <Timeline 
        timeRange={timeRange}
        windowSize={windowSize}
        totalDataRange={totalDataPoints}
        onTimeRangeChange={onTimeRangeChange}
      />
    </div>
  );
};

export default VisualizationArea;

