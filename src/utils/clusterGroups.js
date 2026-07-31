export const DEFAULT_CLUSTER_GROUP = 'unsorted';

export const CLUSTER_GROUPS = Object.freeze([
  DEFAULT_CLUSTER_GROUP,
  'good',
  'mua',
  'noise',
]);

export const normalizeClusterGroup = (group) => {
  const normalized = String(group || '').trim().toLowerCase();
  return CLUSTER_GROUPS.includes(normalized)
    ? normalized
    : DEFAULT_CLUSTER_GROUP;
};

export const getClusterGroup = (annotations, clusterId) => {
  const annotation = (
    annotations?.[clusterId] ||
    annotations?.[String(clusterId)] ||
    {}
  );
  return normalizeClusterGroup(annotation.group);
};
