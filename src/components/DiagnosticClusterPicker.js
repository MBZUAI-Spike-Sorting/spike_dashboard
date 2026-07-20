import React from 'react';

const DiagnosticClusterPicker = ({
  availableClusterIds = [],
  selectedClusterIds = [],
  maxClusters,
  onChange,
}) => {
  const selectedKeys = new Set(selectedClusterIds.map(String));
  const remainingIds = availableClusterIds.filter((clusterId) => !selectedKeys.has(String(clusterId)));

  const addCluster = (rawId) => {
    const clusterId = availableClusterIds.find((candidate) => String(candidate) === rawId);
    if (clusterId === undefined || selectedClusterIds.length >= maxClusters) return;
    onChange?.([...selectedClusterIds, clusterId]);
  };

  return (
    <div className="diagnostic-cluster-picker">
      <span className="diagnostic-cluster-picker-label">Clusters</span>
      <div className="diagnostic-cluster-chips">
        {selectedClusterIds.map((clusterId) => (
          <button
            key={String(clusterId)}
            type="button"
            className="diagnostic-cluster-chip"
            onClick={() => onChange?.(
              selectedClusterIds.filter((candidate) => String(candidate) !== String(clusterId))
            )}
            title={`Remove cluster ${clusterId}`}
          >
            C{clusterId} ×
          </button>
        ))}
      </div>
      <select
        value=""
        aria-label="Add cluster to this widget"
        disabled={remainingIds.length === 0 || selectedClusterIds.length >= maxClusters}
        onChange={(event) => addCluster(event.target.value)}
      >
        <option value="">Add cluster…</option>
        {remainingIds.map((clusterId) => (
          <option key={String(clusterId)} value={String(clusterId)}>Cluster {clusterId}</option>
        ))}
      </select>
      <span className="diagnostic-cluster-limit">{selectedClusterIds.length}/{maxClusters}</span>
    </div>
  );
};

export default DiagnosticClusterPicker;

