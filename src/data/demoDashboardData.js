export const demoDatasets = [
  {
    id: 'synthetic-demo-1',
    name: 'synthetic_demo_recording',
    size: 0,
    sizeFormatted: 'Synthetic'
  }
];

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// Box-Muller transform for more realistic Gaussian-looking clusters
function gaussian(rand) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Rotated elliptical cluster
function makeEllipticalCluster({
  cx,
  cy,
  count,
  sx,
  sy,
  angleDeg,
  clusterId,
  seed
}) {
  const rand = seededRandom(seed);
  const angle = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  return Array.from({ length: count }, () => {
    const gx = gaussian(rand) * sx;
    const gy = gaussian(rand) * sy;

    const rx = gx * cosA - gy * sinA;
    const ry = gx * sinA + gy * cosA;

    return {
      x: cx + rx,
      y: cy + ry,
      clusterId
    };
  });
}

// Small outlier cloud around a cluster
function makeOutliers({
  cx,
  cy,
  count,
  radiusX,
  radiusY,
  clusterId,
  seed
}) {
  const rand = seededRandom(seed);

  return Array.from({ length: count }, () => ({
    x: cx + (rand() - 0.5) * radiusX,
    y: cy + (rand() - 0.5) * radiusY,
    clusterId
  }));
}

export const demoClusterPlotData = [
  // Compact upper-right cluster
  ...makeEllipticalCluster({
    cx: 2.55,
    cy: 0.82,
    count: 180,
    sx: 0.10,
    sy: 0.07,
    angleDeg: 10,
    clusterId: 1,
    seed: 101
  }),

  // Long green cluster, but blob-like not wedge-like
  ...makeEllipticalCluster({
    cx: 1.95,
    cy: 0.38,
    count: 220,
    sx: 0.32,
    sy: 0.12,
    angleDeg: 8,
    clusterId: 2,
    seed: 202
  }),

  // Lower middle cluster
  ...makeEllipticalCluster({
    cx: 1.05,
    cy: -0.78,
    count: 120,
    sx: 0.18,
    sy: 0.10,
    angleDeg: -18,
    clusterId: 3,
    seed: 303
  }),

  // Lower-left dense cluster
  ...makeEllipticalCluster({
    cx: -0.08,
    cy: -1.02,
    count: 170,
    sx: 0.18,
    sy: 0.20,
    angleDeg: -10,
    clusterId: 4,
    seed: 404
  }),

  // Slightly overlapping neighboring cluster
  ...makeEllipticalCluster({
    cx: 0.78,
    cy: -0.58,
    count: 70,
    sx: 0.10,
    sy: 0.08,
    angleDeg: 22,
    clusterId: 5,
    seed: 505
  }),

  // Small sparse cluster
  ...makeEllipticalCluster({
    cx: 2.32,
    cy: 0.50,
    count: 40,
    sx: 0.08,
    sy: 0.06,
    angleDeg: 0,
    clusterId: 6,
    seed: 606
  }),

  // Outliers to make it feel more real
  ...makeOutliers({
    cx: 1.9,
    cy: 0.35,
    count: 12,
    radiusX: 0.9,
    radiusY: 0.45,
    clusterId: 2,
    seed: 707
  }),

  ...makeOutliers({
    cx: 0.95,
    cy: -0.75,
    count: 10,
    radiusX: 0.45,
    radiusY: 0.28,
    clusterId: 3,
    seed: 808
  }),

  ...makeOutliers({
    cx: -0.08,
    cy: -1.00,
    count: 10,
    radiusX: 0.55,
    radiusY: 0.45,
    clusterId: 4,
    seed: 909
  })
];
export const demoSpikeTable = [
  { spikeTime: 12.4, assignedClusterId: 1 },
  { spikeTime: 13.1, assignedClusterId: 2 },
  { spikeTime: 14.7, assignedClusterId: 1 },
  { spikeTime: 15.2, assignedClusterId: 3 },
  { spikeTime: 16.8, assignedClusterId: 4 },
  { spikeTime: 17.5, assignedClusterId: 5 },
  { spikeTime: 18.0, assignedClusterId: 2 },
  { spikeTime: 18.6, assignedClusterId: 3 },
  { spikeTime: 19.1, assignedClusterId: 6 },
  { spikeTime: 20.5, assignedClusterId: 1 },
  { spikeTime: 21.2, assignedClusterId: 2 },
  { spikeTime: 21.9, assignedClusterId: 4 },
  { spikeTime: 22.7, assignedClusterId: 3 },
  { spikeTime: 23.6, assignedClusterId: 5 },
  { spikeTime: 24.4, assignedClusterId: 2 },
  { spikeTime: 25.0, assignedClusterId: 4 }
];
export const demoClusterStats = [
  { clusterId: 1, count: 180, meanAmplitude: 0.92 },
  { clusterId: 2, count: 232, meanAmplitude: 0.84 },
  { clusterId: 3, count: 130, meanAmplitude: 0.78 },
  { clusterId: 4, count: 180, meanAmplitude: 0.88 },
  { clusterId: 5, count: 70, meanAmplitude: 0.73 },
  { clusterId: 6, count: 40, meanAmplitude: 0.69 }
];
const makeTimePoints = (length = 60) =>
  Array.from({ length }, (_, i) => i * 0.05);

