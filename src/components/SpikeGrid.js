import React from 'react';
import SpikeChannel from './SpikeChannel';
import './SpikeGrid.css';

const SpikeGrid = ({ 
  spikeData, 
  selectedChannels, 
  channelScrollOffset, 
  timeRange, 
  windowSize, 
  spikeThreshold, 
  onChannelScroll, 
  isLoading, 
  selectedDataType, 
  filteredLineColor, 
  usePrecomputedSpikes, 
  onSpikeNavigation, 
  filterType,
  channelsPerView = 3, // Default to 3 channels for backward compatibility
  highlightedSpikes = []
}) => {
  // Calculate which channels to render (render one extra on each side for smooth scrolling)
  const startIndex = Math.max(0, Math.floor(channelScrollOffset) - 1);
  const endIndex = Math.min(selectedChannels.length, Math.ceil(channelScrollOffset) + channelsPerView + 1);
  const channelsToRender = selectedChannels.slice(startIndex, endIndex);
  
  // Calculate the fractional offset for smooth positioning
  const fractionalOffset = channelScrollOffset - Math.floor(channelScrollOffset);
  const baseOffset = Math.floor(channelScrollOffset) - startIndex;
  
  const maxOffset = Math.max(0, selectedChannels.length - channelsPerView);

  // Handle mouse wheel scrolling
  const handleWheel = (e) => {
    e.preventDefault();
    if (selectedChannels.length <= channelsPerView) return;
    
    const delta = e.deltaY > 0 ? 0.5 : -0.5;
    const newOffset = Math.max(0, Math.min(maxOffset, channelScrollOffset + delta));
    onChannelScroll(newOffset);
  };

  // Each channel takes up percentage based on channelsPerView
  const channelUnitPercentage = 100 / channelsPerView;

  return (
    <div className="spike-grid-container">
      <div className="spike-grid" onWheel={handleWheel}>
        <div 
          className="spike-grid-scroll-wrapper"
          data-channels-per-view={channelsPerView}
          style={{
            transform: `translateY(-${(baseOffset + fractionalOffset) * channelUnitPercentage}%)`,
            transition: 'none'
          }}
        >
          {channelsToRender.map((channelId, index) => (
            <SpikeChannel
              key={channelId}
              channelId={channelId}
              data={spikeData[channelId]}
              isActive={true}
              timeRange={timeRange}
              windowSize={windowSize}
              spikeThreshold={spikeThreshold}
              isLoading={isLoading}
              selectedDataType={selectedDataType}
              filteredLineColor={filteredLineColor}
              usePrecomputedSpikes={usePrecomputedSpikes}
              onSpikeNavigation={onSpikeNavigation}
              filterType={filterType}
              highlightedSpikes={highlightedSpikes}
            />
          ))}
        </div>
      </div>
      
      <div className="channel-slider-container">
        <div className="channel-slider-track">
          <div 
            className="channel-slider-thumb"
            style={{ 
              top: `calc(${maxOffset > 0 ? (channelScrollOffset / maxOffset) * 100 : 0}% * (100% - 60px) / 100%)`,
              opacity: selectedChannels.length > channelsPerView ? 1 : 0.3
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              if (selectedChannels.length <= channelsPerView) return;
              const rect = e.currentTarget.parentElement.getBoundingClientRect();
              const thumbHeight = 60; // Must match the height in CSS
              const handleMouseMove = (moveEvent) => {
                const y = moveEvent.clientY - rect.top;
                const maxY = rect.height - thumbHeight;
                const clampedY = Math.max(0, Math.min(maxY, y));
                const percentage = maxY > 0 ? (clampedY / maxY) * 100 : 0;
                const newOffset = (percentage / 100) * maxOffset;
                onChannelScroll(newOffset);
              };
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default SpikeGrid;
