export const demoDatasets = [
  {
    id: 'synthetic-demo-1',
    name: 'synthetic_demo_recording',
    size: 0,
    sizeFormatted: 'Synthetic'
  }
];

function makeCluster(cx, cy, count, spreadX, spreadY, clusterId) {
  return Array.from({ length: count }, () => ({
    x: cx + (Math.random() - 0.5) * spreadX,
    y: cy + (Math.random() - 0.5) * spreadY,
    clusterId
  }));
}

export const demoClusterPlotData = [
  ...makeCluster(2.0, 0.42, 120, 0.85, 0.28, 1),
  ...makeCluster(1.05, -0.78, 55, 0.45, 0.22, 2),
  ...makeCluster(2.45, 0.52, 24, 0.25, 0.16, 3),
  ...makeCluster(-0.1, -0.9, 82, 0.75, 0.78, 4),
  ...makeCluster(1.15, -0.75, 45, 0.42, 0.22, 5),
  ...makeCluster(0.7, -0.55, 20, 0.2, 0.16, 6),
  ...makeCluster(1.85, 0.18, 18, 0.45, 0.3, 7),
  ...makeCluster(2.4, 0.48, 15, 0.18, 0.12, 8),

  ...Array.from({ length: 18 }, (_, i) => ({
    x: -1.08 + i * 0.01,
    y: 0.18 - i * 0.004,
    clusterId: 4
  }))
];

export const demoSpikeTable = [
  { spikeTime: 12.4, assignedClusterId: 1 },
  { spikeTime: 13.1, assignedClusterId: 2 },
  { spikeTime: 14.7, assignedClusterId: 1 },
  { spikeTime: 15.2, assignedClusterId: 3 },
  { spikeTime: 16.8, assignedClusterId: 4 },
  { spikeTime: 17.5, assignedClusterId: 5 }
];

export const demoClusterStats = [
  { clusterId: 1, count: 120, meanAmplitude: 0.82 },
  { clusterId: 2, count: 55, meanAmplitude: 0.74 },
  { clusterId: 3, count: 24, meanAmplitude: 0.69 }
];

export const demoWaveforms = {
  1: Array.from({ length: 60 }, (_, i) => Math.sin(i / 8) * 0.85),
  2: Array.from({ length: 60 }, (_, i) => Math.cos(i / 7) * 0.65),
  3: Array.from({ length: 60 }, (_, i) => Math.sin(i / 6) * 0.95)
};



export const demoSettings = {
  view: 'Cluster View',
  mode: 'Synthetic (Demo)',
  filterType: 'High-pass (300 Hz)',
  cluster1Channel: 179,
  cluster2Channel: 181,
  cluster3Channel: 183
};
const generateSignal = (length = 4000, phase = 0, spikePositions = []) => {
  const values = [];
  const filteredValues = [];
  const isSpike = Array(length).fill(false);
  const spikePeaks = [];

  for (let i = 0; i < length; i++) {
    const base =
      0.8 * Math.sin((i + phase) * 0.02) +
      0.35 * Math.sin((i + phase) * 0.055) +
      0.15 * Math.cos((i + phase) * 0.11);

    const noise =
      0.08 * Math.sin(i * 0.37 + phase) +
      0.04 * Math.cos(i * 0.19 + phase);

    let value = base + noise;

    if (spikePositions.includes(i)) {
      value -= 2.8;
      isSpike[i] = true;
      spikePeaks.push(i);
    } else if (spikePositions.includes(i - 1) || spikePositions.includes(i + 1)) {
      value -= 1.2;
    }

    values.push(value);
    filteredValues.push(value * 1.1);
  }

  return {
    data: values,
    filteredData: filteredValues,
    isSpike,
    spikePeaks,
    startTime: 0,
    endTime: length
  };
};

export const demoSignalData = {
  traces: [
    {
      channel: 179,
      ...generateSignal(4000, 0, [220, 640, 1180, 1760, 2480, 3220])
    },
    {
      channel: 181,
      ...generateSignal(4000, 40, [260, 700, 1260, 1830, 2550, 3300])
    },
    {
      channel: 183,
      ...generateSignal(4000, 80, [300, 760, 1320, 1900, 2620, 3380])
    }
  ]
};