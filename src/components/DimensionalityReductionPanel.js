import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import './DimensionalityReductionPanel.css';

const DimensionalityReductionPanel = ({
  clusterData,
  selectedClusters,
  selectedSpike,
  onSpikeClick,
  clusteringResults,
  selectedAlgorithm
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [spikePreview, setSpikePreview] = useState(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState('right'); // 'left' or 'right'
  const plotData = useMemo(() => {
    console.log(`[${selectedAlgorithm}] Rendering PCA plot for clusters:`, selectedClusters);
    console.log('  - clusteringResults:', !!clusteringResults);
    console.log('  - clusteringResults.available:', clusteringResults?.available);
    console.log('  - fullData:', !!clusteringResults?.fullData);
    console.log('  - fullData length:', clusteringResults?.fullData?.length);
    
    // Use algorithm results if available (TorchBCI JimsAlgorithm or Kilosort4)
    if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
      console.log(`Using ${selectedAlgorithm} results for PCA plot`);
      
      const traces = [];
      
      // Filter to show only selected clusters
      selectedClusters.forEach((clusterId) => {
        if (clusterId >= clusteringResults.fullData.length) return;
        
        const clusterSpikes = clusteringResults.fullData[clusterId];
        
        // Separate selected spike from others
        const regularX = [];
        const regularY = [];
        const regularIndices = [];
        let highlightedPoint = null;
        
        clusterSpikes.forEach((spike, spikeIdx) => {
          const isHighlighted = selectedSpike &&
                               selectedSpike.clusterId === clusterId &&
                               selectedSpike.pointIndex === spikeIdx;
          
          if (isHighlighted) {
            highlightedPoint = { x: spike.x, y: spike.y, spikeIdx };
          } else {
            regularX.push(spike.x);
            regularY.push(spike.y);
            regularIndices.push(spikeIdx);
          }
        });
        
        const color = `hsl(${(clusterId * 137) % 360}, 70%, 60%)`;
        const opacity = 0.85;
        
        // Add regular points
        if (regularX.length > 0) {
          traces.push({
            x: regularX,
            y: regularY,
            mode: 'markers',
            type: 'scatter',
            name: `Cluster ${clusterId}`,
            marker: {
              size: 8,
              color: color,
              opacity: opacity,
              line: {
                color: 'rgba(0, 0, 0, 0.5)',
                width: 1.0
              }
            },
            customdata: regularIndices.map(idx => ({
              clusterIdx: clusterId,
              pointIdx: idx,
              clusterId: clusterId
            })),
            hovertemplate: `<b>Cluster ${clusterId}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
            showlegend: highlightedPoint === null
          });
        }
        
        // Add highlighted point
        if (highlightedPoint) {
          traces.push({
            x: [highlightedPoint.x],
            y: [highlightedPoint.y],
            mode: 'markers',
            type: 'scatter',
            name: `Cluster ${clusterId}`,
            marker: {
              size: 14,
              color: color,
              symbol: 'star',
              line: {
                color: '#fff',
                width: 2
              }
            },
            customdata: [{
              clusterIdx: clusterId,
              pointIdx: highlightedPoint.spikeIdx,
              clusterId: clusterId
            }],
            hovertemplate: `<b>Cluster ${clusterId} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
            showlegend: true
          });
        }
      });
      
      console.log(`Created ${traces.length} traces for ${selectedClusters.length} clusters`);
      if (traces.length > 0) {
        console.log(`First trace has ${traces[0].x?.length || 0} points`);
      }
      return traces;
    }
    
    // Otherwise use clusterData from API (Preprocessed Kilosort)
    if (!clusterData || !clusterData.clusters) return [];

    const traces = [];

    // Filter clusters: show only selected ones
    const clustersToShow = selectedClusters.length > 0
      ? clusterData.clusters.filter(cluster => selectedClusters.includes(cluster.clusterId))
      : [];

    clustersToShow.forEach((cluster) => {
      // Separate selected spike from others
      const regularX = [];
      const regularY = [];
      const regularIndices = [];
      let highlightedPoint = null;

      cluster.points.forEach((point, pointIdx) => {
        const isHighlighted = selectedSpike &&
                             selectedSpike.clusterId === cluster.clusterId &&
                             selectedSpike.pointIndex === pointIdx;

        if (isHighlighted) {
          highlightedPoint = { x: point[0], y: point[1], pointIdx };
        } else {
          regularX.push(point[0]);
          regularY.push(point[1]);
          regularIndices.push(pointIdx);
        }
      });

      const color = `hsl(${(cluster.clusterId * 137) % 360}, 70%, 60%)`;
      const opacity = 0.85;

      // Add regular points
      if (regularX.length > 0) {
        traces.push({
          x: regularX,
          y: regularY,
          mode: 'markers',
          type: 'scatter',  // Changed from scattergl for sharper rendering
          name: `Cluster ${cluster.clusterId}`,
          marker: {
            size: 8,  // Increased for better visibility
            color: color,
            opacity: opacity,
            line: {
              color: 'rgba(0, 0, 0, 0.5)',  // Darker outline for definition
              width: 1.0
            }
          },
          customdata: regularIndices.map(idx => ({
            clusterIdx: cluster.clusterId,
            pointIdx: idx,
            clusterId: cluster.clusterId
          })),
          hovertemplate: `<b>Cluster ${cluster.clusterId}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
          showlegend: highlightedPoint === null
        });
      }

      // Add highlighted point
      if (highlightedPoint) {
        traces.push({
          x: [highlightedPoint.x],
          y: [highlightedPoint.y],
          mode: 'markers',
          type: 'scatter',  // Changed from scattergl
          name: `Cluster ${cluster.clusterId}`,
          marker: {
            size: 16,  // Larger for visibility
            color: color,
            opacity: 1,
            line: {
              color: '#FFFFFF',
              width: 3
            },
            symbol: 'x'
          },
          customdata: [{
            clusterIdx: cluster.clusterId,
            pointIdx: highlightedPoint.pointIdx,
            clusterId: cluster.clusterId
          }],
          hovertemplate: `<b>Cluster ${cluster.clusterId} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`
        });
      }
    });

    console.log(`Created ${traces.length} traces from clusterData for ${clustersToShow.length} clusters`);
    if (traces.length > 0) {
      console.log(`First trace has ${traces[0].x?.length || 0} points`);
    }
    return traces;
  }, [clusterData, selectedClusters, selectedSpike, clusteringResults, selectedAlgorithm]);

  const fetchSpikePreview = async (clusterId, pointIdx) => {
    setIsLoadingPreview(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';

      // Get spike time and channel from cluster data
      let spikeTime, channelId;
      
      if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) {
        const spike = clusteringResults.fullData[clusterId][pointIdx];
        spikeTime = spike.time;
        channelId = spike.channel;
      } else if (clusterData && clusterData.clusters) {
        const cluster = clusterData.clusters.find(c => c.clusterId === clusterId);
        if (!cluster) {
          console.error('Cluster not found');
          setIsLoadingPreview(false);
          return;
        }
        spikeTime = cluster.spikeTimes[pointIdx];
        channelId = cluster.spikeChannels ? cluster.spikeChannels[pointIdx] : 181;
      }

      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: 'highpass',
          pointIndex: pointIdx
        })
      });

      if (response.ok) {
        const preview = await response.json();
        setSpikePreview({ ...preview, clusterId, pointIdx });
      }
    } catch (error) {
      console.error('Error fetching spike preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePointHover = (event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const customdata = point.customdata;
      
      // Determine position based on point's data x coordinate relative to plot range
      // Get the x-axis range from the plot
      try {
        const xValue = point.x;
        const plotElement = event.event?.target;
        
        if (plotElement && typeof xValue === 'number') {
          // Try to get the x-axis range from the plot layout
          const plot = plotElement.closest('.js-plotly-plot');
          if (plot && plot.layout && plot.layout.xaxis) {
            const xRange = plot.layout.xaxis.range || [plot.layout.xaxis.min, plot.layout.xaxis.max];
            if (xRange && xRange.length === 2) {
              const xMid = (xRange[0] + xRange[1]) / 2;
              const isLeftSide = xValue < xMid;
              setPreviewPosition(isLeftSide ? 'right' : 'left');
            } else {
              // Fallback to pixel position
              const bbox = plotElement.getBoundingClientRect();
              const xPos = event.event.clientX - bbox.left;
              const isLeftSide = xPos < bbox.width / 2;
              setPreviewPosition(isLeftSide ? 'right' : 'left');
            }
          } else {
            // Fallback to pixel position if we can't get the plot layout
            const bbox = plotElement.getBoundingClientRect();
            const xPos = event.event.clientX - bbox.left;
            const isLeftSide = xPos < bbox.width / 2;
            setPreviewPosition(isLeftSide ? 'right' : 'left');
          }
        }
      } catch (error) {
        console.log('Could not determine preview position, using default');
      }
      
      setHoveredPoint({ clusterId: customdata.clusterId, pointIdx: customdata.pointIdx });
      fetchSpikePreview(customdata.clusterId, customdata.pointIdx);
    }
  };

  const handlePointUnhover = () => {
    setHoveredPoint(null);
    setSpikePreview(null);
  };

  const handlePointClick = (event) => {
    if (event.points && event.points.length > 0 && onSpikeClick) {
      const point = event.points[0];
      const customdata = point.customdata;
      onSpikeClick(customdata.clusterId, customdata.pointIdx);
    }
  };

  const generatePreviewPlot = () => {
    if (!spikePreview || !spikePreview.waveform) return null;

    const spikeTime = spikePreview.spikeTime;
    const window = spikePreview.window || 10;
    const relativeTimePoints = Array.from(
      { length: spikePreview.waveform.length },
      (_, i) => i - window
    );

    return {
      data: [
        {
          x: relativeTimePoints,
          y: spikePreview.waveform,
          type: 'scatter',
          mode: 'lines',
          line: { color: '#40e0d0', width: 2 },
          fill: 'tozeroy',
          fillcolor: 'rgba(64, 224, 208, 0.2)'
        },
        // Vertical line at spike time (time 0)
        {
          x: [0, 0],
          y: [Math.min(...spikePreview.waveform), Math.max(...spikePreview.waveform)],
          type: 'scatter',
          mode: 'lines',
          line: { color: 'rgba(255, 255, 255, 0.5)', width: 2, dash: 'dash' },
          hoverinfo: 'skip',
          showlegend: false
        }
      ],
      layout: {
        autosize: true,
        paper_bgcolor: 'rgba(26, 26, 46, 0.95)',
        plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
        font: { color: '#e0e6ed', size: 10 },
        xaxis: {
          title: 'Time Relative to Spike',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        yaxis: {
          title: 'Amplitude',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        margin: { l: 40, r: 10, t: 10, b: 40 },
        showlegend: false
      },
      config: {
        displayModeBar: false,
        responsive: true
      }
    };
  };

  return (
    <div className="dimensionality-reduction-panel">
      {hoveredPoint && (
        <div className={`spike-preview-overlay spike-preview-${previewPosition}`}>
          <div className="preview-info">
            <h4>Spike Preview</h4>
            <p>Cluster {hoveredPoint.clusterId} - Point {hoveredPoint.pointIdx}</p>
            {spikePreview && <p>Ch{spikePreview.channelId} @ {spikePreview.spikeTime}</p>}
          </div>
          {isLoadingPreview ? (
            <div className="preview-loading">Loading...</div>
          ) : spikePreview && generatePreviewPlot() && (
            <div className="preview-plot">
              <Plot
                data={generatePreviewPlot().data}
                layout={generatePreviewPlot().layout}
                config={generatePreviewPlot().config}
                style={{ width: '100%', height: '150px' }}
              />
            </div>
          )}
        </div>
      )}
      <div className="dim-reduction-plot-container">
        {(((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && clusteringResults && clusteringResults.available) ||
          (clusterData && clusterData.clusters && clusterData.clusters.length > 0)) ? (
          <Plot
            data={plotData}
            layout={{
              autosize: true,
              uirevision: 'true',
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed' },
              xaxis: {
                title: 'Principal Component 1',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Principal Component 2',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              hovermode: 'closest',
              showlegend: true,
              legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(26, 26, 46, 0.8)',
                bordercolor: 'rgba(64, 224, 208, 0.3)',
                borderwidth: 1
              },
              margin: { l: 60, r: 20, t: 20, b: 60 }
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
            onClick={handlePointClick}
            onHover={handlePointHover}
            onUnhover={handlePointUnhover}
          />
        ) : selectedClusters.length === 0 ? (
          <div className="no-data-message">
            <p>Select clusters from any linked widget, or open the Cluster Curation Table.</p>
          </div>
        ) : (
          <div className="no-data-message">
            <p>Loading cluster data...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DimensionalityReductionPanel;
