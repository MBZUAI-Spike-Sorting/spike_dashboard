import React, { useState, useEffect, useRef } from 'react';
import Plot from 'react-plotly.js';
import './ClusterView.css';

const ClusterView = ({ selectedDataset, onNavigateToSpike, clusteringResults, selectedAlgorithm }) => {
  const [clusterData, setClusterData] = useState(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [spikePreview, setSpikePreview] = useState(null);
  const [selectedChannels, setSelectedChannels] = useState({ 0: 179, 1: 181, 2: 183 });
  const [filterType, setFilterType] = useState('highpass');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [overlaySpikes, setOverlaySpikes] = useState([]);
  const [isLoadingOverlay, setIsLoadingOverlay] = useState(false);
  const [mode, setMode] = useState('synthetic'); // 'synthetic', 'real', or 'algorithm'
  const [channelMapping, setChannelMapping] = useState({});
  const [showChannelMappingModal, setShowChannelMappingModal] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState([]);
  const clickTimeoutRef = useRef(null);
  const lastClickRef = useRef(null);

  useEffect(() => {
    if (clusteringResults && clusteringResults.demo) {
      console.log('Using synthetic demo clustering results');
      setMode('synthetic');
      setClusterData(convertClusteringResultsToClusterData(clusteringResults));
      return;
    }

    if (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') {
      if (clusteringResults && clusteringResults.available) {
        console.log(`Using ${selectedAlgorithm} results`);
        setMode('algorithm');
        setClusterData(convertClusteringResultsToClusterData(clusteringResults));
      } else {
        console.log(`Waiting for ${selectedAlgorithm} to run...`);
        setClusterData(null);
      }
    } else if (selectedAlgorithm === 'preprocessed_torchbci') {
      console.log('Using Preprocessed TorchBCI data');
      fetchClusterData('preprocessed_torchbci');
    } else if (selectedAlgorithm === 'preprocessed_kilosort4') {
      console.log('Using Preprocessed Kilosort4 data');
      fetchClusterData('preprocessed_kilosort4');
    } else {
      fetchClusterData();
    }

    if (selectedDataset === 'c46') {
      setSelectedChannels({ 0: 179, 1: 181, 2: 183 });
    }
  }, [selectedDataset, mode, channelMapping, clusteringResults, selectedAlgorithm]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hoveredPoint && !clusteringResults?.demo) {
      fetchSpikePreview(hoveredPoint.cluster, hoveredPoint.index);
    }
  }, [filterType]);

  const convertClusteringResultsToClusterData = (results) => {
    const sourceClusters = Array.isArray(results?.fullData) ? results.fullData : [];

    const clusters = sourceClusters.map((clusterSpikes, clusterIdx) => {
      const normalizedPoints = (clusterSpikes || []).map((spike, pointIdx) => {
        if (Array.isArray(spike) && spike.length >= 2) {
          return {
            x: Number(spike[0]),
            y: Number(spike[1]),
            time: pointIdx * 20,
            channel: 181
          };
        }

        return {
          x: Number(spike?.x ?? 0),
          y: Number(spike?.y ?? 0),
          time: Number(spike?.time ?? pointIdx * 20),
          channel: Number(spike?.channel ?? 181)
        };
      });

      return {
        x: normalizedPoints.map((spike) => spike.x),
        y: normalizedPoints.map((spike) => spike.y),
        points: normalizedPoints.map((spike) => [spike.x, spike.y]),
        spikeTimes: normalizedPoints.map((spike) => spike.time),
        spikeChannels: normalizedPoints.map((spike) => spike.channel),
        clusterLabel: `Cluster ${clusterIdx + 1}`,
        clusterId: clusterIdx + 1,
        size: normalizedPoints.length,
        pointCount: normalizedPoints.length,
        channelId: normalizedPoints[0]?.channel ?? 181
      };
    });

    console.log(`Converted ${clusters.length} clusters from clustering results`);

    return {
      clusters,
      numClusters: results?.numClusters ?? clusters.length,
      totalSpikes: results?.totalSpikes ?? clusters.reduce((sum, c) => sum + c.pointCount, 0),
      totalPoints: results?.totalSpikes ?? clusters.reduce((sum, c) => sum + c.pointCount, 0),
      clusterIds: clusters.map((c) => c.clusterId),
      demo: !!results?.demo
    };
  };

  const fetchClusterData = async (algorithmOverride = null) => {
    if (clusteringResults?.demo) return;

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';

      let requestBody;
      if (mode === 'real') {
        requestBody = {
          mode: 'real',
          channelMapping: channelMapping
        };
      } else {
        const channelIds = [
          selectedChannels[0],
          selectedChannels[1],
          selectedChannels[2]
        ];
        requestBody = {
          mode: 'synthetic',
          channelIds: channelIds
        };
      }

      if (algorithmOverride) {
        requestBody.algorithm = algorithmOverride;
      }

      const response = await fetch(`${apiUrl}/api/cluster-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const data = await response.json();
        setClusterData(data);
        console.log('Cluster data loaded:', data);
      }
    } catch (error) {
      console.error('Error fetching cluster data:', error);
    }
  };

  const buildSyntheticPreview = (clusterIndex, pointIndex, channelId) => {
    const baseWave = Array.from({ length: 41 }, (_, i) => {
      const t = i - 20;
      return (
        Math.exp(-(t * t) / 45) * Math.sin(t / 2.8) * 2.2 +
        Math.exp(-(t * t) / 120) * 0.35
      );
    });

    return {
      waveform: baseWave,
      spikeTime: clusterData?.clusters?.[clusterIndex]?.spikeTimes?.[pointIndex] ?? pointIndex * 20,
      channelId,
      pointIndex,
      window: 20
    };
  };

  const fetchSpikePreview = async (clusterIndex, pointIndex) => {
    if (clusteringResults?.demo) {
      const channelId =
        clusterData?.clusters?.[clusterIndex]?.spikeChannels?.[pointIndex] ??
        selectedChannels[clusterIndex] ??
        181;

      setSpikePreview(buildSyntheticPreview(clusterIndex, pointIndex, channelId));
      return;
    }

    setIsLoadingPreview(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';

      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        setIsLoadingPreview(false);
        return;
      }

      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];

      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        setIsLoadingPreview(false);
        return;
      }

      let channelId;
      if (mode === 'algorithm' && (selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4')) {
        channelId = cluster.spikeChannels && cluster.spikeChannels[pointIndex]
          ? cluster.spikeChannels[pointIndex]
          : 181;
      } else if (mode === 'real') {
        channelId = cluster.channelId || channelMapping[cluster.clusterId] || 181;
      } else {
        channelId = selectedChannels[clusterIndex];
      }

      console.log(`[${selectedAlgorithm}] Fetching spike preview - Cluster: ${clusterIndex}, Point: ${pointIndex}, Time: ${spikeTime}, Channel: ${channelId}`);

      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex,
          algorithm: selectedAlgorithm,
          mode: mode
        })
      });

      if (response.ok) {
        const preview = await response.json();
        setSpikePreview(preview);
      }
    } catch (error) {
      console.error('Error fetching spike preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePointHover = (event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const clusterIndex = point.customdata.clusterIdx;
      const pointIndex = point.customdata.pointIdx;

      setHoveredPoint({
        cluster: clusterIndex,
        index: pointIndex,
        x: point.x,
        y: point.y
      });

      fetchSpikePreview(clusterIndex, pointIndex);
    }
  };

  const handlePointUnhover = () => {
    setHoveredPoint(null);
    setSpikePreview(null);
  };

  const handlePointClick = (event) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const clusterIndex = point.customdata.clusterIdx;
      const pointIndex = point.customdata.pointIdx;
      const channelId =
        clusterData?.clusters?.[clusterIndex]?.spikeChannels?.[pointIndex] ??
        selectedChannels[clusterIndex] ??
        181;

      const now = Date.now();
      const lastClick = lastClickRef.current;

      if (
        lastClick &&
        lastClick.clusterIndex === clusterIndex &&
        lastClick.pointIndex === pointIndex &&
        now - lastClick.time < 300
      ) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }
        lastClickRef.current = null;
        fetchSpikePreviewForNavigation(clusterIndex, pointIndex, channelId);
      } else {
        lastClickRef.current = { clusterIndex, pointIndex, time: now };

        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }

        clickTimeoutRef.current = setTimeout(() => {
          addSpikeToOverlay(clusterIndex, pointIndex, channelId);
          lastClickRef.current = null;
          clickTimeoutRef.current = null;
        }, 300);
      }
    }
  };

  const addSpikeToOverlay = async (clusterIndex, pointIndex, channelId) => {
    if (clusteringResults?.demo) {
      const preview = buildSyntheticPreview(clusterIndex, pointIndex, channelId);
      const isDuplicate = overlaySpikes.some(
        (s) => s.spikeTime === preview.spikeTime && s.channelId === channelId
      );

      if (!isDuplicate) {
        setOverlaySpikes((prev) => [
          ...prev,
          {
            ...preview,
            clusterIndex,
            pointIndex,
            color: ['#FF6B6B', '#4ECDC4', '#FFD700'][clusterIndex % 3]
          }
        ]);
      }
      return;
    }

    setIsLoadingOverlay(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';

      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        setIsLoadingOverlay(false);
        return;
      }

      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];

      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        setIsLoadingOverlay(false);
        return;
      }

      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex
        })
      });

      if (response.ok) {
        const preview = await response.json();

        const isDuplicate = overlaySpikes.some(
          (s) => s.spikeTime === spikeTime && s.channelId === channelId
        );

        if (!isDuplicate) {
          setOverlaySpikes((prev) => [
            ...prev,
            {
              ...preview,
              clusterIndex: clusterIndex,
              pointIndex: pointIndex,
              color: ['#FF6B6B', '#4ECDC4', '#FFD700'][clusterIndex % 3]
            }
          ]);
        }
      }
    } catch (error) {
      console.error('Error adding spike to overlay:', error);
    } finally {
      setIsLoadingOverlay(false);
    }
  };

  const removeSpikeFromOverlay = (index) => {
    setOverlaySpikes((prev) => prev.filter((_, i) => i !== index));
  };

  const clearOverlay = () => {
    setOverlaySpikes([]);
  };

  const handleNavigateToSpikeFromOverlay = (spike) => {
    if (onNavigateToSpike) {
      const allClusterChannels = [
        selectedChannels[0],
        selectedChannels[1],
        selectedChannels[2]
      ];
      onNavigateToSpike(spike.spikeTime, spike.channelId, allClusterChannels);
    }
  };

  const fetchSpikePreviewForNavigation = async (clusterIndex, pointIndex, channelId) => {
    if (clusteringResults?.demo) {
      const preview = buildSyntheticPreview(clusterIndex, pointIndex, channelId);
      if (onNavigateToSpike) {
        const allClusterChannels = [
          selectedChannels[0],
          selectedChannels[1],
          selectedChannels[2]
        ];
        onNavigateToSpike(preview.spikeTime, channelId, allClusterChannels);
      }
      return;
    }

    try {
      const apiUrl = process.env.REACT_APP_API_URL || '';

      if (!clusterData || !clusterData.clusters || !clusterData.clusters[clusterIndex]) {
        console.error('Cluster data not available');
        return;
      }

      const cluster = clusterData.clusters[clusterIndex];
      const spikeTime = cluster.spikeTimes[pointIndex];

      if (spikeTime === null || spikeTime === undefined) {
        console.error('No spike time available for this point');
        return;
      }

      const response = await fetch(`${apiUrl}/api/spike-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spikeTime: spikeTime,
          channelId: channelId,
          window: 10,
          filterType: filterType,
          pointIndex: pointIndex
        })
      });

      if (response.ok) {
        const preview = await response.json();
        if (onNavigateToSpike) {
          const allClusterChannels = [
            selectedChannels[0],
            selectedChannels[1],
            selectedChannels[2]
          ];
          onNavigateToSpike(preview.spikeTime, channelId, allClusterChannels);
        }
      }
    } catch (error) {
      console.error('Error fetching spike for navigation:', error);
    }
  };

  const generatePlotData = () => {
    if (!clusterData || !clusterData.clusters || clusterData.clusters.length === 0) return [];

    const traces = [];
    const totalPoints = clusterData.totalPoints || 0;

    let basePointSize = 10;
    if (totalPoints > 10000) basePointSize = 4;
    else if (totalPoints > 5000) basePointSize = 6;
    else if (totalPoints > 1000) basePointSize = 8;

    clusterData.clusters.forEach((cluster, clusterIdx) => {
      if (!cluster.points || cluster.points.length === 0) return;

      const selectedIndicesSet = new Set(
        overlaySpikes
          .filter((spike) => spike.clusterIndex === clusterIdx)
          .map((spike) => spike.pointIndex)
      );

      const unselectedX = [];
      const unselectedY = [];
      const unselectedIndices = [];
      const selectedX = [];
      const selectedY = [];
      const selectedPointIndices = [];

      cluster.points.forEach((point, pointIdx) => {
        const px = Array.isArray(point) ? point[0] : point.x;
        const py = Array.isArray(point) ? point[1] : point.y;

        if (selectedIndicesSet.has(pointIdx)) {
          selectedX.push(px);
          selectedY.push(py);
          selectedPointIndices.push(pointIdx);
        } else {
          unselectedX.push(px);
          unselectedY.push(py);
          unselectedIndices.push(pointIdx);
        }
      });

      const color = `hsl(${(cluster.clusterId * 137) % 360}, 70%, 60%)`;
      const clusterName = `Cluster ${cluster.clusterId}`;

      if (unselectedX.length > 0) {
        traces.push({
          x: unselectedX,
          y: unselectedY,
          mode: 'markers',
          type: 'scattergl',
          name: clusterName,
          marker: {
            size: basePointSize,
            color: color,
            opacity: 0.78,
            line: {
              color: color,
              width: 1
            }
          },
          customdata: unselectedIndices.map((idx) => ({
            clusterIdx,
            pointIdx: idx,
            clusterId: cluster.clusterId
          })),
          hovertemplate: `<b>${clusterName}</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`,
          showlegend: selectedX.length === 0
        });
      }

      if (selectedX.length > 0) {
        traces.push({
          x: selectedX,
          y: selectedY,
          mode: 'markers',
          type: 'scattergl',
          name: clusterName,
          marker: {
            size: basePointSize + 4,
            color: color,
            opacity: 1,
            line: {
              color: '#FFFFFF',
              width: 2
            },
            symbol: 'circle'
          },
          customdata: selectedPointIndices.map((idx) => ({
            clusterIdx,
            pointIdx: idx,
            clusterId: cluster.clusterId
          })),
          hovertemplate: `<b>${clusterName} (Selected)</b><br>Point: %{customdata.pointIdx}<br>PC1: %{x:.2f}<br>PC2: %{y:.2f}<extra></extra>`
        });
      }
    });

    return traces;
  };

  const generatePreviewPlot = () => {
    if (!spikePreview || !spikePreview.waveform) return null;

    const spikeTime = spikePreview.spikeTime;
    const window = spikePreview.window || 10;
    const startTime = spikeTime - window;
    const timePoints = Array.from(
      { length: spikePreview.waveform.length },
      (_, i) => startTime + i
    );

    return {
      data: [
        {
          x: timePoints,
          y: spikePreview.waveform,
          type: 'scatter',
          mode: 'lines',
          line: { color: '#40e0d0', width: 2 },
          fill: 'tozeroy',
          fillcolor: 'rgba(64, 224, 208, 0.2)'
        },
        {
          x: [spikeTime, spikeTime],
          y: [Math.min(...spikePreview.waveform), Math.max(...spikePreview.waveform)],
          type: 'scatter',
          mode: 'lines',
          line: { color: 'rgba(255, 255, 255, 0.5)', width: 2, dash: 'dash' },
          hoverinfo: 'skip',
          showlegend: false
        }
      ],
      layout: {
        width: 300,
        height: 200,
        margin: { l: 40, r: 20, t: 30, b: 50 },
        paper_bgcolor: 'rgba(26, 26, 46, 0.95)',
        plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
        font: { color: '#e0e6ed', size: 10 },
        xaxis: {
          title: {
            text: 'Time (samples)',
            standoff: 15
          },
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          color: '#e0e6ed'
        },
        yaxis: {
          title: 'Amplitude',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          color: '#e0e6ed'
        },
        title: {
          text: `CH${spikePreview.channelId} - Point ${spikePreview.pointIndex}`,
          font: { size: 12, color: '#40e0d0' }
        },
        annotations: [{
          x: spikeTime,
          y: Math.max(...spikePreview.waveform),
          text: 'Spike',
          showarrow: false,
          yshift: 10,
          font: { color: 'rgba(255, 255, 255, 0.7)', size: 9 }
        }]
      },
      config: {
        displayModeBar: false,
        responsive: true
      }
    };
  };

  const generateOverlayPlot = () => {
    if (overlaySpikes.length === 0) return null;

    const traces = overlaySpikes.map((spike, idx) => {
      const window = spike.window || 10;
      const relativeTimePoints = Array.from(
        { length: spike.waveform.length },
        (_, i) => i - window
      );

      return {
        x: relativeTimePoints,
        y: spike.waveform,
        type: 'scatter',
        mode: 'lines',
        name: `Cluster ${spike.clusterIndex + 1} - CH${spike.channelId}`,
        line: { color: spike.color, width: 2 },
        hovertemplate: `<b>Cluster ${spike.clusterIndex + 1}</b><br>CH${spike.channelId} - Point ${spike.pointIndex}<br>Time: %{x}<br>Amplitude: %{y:.2f}<extra></extra>`
      };
    });

    const allAmplitudes = overlaySpikes.flatMap((s) => s.waveform);
    traces.push({
      x: [0, 0],
      y: [Math.min(...allAmplitudes), Math.max(...allAmplitudes)],
      type: 'scatter',
      mode: 'lines',
      line: { color: 'rgba(255, 255, 255, 0.3)', width: 2, dash: 'dash' },
      hoverinfo: 'skip',
      showlegend: false
    });

    return {
      data: traces,
      layout: {
        autosize: true,
        paper_bgcolor: 'rgba(26, 26, 46, 0.95)',
        plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
        font: { color: '#e0e6ed', size: 11 },
        xaxis: {
          title: 'Time Relative to Spike (samples)',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        yaxis: {
          title: 'Amplitude',
          gridcolor: 'rgba(64, 224, 208, 0.2)',
          zerolinecolor: 'rgba(64, 224, 208, 0.4)',
          color: '#e0e6ed'
        },
        hovermode: 'closest',
        showlegend: false,
        margin: { l: 60, r: 20, t: 20, b: 60 }
      },
      config: {
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['lasso2d', 'select2d']
      }
    };
  };

  const handleChannelChange = (clusterIndex, channelId) => {
    setSelectedChannels((prev) => ({
      ...prev,
      [clusterIndex]: parseInt(channelId)
    }));
  };

  const handleModeChange = (newMode) => {
    if (clusteringResults?.demo) {
      setMode('synthetic');
      return;
    }
    setMode(newMode);
    setOverlaySpikes([]);
  };

  const handleChannelMappingChange = (clusterId, channelId) => {
    setChannelMapping((prev) => ({
      ...prev,
      [clusterId]: parseInt(channelId) || null
    }));
  };

  const applyChannelMappings = () => {
    setShowChannelMappingModal(false);
    fetchClusterData();
  };

  if ((selectedAlgorithm === 'torchbci_jims' || selectedAlgorithm === 'kilosort4') && (!clusterData || !clusteringResults) && !clusteringResults?.demo) {
    const algorithmName = selectedAlgorithm === 'kilosort4' ? 'Kilosort4' : 'TorchBCI JimsAlgorithm';
    return (
      <div className="cluster-view">
        <div className="cluster-header">
          <h2>Spike Cluster Visualization</h2>
        </div>
        <div
          className="cluster-content"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            fontSize: '1.2rem',
            color: '#888'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p>No clustering results available</p>
            <p style={{ fontSize: '0.9rem', marginTop: '1rem' }}>
              Click the <strong>Run</strong> button in the header to run {algorithmName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cluster-view">
      <div className="cluster-header">
        <h2>Spike Cluster Visualization</h2>
        <div className="cluster-controls">
          <div className="filter-selector">
            <label>Mode:</label>
            <select
              className="filter-select"
              value={clusteringResults?.demo ? 'synthetic' : mode}
              onChange={(e) => handleModeChange(e.target.value)}
              disabled={!!clusteringResults?.demo}
            >
              <option value="synthetic">Synthetic (Demo)</option>
              <option value="real">Kilosort Data</option>
            </select>
          </div>
          <div className="filter-selector">
            <label>Filter Type:</label>
            <select
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="none">None (Raw Data)</option>
              <option value="highpass">High-pass (300 Hz)</option>
              <option value="lowpass">Low-pass (3000 Hz)</option>
              <option value="bandpass">Band-pass (300-3000 Hz)</option>
            </select>
          </div>
          {(clusteringResults?.demo || mode === 'synthetic') && (
            <div className="channel-selectors">
              {[0, 1, 2].map((clusterIdx) => (
                <div key={clusterIdx} className="cluster-channel-select">
                  <label style={{ color: ['#FF6B6B', '#4ECDC4', '#FFD700'][clusterIdx] }}>
                    Cluster {clusterIdx + 1} Channel:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="385"
                    value={selectedChannels[clusterIdx]}
                    onChange={(e) => handleChannelChange(clusterIdx, e.target.value)}
                    className="channel-input"
                  />
                </div>
              ))}
            </div>
          )}
          {!clusteringResults?.demo && mode === 'real' && (
            <button
              className="channel-mapping-btn"
              onClick={() => setShowChannelMappingModal(true)}
            >
              Configure Channel Mapping
            </button>
          )}
        </div>
      </div>

      <div className="cluster-content">
        <div className="cluster-plot-container">
          <Plot
            data={generatePlotData()}
            layout={{
              autosize: true,
              uirevision: 'true',
              paper_bgcolor: 'rgba(30, 30, 60, 0.6)',
              plot_bgcolor: 'rgba(0, 0, 0, 0.3)',
              font: { color: '#e0e6ed' },
              xaxis: {
                title: 'Principal Component 1',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              yaxis: {
                title: 'Principal Component 2',
                gridcolor: 'rgba(64, 224, 208, 0.2)',
                zerolinecolor: 'rgba(64, 224, 208, 0.4)',
                color: '#e0e6ed'
              },
              hovermode: 'closest',
              showlegend: true,
              legend: {
                x: 1,
                xanchor: 'right',
                y: 1,
                bgcolor: 'rgba(26, 26, 46, 0.8)',
                bordercolor: 'rgba(64, 224, 208, 0.3)',
                borderwidth: 1
              },
              margin: { l: 60, r: 20, t: 20, b: 60 }
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['lasso2d', 'select2d']
            }}
            style={{ width: '100%', height: '100%' }}
            onHover={handlePointHover}
            onUnhover={handlePointUnhover}
            onClick={handlePointClick}
          />
        </div>

        {overlaySpikes.length > 0 && (
          <div className="spike-overlay-container">
            <div className="overlay-header">
              <h3>Spike Overlay Comparison</h3>
              <div className="overlay-controls">
                <span className="spike-count">
                  {overlaySpikes.length} spike{overlaySpikes.length !== 1 ? 's' : ''}
                </span>
                <button className="clear-overlay-btn" onClick={clearOverlay}>
                  Clear All
                </button>
              </div>
            </div>

            <div className="overlay-plot">
              {isLoadingOverlay ? (
                <div className="overlay-loading">Loading spike...</div>
              ) : (
                <Plot
                  data={generateOverlayPlot().data}
                  layout={generateOverlayPlot().layout}
                  config={generateOverlayPlot().config}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>

            <div className="overlay-spike-list-compact">
              <h4>Selected Spikes:</h4>
              <div className="spike-list-items-compact">
                {overlaySpikes.map((spike, idx) => (
                  <div key={idx} className="spike-list-item-compact" style={{ borderLeftColor: spike.color }}>
                    <div className="spike-item-info-compact">
                      <span className="spike-item-label-compact">
                        Cluster {spike.clusterIndex + 1} - CH{spike.channelId}
                      </span>
                      <span className="spike-item-time-compact">
                        Point {spike.pointIndex} (t={spike.spikeTime})
                      </span>
                    </div>
                    <div className="spike-item-actions-compact">
                      <button
                        className="spike-item-nav-btn-compact"
                        onClick={() => handleNavigateToSpikeFromOverlay(spike)}
                        title="Navigate to spike"
                      >
                        →
                      </button>
                      <button
                        className="spike-item-remove-btn-compact"
                        onClick={() => removeSpikeFromOverlay(idx)}
                        title="Remove from overlay"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {hoveredPoint && (
          <div className={`spike-preview-panel ${overlaySpikes.length > 0 ? 'with-overlay' : ''}`}>
            <div className="preview-info">
              <h3>Spike Preview</h3>
              <p>Cluster {hoveredPoint.cluster + 1} - Point {hoveredPoint.index}</p>
              <p>Channel: {selectedChannels[hoveredPoint.cluster] || 181}</p>
              {spikePreview && <p>Time: {spikePreview.spikeTime} samples</p>}
              <p className="click-hint">Click: Add to overlay</p>
              <p className="click-hint">Double-click: Navigate to spike</p>
            </div>
            {isLoadingPreview ? (
              <div className="preview-loading">Loading...</div>
            ) : spikePreview && (
              <div className="preview-plot">
                <Plot
                  data={generatePreviewPlot().data}
                  layout={generatePreviewPlot().layout}
                  config={generatePreviewPlot().config}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showChannelMappingModal && mode === 'real' && clusterData && !clusteringResults?.demo && (
        <div className="channel-mapping-modal-overlay" onClick={() => setShowChannelMappingModal(false)}>
          <div className="channel-mapping-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Channel Mapping Configuration</h3>
              <button className="modal-close" onClick={() => setShowChannelMappingModal(false)}>×</button>
            </div>
            <div className="modal-info">
              <p>Assign neural channels to each cluster for spike preview and navigation.</p>
              <p className="modal-hint">{clusterData.numClusters} clusters found • Leave blank to use default channel 181</p>
            </div>
            <div className="channel-mapping-list">
              {clusterData.clusterIds && clusterData.clusterIds.map((clusterId) => {
                const cluster = clusterData.clusters.find((c) => c.clusterId === clusterId);
                const color = cluster ? `hsl(${(clusterId * 137) % 360}, 70%, 60%)` : '#888';
                return (
                  <div key={clusterId} className="channel-mapping-item">
                    <div className="cluster-info">
                      <div className="cluster-color-indicator" style={{ backgroundColor: color }}></div>
                      <span className="cluster-label">Cluster {clusterId}</span>
                      <span className="cluster-point-count">({cluster ? cluster.pointCount : 0} points)</span>
                    </div>
                    <div className="channel-input-container">
                      <label>Channel:</label>
                      <input
                        type="number"
                        min="1"
                        max="385"
                        placeholder="181"
                        value={channelMapping[clusterId] || ''}
                        onChange={(e) => handleChannelMappingChange(clusterId, e.target.value)}
                        className="channel-input-modal"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="modal-btn-secondary" onClick={() => setShowChannelMappingModal(false)}>
                Cancel
              </button>
              <button className="modal-btn-primary" onClick={applyChannelMappings}>
                Apply Mappings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusterView;