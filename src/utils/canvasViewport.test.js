import { screenToCanvasPoint, zoomViewportAtPoint } from './canvasViewport';

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
