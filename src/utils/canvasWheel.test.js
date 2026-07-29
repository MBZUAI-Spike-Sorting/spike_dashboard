import {
  CANVAS_WHEEL_ACTIONS,
  getCanvasWheelAction,
} from './canvasWheel';

const targetInside = (matchingSelector) => ({
  closest: (selector) => selector === matchingSelector ? {} : null,
});

test('routes unmodified canvas wheel gestures to canvas panning', () => {
  expect(getCanvasWheelAction({ target: targetInside(null) }))
    .toBe(CANVAS_WHEEL_ACTIONS.PAN);
});

test('routes modified canvas wheel gestures to canvas zooming', () => {
  expect(getCanvasWheelAction({
    ctrlKey: true,
    target: targetInside(null),
  })).toBe(CANVAS_WHEEL_ACTIONS.ZOOM);
});

test('leaves wheel scrolling inside widgets and side menus alone', () => {
  expect(getCanvasWheelAction({
    target: targetInside('.dockable-widget'),
  })).toBe(CANVAS_WHEEL_ACTIONS.IGNORE);
  expect(getCanvasWheelAction({
    target: targetInside('.dashboard-overlay'),
  })).toBe(CANVAS_WHEEL_ACTIONS.IGNORE);
});

test('suppresses browser zoom without moving the canvas over side menus', () => {
  expect(getCanvasWheelAction({
    ctrlKey: true,
    target: targetInside('.dashboard-overlay'),
  })).toBe(CANVAS_WHEEL_ACTIONS.PREVENT_BROWSER_ZOOM);
});
