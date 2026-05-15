import React, { useEffect, useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import PropTypes from 'prop-types';
import { getClusterColor } from '../utils/colors';
import './AmplitudeProfileWidget.css';

const AUTO_BIN_COUNT = 'auto';
const DISPLAY_OVERLAY = 'overlay';
const DISPLAY_SEPARATE = 'separate';
const TRACE_BOTH = 'both';
const TRACE_HISTOGRAM = 'histogram';
const TRACE_CURVE = 'curve';
const KDE_POINT_COUNT = 160;
const MIN_BINS = 8;
const MAX_BINS = 60;

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getSpikeAmplitude = (waveform) => {
  if (!waveform) return null;

  if (typeof waveform === 'number') {
    return toFiniteNumber(waveform);
  }

  const directAmplitude =
    waveform.spikeAmplitude ??
    waveform.peakAmplitude ??
    waveform.amplitudeValue ??
    waveform.value;

  if (typeof directAmplitude === 'number') {
    return toFiniteNumber(directAmplitude);
  }

  if (!Array.isArray(waveform.amplitude) || waveform.amplitude.length === 0) {
    return null;
  }

  const values = waveform.amplitude.map(toFiniteNumber).filter((v) => v !== null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  return max - min;
};

const extractAmplitudeFromSpike = (spike) => {
  if (!spike || typeof spike !== 'object') return null;

  const candidate =
    spike.spikeAmplitude ??
    spike.peakAmplitude ??
    spike.amplitudeValue ??
    spike.amplitude ??
    spike.amp;

  return typeof candidate === 'number' ? toFiniteNumber(candidate) : null;
};

const standardDeviation = (values) => {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
};

const getProfileId = (profile) => String(profile.id);

const getProfileColorKey = (profile, fallbackIndex) => {
  const numericId = Number(profile.id);
  return Number.isFinite(numericId) ? numericId : fallbackIndex;
};

const normalizeNestedAmplitudes = ({
  amplitudes,
  amplitudeGroups,
  clusterIds,
  clusterLabels,
  spikeTimestamps
}) => {
  const source = amplitudeGroups || amplitudes;

  if (!Array.isArray(source)) return [];

  return source
    .map((group, index) => {
      const values = Array.isArray(group)
        ? group.map(toFiniteNumber).filter((value) => value !== null)
        : [];

      if (values.length === 0) return null;

      const id = clusterIds?.[index] ?? index;
      const label = clusterLabels?.[index] ?? `Cluster ${id}`;

      return {
        id,
        sourceIds: [id],
        label,
        values,
        timestamps: Array.isArray(spikeTimestamps?.[index])
          ? spikeTimestamps[index]
          : []
      };
    })
    .filter(Boolean);
};

const profilesFromClusterData = (clusterData, selectedClusters) => {
  if (!clusterData?.clusters) return [];

  const selectedSet = new Set(selectedClusters);

  return clusterData.clusters
    .filter((cluster) => selectedSet.has(cluster.clusterId))
    .map((cluster) => {
      const rawAmplitudes =
        cluster.spikeAmplitudes ||
        cluster.amplitudes ||
        cluster.amplitude ||
        [];

      const values = Array.isArray(rawAmplitudes)
        ? rawAmplitudes.map(toFiniteNumber).filter((value) => value !== null)
        : [];

      if (values.length === 0) return null;

      return {
        id: cluster.clusterId,
        sourceIds: [cluster.clusterId],
        label: cluster.clusterLabel || `Cluster ${cluster.clusterId}`,
        values,
        timestamps: Array.isArray(cluster.spikeTimes) ? cluster.spikeTimes : []
      };
    })
    .filter(Boolean);
};

const profilesFromClusteringResults = (clusteringResults, selectedClusters) => {
  if (!clusteringResults?.fullData) return [];

  return selectedClusters
    .map((clusterId) => {
      const clusterSpikes = clusteringResults.fullData[clusterId];
      if (!Array.isArray(clusterSpikes)) return null;

      const values = clusterSpikes
        .map(extractAmplitudeFromSpike)
        .filter((value) => value !== null);

      if (values.length === 0) return null;

      return {
        id: clusterId,
        sourceIds: [clusterId],
        label: `Cluster ${clusterId}`,
        values,
        timestamps: clusterSpikes.map((spike) => spike?.time).filter(Boolean)
      };
    })
    .filter(Boolean);
};

const profilesFromWaveforms = (clusterWaveforms, selectedClusters) => {
  if (!clusterWaveforms) return [];

  return selectedClusters
    .map((clusterId) => {
      const waveforms = clusterWaveforms[clusterId] || clusterWaveforms[String(clusterId)];
      if (!Array.isArray(waveforms)) return null;

      const values = waveforms
        .map(getSpikeAmplitude)
        .filter((value) => value !== null);

      if (values.length === 0) return null;

      return {
        id: clusterId,
        sourceIds: [clusterId],
        label: `Cluster ${clusterId}`,
        values,
        timestamps: waveforms.map((waveform) => waveform?.time).filter(Boolean)
      };
    })
    .filter(Boolean);
};

const getProfiles = ({
  amplitudes,
  amplitudeGroups,
  clusterIds,
  clusterLabels,
  spikeTimestamps,
  selectedClusters,
  clusterWaveforms,
  clusterData,
  clusteringResults
}) => {
  const nestedProfiles = normalizeNestedAmplitudes({
    amplitudes,
    amplitudeGroups,
    clusterIds,
    clusterLabels,
    spikeTimestamps
  });

  if (nestedProfiles.length > 0) {
    if (!selectedClusters?.length) return nestedProfiles;
    const selectedSet = new Set(selectedClusters.map(String));
    return nestedProfiles.filter((profile) => selectedSet.has(String(profile.id)));
  }

  const waveformProfiles = profilesFromWaveforms(clusterWaveforms, selectedClusters);
  if (waveformProfiles.length > 0) return waveformProfiles;

  const resultProfiles = profilesFromClusteringResults(clusteringResults, selectedClusters);
  if (resultProfiles.length > 0) return resultProfiles;

  return profilesFromClusterData(clusterData, selectedClusters);
};

const createRange = (values) => {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    const padding = Math.max(Math.abs(min) * 0.1, 1);
    return [min - padding, max + padding];
  }

  const padding = (max - min) * 0.04;
  return [min - padding, max + padding];
};

const resolveBinCount = (binMode, values) => {
  if (binMode !== AUTO_BIN_COUNT) return Number(binMode);

  const sturges = Math.ceil(Math.log2(values.length) + 1);
  const sqrtCount = Math.ceil(Math.sqrt(values.length));

  return Math.max(MIN_BINS, Math.min(MAX_BINS, Math.max(sturges, sqrtCount)));
};

const createHistogram = (values, range, binCount) => {
  const [min, max] = range;
  const binWidth = (max - min) / binCount || 1;
  const counts = new Array(binCount).fill(0);

  values.forEach((value) => {
    const rawIndex = Math.floor((value - min) / binWidth);
    const index = Math.max(0, Math.min(binCount - 1, rawIndex));
    counts[index] += 1;
  });

  return {
    centers: counts.map((_, index) => min + binWidth * (index + 0.5)),
    counts,
    binWidth
  };
};

const gaussianKde = (values, range, binWidth) => {
  if (values.length === 0) return { x: [], y: [] };

  const [min, max] = range;
  const sd = standardDeviation(values);
  const fallbackBandwidth = Math.max((max - min) / 20, Number.EPSILON);
  const bandwidth = sd > 0
    ? 1.06 * sd * values.length ** -0.2
    : fallbackBandwidth;

  const safeBandwidth = Math.max(bandwidth, fallbackBandwidth / 10, Number.EPSILON);
  const normalizer = 1 / (safeBandwidth * Math.sqrt(2 * Math.PI) * values.length);

  const x = Array.from({ length: KDE_POINT_COUNT }, (_, index) => {
    if (KDE_POINT_COUNT === 1) return min;
    return min + ((max - min) * index) / (KDE_POINT_COUNT - 1);
  });

  const y = x.map((point) => {
    const density = values.reduce((sum, value) => {
      const z = (point - value) / safeBandwidth;
      return sum + Math.exp(-0.5 * z * z);
    }, 0) * normalizer;

    return density * values.length * binWidth;
  });

  return { x, y };
};

const createProfileTraces = ({
  profile,
  index,
  range,
  binCount,
  traceMode,
  axisSuffix = ''
}) => {
  const color = profile.merged
    ? '#f39c12'
    : getClusterColor(getProfileColorKey(profile, index));
  const histogram = createHistogram(profile.values, range, binCount);
  const kde = gaussianKde(profile.values, range, histogram.binWidth);
  const traces = [];
  const axisProps = axisSuffix
    ? { xaxis: `x${axisSuffix}`, yaxis: `y${axisSuffix}` }
    : {};

  if (traceMode !== TRACE_CURVE) {
    traces.push({
      type: 'bar',
      x: histogram.centers,
      y: histogram.counts,
      width: histogram.binWidth * 0.88,
      marker: {
        color,
        opacity: profile.merged ? 0.35 : 0.28,
        line: {
          color,
          width: 1
        }
      },
      name: traceMode === TRACE_HISTOGRAM ? profile.label : `${profile.label} bins`,
      legendgroup: getProfileId(profile),
      hovertemplate: `<b>${profile.label}</b><br>Amplitude: %{x:.3f}<br>Spikes: %{y}<extra></extra>`,
      showlegend: traceMode === TRACE_HISTOGRAM,
      ...axisProps
    });
  }

  if (traceMode !== TRACE_HISTOGRAM) {
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: kde.x,
      y: kde.y,
      line: {
        color,
        width: profile.merged ? 4 : 3
      },
      name: traceMode === TRACE_CURVE ? profile.label : `${profile.label} KDE`,
      legendgroup: getProfileId(profile),
      hovertemplate: `<b>${profile.label}</b><br>Amplitude: %{x:.3f}<br>KDE: %{y:.2f}<extra></extra>`,
      ...axisProps
    });
  }

  return traces;
};

