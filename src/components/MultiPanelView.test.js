import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import MultiPanelView from './MultiPanelView';
import { DEFAULT_DISPLAY_SETTINGS } from '../utils/displaySettings';

jest.mock('react-plotly.js', () => () => null);
jest.mock('./ClusterListTable', () => ({
  __esModule: true,
  default: () => null,
  DEFAULT_CLUSTER_GROUPS: ['unsorted', 'good', 'mua', 'noise'],
  normalizeClusterGroups: (groups = []) => groups,
}));
jest.mock('./SpikeListTable', () => () => null);
jest.mock('./ClusterStatisticsWindow', () => () => null);
jest.mock('./RightSideMenu', () => {
  const React = require('react');
  return ({ onOpenChange }) => React.createElement(
    'div',
    null,
    React.createElement('button', {
      className: 'mock-right-menu-open',
      onClick: () => onOpenChange?.(true),
    }),
    React.createElement('button', {
      className: 'mock-right-menu-close',
      onClick: () => onOpenChange?.(false),
    })
  );
});
jest.mock('./CanvasMinimap', () => {
  const React = require('react');
  return () => React.createElement('div', { className: 'mock-canvas-minimap' });
});
jest.mock('./WidgetBank', () => ({
  __esModule: true,
  default: () => null,
  WIDGET_DEFINITIONS: {},
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const DISPLAY_SETTINGS_STORAGE_KEY = 'spikescope_display_settings:v1';
const EMPTY_LIST = [];
const EMPTY_MAP = {};

const createWidgetStates = () => ({
  clusterList: {
    visible: true,
    minimized: false,
    maximized: false,
    position: null,
    size: { width: 200, height: 160 },
    type: 'clusterList',
  },
  spikeList: {
    visible: true,
    minimized: false,
    maximized: false,
    position: null,
    size: { width: 200, height: 160 },
    type: 'spikeList',
  },
  clusterStats: {
    visible: true,
    minimized: false,
    maximized: false,
    position: null,
    size: { width: 200, height: 160 },
    type: 'clusterStats',
  },
  signalView: { visible: false },
  dimReduction: { visible: false },
  waveform: { visible: false },
});

const mountDashboard = () => {
  localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify({
    ...DEFAULT_DISPLAY_SETTINGS,
    scale: 0.5,
  }));

  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const dashboardRef = createRef();
  const savedViews = [{
    id: 'interaction-test',
    name: 'Interaction test',
    widgetStates: createWidgetStates(),
  }];

  act(() => {
    root.render(
      <MultiPanelView
        ref={dashboardRef}
        demoMode
        demoClusterPlotData={EMPTY_LIST}
        demoSpikeTable={EMPTY_LIST}
        demoClusterStats={EMPTY_LIST}
        demoWaveforms={EMPTY_MAP}
        savedViews={savedViews}
        savedCurrentViewId="interaction-test"
        layoutStorageScope="interaction-test"
      />
    );
  });

  return {
    dashboardRef,
    host,
    root,
    unmount() {
      act(() => root.unmount());
      host.remove();
      localStorage.clear();
    },
  };
};

const widget = (host, widgetId) => (
  host.querySelector(`[data-widget-id="${widgetId}"]`)
);

const panel = (host, widgetId) => (
  host.querySelector(`[data-widget-panel-id="${widgetId}"]`)
);

const mouseDownHeader = (host, widgetId, options = {}) => {
  widget(host, widgetId).querySelector('.widget-header').dispatchEvent(
    new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 100,
      ...options,
    })
  );
};

