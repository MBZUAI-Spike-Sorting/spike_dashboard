export const zoomViewportAtPoint = (view, nextZoom, point) => {
  const currentZoom = Number(view.zoom) || 1;
  const zoom = Number(nextZoom) || currentZoom;
  const worldX = (point.x - view.x) / currentZoom;
  const worldY = (point.y - view.y) / currentZoom;

  return {
    x: point.x - worldX * zoom,
    y: point.y - worldY * zoom,
    zoom,
  };
};

export const screenToCanvasPoint = (point, view) => ({
  left: (point.x - view.x) / view.zoom,
  top: (point.y - view.y) / view.zoom,
});

export const getViewportCenteredWidgetPosition = ({
  containerWidth,
  containerHeight,
  widgetWidth,
  widgetHeight,
  viewport,
}) => {
  const center = screenToCanvasPoint({
    x: Number(containerWidth) / 2,
    y: Number(containerHeight) / 2,
  }, viewport);

  return {
    left: center.left - Number(widgetWidth) / 2,
    top: center.top - Number(widgetHeight) / 2,
  };
};
