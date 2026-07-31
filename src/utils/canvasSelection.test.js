import {
  getWidgetIdsInSelectionRect,
  mergeWidgetSelection,
  normalizeSelectionRect,
  offsetWidgetPositions,
  resolveWidgetSelection,
  selectionRectIntersects,
} from './canvasSelection';

test('normalizes a marquee dragged in reverse', () => {
  expect(normalizeSelectionRect(
    { x: 300, y: 220 },
    { x: 100, y: 80 }
  )).toEqual({
    left: 100,
    top: 80,
    right: 300,
    bottom: 220,
    width: 200,
    height: 140,
  });
});

test('finds widgets intersecting a viewport-space marquee', () => {
  const selectionRect = normalizeSelectionRect(
    { x: 90, y: 70 },
    { x: 260, y: 190 }
  );
  const widgets = [
    { id: 'a', rect: { left: 100, top: 80, right: 180, bottom: 140 } },
    { id: 'b', rect: { left: 240, top: 170, right: 320, bottom: 240 } },
    { id: 'c', rect: { left: 400, top: 300, right: 500, bottom: 380 } },
  ];

  expect(getWidgetIdsInSelectionRect(widgets, selectionRect)).toEqual(['a', 'b']);
  expect(selectionRectIntersects(selectionRect, widgets[2].rect)).toBe(false);
});

test('toggles additive widget selection and preserves a selected group', () => {
  expect(resolveWidgetSelection(['a'], 'b', true)).toEqual(['a', 'b']);
  expect(resolveWidgetSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  expect(resolveWidgetSelection(['a', 'b'], 'a')).toEqual(['a', 'b']);
  expect(resolveWidgetSelection(['a', 'b'], 'c')).toEqual(['c']);
});

test('adds marquee matches to the initial modifier selection', () => {
  expect(mergeWidgetSelection(['a'], ['b', 'a'], true)).toEqual(['a', 'b']);
  expect(mergeWidgetSelection(['a'], ['b'], false)).toEqual(['b']);
});

test('applies one shared delta to every grouped widget position', () => {
  expect(offsetWidgetPositions({
    a: { left: 40, top: 30 },
    b: { left: 240, top: 130 },
  }, {
    x: 80,
    y: 50,
  })).toEqual({
    a: { left: 120, top: 80 },
    b: { left: 320, top: 180 },
  });
});
