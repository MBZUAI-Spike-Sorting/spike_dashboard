const clusterIdOf = (cluster, fallback) => (
  cluster?.clusterId ?? cluster?.id ?? fallback
);

const appendUniqueIds = (target, seen, values = []) => {
  values.forEach((value) => {
    if (value === undefined || value === null) return;
    const key = String(value);
    if (seen.has(key)) return;
    seen.add(key);
    target.push(value);
  });
};

export const getAvailableDiagnosticClusterIds = ({
  availableClusterIds = [],
  clusterData = null,
  clusteringResults = null,
} = {}) => {
  const ids = [];
  const seen = new Set();

  appendUniqueIds(ids, seen, availableClusterIds);
  appendUniqueIds(ids, seen, clusterData?.clusterIds || []);
  appendUniqueIds(
    ids,
    seen,
    (clusterData?.clusters || []).map((cluster, index) => clusterIdOf(cluster, index))
  );
  appendUniqueIds(
    ids,
    seen,
    (clusteringResults?.clusters || []).map((cluster, index) => clusterIdOf(cluster, index))
  );

  if (ids.length === 0 && Array.isArray(clusteringResults?.fullData)) {
    appendUniqueIds(
      ids,
      seen,
      clusteringResults.fullData.map((_, index) => index)
    );
  }

  return ids.sort((left, right) => String(left).localeCompare(String(right), undefined, {
    numeric: true,
  }));
};

export const reconcileDiagnosticClusterIds = (selectedIds, availableIds, limit) => {
  const availableKeys = new Set(availableIds.map(String));
  const retained = selectedIds.filter((clusterId) => availableKeys.has(String(clusterId)));
  const retainedKeys = new Set(retained.map(String));
  const additions = availableIds.filter((clusterId) => !retainedKeys.has(String(clusterId)));
  return [...retained, ...additions].slice(0, limit);
};

export const getLinkedDiagnosticClusterIds = (linkedIds, availableIds, limit) => {
  if (!linkedIds.length) return null;
  const availableKeys = new Set(availableIds.map(String));
  return linkedIds
    .filter((clusterId) => availableKeys.has(String(clusterId)))
    .slice(0, limit);
};
