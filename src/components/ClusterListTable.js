import React, { useEffect, useMemo, useState } from 'react';
import {
  CLUSTER_GROUPS,
  getClusterGroup,
  normalizeClusterGroups,
} from '../utils/clusterGroups';
import './ClusterListTable.css';

export const DEFAULT_CLUSTER_GROUPS = CLUSTER_GROUPS;
export { normalizeClusterGroups };

const metricValue = (cluster, stats, annotations, groups = CLUSTER_GROUPS) => {
  const clusterId = cluster.id;
  const values = stats?.[clusterId] || stats?.[String(clusterId)] || {};
  const annotation = annotations?.[clusterId] || annotations?.[String(clusterId)] || {};
  return {
    id: clusterId,
    size: Number(values.numSpikes ?? values.count ?? cluster.size ?? 0),
    peakChannel: values.peakChannel ?? cluster.peakChannel ?? null,
    depth: values.depth ?? cluster.depth ?? null,
    firingRateHz: Number(values.firingRateHz ?? 0),
    isiViolationRate: Number(values.isiViolationRate ?? 0),
    meanAmplitude: values.meanAmplitude === null || values.meanAmplitude === undefined
      ? null
      : Number(values.meanAmplitude),
    group: getClusterGroup(annotations, clusterId, groups),
    label: annotation.label || '',
    note: annotation.note || '',
  };
};