test('moves a selected widget group from measured CSS positions and commits every member', () => {
  const dashboard = mountDashboard();
  const origins = {
    clusterList: { left: 40, top: 30 },
    spikeList: { left: 240, top: 130 },
    clusterStats: { left: 440, top: 230 },
  };
  const originalGetComputedStyle = window.getComputedStyle;
  const computedStyleSpy = jest.spyOn(window, 'getComputedStyle').mockImplementation(
    (element) => {
      const widgetId = element.dataset?.widgetPanelId;
      if (origins[widgetId]) {
        return {
          left: `${origins[widgetId].left}px`,
          top: `${origins[widgetId].top}px`,
        };
      }
      return originalGetComputedStyle(element);
    }
  );

  act(() => {
    mouseDownHeader(dashboard.host, 'clusterList', { ctrlKey: true });
    mouseDownHeader(dashboard.host, 'spikeList', { metaKey: true });
  });
  expect(widget(dashboard.host, 'clusterList').dataset.widgetSelected).toBe('true');
  expect(widget(dashboard.host, 'spikeList').dataset.widgetSelected).toBe('true');

  // A click without pointer travel collapses the selection without freezing
  // responsive CSS positions into the saved layout.
  act(() => {
    mouseDownHeader(dashboard.host, 'clusterList');
    document.dispatchEvent(new MouseEvent('mouseup', {
      clientX: 100,
      clientY: 100,
    }));
  });
  expect(widget(dashboard.host, 'clusterList').dataset.widgetSelected).toBe('true');
  expect(widget(dashboard.host, 'spikeList').dataset.widgetSelected).toBe('false');
  expect(dashboard.dashboardRef.current.getWidgetPositionsAndSizes().clusterList.position).toBeNull();
  expect(dashboard.dashboardRef.current.getWidgetPositionsAndSizes().spikeList.position).toBeNull();

  act(() => {
    mouseDownHeader(dashboard.host, 'spikeList', { ctrlKey: true });
    mouseDownHeader(dashboard.host, 'clusterList');
    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 140,
      clientY: 125,
    }));
  });

  expect(panel(dashboard.host, 'clusterList').style.left).toBe('120px');
  expect(panel(dashboard.host, 'clusterList').style.top).toBe('80px');
  expect(panel(dashboard.host, 'spikeList').style.left).toBe('320px');
  expect(panel(dashboard.host, 'spikeList').style.top).toBe('180px');
  expect(panel(dashboard.host, 'clusterStats').style.left).toBe('');
  expect(panel(dashboard.host, 'clusterStats').style.top).toBe('');

  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup', {
      clientX: 140,
      clientY: 125,
    }));
  });

  const states = dashboard.dashboardRef.current.getWidgetPositionsAndSizes();
  expect(states.clusterList.position).toEqual({ left: 120, top: 80 });
  expect(states.spikeList.position).toEqual({ left: 320, top: 180 });
  expect(states.clusterStats.position).toBeNull();

  computedStyleSpy.mockRestore();
  dashboard.unmount();
});

test('marquee-selects intersecting widgets without panning the canvas', () => {
  const dashboard = mountDashboard();
  const dashboardRoot = dashboard.host.querySelector('.multi-panel-view');
  const dashboardCanvas = dashboard.host.querySelector('.dashboard-canvas');
  dashboardRoot.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
  });

  const rects = {
    clusterList: { left: 50, top: 50, right: 150, bottom: 140 },
    spikeList: { left: 220, top: 120, right: 320, bottom: 210 },
    clusterStats: { left: 500, top: 320, right: 620, bottom: 430 },
  };
  Object.entries(rects).forEach(([widgetId, rect]) => {
    widget(dashboard.host, widgetId).getBoundingClientRect = () => ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
    });
  });
  const initialTransform = dashboardCanvas.style.transform;

  act(() => {
    dashboardRoot.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: 20,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 350,
      clientY: 240,
    }));
  });
  expect(dashboard.host.querySelector('.widget-selection-box')).not.toBeNull();

  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup', {
      clientX: 350,
      clientY: 240,
    }));
  });

  expect(widget(dashboard.host, 'clusterList').dataset.widgetSelected).toBe('true');
  expect(widget(dashboard.host, 'spikeList').dataset.widgetSelected).toBe('true');
  expect(widget(dashboard.host, 'clusterStats').dataset.widgetSelected).toBe('false');
  expect(dashboardCanvas.style.transform).toBe(initialTransform);
  expect(dashboard.host.querySelector('.widget-selection-box')).toBeNull();

  dashboard.unmount();
});

test('hides the minimap while either side menu is open and restores it on close', () => {
  jest.useFakeTimers();
  const dashboard = mountDashboard();
  const click = (selector) => {
    dashboard.host.querySelector(selector).dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
    }));
  };

  expect(dashboard.host.querySelector('.mock-canvas-minimap')).not.toBeNull();
  act(() => jest.advanceTimersByTime(5000));
  expect(dashboard.host.querySelector('.mock-canvas-minimap')).not.toBeNull();

  act(() => click('.widget-bank-floating-toggle'));
  expect(dashboard.host.querySelector('.mock-canvas-minimap')).toBeNull();

  act(() => click('.widget-bank-floating-toggle'));
  expect(dashboard.host.querySelector('.mock-canvas-minimap')).not.toBeNull();

  act(() => click('.mock-right-menu-open'));
  expect(dashboard.host.querySelector('.mock-canvas-minimap')).toBeNull();

  act(() => click('.mock-right-menu-close'));
  expect(dashboard.host.querySelector('.mock-canvas-minimap')).not.toBeNull();

  dashboard.unmount();
  jest.useRealTimers();
});
