import {
  getViewportCenteredWidgetPosition,
  screenToCanvasPoint,
  zoomViewportAtPoint,
} from './canvasViewport';

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
