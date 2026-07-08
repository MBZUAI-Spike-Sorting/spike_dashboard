import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import './WaveformSingleChannelView.css';

const WaveformSingleChannelView = ({
  selectedClusters,
  clusterWaveforms,
  highlightedSpike
}) => {
  const calculateMeanWaveform = (waveforms) => {
    if (waveforms.length === 0) return { timePoints: [], amplitude: [] };

    const timePoints = waveforms[0].timePoints;
    const meanAmplitude = timePoints.map((_, idx) => {
      const sum = waveforms.reduce((acc, wf) => acc + wf.amplitude[idx], 0);
      return sum / waveforms.length;
    });

    return { timePoints, amplitude: meanAmplitude };
  };

  // Function to get PCA-matching color
  const getClusterColor = (clusterId) => {
    return `hsl(${(clusterId * 137) % 360}, 70%, 60%)`;
  };

  const [visibleClusters, setVisibleClusters] = React.useState({});

  // Initialize all clusters as visible when selectedClusters changes
  React.useEffect(() => {
    const initial = {};
    selectedClusters.forEach(id => {
      // Only set to true if it's a new cluster (not already in state)
      if (!(id in visibleClusters)) {
        initial[id] = true;
      }
    });
    if (Object.keys(initial).length > 0) {
      setVisibleClusters(prev => ({ ...prev, ...initial }));
    }
  }, [selectedClusters]);

  const { waveformPlots, visibilityButtons } = useMemo(() => {
    if (selectedClusters.length === 0) return { waveformPlots: [], visibilityButtons: [] };

    const traces = [];
    const buttons = [];
    const traceIndicesByCluster = {};
    let currentTraceIndex = 0;

    selectedClusters.forEach((clusterId) => {
      const waveforms = clusterWaveforms[clusterId];
      if (!waveforms || waveforms.length === 0) return;

      const color = getClusterColor(clusterId);
      const clusterTraceIndices = [];
      const isVisible = visibleClusters[clusterId] !== false;

      // Plot all waveforms for this cluster with reduced opacity
      waveforms.forEach((waveform, waveformIdx) => {
        const opacity = highlightedSpike &&
                       highlightedSpike.clusterId === clusterId &&
                       highlightedSpike.waveformIdx === waveformIdx ? 1.0 : 0.15;

        const lineWidth = highlightedSpike &&
                         highlightedSpike.clusterId === clusterId &&
                         highlightedSpike.waveformIdx === waveformIdx ? 3 : 1;

        traces.push({
          x: waveform.timePoints,
          y: waveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          showlegend: false,
          line: {
            color: color,
            width: lineWidth
          },
          opacity: opacity,
          visible: isVisible,
          legendgroup: `cluster${clusterId}`,
          hovertemplate: `<b>Cluster ${clusterId}</b><br>Waveform ${waveformIdx}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
        });
        clusterTraceIndices.push(currentTraceIndex);
        currentTraceIndex++;
      });

      // Add mean waveform (bold line with same color)
      if (waveforms.length > 0) {
        const meanWaveform = calculateMeanWaveform(waveforms);
        traces.push({
          x: meanWaveform.timePoints,
          y: meanWaveform.amplitude,
          type: 'scatter',
          mode: 'lines',
          showlegend: false,
          line: {
            color: color,
            width: 4
          },
          opacity: 1.0,
          visible: isVisible,
          legendgroup: `cluster${clusterId}`,
          hovertemplate: `<b>Cluster ${clusterId} Mean</b><br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
        });
        clusterTraceIndices.push(currentTraceIndex);
        currentTraceIndex++;
      }

      traceIndicesByCluster[clusterId] = clusterTraceIndices;
    });

    // Add header button as first item
    buttons.push({
      label: 'Visible Clusters',
      method: 'skip',
      execute: false
    });
    
    // Create toggle button for each cluster with visual indicator
    selectedClusters.forEach((clusterId) => {
      if (traceIndicesByCluster[clusterId]) {
        const isCurrentlyVisible = visibleClusters[clusterId] !== false;
        
        // Create visibility array - toggle only this cluster
        const newVisibility = traces.map((trace) => {
          if (trace.legendgroup === `cluster${clusterId}`) {
            return !isCurrentlyVisible;
          }
          return trace.visible;
        });
        
        // Add visual indicator for visibility
        const indicator = isCurrentlyVisible ? '● ' : '○ ';
        
        buttons.push({
          label: `  ${indicator}Cluster ${clusterId}`,
          method: 'restyle',
          args: ['visible', newVisibility],
          execute: true
        });
      }
    });

    return { waveformPlots: traces, visibilityButtons: buttons };
  }, [selectedClusters, clusterWaveforms, highlightedSpike, visibleClusters]);

  return (
    <div className="waveform-single-channel-view">
      <div className="waveform-plot-container">
        {selectedClusters.length > 0 ? (
          <Plot
            data={waveformPlots}
            layout={{
              autosize: true,
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed', size: 11 },
              xaxis: {
                title: 'Time (ms)',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Waveforms',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              hovermode: 'closest',
              showlegend: false,
              margin: { l: 60, r: 20, t: 20, b: 60 },
              updatemenus: visibilityButtons.length > 0 ? [{
                type: 'dropdown',
                direction: 'down',
                x: 0.99,
                y: 0.97,
                xanchor: 'right',
                yanchor: 'top',
                bgcolor: 'rgba(26, 26, 46, 0.9)',
                bordercolor: 'rgba(64, 224, 208, 0.5)',
                borderwidth: 1,
                font: { color: '#40e0d0', size: 11 },
                buttons: visibilityButtons,
                active: 0,
                pad: { t: 0, b: 0 },
                showactive: false
              }] : []
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
            onUpdate={(figure) => {
              // Sync React state with plot visibility after Plotly updates
              if (figure && figure.data) {
                const newVisible = {};
                let hasChanges = false;
                
                selectedClusters.forEach(clusterId => {
                  const clusterTraces = figure.data.filter(t => t.legendgroup === `cluster${clusterId}`);
                  if (clusterTraces.length > 0) {
                    const isVisible = clusterTraces[0].visible !== false;
                    newVisible[clusterId] = isVisible;
                    if (visibleClusters[clusterId] !== isVisible) {
                      hasChanges = true;
                    }
                  }
                });
                
                if (hasChanges) {
                  setVisibleClusters(prev => ({ ...prev, ...newVisible }));
                }
              }
            }}
          />
        ) : (
          <div className="no-data-message">
            <p>Select clusters from any linked widget, or open the Cluster Selector.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WaveformSingleChannelView;
