export const CANVAS_WHEEL_ACTIONS = Object.freeze({
  IGNORE: 'ignore',
  PREVENT_BROWSER_ZOOM: 'prevent-browser-zoom',
  PAN: 'pan',
  ZOOM: 'zoom',
});

const closest = (target, selector) => (
  typeof target?.closest === 'function' ? target.closest(selector) : null
);

export function getCanvasWheelAction(event) {
  const isZoomGesture = Boolean(event?.ctrlKey || event?.metaKey);

  if (closest(event?.target, '.dashboard-overlay')) {
    return isZoomGesture
      ? CANVAS_WHEEL_ACTIONS.PREVENT_BROWSER_ZOOM
      : CANVAS_WHEEL_ACTIONS.IGNORE;
  }

  if (closest(event?.target, '.dockable-widget') && !isZoomGesture) {
    return CANVAS_WHEEL_ACTIONS.IGNORE;
  }

  return isZoomGesture
    ? CANVAS_WHEEL_ACTIONS.ZOOM
    : CANVAS_WHEEL_ACTIONS.PAN;
}
