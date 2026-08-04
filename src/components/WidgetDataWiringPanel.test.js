import {
  getSelectableWiringWidgetIds,
  resolveSelectedWiringWidgetId
} from './WidgetDataWiringPanel';
import {
  createDashboardPipelineVariables,
  createDefaultWidgetInputBindings,
  validateWidgetBindings,
} from '../widgets/dataContracts';

const widgetStates = {
  clusterList: { visible: true },
  correlogram: { visible: false },
  isiHistogram: { visible: false },
  unknownWidget: { visible: true }
};

test('hidden views remain selectable in Data Wiring', () => {
  expect(resolveSelectedWiringWidgetId('correlogram', widgetStates)).toBe(
    'correlogram'
  );
  expect(resolveSelectedWiringWidgetId('isiHistogram', widgetStates)).toBe(
    'isiHistogram'
  );
});

test('selection falls back only when the selected view is unavailable', () => {
  expect(getSelectableWiringWidgetIds(widgetStates)).toEqual([
    'clusterList',
    'correlogram',
    'isiHistogram'
  ]);
  expect(resolveSelectedWiringWidgetId('unknownWidget', widgetStates)).toBe(
    'clusterList'
  );
});

test('amplitude distribution is wired to selected clusters and waveforms by default', () => {
  const bindings = createDefaultWidgetInputBindings();
  const variables = createDashboardPipelineVariables({
    selectedClusters: [],
    clusterWaveforms: {},
  });

  expect(bindings.amplitudeProfile).toMatchObject({
    selectedClusters: 'selectedClusters',
    waveforms: 'clusterWaveforms',
  });
  expect(validateWidgetBindings(
    'amplitudeProfile',
    bindings.amplitudeProfile,
    variables
  ).valid).toBe(true);
});

test('analysis workspace exposes the current typed pipeline state', () => {
  const bindings = createDefaultWidgetInputBindings();

  expect(bindings.analysisWorkspace).toMatchObject({
    datasetInfo: 'datasetInfo',
    clusters: 'clusters',
    selectedClusters: 'selectedClusters',
    statistics: 'clusterStats',
    annotations: 'clusterAnnotations',
    spikeSelection: 'highlightedSpikes',
    timeRange: 'focusedTimeRange',
  });
});
