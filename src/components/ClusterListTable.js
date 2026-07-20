import React, { useEffect, useMemo, useState } from 'react';
import './ClusterListTable.css';

const GROUPS = ['unsorted', 'good', 'mua', 'noise'];

const metricValue = (cluster, stats, annotations) => {
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
    group: annotation.group || 'unsorted',
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
    channel: 'peakChannel', peak_channel: 'peakChannel', depth: 'depth',
    fr: 'firingRateHz', firing_rate: 'firingRateHz', firing_rate_hz: 'firingRateHz',
    isi: 'isiViolationRate', isi_violations: 'isiViolationRate', isi_violation_rate: 'isiViolationRate',
    amp: 'meanAmplitude', amplitude: 'meanAmplitude', mean_amplitude: 'meanAmplitude',
    group: 'group', label: 'label', note: 'note',
  };
  return row[aliases[field.toLowerCase()]];
};

const matchesQuery = (row, rawQuery) => {
  const query = rawQuery.trim();
  if (!query) return true;

  const expression = query.match(/^([a-z_]+)\s*(<=|>=|!=|=|<|>)\s*(.+)$/i);
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
  return query.toLowerCase().split(/\s+/).every((term) => haystack.includes(term));
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
}) => {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'id', direction: 'asc' });

  const rows = useMemo(() => clusters
    .map((cluster) => metricValue(cluster, clusterStats, clusterAnnotations))
    .filter((row) => groupFilter === 'all' || row.group === groupFilter)
    .filter((row) => matchesQuery(row, query))
    .sort((left, right) => {
      const result = compare(left, right, sort.key);
      return sort.direction === 'asc' ? result : -result;
    }), [clusters, clusterStats, clusterAnnotations, groupFilter, query, sort]);

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

  return (
    <div className="cluster-list-table">
      <div className="cluster-curation-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter or n_spikes > 100"
          aria-label="Filter clusters"
        />
        <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="Filter by group">
          <option value="all">All groups</option>
          {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
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
          {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
        <span className="cluster-selection-summary">{selectedClusters.length} selected · {rows.length}/{clusters.length}</span>
      </div>

      <div className="cluster-list-content">
        <table>
          <thead>
            <tr>
              <th aria-label="Selected" />
              <th>{sortLabel('id', 'ID')}</th>
              <th>{sortLabel('group', 'Group')}</th>
              <th>{sortLabel('size', 'Spikes')}</th>
              <th>{sortLabel('peakChannel', 'Ch')}</th>
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
                      {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
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
