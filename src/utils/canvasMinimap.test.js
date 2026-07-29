import { createCanvasMinimapModel } from './canvasMinimap';

test('projects widgets and the current viewport into the minimap', () => {
  const model = createCanvasMinimapModel({
    viewport: { x: 100, y: 50, width: 400, height: 300 },
    widgets: [
      { id: 'left', x: -200, y: 0, width: 100, height: 100 },
      { id: 'right', x: 700, y: 400, width: 200, height: 150 },
    ],
  });

  expect(model.widgets).toHaveLength(2);
  expect(model.viewport.width).toBeGreaterThan(0);
  expect(model.viewport.height).toBeGreaterThan(0);
  [...model.widgets, model.viewport].forEach((rect) => {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(model.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(model.height);
  });
});

test('keeps an empty canvas viewport visible', () => {
  const model = createCanvasMinimapModel({
    viewport: { x: 0, y: 0, width: 800, height: 600 },
  });

  expect(model.viewport.width).toBeGreaterThan(1);
  expect(model.viewport.height).toBeGreaterThan(1);
});
