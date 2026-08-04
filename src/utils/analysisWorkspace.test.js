import {
  createAnalysisManifest,
  createManifestFilename,
  createNotebookSnippet,
} from './analysisWorkspace';

const manifest = createAnalysisManifest({
  exportedAt: '2026-08-04T12:00:00.000Z',
  apiBaseUrl: 'https://spikes.example',
  selectedDataset: { id: 9, name: 'Mouse A', secret: 'not exported' },
  selectedAlgorithm: 'kilosort4',
  datasetInfo: { totalChannels: 64, totalDataPoints: 120000 },
  clusters: [{ id: 3, size: 50 }],
  selectedClusters: [3],
  visibleClusterOrder: [3],
  clusterStats: { 3: { firingRateHz: 2.5 } },
  clusterAnnotations: { 3: { group: 'good' } },
  highlightedSpikes: [{ clusterId: 3, pointIndex: 4, time: 200 }],
  currentViewId: 'review',
  widgetStates: { signalView: { visible: true, order: 2, type: 'signalView' } },
  widgetInputBindings: { signalView: { signal: 'signalData' } },
  pipelineVariables: {
    signalData: {
      id: 'signalData', label: 'Signal', dataType: 'signal_trace', shape: '{ data }',
      isAvailable: true, isFormatValid: true, hasData: true, value: [1, 2, 3],
    },
  },
});

test('exports inspectable state and wiring without raw pipeline values or credentials', () => {
  expect(manifest).toMatchObject({
    schema: 'spikescope.analysis-session',
    application: { workspace: 'read_only', arbitraryCodeExecution: false },
    source: { dataset: { id: 9, name: 'Mouse A' }, algorithm: 'kilosort4' },
    selection: { clusterIds: [3] },
  });
  expect(manifest.source.dataset.secret).toBeUndefined();
  expect(manifest.dashboard.widgets[0].inputBindings).toEqual({ signal: 'signalData' });
  expect(manifest.dashboard.pipelineVariables[0].value).toBeUndefined();
  expect(manifest.provenance).toMatchObject({ credentialsExported: false, rawSignalExported: false });
});

test('creates a stable filename and copyable API notebook snippet', () => {
  expect(createManifestFilename(manifest)).toBe('spikescope-Mouse-A-2026-08-04.json');
  const snippet = createNotebookSnippet(manifest);
  expect(snippet).toContain('/api/cluster-statistics');
  expect(snippet).toContain('https://spikes.example');
  expect(snippet).not.toMatch(/\beval\s*\(|\bexec\s*\(/);
});
