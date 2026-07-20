import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import './SpikeChannel.css';

const SpikeChannel = ({ channelId, data, isActive, timeRange, windowSize, spikeThreshold, isLoading, selectedDataType, filteredLineColor, usePrecomputedSpikes, onSpikeNavigation, filterType, highlightedSpikes = [] }) => {
  const plotData = useMemo(() => {
    const channelHighlights = highlightedSpikes.filter((spike) => (
      Number.isFinite(Number(spike?.time)) &&
      (spike?.channel === undefined || String(spike.channel) === String(channelId))
    ));
    const highlightShapes = channelHighlights.map((spike) => ({
      type: 'line',
      x0: Number(spike.time),
      x1: Number(spike.time),
      y0: 0,
      y1: 1,
      yref: 'paper',
      line: { color: `hsl(${(Number(spike.clusterId) * 137) % 360}, 80%, 70%)`, width: 2, dash: 'dot' },
    }));
    const highlightAnnotations = channelHighlights.map((spike) => ({
      x: Number(spike.time),
      y: 1,
      yref: 'paper',
      text: `C${spike.clusterId}`,
      showarrow: false,
      yanchor: 'bottom',
      font: { color: '#f8fafc', size: 9 },
    }));

    if (!data || !data.data || !isActive) {
      return {
        data: [{
          x: [],
          y: [],
          type: 'scatter',
          mode: 'lines',
          line: { color: '#40e0d0', width: 1 },
          name: 'Spike Data'
        }],
        layout: {
          autosize: true,
          xaxis: {
            title: 'Index',
            color: '#e0e6ed',
            gridcolor: 'rgba(64, 224, 208, 0.2)',
            showgrid: true
          },
          yaxis: {
            title: 'Amplitude',
            color: '#e0e6ed',
            gridcolor: 'rgba(64, 224, 208, 0.2)',
            showgrid: true
          },
          plot_bgcolor: 'rgba(0, 0, 0, 0.2)',
          paper_bgcolor: 'transparent',
          font: { color: '#e0e6ed' },
          margin: { l: 50, r: 20, t: 20, b: 50 },
          shapes: highlightShapes,
          annotations: highlightAnnotations
        },
        config: {
          displayModeBar: false,
          responsive: true
        }
      };
    }

    const dataStartTime = data.startTime || 0;
    
    const windowStart = Math.floor(timeRange.start);
    const windowEnd = Math.floor(timeRange.end);
    
    const offsetStart = Math.max(0, windowStart - dataStartTime);
    const offsetEnd = Math.min(data.data.length, windowEnd - dataStartTime);
    
    const windowData = data.data.slice(offsetStart, offsetEnd);
    const spikeFlags = data.isSpike ? data.isSpike.slice(offsetStart, offsetEnd) : [];
    const timePoints = Array.from({ length: windowData.length }, (_, i) => windowStart + i);

    const spikePeaks = data.spikePeaks || [];
    const peaksInWindow = spikePeaks.filter(peakIdx => {
      const adjustedIdx = peakIdx - offsetStart;
      return adjustedIdx >= 0 && adjustedIdx < windowData.length;
    }).map(peakIdx => peakIdx - offsetStart);

    const plotData = [];
    let currentSegment = null;
    
    // Only apply spike coloring when "Detected Spikes" is selected
    const showSpikeColoring = selectedDataType === 'spikes';
    
    windowData.forEach((value, index) => {
      const timePoint = timePoints[index];
      const isSpike = showSpikeColoring && (spikeFlags[index] || false);
      const segmentColor = isSpike ? '#ff4444' : '#40e0d0';
      
      if (!currentSegment) {
        currentSegment = { x: [timePoint], y: [value], color: segmentColor };
      }
      else if (currentSegment.color !== segmentColor) {
        const lastX = currentSegment.x[currentSegment.x.length - 1];
        const lastY = currentSegment.y[currentSegment.y.length - 1];
        
        plotData.push({
          x: [...currentSegment.x],
          y: [...currentSegment.y],
          type: 'scatter',
          mode: 'lines',
          line: { color: currentSegment.color, width: 1 },
          showlegend: false,
          hoverinfo: 'x+y',
          connectgaps: false
        });
        
        const connectColor = (currentSegment.color === '#40e0d0' && segmentColor === '#ff4444') 
          ? '#ff4444' 
          : currentSegment.color;
        
        plotData.push({
          x: [lastX, timePoint],
          y: [lastY, value],
          type: 'scatter',
          mode: 'lines',
          line: { color: connectColor, width: 1 },
          showlegend: false,
          hoverinfo: 'x+y',
          connectgaps: false
        });
        
        currentSegment = { 
          x: [timePoint], 
          y: [value], 
          color: segmentColor 
        };
      }
      else {
        currentSegment.x.push(timePoint);
        currentSegment.y.push(value);
      }
    });
    
    if (currentSegment && currentSegment.x.length > 0) {
      plotData.push({
        x: currentSegment.x,
        y: currentSegment.y,
        type: 'scatter',
        mode: 'lines',
        line: { color: currentSegment.color, width: 1 },
        showlegend: false,
        hoverinfo: 'x+y',
        connectgaps: false
      });
    }

    // Add filtered data trace if available and requested
    if (selectedDataType === 'filtered' && data.filteredData) {
      const filteredData = data.filteredData.slice(offsetStart, offsetEnd);
      const filteredTimePoints = Array.from({ length: filteredData.length }, (_, i) => windowStart + i);
      
      plotData.push({
        x: filteredTimePoints,
        y: filteredData,
        type: 'scatter',
        mode: 'lines',
        line: { color: filteredLineColor || '#FFD700', width: 1.5 },  // Use selected color or default to gold
        showlegend: false,
        hoverinfo: 'x+y',
        name: 'Filtered Data',
        connectgaps: false
      });
    }

    // Only show spike peaks when "Detected Spikes" visualization type is selected
    if (selectedDataType === 'spikes' && peaksInWindow.length > 0) {
      const peakX = peaksInWindow.map(idx => timePoints[idx]);
      const peakY = peaksInWindow.map(idx => windowData[idx]);
      
      plotData.push({
        x: peakX,
        y: peakY,
        type: 'scatter',
        mode: 'markers',
        marker: { 
          size: 6,
          color: '#e0e6ed',
          symbol: 'star'
        },
        showlegend: false,
        hoverinfo: 'x+y',
        hovertemplate: 'Peak<br>Index: %{x}<br>Amplitude: %{y}<extra></extra>'
      });
    }

    return {
      data: plotData,
      layout: {
        autosize: true,
        xaxis: {
          title: 'Index',
          color: '#e0e6ed',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          showgrid: true,
          range: [timeRange.start, timeRange.end]
        },
        yaxis: {
          title: 'Amplitude',
          color: '#e0e6ed',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          showgrid: true
        },
        plot_bgcolor: 'rgba(0, 0, 0, 0.2)',
        paper_bgcolor: 'transparent',
        font: { color: '#e0e6ed' },
        margin: { l: 50, r: 20, t: 20, b: 50 },
        showlegend: false,
        shapes: highlightShapes,
        annotations: highlightAnnotations
      },
      config: {
        displayModeBar: false,
        responsive: true
      }
    };
  }, [channelId, data, highlightedSpikes, isActive, timeRange, selectedDataType, filteredLineColor]);

  return (
    <div className={`spike-channel ${!isActive ? 'inactive' : ''}`}>
      <div className="channel-label">
        {channelId !== undefined ? `CH${channelId}` : 'No Channel'}
      </div>
      <div className="spike-waveform">
        {isActive ? (
          <div className="plot-container">
            <Plot
              data={plotData.data}
              layout={plotData.layout}
              config={plotData.config}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler={true}
            />
            {usePrecomputedSpikes && onSpikeNavigation && (
              <div className="spike-nav-arrows">
                <button 
                  className="spike-nav-button spike-nav-prev"
                  onClick={() => onSpikeNavigation('prev')}
                  title="Previous spike"
                >
                  ◄
                </button>
                <button 
                  className="spike-nav-button spike-nav-next"
                  onClick={() => onSpikeNavigation('next')}
                  title="Next spike"
                >
                  ►
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-channel">
            <div className="empty-message">Channel Disabled</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpikeChannel;
