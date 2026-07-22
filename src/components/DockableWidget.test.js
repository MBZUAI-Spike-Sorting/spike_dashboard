import {
  calculateResizeLayout,
  constrainWidgetPosition,
  normalizeInteractionScale
} from './DockableWidget';

test('normalizes invalid interaction scales', () => {
  expect(normalizeInteractionScale(0.85)).toBe(0.85);
  expect(normalizeInteractionScale(0)).toBe(1);
  expect(normalizeInteractionScale('invalid')).toBe(1);
});

test('converts pointer movement to layout pixels when resizing a scaled widget', () => {
  const layout = calculateResizeLayout({
    startX: 100,
    startY: 100,
    width: 300,
    height: 200,
    left: 40,
    top: 30,
    direction: 'se'
  }, 185, 142.5, 0.85);

  expect(layout).toEqual({
    width: 400,
    height: 250,
    left: 40,
    top: 30
  });
});

test('keeps the opposite edge anchored for north-west resizing at a scale', () => {
  const layout = calculateResizeLayout({
    startX: 200,
    startY: 200,
    width: 300,
    height: 240,
    left: 40,
    top: 30,
    direction: 'nw'
  }, 217, 208.5, 0.85);

  expect(layout).toEqual({
    width: 280,
    height: 230,
    left: 60,
    top: 40
  });
});

test('keeps a widget header vertically accessible inside its dashboard', () => {
  expect(constrainWidgetPosition({
    left: 200,
    top: -140,
    widgetWidth: 400,
    headerHeight: 36,
    containerWidth: 1000,
    containerHeight: 700
  })).toEqual({ left: 200, top: 0 });

  expect(constrainWidgetPosition({
    left: 200,
    top: 900,
    widgetWidth: 400,
    headerHeight: 36,
    containerWidth: 1000,
    containerHeight: 700
  })).toEqual({ left: 200, top: 664 });
});

test('keeps enough of an off-screen widget header visible to recover it', () => {
  expect(constrainWidgetPosition({
    left: -500,
    top: 20,
    widgetWidth: 400,
    headerHeight: 36,
    containerWidth: 1000,
    containerHeight: 700
  })).toEqual({ left: -304, top: 20 });

  expect(constrainWidgetPosition({
    left: 1200,
    top: 20,
    widgetWidth: 400,
    headerHeight: 36,
    containerWidth: 1000,
    containerHeight: 700
  })).toEqual({ left: 904, top: 20 });
});
