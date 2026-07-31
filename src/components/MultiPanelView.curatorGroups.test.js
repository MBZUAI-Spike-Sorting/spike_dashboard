import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import MultiPanelView from './MultiPanelView';
import { DEFAULT_DISPLAY_SETTINGS } from '../utils/displaySettings';

let mockCuratorWidgetProps = null;
let mockClusterListProps = null;

jest.mock('react-plotly.js', () => () => null);
jest.mock('./ClusterListTable', () => (props) => {
  mockClusterListProps = props;
  return null;
});
jest.mock('./SpikeListTable', () => () => null);
jest.mock('./ClusterStatisticsWindow', () => () => null);
jest.mock('./RightSideMenu', () => () => null);
jest.mock('./CanvasMinimap', () => () => null);
jest.mock('./CuratorWidget', () => (props) => {
  mockCuratorWidgetProps = props;
  return null;
});
jest.mock('./WidgetBank', () => ({
  __esModule: true,
  default: () => null,
  WIDGET_DEFINITIONS: {},
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const DISPLAY_SETTINGS_STORAGE_KEY = 'spikescope_display_settings:v1';

const createWidgetStates = () => ({
  clusterList: {
    visible: true,
    minimized: false,
    maximized: false,
    position: null,
    size: { width: 200, height: 160 },
    type: 'clusterList',
    groupNames: ['unsorted', 'mua', 'good'],
    clusterGroups: { 12: 'mua' },
  },
  spikeList: { visible: false },
  clusterStats: { visible: false },
  signalView: { visible: false },
  dimReduction: { visible: false },
  waveform: { visible: false },
  curator: {
    visible: true,
    minimized: false,
    maximized: false,
    position: null,
    size: { width: 500, height: 320 },
    type: 'curator',
  },
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
    id: 'curator-groups-test',
    name: 'Curator groups test',
    widgetStates: createWidgetStates(),
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
        savedCurrentViewId="curator-groups-test"
        layoutStorageScope="curator-groups-test"
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
      mockCuratorWidgetProps = null;
      mockClusterListProps = null;
    },
  };
};

test('restores curator groups from layout state and writes controlled edits back', () => {
  const dashboard = mountDashboard();

  expect(mockCuratorWidgetProps).not.toBeNull();
  expect(mockCuratorWidgetProps.clusterAnnotations).toEqual({
    12: { group: 'mua' },
  });

  act(() => {
    mockCuratorWidgetProps.onAnnotationChange(12, { group: 'good' });
  });

  expect(
    dashboard.dashboardRef.current
      .getWidgetPositionsAndSizes()
      .clusterList
      .clusterGroups
  ).toEqual({ 12: 'good' });
  expect(mockCuratorWidgetProps.clusterAnnotations[12].group).toBe('good');

  dashboard.unmount();
});

test('deleting a group reassigns its clusters and persists the remaining names', () => {
  const dashboard = mountDashboard();

  expect(mockClusterListProps.groups).toEqual(['unsorted', 'mua', 'good']);

  act(() => {
    mockClusterListProps.onGroupsChange(
      ['unsorted', 'good'],
      { deletedGroup: 'mua', replacementGroup: 'unsorted' }
    );
  });

  const clusterListState = dashboard.dashboardRef.current
    .getWidgetPositionsAndSizes()
    .clusterList;
  expect(clusterListState.groupNames).toEqual(['unsorted', 'good']);
  expect(clusterListState.clusterGroups).toEqual({ 12: 'unsorted' });
  expect(mockCuratorWidgetProps.clusterAnnotations[12].group).toBe('unsorted');

  dashboard.unmount();
});