const makeWaveformTemplate = (length, fn) =>
  Array.from({ length }, (_, i) => fn(i));

const jitterAmplitude = (base, seedOffset = 0) => {
  return base.map((v, i) => {
    const jitter =
      0.03 * Math.sin((i + 1) * (0.35 + seedOffset * 0.01)) +
      0.015 * Math.cos((i + 1) * (0.22 + seedOffset * 0.015));
    return v + jitter;
  });
};

const makeWaveformObjects = (baseAmplitude, count = 24) => {
  const timePoints = makeTimePoints(baseAmplitude.length);
  return Array.from({ length: count }, (_, idx) => ({
    timePoints,
    amplitude: jitterAmplitude(baseAmplitude, idx + 1)
  }));
};

const waveformBase1 = makeWaveformTemplate(
  60,
  (i) => Math.sin(i / 8) * 0.95 - Math.exp(-((i - 20) ** 2) / 80) * 0.35
);

const waveformBase2 = makeWaveformTemplate(
  60,
  (i) => Math.cos(i / 7) * 0.72 - Math.exp(-((i - 24) ** 2) / 90) * 0.28
);

const waveformBase3 = makeWaveformTemplate(
  60,
  (i) => Math.sin(i / 6) * 1.02 - Math.exp(-((i - 18) ** 2) / 70) * 0.42
);

const waveformBase4 = makeWaveformTemplate(
  60,
  (i) => Math.cos(i / 9) * 0.85 - Math.exp(-((i - 27) ** 2) / 120) * 0.31
);

const waveformBase5 = makeWaveformTemplate(
  60,
  (i) => Math.sin(i / 7.5) * 0.76 - Math.exp(-((i - 22) ** 2) / 95) * 0.24
);

const waveformBase6 = makeWaveformTemplate(
  60,
  (i) => Math.cos(i / 8.5) * 0.69 - Math.exp(-((i - 19) ** 2) / 75) * 0.22
);

const waveformBase7 = makeWaveformTemplate(
  60,
  (i) => Math.sin(i / 7.2) * 0.81 - Math.exp(-((i - 23) ** 2) / 88) * 0.26
);

const waveformBase8 = makeWaveformTemplate(
  60,
  (i) => Math.cos(i / 6.8) * 0.64 - Math.exp(-((i - 20) ** 2) / 68) * 0.20
);

export const demoWaveforms = {
  1: makeWaveformObjects(waveformBase1, 28),
  2: makeWaveformObjects(waveformBase2, 24),
  3: makeWaveformObjects(waveformBase3, 22),
  4: makeWaveformObjects(waveformBase4, 26),
  5: makeWaveformObjects(waveformBase5, 20),
  6: makeWaveformObjects(waveformBase6, 18)
};

export const demoSettings = {
  view: 'Multi-Widget View',
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
    } else if (
      spikePositions.includes(i - 1) ||
      spikePositions.includes(i + 1)
    ) {
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

const deterministicSpikePositions = (channelId, length) => {
  const positions = [];
  let seed = ((channelId * 9301 + 49297) % 233280) || 17;
  let t = 200 + (seed % 200);

  while (t < length - 50) {
    positions.push(t);
    seed = (seed * 9301 + 49297) % 233280;
    t += 360 + (seed % 220);
  }

  return positions;
};

export const synthesizeChannelTrace = (channelId, length = 4000) => {
  const phase = (channelId * 17) % 360;
  const spikePositions = deterministicSpikePositions(channelId, length);
  return {
    channel: channelId,
    ...generateSignal(length, phase, spikePositions)
  };
};

export const applyDemoFilter = (values, filterType) => {
  if (!values || values.length === 0) return [];
  if (!filterType || filterType === 'none') return values.slice();

  const out = new Array(values.length).fill(0);

  if (filterType === 'highpass') {
    const alpha = 0.92;
    let prevIn = values[0];
    let prevOut = 0;

    for (let i = 0; i < values.length; i++) {
      const y = alpha * (prevOut + values[i] - prevIn);
      out[i] = y;
      prevIn = values[i];
      prevOut = y;
    }
    return out;
  }

  if (filterType === 'lowpass') {
    const alpha = 0.18;
    let prev = values[0];

    for (let i = 0; i < values.length; i++) {
      prev = prev + alpha * (values[i] - prev);
      out[i] = prev;
    }
    return out;
  }

  return applyDemoFilter(
    applyDemoFilter(values, 'highpass'),
    'lowpass'
  );
};