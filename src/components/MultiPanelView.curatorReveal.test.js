import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import MultiPanelView, {
  CURATOR_LINKED_WIDGET_IDS,
  revealCuratorLinkedWidgets,
} from './MultiPanelView';
import { DEFAULT_DISPLAY_SETTINGS } from '../utils/displaySettings';

jest.mock('react-plotly.js', () => () => null);
jest.mock('./ClusterListTable', () => () => null);
jest.mock('./SpikeListTable', () => () => null);
jest.mock('./ClusterStatisticsWindow', () => () => null);
jest.mock('./SignalViewPanel', () => () => null);
jest.mock('./WaveformSingleChannelView', () => () => null);
jest.mock('./WaveformNeighboringChannelsView', () => () => null);
jest.mock('./AmplitudeProfileWidget', () => () => null);
jest.mock('./RasterPlotWidget', () => () => null);
jest.mock('./RightSideMenu', () => () => null);
jest.mock('./CanvasMinimap', () => () => null);
jest.mock('./WidgetBank', () => ({
  __esModule: true,
  default: () => null,
  WIDGET_DEFINITIONS: {},
}));
jest.mock('./CuratorWidget', () => {
  const ReactModule = require('react');
  return ({ onClusterSelect, selectedClusters }) => ReactModule.createElement(
    'div',
    { 'data-testid': 'curator-selection', 'data-selected': selectedClusters.join(',') },
    [42, 43].map((clusterId) => ReactModule.createElement(
      'button',
      {
        key: clusterId,
        type: 'button',
        'aria-label': `Select curator cluster ${clusterId}`,
        onClick: () => onClusterSelect({ id: clusterId }),
      },
      `Cluster ${clusterId}`
    ))
  );
});

global.IS_REACT_ACT_ENVIRONMENT = true;

const DISPLAY_SETTINGS_STORAGE_KEY = 'spikescope_display_settings:v1';

const createHiddenLinkedWidgetStates = () => ({
  clusterList: { visible: false, minimized: false, maximized: false, order: 1 },
  spikeList: { visible: false, minimized: false, maximized: false, order: 2 },
  clusterStats: { visible: false, minimized: false, maximized: false, order: 3 },
  signalView: { visible: false, minimized: false, maximized: false, order: 4 },
  dimReduction: { visible: false, minimized: false, maximized: false, order: 5 },
  waveform: { visible: false, minimized: false, maximized: false, order: 6 },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7 },
  curator: { visible: true, minimized: false, maximized: false, order: 9 },
  rasterPlot: { visible: false, minimized: false, maximized: false, order: 10 },
});

const mountDashboard = () => {
  localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify({
    ...DEFAULT_DISPLAY_SETTINGS,
    scale: 1,
  }));

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const dashboardRef = createRef();
  const savedViews = [{
    id: 'curator-reveal-test',
    name: 'Curator reveal test',
    widgetStates: createHiddenLinkedWidgetStates(),
  }];

  act(() => {
    root.render(
      <MultiPanelView
        ref={dashboardRef}
        demoMode
        demoClusterPlotData={[]}
        demoSpikeTable={[]}
        demoClusterStats={[]}
        demoWaveforms={{}}
        savedViews={savedViews}
        savedCurrentViewId="curator-reveal-test"
        layoutStorageScope="curator-reveal-test"
      />
    );
  });

  return {
    dashboardRef,
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
      localStorage.clear();
    },
  };
};

test('reveals every linked diagnostic without changing unrelated widget objects', () => {
  const states = {
    clusterStats: { visible: false, minimized: false, maximized: false, order: 3 },
    signalView: { visible: true, minimized: true, maximized: false, order: 4 },
    waveform: { visible: true, minimized: false, maximized: false, order: 6 },
    curator: { visible: true, minimized: false, maximized: false, order: 9 },
  };

  const revealed = revealCuratorLinkedWidgets(states);

  CURATOR_LINKED_WIDGET_IDS.forEach((widgetId) => {
    expect(revealed[widgetId]).toEqual(expect.objectContaining({
      visible: true,
      minimized: false,
    }));
  });
  expect(revealed.curator).toBe(states.curator);
  expect(revealed.waveform).toBe(states.waveform);
});

test('keeps state identity when all linked diagnostics are already open', () => {
  const states = Object.fromEntries(CURATOR_LINKED_WIDGET_IDS.map((widgetId, order) => [
    widgetId,
    { visible: true, minimized: false, maximized: false, order },
  ]));

  expect(revealCuratorLinkedWidgets(states)).toBe(states);
});

test('opens linked widgets and continues updating selection from Curator clicks', () => {
  const dashboard = mountDashboard();

  act(() => {
    dashboard.host.querySelector('[aria-label="Select curator cluster 42"]').click();
  });
  CURATOR_LINKED_WIDGET_IDS.forEach((widgetId) => {
    expect(
      dashboard.host.querySelector(`[data-widget-panel-id="${widgetId}"]`)
    ).not.toBeNull();
  });
  expect(
    dashboard.host.querySelector('[data-testid="curator-selection"]').dataset.selected
  ).toBe('42');

  act(() => {
    dashboard.host.querySelector('[aria-label="Select curator cluster 43"]').click();
  });
  expect(
    dashboard.host.querySelector('[data-testid="curator-selection"]').dataset.selected
  ).toBe('43');

  dashboard.unmount();
});
