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