const compare = (left, right, key) => {
  const a = left[key];
  const b = right[key];
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

const queryValue = (row, field) => {
  const aliases = {
    id: 'id', cluster: 'id', cluster_id: 'id',
    n_spikes: 'size', spikes: 'size', count: 'size',
    ch: 'peakChannel', channel: 'peakChannel', peak_channel: 'peakChannel', depth: 'depth',
    fr: 'firingRateHz', firing_rate: 'firingRateHz', firing_rate_hz: 'firingRateHz',
    isi: 'isiViolationRate', isi_violations: 'isiViolationRate', isi_violation_rate: 'isiViolationRate',
    amp: 'meanAmplitude', amplitude: 'meanAmplitude', mean_amplitude: 'meanAmplitude',
    group: 'group', label: 'label', note: 'note',
  };
  return row[aliases[field.toLowerCase()]];
};

const matchesClause = (row, rawClause) => {
  const clause = rawClause.trim();
  const expression = clause.match(/^([a-z_]+)\s*(<=|>=|!=|=|<|>)\s*(.+)$/i);
  if (expression) {
    const [, field, operator, rawExpected] = expression;
    const actual = queryValue(row, field);
    if (actual === undefined) return false;
    const numericExpected = Number(rawExpected);
    const numericActual = Number(actual);
    const useNumbers = Number.isFinite(numericExpected) && Number.isFinite(numericActual);
    const left = useNumbers ? numericActual : String(actual).toLowerCase();
    const right = useNumbers ? numericExpected : rawExpected.trim().toLowerCase();
    if (operator === '=') return left === right;
    if (operator === '!=') return left !== right;
    if (operator === '<') return left < right;
    if (operator === '<=') return left <= right;
    if (operator === '>') return left > right;
    if (operator === '>=') return left >= right;
  }

  const haystack = [row.id, row.group, row.label, row.note, row.peakChannel, row.depth]
    .join(' ')
    .toLowerCase();
  return clause.toLowerCase().split(/\s+/).every((term) => haystack.includes(term));
};

export const matchesQuery = (row, rawQuery) => {
  const query = rawQuery.trim();
  if (!query) return true;

  return query
    .split(/\s+(?:or)\s+|\|\|/i)
    .filter((orGroup) => orGroup.trim())
    .some((orGroup) => {
      const clauses = orGroup
        .split(/\s+(?:and)\s+|&&|,/i)
        .filter((clause) => clause.trim());
      return clauses.length > 0 && clauses.every((clause) => matchesClause(row, clause));
    });
};

const formatMetric = (value, digits = 2) => (
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '—'
);

const ClusterListTable = ({
  clusters = [],
  selectedClusters = [],
  clusterStats = {},
  clusterAnnotations = {},
  onClusterSelect,
  onClusterToggle,
  onAnnotationChange,
  onVisibleClustersChange,
  groups = DEFAULT_CLUSTER_GROUPS,
  onGroupsChange,
}) => {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'id', direction: 'asc' });
  const [isGroupEditorOpen, setIsGroupEditorOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupDrafts, setGroupDrafts] = useState({});
  const [groupError, setGroupError] = useState('');

  const availableGroups = useMemo(() => normalizeClusterGroups(
    groups,
    Object.values(clusterAnnotations || {}).map((annotation) => annotation?.group)
  ), [clusterAnnotations, groups]);

  const rows = useMemo(() => clusters
    .map((cluster) => metricValue(
      cluster,
      clusterStats,
      clusterAnnotations,
      availableGroups
    ))
    .filter((row) => groupFilter === 'all' || row.group === groupFilter)
    .filter((row) => matchesQuery(row, query))
    .sort((left, right) => {
      const result = compare(left, right, sort.key);
      return sort.direction === 'asc' ? result : -result;
    }), [
      availableGroups,
      clusters,
      clusterStats,
      clusterAnnotations,
      groupFilter,
      query,
      sort,
    ]);

  useEffect(() => {
    onVisibleClustersChange?.(rows.map((row) => row.id));
  }, [onVisibleClustersChange, rows]);

  const setSortKey = (key) => {
    setSort((previous) => ({
      key,
      direction: previous.key === key && previous.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortLabel = (key, label) => (
    <button type="button" className="cluster-sort-button" onClick={() => setSortKey(key)}>
      {label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  );

  const selectCluster = (clusterId, event, forceAdditive = false) => {
    if (onClusterSelect) {
      onClusterSelect(clusterId, {
        additive: forceAdditive || Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey),
      });
    } else {
      onClusterToggle?.(clusterId);
    }
  };

  const applyGroupToSelection = (group) => {
    selectedClusters.forEach((clusterId) => onAnnotationChange?.(clusterId, { group }));
  };

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      setGroupError('Enter a group name.');
      return;
    }
    if (availableGroups.some((group) => group.toLowerCase() === name.toLowerCase())) {
      setGroupError('That group already exists.');
      return;
    }
    onGroupsChange?.([...availableGroups, name]);
    setNewGroupName('');
    setGroupError('');
  };

  const renameGroup = (currentName) => {
    const nextName = String(groupDrafts[currentName] ?? currentName).trim();
    if (!nextName) {
      setGroupError('Group names cannot be empty.');
      setGroupDrafts((current) => ({ ...current, [currentName]: currentName }));
      return;
    }
    if (
      availableGroups.some((group) => (
        group !== currentName && group.toLowerCase() === nextName.toLowerCase()
      ))
    ) {
      setGroupError('That group already exists.');
      return;
    }
    if (nextName === currentName) return;
    onGroupsChange?.(
      availableGroups.map((group) => group === currentName ? nextName : group),
      { renamedFrom: currentName, renamedTo: nextName }
    );
    setGroupDrafts((current) => {
      const next = { ...current };
      delete next[currentName];
      return next;
    });
    setGroupFilter((current) => current === currentName ? nextName : current);
    setGroupError('');
  };

  const deleteGroup = (groupToDelete) => {
    if (availableGroups.length <= 1) {
      setGroupError('At least one group is required.');
      return;
    }

    const remainingGroups = availableGroups.filter((group) => group !== groupToDelete);
    const replacementGroup = remainingGroups[0];
    onGroupsChange?.(remainingGroups, {
      deletedGroup: groupToDelete,
      replacementGroup,
    });
    setGroupDrafts((current) => {
      const next = { ...current };
      delete next[groupToDelete];
      return next;
    });
    setGroupFilter((current) => current === groupToDelete ? 'all' : current);
    setGroupError('');
  };

  return (
    <div className="cluster-list-table">
      <div className="cluster-curation-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ch=30 and spikes>500, or use “or”"
          aria-label="Filter clusters"
          title="Combine filters with and/or, for example: ch=30 or spikes>500"
        />
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Filter by group">
          <option value="all">All groups</option>
          {availableGroups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) applyGroupToSelection(event.target.value);
          }}
          disabled={selectedClusters.length === 0}
          aria-label="Set group for selected clusters"
        >
          <option value="">Label selected…</option>
          {availableGroups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <button
          type="button"
          className="cluster-groups-edit-button"
          onClick={() => {
            setIsGroupEditorOpen((current) => !current);
            setGroupError('');
          }}
          aria-expanded={isGroupEditorOpen}
        >
          Edit groups
        </button>
        <span className="cluster-selection-summary">{selectedClusters.length} selected · {rows.length}/{clusters.length}</span>
      </div>

      {isGroupEditorOpen && (
        <div className="cluster-group-editor">
          <div className="cluster-group-editor-list">
            {availableGroups.map((group) => (
              <div className="cluster-group-editor-row" key={group}>
                <input
                  value={groupDrafts[group] ?? group}
                  onChange={(event) => {
                    setGroupDrafts((current) => ({ ...current, [group]: event.target.value }));
                    setGroupError('');
                  }}
                  onBlur={() => {
                    if (!String(groupDrafts[group] ?? group).trim()) {
                      setGroupDrafts((current) => ({ ...current, [group]: group }));
                      setGroupError('Group names cannot be empty.');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') renameGroup(group);
                    if (event.key === 'Escape') {
                      setGroupDrafts((current) => ({ ...current, [group]: group }));
                      setGroupError('');
                    }
                  }}
                  aria-label={`Rename group ${group}`}
                />
                <button
                  type="button"
                  className="cluster-group-icon-button"
                  onClick={() => renameGroup(group)}
                  disabled={(groupDrafts[group] ?? group).trim() === group}
                  aria-label={`Save group ${group}`}
                  title="Save group name"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 20h4l11-11-4-4L4 16v4Zm13.5-16.5 3 3" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="cluster-group-icon-button delete"
                  onClick={() => deleteGroup(group)}
                  disabled={availableGroups.length <= 1}
                  aria-label={`Delete group ${group}`}
                  title="Delete group and move its clusters to the default group"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <div className="cluster-group-editor-add">
            <input
              value={newGroupName}
              onChange={(event) => {
                setNewGroupName(event.target.value);
                setGroupError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addGroup();
              }}
              placeholder="New group name"
              aria-label="New group name"
            />
            <button type="button" onClick={addGroup}>Add group</button>
          </div>
          {groupError && <div className="cluster-group-editor-error" role="alert">{groupError}</div>}
        </div>
      )}

      <div className="cluster-list-content">
        <table>
          <thead>
            <tr>
              <th aria-label="Selected" />
              <th>{sortLabel('id', 'ID')}</th>
              <th>{sortLabel('group', 'Group')}</th>
              <th>{sortLabel('size', 'Spikes')}</th>
              <th>{sortLabel('peakChannel', 'CH')}</th>
              <th>{sortLabel('depth', 'Depth')}</th>
              <th>{sortLabel('firingRateHz', 'Hz')}</th>
              <th>{sortLabel('isiViolationRate', 'ISI %')}</th>
              <th>{sortLabel('meanAmplitude', 'Amp')}</th>
              <th>Label</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row) => {
              const selected = selectedClusters.some((clusterId) => String(clusterId) === String(row.id));
              const primary = String(selectedClusters[0]) === String(row.id);
              return (
                <tr
                  key={row.id}
                  className={`${selected ? 'selected' : ''} ${primary ? 'primary' : ''}`}
                  onClick={(event) => selectCluster(row.id, event)}
                >
                  <td className="checkbox-cell">
                    <input
                      type="checkbox"
                      checked={selected}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => selectCluster(row.id, event, true)}
                      aria-label={`Select cluster ${row.id}`}
                    />
                  </td>
                  <td className="cluster-id-cell">{row.id}</td>
                  <td>
                    <select
                      className={`cluster-group-select group-${row.group}`}
                      value={row.group}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onAnnotationChange?.(row.id, { group: event.target.value })}
                      aria-label={`Group for cluster ${row.id}`}
                    >
                      {availableGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                    </select>
                  </td>
                  <td>{row.size.toLocaleString()}</td>
                  <td>{row.peakChannel ?? '—'}</td>
                  <td>{formatMetric(row.depth, 1)}</td>
                  <td>{formatMetric(row.firingRateHz)}</td>
                  <td className={row.isiViolationRate > 0.02 ? 'metric-warning' : ''}>
                    {formatMetric(row.isiViolationRate * 100, 2)}
                  </td>
                  <td>{formatMetric(row.meanAmplitude)}</td>
                  <td>
                    <input
                      className="cluster-label-input"
                      value={row.label}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onAnnotationChange?.(row.id, { label: event.target.value })}
                      placeholder="label"
                      aria-label={`Custom label for cluster ${row.id}`}
                    />
                  </td>
                  <td>
                    <input
                      className="cluster-note-input"
                      value={row.note}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onAnnotationChange?.(row.id, { note: event.target.value })}
                      placeholder="note"
                      aria-label={`Note for cluster ${row.id}`}
                    />
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan="11" className="cluster-empty-cell">
                  {clusters.length > 0
                    ? 'No clusters match the current filter.'
                    : 'No clustering results available. Select preprocessed results or run an algorithm.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ClusterListTable;
