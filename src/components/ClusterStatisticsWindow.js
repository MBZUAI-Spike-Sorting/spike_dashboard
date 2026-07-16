import React from 'react';
import './ClusterStatisticsWindow.css';

const ClusterStatisticsWindow = ({ selectedClusters, clusterStats }) => {
  // Filter stats for selected clusters
  const selectedStats = selectedClusters.map(clusterId => {
    const stats = clusterStats[clusterId];
    return stats ? { clusterId, ...stats } : null;
  }).filter(Boolean);

  return (
    <div className="cluster-statistics-window">
      <div className="cluster-stats-content">
        {selectedStats.length > 0 ? (
          selectedStats.map((stats, index) => (
            <div key={stats.clusterId} className="cluster-stat-panel">
              <div className="cluster-stat-title">
                Cluster #{stats.clusterId}:
              </div>
              <div className="cluster-stat-items">
                <div className="stat-item">
                  <span className="stat-label">ISI violation rate =</span>
                  <span className="stat-value">{stats.isiViolationRate?.toFixed(3) || 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Number of spikes =</span>
                  <span className="stat-value">{stats.numSpikes || 0}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Peak Channel =</span>
                  <span className="stat-value">{stats.peakChannel ?? 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Firing rate =</span>
                  <span className="stat-value">{Number.isFinite(Number(stats.firingRateHz)) ? `${Number(stats.firingRateHz).toFixed(2)} Hz` : 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Mean amplitude =</span>
                  <span className="stat-value">{Number.isFinite(Number(stats.meanAmplitude)) ? Number(stats.meanAmplitude).toFixed(2) : 'N/A'}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-cluster-selected">
            <p>Select clusters to view statistics</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClusterStatisticsWindow;
