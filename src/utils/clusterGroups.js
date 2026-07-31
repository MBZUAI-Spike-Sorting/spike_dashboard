export const DEFAULT_CLUSTER_GROUP = 'unsorted';

export const CLUSTER_GROUPS = Object.freeze([
  DEFAULT_CLUSTER_GROUP,
  'good',
  'mua',
  'noise',
]);

export const DEFAULT_CLUSTER_GROUPS = CLUSTER_GROUPS;

export const normalizeClusterGroups = (groups = [], observedGroups = []) => {
  const normalized = [];
  [...groups, ...observedGroups].forEach((group) => {
    const name = String(group || '').trim();
    if (
      !name ||
      normalized.some((candidate) => candidate.toLowerCase() === name.toLowerCase())
    ) {
      return;
    }
    normalized.push(name);
  });
  return normalized.length > 0 ? normalized : [...CLUSTER_GROUPS];
};

export const normalizeClusterGroup = (group) => {
  const normalized = String(group || '').trim().toLowerCase();
  return CLUSTER_GROUPS.includes(normalized)
    ? normalized
    : DEFAULT_CLUSTER_GROUP;
};

export const getClusterGroup = (annotations, clusterId, groups = CLUSTER_GROUPS) => {
  const annotation = (
    annotations?.[clusterId] ||
    annotations?.[String(clusterId)] ||
    {}
  );
  const availableGroups = normalizeClusterGroups(groups);
  const requestedGroup = String(annotation.group || '').trim();
  return availableGroups.find(
    (group) => group.toLowerCase() === requestedGroup.toLowerCase()
  ) || availableGroups[0] || DEFAULT_CLUSTER_GROUP;
};
