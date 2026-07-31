export const WIDGET_SELECTION_DRAG_THRESHOLD = 4;

const uniqueWidgetIds = (widgetIds = []) => (
  widgetIds.reduce((uniqueIds, widgetId) => (
    uniqueIds.some((candidate) => String(candidate) === String(widgetId))
      ? uniqueIds
      : [...uniqueIds, widgetId]
  ), [])
);

export const resolveWidgetSelection = (
  selectedWidgetIds,
  widgetId,
  additive = false
) => {
  const currentSelection = uniqueWidgetIds(selectedWidgetIds);
  const selectedIndex = currentSelection.findIndex(
    (candidate) => String(candidate) === String(widgetId)
  );

  if (additive) {
    return selectedIndex >= 0
      ? currentSelection.filter((_, index) => index !== selectedIndex)
      : [...currentSelection, widgetId];
  }

  return selectedIndex >= 0 ? currentSelection : [widgetId];
};

export const mergeWidgetSelection = (
  selectedWidgetIds,
  matchedWidgetIds,
  additive = false
) => (
  uniqueWidgetIds(additive
    ? [...(selectedWidgetIds || []), ...(matchedWidgetIds || [])]
    : matchedWidgetIds)
);

export const normalizeSelectionRect = (startPoint, endPoint) => {
  const left = Math.min(startPoint.x, endPoint.x);
  const top = Math.min(startPoint.y, endPoint.y);
  const right = Math.max(startPoint.x, endPoint.x);
  const bottom = Math.max(startPoint.y, endPoint.y);

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

export const selectionRectIntersects = (selectionRect, widgetRect) => (
  selectionRect.right >= widgetRect.left &&
  selectionRect.left <= widgetRect.right &&
  selectionRect.bottom >= widgetRect.top &&
  selectionRect.top <= widgetRect.bottom
);

export const getWidgetIdsInSelectionRect = (widgets, selectionRect) => (
  (widgets || [])
    .filter(({ rect }) => selectionRectIntersects(selectionRect, rect))
    .map(({ id }) => id)
);

export const offsetWidgetPositions = (positions, delta) => (
  Object.fromEntries(Object.entries(positions || {}).map(([widgetId, position]) => [
    widgetId,
    {
      left: position.left + delta.x,
      top: position.top + delta.y,
    },
  ]))
);
