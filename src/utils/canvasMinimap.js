const DEFAULT_WIDTH = 216;
const DEFAULT_HEIGHT = 132;
const DEFAULT_INSET = 10;
const WORLD_PADDING = 80;

const finite = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

const normalizeRect = (rect = {}) => ({
  id: rect.id,
  x: finite(rect.x),
  y: finite(rect.y),
  width: Math.max(0, finite(rect.width)),
  height: Math.max(0, finite(rect.height)),
});

const getBounds = (rects) => {
  const minX = Math.min(...rects.map((rect) => rect.x)) - WORLD_PADDING;
  const minY = Math.min(...rects.map((rect) => rect.y)) - WORLD_PADDING;
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width)) + WORLD_PADDING;
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height)) + WORLD_PADDING;

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
};

export function createCanvasMinimapModel({
  viewport,
  widgets = [],
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  inset = DEFAULT_INSET,
}) {
  const normalizedViewport = normalizeRect(viewport);
  const normalizedWidgets = widgets.map(normalizeRect);
  const bounds = getBounds([normalizedViewport, ...normalizedWidgets]);
  const drawableWidth = Math.max(1, width - inset * 2);
  const drawableHeight = Math.max(1, height - inset * 2);
  const scale = Math.min(
    drawableWidth / bounds.width,
    drawableHeight / bounds.height
  );
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const originX = (width - contentWidth) / 2;
  const originY = (height - contentHeight) / 2;

  const project = (rect) => ({
    id: rect.id,
    x: originX + (rect.x - bounds.x) * scale,
    y: originY + (rect.y - bounds.y) * scale,
    width: Math.max(1, rect.width * scale),
    height: Math.max(1, rect.height * scale),
  });

  return {
    width,
    height,
    bounds,
    widgets: normalizedWidgets.map(project),
    viewport: project(normalizedViewport),
  };
}