const mergeProfiles = (baseProfiles, mergeGroups) => {
  const profileById = new Map(baseProfiles.map((profile) => [getProfileId(profile), profile]));
  const mergedIds = new Set(
    mergeGroups.flatMap((group) => group.sourceIds.map(String))
  );

  const unmergedProfiles = baseProfiles.filter(
    (profile) => !mergedIds.has(getProfileId(profile))
  );

  const mergedProfiles = mergeGroups
    .map((group) => {
      const sources = group.sourceIds
        .map((sourceId) => profileById.get(String(sourceId)))
        .filter(Boolean);

      if (sources.length < 2) return null;

      return {
        id: group.id,
        sourceIds: group.sourceIds,
        label: group.label,
        values: sources.flatMap((source) => source.values),
        timestamps: sources.flatMap((source) => source.timestamps || []),
        merged: true
      };
    })
    .filter(Boolean);

  return [...unmergedProfiles, ...mergedProfiles];
};

const profileStats = (profile) => {
  const count = profile.values.length;
  const mean = profile.values.reduce((sum, value) => sum + value, 0) / count;
  const sorted = [...profile.values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  return { count, mean, median };
};

const AmplitudeProfileWidget = ({
  amplitudes,
  amplitudeGroups,
  clusterIds,
  clusterLabels,
  spikeTimestamps,
  selectedClusters = [],
  clusterWaveforms = {},
  clusterData,
  clusteringResults
}) => {
  const [binMode, setBinMode] = useState(AUTO_BIN_COUNT);
  const [displayMode, setDisplayMode] = useState(DISPLAY_OVERLAY);
  const [traceMode, setTraceMode] = useState(TRACE_BOTH);
  const [mergeSelection, setMergeSelection] = useState([]);
  const [mergeGroups, setMergeGroups] = useState([]);

  const baseProfiles = useMemo(() => getProfiles({
    amplitudes,
    amplitudeGroups,
    clusterIds,
    clusterLabels,
    spikeTimestamps,
    selectedClusters,
    clusterWaveforms,
    clusterData,
    clusteringResults
  }), [
    amplitudes,
    amplitudeGroups,
    clusterIds,
    clusterLabels,
    spikeTimestamps,
    selectedClusters,
    clusterWaveforms,
    clusterData,
    clusteringResults
  ]);

  useEffect(() => {
    const availableIds = new Set(baseProfiles.map(getProfileId));

    setMergeGroups((previous) =>
      previous.filter((group) =>
        group.sourceIds.every((sourceId) => availableIds.has(String(sourceId)))
      )
    );
  }, [baseProfiles]);

  const visibleProfiles = useMemo(
    () => mergeProfiles(baseProfiles, mergeGroups),
    [baseProfiles, mergeGroups]
  );

  useEffect(() => {
    const visibleIds = new Set(visibleProfiles.map(getProfileId));

    setMergeSelection((previous) =>
      previous.filter((profileId) => visibleIds.has(String(profileId)))
    );
  }, [visibleProfiles]);

  const allValues = useMemo(
    () => visibleProfiles.flatMap((profile) => profile.values),
    [visibleProfiles]
  );

  const plotData = useMemo(() => {
    if (visibleProfiles.length === 0 || allValues.length === 0) return [];

    const range = createRange(allValues);
    const binCount = resolveBinCount(binMode, allValues);

    return visibleProfiles.flatMap((profile, index) => {
      return createProfileTraces({
        profile,
        index,
        range,
        binCount,
        traceMode
      });
    });
  }, [visibleProfiles, allValues, binMode, traceMode]);

  const separatePlots = useMemo(() => {
    if (visibleProfiles.length === 0 || allValues.length === 0) return [];

    const range = createRange(allValues);
    const binCount = resolveBinCount(binMode, allValues);

    return visibleProfiles.map((profile, index) => ({
      id: getProfileId(profile),
      label: profile.label,
      color: profile.merged
        ? '#f39c12'
        : getClusterColor(getProfileColorKey(profile, index)),
      data: createProfileTraces({
        profile,
        index,
        range,
        binCount,
        traceMode
      })
    }));
  }, [visibleProfiles, allValues, binMode, traceMode]);

  const stats = useMemo(
    () => visibleProfiles.map((profile) => ({ ...profile, ...profileStats(profile) })),
    [visibleProfiles]
  );

  const toggleMergeSelection = (profileId) => {
    const normalizedId = String(profileId);

    setMergeSelection((previous) => (
      previous.includes(normalizedId)
        ? previous.filter((id) => id !== normalizedId)
        : [...previous, normalizedId]
    ));
  };

  const handleMerge = () => {
    if (mergeSelection.length < 2) return;

    const profileById = new Map(visibleProfiles.map((profile) => [getProfileId(profile), profile]));
    const selectedProfiles = mergeSelection
      .map((profileId) => profileById.get(String(profileId)))
      .filter(Boolean);

    if (selectedProfiles.length < 2) return;

    const sourceIds = selectedProfiles
      .flatMap((profile) => profile.sourceIds)
      .filter((sourceId, index, array) =>
        array.findIndex((candidate) => String(candidate) === String(sourceId)) === index
      );
    const sourceIdSet = new Set(sourceIds.map(String));
    const label = `Merged ${sourceIds.join(' + ')}`;

    setMergeGroups((previous) => [
      ...previous.filter((group) =>
        !group.sourceIds.some((sourceId) => sourceIdSet.has(String(sourceId)))
      ),
      {
        id: `merged-${Date.now()}`,
        sourceIds,
        label
      }
    ]);
    setMergeSelection([]);
  };

  const handleClearMerges = () => {
    setMergeGroups([]);
    setMergeSelection([]);
  };

  return (
    <div className="amplitude-profile-widget">
      <div className="amplitude-profile-toolbar">
        <div className="amplitude-profile-control">
          <span>Bins</span>
          <select value={binMode} onChange={(event) => setBinMode(event.target.value)}>
            <option value={AUTO_BIN_COUNT}>Auto</option>
            <option value="12">12</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="40">40</option>
            <option value="60">60</option>
          </select>
        </div>

        <div className="amplitude-profile-control">
          <span>View</span>
          <select value={displayMode} onChange={(event) => setDisplayMode(event.target.value)}>
            <option value={DISPLAY_OVERLAY}>Overlay</option>
            <option value={DISPLAY_SEPARATE}>Separate</option>
          </select>
        </div>

        <div className="amplitude-profile-control">
          <span>Show</span>
          <select value={traceMode} onChange={(event) => setTraceMode(event.target.value)}>
            <option value={TRACE_BOTH}>Bins + curve</option>
            <option value={TRACE_HISTOGRAM}>Bins only</option>
            <option value={TRACE_CURVE}>Curve only</option>
          </select>
        </div>

        <div className="amplitude-profile-merge">
          <button
            type="button"
            onClick={handleMerge}
            disabled={mergeSelection.length < 2}
          >
            Merge
          </button>
          <button
            type="button"
            onClick={handleClearMerges}
            disabled={mergeGroups.length === 0}
          >
            Reset
          </button>
        </div>
      </div>

      {visibleProfiles.length > 0 && (
        <div className="amplitude-profile-cluster-strip">
          {visibleProfiles.map((profile, index) => {
            const profileId = getProfileId(profile);
            const isSelected = mergeSelection.includes(profileId);
            const color = profile.merged
              ? '#f39c12'
              : getClusterColor(getProfileColorKey(profile, index));

            return (
              <button
                key={profileId}
                type="button"
                className={`amplitude-profile-chip ${isSelected ? 'selected' : ''} ${profile.merged ? 'merged' : ''}`}
                onClick={() => toggleMergeSelection(profileId)}
                title={`Select ${profile.label}`}
              >
                <span style={{ backgroundColor: color }} />
                {profile.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="amplitude-profile-plot">
        {displayMode === DISPLAY_SEPARATE && separatePlots.length > 0 ? (
          <div className="amplitude-profile-separated-plots">
            {separatePlots.map((figure) => (
              <div key={figure.id} className="amplitude-profile-separated-panel">
                <div className="amplitude-profile-separated-title">
                  <span style={{ backgroundColor: figure.color }} />
                  {figure.label}
                </div>
                <Plot
                  data={figure.data}
                  layout={{
                    autosize: true,
                    barmode: 'overlay',
                    bargap: 0.02,
                    paper_bgcolor: 'rgba(30, 30, 60, 0)',
                    plot_bgcolor: 'rgba(0, 0, 0, 0.24)',
                    font: { color: '#e0e6ed', size: 10 },
                    xaxis: {
                      title: 'Spike amplitude',
                      gridcolor: 'rgba(64, 224, 208, 0.14)',
                      zerolinecolor: 'rgba(64, 224, 208, 0.32)',
                      color: '#e0e6ed'
                    },
                    yaxis: {
                      title: 'Spike count',
                      gridcolor: 'rgba(64, 224, 208, 0.14)',
                      zerolinecolor: 'rgba(64, 224, 208, 0.32)',
                      color: '#e0e6ed'
                    },
                    hovermode: 'closest',
                    showlegend: false,
                    margin: { l: 52, r: 16, t: 8, b: 48 },
                    uirevision: `amplitude-profile-${figure.id}`
                  }}
                  config={{
                    displayModeBar: true,
                    displaylogo: false,
                    responsive: true,
                    modeBarButtonsToRemove: ['lasso2d', 'select2d']
                  }}
                  style={{ width: '100%', height: '100%' }}
                  useResizeHandler={true}
                />
              </div>
            ))}
          </div>
        ) : plotData.length > 0 ? (
          <Plot
            data={plotData}
            layout={{
              autosize: true,
              barmode: 'overlay',
              bargap: 0.02,
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed', size: 11 },
              xaxis: {
                title: 'Spike amplitude',
                gridcolor: 'rgba(64, 224, 208, 0.16)',
                zerolinecolor: 'rgba(64, 224, 208, 0.35)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Spike count',
                gridcolor: 'rgba(64, 224, 208, 0.16)',
                zerolinecolor: 'rgba(64, 224, 208, 0.35)',
                color: '#e0e6ed'
              },
              hovermode: 'closest',
              showlegend: true,
              legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: 1.02,
                xanchor: 'right',
                x: 1,
                bgcolor: 'rgba(26, 26, 46, 0.76)',
                bordercolor: 'rgba(64, 224, 208, 0.22)',
                borderwidth: 1,
                font: { size: 10 }
              },
              margin: { l: 58, r: 20, t: 26, b: 58 },
              uirevision: 'amplitude-profile'
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              responsive: true,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        ) : (
          <div className="amplitude-profile-empty">
            <p>Select clusters with waveform or amplitude data</p>
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="amplitude-profile-stats">
          {stats.map((profile) => (
            <div key={getProfileId(profile)} className="amplitude-profile-stat-row">
              <span>{profile.label}</span>
              <span>{profile.count} spikes</span>
              <span>Mean {profile.mean.toFixed(3)}</span>
              <span>Median {profile.median.toFixed(3)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

AmplitudeProfileWidget.propTypes = {
  amplitudes: PropTypes.array,
  amplitudeGroups: PropTypes.array,
  clusterIds: PropTypes.array,
  clusterLabels: PropTypes.array,
  spikeTimestamps: PropTypes.array,
  selectedClusters: PropTypes.array,
  clusterWaveforms: PropTypes.object,
  clusterData: PropTypes.object,
  clusteringResults: PropTypes.object
};

export default AmplitudeProfileWidget;
