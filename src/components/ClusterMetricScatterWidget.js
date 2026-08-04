import React, { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import {
  buildClusterMetricPoints,
  CLUSTER_METRICS,
  scaleMetricSizes,
} from '../utils/clusterMetricScatter';
import './PopulationViews.css';

const metricOptions = Object.values(CLUSTER_METRICS);

const ClusterMetricScatterWidget = ({
  visibleClusterIds = [],
  selectedClusters = [],
  clusters = [],
  clusterStats = {},
  clusterAnnotations = {},
  onClusterSelect,
}) => {
  const [xMetric, setXMetric] = useState('peakChannel');
  const [yMetric, setYMetric] = useState('firingRateHz');
  const [sizeMetric, setSizeMetric] = useState('numSpikes');
  const [colorMetric, setColorMetric] = useState('isiViolationRate');
  const points = useMemo(() => buildClusterMetricPoints({
    clusterIds: visibleClusterIds,
    clusters,
    clusterStats,
    clusterAnnotations,
  }), [clusterAnnotations, clusterStats, clusters, visibleClusterIds]);
  const visiblePoints = useMemo(() => points.filter((point) => (
    Number.isFinite(point.values[xMetric]) && Number.isFinite(point.values[yMetric])
  )), [points, xMetric, yMetric]);
  const selectedKeys = useMemo(() => new Set(selectedClusters.map(String)), [selectedClusters]);
  const markerSizes = scaleMetricSizes(visiblePoints.map((point) => point.values[sizeMetric]));
  const selectedPointIndices = visiblePoints
    .map((point, index) => selectedKeys.has(String(point.clusterId)) ? index : null)
    .filter((index) => index !== null);
  const trace = {
    x: visiblePoints.map((point) => point.values[xMetric]),
    y: visiblePoints.map((point) => point.values[yMetric]),
    customdata: visiblePoints,
    type: 'scattergl',
    mode: 'markers',
    name: 'Clusters',
    selectedpoints: selectedKeys.size > 0 ? selectedPointIndices : undefined,
    marker: {
      size: markerSizes,
      sizemode: 'diameter',
      color: visiblePoints.map((point) => point.values[colorMetric]),
      colorscale: 'Viridis',
      showscale: true,
      colorbar: { title: CLUSTER_METRICS[colorMetric].label, thickness: 10 },
      opacity: 0.78,
      line: { color: 'rgba(226,232,240,.36)', width: 1 },
    },
    selected: { marker: { opacity: 1, line: { color: '#ffffff', width: 3 } } },
    unselected: { marker: { opacity: 0.46 } },
    hovertemplate: [
      '<b>Cluster %{customdata.clusterId}</b>',
      `${CLUSTER_METRICS[xMetric].label}: %{x:.4g}`,
      `${CLUSTER_METRICS[yMetric].label}: %{y:.4g}`,
      'Group: %{customdata.group}',
      '<extra></extra>',
    ].join('<br>'),
  };

  const metricSelect = (label, value, setter) => (
    <label>{label}
      <select value={value} onChange={(event) => setter(event.target.value)}>
        {metricOptions.map((metric) => <option key={metric.id} value={metric.id}>{metric.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="population-view-widget">
      <div className="population-toolbar metric-toolbar">
        {metricSelect('X', xMetric, setXMetric)}
        {metricSelect('Y', yMetric, setYMetric)}
        {metricSelect('Size', sizeMetric, setSizeMetric)}
        {metricSelect('Color', colorMetric, setColorMetric)}
        <span className="population-summary">{visiblePoints.length} / {points.length} clusters with X/Y metrics</span>
      </div>
      <div className="population-content">
        {points.length === 0 ? <div className="population-message">No clusters match the current table filter.</div>
          : visiblePoints.length === 0 ? <div className="population-message">Choose X/Y metrics available for these clusters.</div>
          : <div className="metric-scatter-shell">
            <Plot
              data={[trace]}
              layout={{
                autosize: true,
                uirevision: `${xMetric}:${yMetric}`,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0.18)',
                font: { color: '#cbd5e1', size: 10 },
                margin: { l: 62, r: 78, t: 22, b: 58 },
                hovermode: 'closest',
                xaxis: { title: CLUSTER_METRICS[xMetric].label, gridcolor: 'rgba(148,163,184,.13)' },
                yaxis: { title: CLUSTER_METRICS[yMetric].label, gridcolor: 'rgba(148,163,184,.13)' },
              }}
              config={{ responsive: true, displaylogo: false }}
              useResizeHandler
              style={{ width: '100%', height: '100%' }}
              onClick={(plotEvent) => {
                const point = plotEvent?.points?.[0]?.customdata;
                const sourceEvent = plotEvent?.event;
                if (!point) return;
                onClusterSelect?.(point.clusterId, {
                  additive: Boolean(sourceEvent?.ctrlKey || sourceEvent?.metaKey || sourceEvent?.shiftKey),
                });
              }}
            />
          </div>}
      </div>
    </div>
  );
};

export default ClusterMetricScatterWidget;
