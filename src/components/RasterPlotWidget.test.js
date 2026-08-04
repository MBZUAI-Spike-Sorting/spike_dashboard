import {
  buildRasterEvents,
  isAdditiveClusterSelection,
  panTimeDomain,
  zoomTimeDomain,
} from './RasterPlotWidget';

const fullDomain = { start: 0, end: 1000 };

test('zooms around the pointer position on the time axis', () => {
  expect(zoomTimeDomain(fullDomain, fullDomain, 0.5, 0.25)).toEqual({
    start: 125,
    end: 625
  });
});

test('keeps zoomed time windows inside the recording bounds', () => {
  expect(zoomTimeDomain({ start: 0, end: 200 }, fullDomain, 0.5, 0)).toEqual({
    start: 0,
    end: 100
  });
  expect(zoomTimeDomain({ start: 800, end: 1000 }, fullDomain, 0.5, 1)).toEqual({
    start: 900,
    end: 1000
  });
});

test('pans a zoomed time window and clamps at either recording edge', () => {
  expect(panTimeDomain({ start: 300, end: 500 }, fullDomain, 100)).toEqual({
    start: 400,
    end: 600
  });
  expect(panTimeDomain({ start: 800, end: 1000 }, fullDomain, 500)).toEqual({
    start: 800,
    end: 1000
  });
  expect(panTimeDomain({ start: 0, end: 200 }, fullDomain, -500)).toEqual({
    start: 0,
    end: 200
  });
});

test('returns to the full domain when zooming all the way out', () => {
  expect(zoomTimeDomain({ start: 250, end: 750 }, fullDomain, 2)).toBeNull();
});

test('does not activate the visible-cluster filter before the table publishes it', () => {
  const events = buildRasterEvents({
    spikes: [],
    selectedClusters: [12],
    visibleClusterIds: null,
    clusterData: {
      clusters: [{ clusterId: 12, spikeTimes: [100, 200] }],
    },
  });

  expect(events.map((event) => event.clusterId)).toEqual([12, 12]);
});

test('an intentionally empty table filter produces an empty raster', () => {
  const events = buildRasterEvents({
    selectedClusters: [12],
    visibleClusterIds: [],
    clusterData: {
      clusters: [{ clusterId: 12, spikeTimes: [100, 200] }],
    },
  });

  expect(events).toEqual([]);
});

test('uses complete cluster data so IDs above the spike preview range remain visible', () => {
  const events = buildRasterEvents({
    spikes: [
      { time: 10, clusterId: 0 },
      { time: 20, clusterId: 1 },
    ],
    selectedClusters: [],
    visibleClusterIds: null,
    clusterData: {
      clusters: [
        { clusterId: 0, spikeTimes: [10] },
        { clusterId: 8, spikeTimes: [20] },
        { clusterId: 16, spikeTimes: [30] },
      ],
    },
  });

  expect(events.map((event) => event.clusterId)).toEqual([0, 8, 16]);
});

test('selected-only mode overrides the visible cluster list', () => {
  const events = buildRasterEvents({
    spikes: [],
    selectedClusters: [0, 2, 3, 6, 16],
    visibleClusterIds: [0, 1, 2, 3, 4, 5, 6, 7, 16],
    selectedOnly: true,
    clusterData: {
      clusters: [
        { clusterId: 0, spikeTimes: [10] },
        { clusterId: 1, spikeTimes: [20] },
        { clusterId: 2, spikeTimes: [30] },
        { clusterId: 3, spikeTimes: [40] },
        { clusterId: 6, spikeTimes: [50] },
        { clusterId: 7, spikeTimes: [60] },
        { clusterId: 16, spikeTimes: [70] },
      ],
    },
  });

  expect(events.map((event) => event.clusterId)).toEqual([0, 2, 3, 6, 16]);
});

test('selected-only mode can intentionally produce an empty raster', () => {
  const events = buildRasterEvents({
    selectedClusters: [],
    visibleClusterIds: [0, 1],
    selectedOnly: true,
    clusterData: {
      clusters: [
        { clusterId: 0, spikeTimes: [10] },
        { clusterId: 1, spikeTimes: [20] },
      ],
    },
  });

  expect(events).toEqual([]);
});

test('recognizes standard additive-selection modifiers for raster clicks', () => {
  expect(isAdditiveClusterSelection({ ctrlKey: true })).toBe(true);
  expect(isAdditiveClusterSelection({ metaKey: true })).toBe(true);
  expect(isAdditiveClusterSelection({ shiftKey: true })).toBe(true);
  expect(isAdditiveClusterSelection({})).toBe(false);
});
