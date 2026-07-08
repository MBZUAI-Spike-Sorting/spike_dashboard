import React from 'react';
import Plot from 'react-plotly.js';
import './MultiPanelView.css';

const DemoMultiPanelView = ({
  demoClusterPlotData = [],
  demoSpikeTable = [],
  demoClusterStats = [],
  demoWaveforms = {},
  demoSignalData = null
}) => {
  // Group flat points by clusterId
  const groupedClusters = {};
  demoClusterPlotData.forEach((p) => {
    if (!groupedClusters[p.clusterId]) groupedClusters[p.clusterId] = [];
    groupedClusters[p.clusterId].push(p);
  });

  const clusterIds = Object.keys(groupedClusters)
    .map(Number)
    .sort((a, b) => a - b);

  const pcaTraces = clusterIds.map((clusterId) => ({
    x: groupedClusters[clusterId].map((p) => p.x),
    y: groupedClusters[clusterId].map((p) => p.y),
    type: 'scattergl',
    mode: 'markers',
    name: `Cluster ${clusterId}`,
    marker: {
      size: 8
    }
  }));

  const signalTraces = (demoSignalData?.traces || []).slice(0, 3);

  const waveformClusterIds = Object.keys(demoWaveforms).map(Number).sort((a, b) => a - b);
  const waveformTraces = waveformClusterIds.map((clusterId) => ({
    x: Array.from({ length: demoWaveforms[clusterId].length }, (_, i) => i),
    y: demoWaveforms[clusterId],
    type: 'scatter',
    mode: 'lines',
    name: `Cluster ${clusterId}`
  }));

  const commonLayout = {
    autosize: true,
    paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
    plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
    font: { color: '#e0e6ed' },
    margin: { l: 50, r: 20, t: 20, b: 40 }
  };

  return (
    <div className="multi-panel-view">
      <div className="panel-row panel-row-top">
        <div className="panel panel-cluster-list">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Cluster Selector</span>
            </div>
            <div className="dockable-widget-content">
              <table style={{ width: '100%', color: '#e0e6ed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Cluster</th>
                    <th style={{ textAlign: 'left' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterIds.map((clusterId) => (
                    <tr key={clusterId}>
                      <td>{clusterId}</td>
                      <td>{groupedClusters[clusterId].length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel panel-spike-list">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Spike List Table</span>
            </div>
            <div className="dockable-widget-content">
              <table style={{ width: '100%', color: '#e0e6ed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Spike Time</th>
                    <th style={{ textAlign: 'left' }}>Cluster</th>
                  </tr>
                </thead>
                <tbody>
                  {demoSpikeTable.map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.spikeTime}</td>
                      <td>{row.assignedClusterId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel panel-cluster-stats">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Cluster Statistics Window</span>
            </div>
            <div className="dockable-widget-content">
              <div style={{ color: '#e0e6ed' }}>
                {demoClusterStats.map((row) => (
                  <div key={row.clusterId} style={{ marginBottom: '12px' }}>
                    <strong>Cluster {row.clusterId}</strong>
                    <div>Count: {row.count}</div>
                    <div>Mean amplitude: {row.meanAmplitude}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="panel panel-signal-view">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Signal View</span>
            </div>
            <div className="dockable-widget-content">
              {signalTraces.map((trace) => (
                <div key={trace.channel} style={{ height: '180px', marginBottom: '10px' }}>
                  <Plot
                    data={[
                      {
                        x: Array.from({ length: 1000 }, (_, i) => i),
                        y: trace.data.slice(0, 1000),
                        type: 'scatter',
                        mode: 'lines',
                        name: `CH${trace.channel}`
                      }
                    ]}
                    layout={{
                      ...commonLayout,
                      title: { text: `CH${trace.channel}`, font: { color: '#40e0d0', size: 14 } }
                    }}
                    config={{ displayModeBar: false, responsive: true }}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel-row panel-row-bottom">
        <div className="panel panel-dim-reduction">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Dimensionality Reduction Plot View (PCA)</span>
            </div>
            <div className="dockable-widget-content">
              <div style={{ height: '100%' }}>
                <Plot
                  data={pcaTraces}
                  layout={{
                    ...commonLayout,
                    xaxis: { title: 'Principal Component 1', color: '#e0e6ed' },
                    yaxis: { title: 'Principal Component 2', color: '#e0e6ed' },
                    showlegend: true
                  }}
                  config={{ responsive: true, displaylogo: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="panel panel-waveform">
          <div className="dockable-widget">
            <div className="dockable-widget-header">
              <span>Waveform View</span>
            </div>
            <div className="dockable-widget-content">
              <div style={{ height: '100%' }}>
                <Plot
                  data={waveformTraces}
                  layout={{
                    ...commonLayout,
                    xaxis: { title: 'Sample', color: '#e0e6ed' },
                    yaxis: { title: 'Amplitude', color: '#e0e6ed' },
                    showlegend: true
                  }}
                  config={{ responsive: true, displaylogo: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoMultiPanelView;
