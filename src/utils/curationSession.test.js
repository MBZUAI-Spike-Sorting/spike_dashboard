import {
  createCurationExport,
  createCurationSession,
  createCurationSource,
  createCuratedDashboardData,
  deriveCurationState,
  mergeCurationClusters,
  redoCuration,
  restoreCurationSession,
  splitCurationSelection,
  undoCuration,
} from './curationSession';

const clusterData = {
  clusters: [
    {
      clusterId: 2,
      spikeTimes: [10, 20],
      spikeChannels: [1, 1],
      spikeAmplitudes: [4, 6],
      points: [[0, 0], [0.2, 0.3]],
      pointCount: 2,
    },
    {
      clusterId: 5,
      spikeTimes: [30, 40],
      spikeChannels: [2, 2],
      spikeAmplitudes: [8, 10],
      points: [[2, 2], [2.2, 2.3]],
      pointCount: 2,
    },
  ],
};

const source = createCurationSource({
  sourceKey: 'dataset-a:kilosort4',
  clusterData,
  clusterWaveforms: {
    2: [
      { spikeIndex: 0, timePoints: [-1, 0, 1], amplitude: [0, -2, 0] },
      { spikeIndex: 1, timePoints: [-1, 0, 1], amplitude: [0, -3, 0] },
    ],
    5: [
      { spikeIndex: 0, timePoints: [-1, 0, 1], amplitude: [0, -4, 0] },
      { spikeIndex: 1, timePoints: [-1, 0, 1], amplitude: [0, -5, 0] },
    ],
  },
  clusterAnnotations: {
    2: { group: 'good', label: 'A', note: 'keep' },
    5: { group: 'good', label: 'B', note: 'review' },
  },
});

test('creates stable original spike IDs and a versioned session', () => {
  const session = createCurationSession(source);
  expect(source.clusters[0].spikeIds).toEqual(['2:0', '2:1']);
  expect(source.spikesById['5:1']).toMatchObject({
    originalClusterId: 5, originalPointIndex: 1, timeSamples: 40,
  });
  expect(session).toMatchObject({ schemaVersion: 1, cursor: 0, revision: 0, nextClusterId: 6 });

  const changedMembership = createCurationSource({
    sourceKey: 'dataset-a:kilosort4',
    clusterData: {
      clusters: clusterData.clusters.map((cluster, index) => (
        index === 0 ? { ...cluster, spikeTimes: [10, 21] } : cluster
      )),
    },
  });
  expect(changedMembership.signature).not.toBe(source.signature);
});

test('merges selected clusters and preserves compatible metadata', () => {
  const merged = mergeCurationClusters(source, createCurationSession(source), [2, 5]);
  const state = deriveCurationState(source, merged);

  expect(state.clusters).toHaveLength(1);
  expect(state.clusters[0]).toMatchObject({
    id: 6,
    spikeIds: ['2:0', '2:1', '5:0', '5:1'],
    metadata: { group: 'good', label: 'Merged C2 + C5', note: 'keep\nreview' },
  });
});

test('splits only a complete exact-ID selection from one current cluster', () => {
  const session = createCurationSession(source);
  const split = splitCurationSelection(source, session, ['2:1']);
  const state = deriveCurationState(source, split);

  expect(state.clusters.find((cluster) => cluster.id === 2).spikeIds).toEqual(['2:0']);
  expect(state.clusters.find((cluster) => cluster.id === 6)).toMatchObject({
    spikeIds: ['2:1'],
    metadata: { group: 'good', label: 'A split', note: 'keep' },
  });
  expect(() => splitCurationSelection(source, session, ['2:0', '5:0'])).toThrow(/one current cluster/);
  expect(() => splitCurationSelection(source, session, ['missing'])).toThrow(/outside the loaded source/);
  expect(() => splitCurationSelection(source, session, ['2:0', '2:1'])).toThrow(/leave at least one/);
});

test('undo and redo replay deterministic history and branching truncates redo', () => {
  const merged = mergeCurationClusters(source, createCurationSession(source), [2, 5]);
  const undone = undoCuration(merged);
  const redone = redoCuration(undone);

  expect(deriveCurationState(source, undone).clusters.map((cluster) => cluster.id)).toEqual([2, 5]);
  expect(deriveCurationState(source, redone)).toEqual(deriveCurationState(source, merged));

  const branched = splitCurationSelection(source, undone, ['2:0']);
  expect(branched.operations).toHaveLength(1);
  expect(branched.operations[0].type).toBe('split');
  expect(redoCuration(branched)).toBe(branched);
});

test('invalid persisted history recovers to a clean compatible session', () => {
  const restored = restoreCurationSession(JSON.stringify({
    ...createCurationSession(source),
    sourceSignature: 'another-dataset',
  }), source);

  expect(restored.recovered).toBe(false);
  expect(restored.error).toMatch(/incompatible|match/);
  expect(restored.session.operations).toEqual([]);
});

test('restore validates undone operations before they can be replayed', () => {
  const merged = mergeCurationClusters(source, createCurationSession(source), [2, 5]);
  const corrupted = {
    ...undoCuration(merged),
    operations: [{ ...merged.operations[0], clusterIds: [2, 99] }],
  };
  const restored = restoreCurationSession(JSON.stringify(corrupted), source);

  expect(restored.recovered).toBe(false);
  expect(restored.error).toMatch(/unavailable/);
  expect(restored.session.operations).toEqual([]);
});

test('curated dashboard data drives linked clusters without changing the source', () => {
  const session = mergeCurationClusters(source, createCurationSession(source), [2, 5]);
  const dashboard = createCuratedDashboardData(source, session, {}, {
    sampleRateHz: 1000,
    totalDataPoints: 100,
  });

  expect(dashboard.clusterData.clusterIds).toEqual([6]);
  expect(dashboard.clusterData.clusters[0].spikeIds).toEqual(['2:0', '2:1', '5:0', '5:1']);
  expect(dashboard.clusterWaveforms['6']).toHaveLength(4);
  expect(dashboard.clusterWaveforms['6'][2]).toMatchObject({ spikeId: '5:0', spikeIndex: 0 });
  expect(dashboard.clusterStats['6']).toMatchObject({ numSpikes: 4, meanAmplitude: 7 });
  expect(source.clusters.map((cluster) => cluster.id)).toEqual([2, 5]);
});

test('non-destructive export contains original and curated assignments', () => {
  const session = splitCurationSelection(source, createCurationSession(source), ['2:1']);
  const payload = createCurationExport({
    source,
    session,
    dataset: { id: 'dataset-a' },
    algorithm: 'kilosort4',
    exportedAt: '2026-08-04T12:00:00.000Z',
  });
  const moved = payload.assignments.find((assignment) => assignment.spikeId === '2:1');

  expect(payload).toMatchObject({ nonDestructive: true, rawSorterInputsModified: false });
  expect(moved).toMatchObject({ originalClusterId: 2, curatedClusterId: 6 });
});
