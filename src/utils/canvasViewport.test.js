import {
  getWidgetStatesCenteredViewport,
  getViewportCenteredWidgetPosition,
  normalizeCanvasViewport,
  screenToCanvasPoint,
  zoomViewportAtPoint,
} from './canvasViewport';

test('normalizes only complete finite canvas viewports', () => {
  expect(normalizeCanvasViewport({ x: -120, y: 45, zoom: 0.75 })).toEqual({
    x: -120,
    y: 45,
    zoom: 0.75,
  });
  expect(normalizeCanvasViewport({ x: 0, y: 0, zoom: 0 })).toBeNull();
  expect(normalizeCanvasViewport({ x: 'missing', y: 0, zoom: 1 })).toBeNull();
});

test('centers the bounds of visible positioned widgets for legacy views', () => {
  expect(getWidgetStatesCenteredViewport({
    containerWidth: 1000,
    containerHeight: 600,
    zoom: 0.5,
    widgetStates: {
      first: {
        visible: true,
        position: { left: 1000, top: 400 },
        size: { width: 400, height: 200 },
      },
      second: {
        visible: true,
        position: { left: 1600, top: 800 },
        size: { width: 200, height: 200 },
      },
      hidden: {
        visible: false,
        position: { left: -5000, top: -5000 },
        size: { width: 100, height: 100 },
      },
    },
  })).toEqual({ x: -200, y: -50, zoom: 0.5 });
});

test('keeps the world point under the cursor fixed while zooming', () => {
  expect(zoomViewportAtPoint(
    { x: 100, y: 50, zoom: 1 },
    2,
    { x: 300, y: 250 }
  )).toEqual({ x: -100, y: -150, zoom: 2 });
});

test('converts screen coordinates into canvas coordinates', () => {
  expect(screenToCanvasPoint(
    { x: 300, y: 250 },
    { x: -100, y: -150, zoom: 2 }
  )).toEqual({ left: 200, top: 200 });
});

test('centers a new widget in the currently focused canvas viewport', () => {
  expect(getViewportCenteredWidgetPosition({
    containerWidth: 1200,
    containerHeight: 800,
    widgetWidth: 400,
    widgetHeight: 300,
    viewport: { x: -900, y: -300, zoom: 0.5 },
  })).toEqual({
    left: 2800,
    top: 1250,
  });
});
