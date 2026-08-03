import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ViewManager from './ViewManager';

global.IS_REACT_ACT_ENVIRONMENT = true;

const widgetStates = {
  clusterList: {
    visible: true,
    position: { left: 900, top: 300 },
    size: { width: 400, height: 250 },
  },
};

const savedViews = [{
  id: 'saved-view',
  name: 'Saved view',
  widgetStates,
  viewport: { x: -320, y: 80, zoom: 0.7 },
}];

test('applies and persists the viewport belonging to a custom view', () => {
  jest.useFakeTimers();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onViewChange = jest.fn();
  const onPersistViews = jest.fn();

  act(() => {
    root.render(
      <ViewManager
        currentWidgetStates={widgetStates}
        currentViewport={{ x: -320, y: 80, zoom: 0.7 }}
        onViewChange={onViewChange}
        savedViews={savedViews}
        savedCurrentViewId="saved-view"
        onPersistViews={onPersistViews}
        layoutStorageScope="viewport-test"
      />
    );
  });
  act(() => {
    jest.advanceTimersByTime(100);
  });

  expect(onViewChange).toHaveBeenCalledWith(
    expect.any(Object),
    'saved-view',
    { x: -320, y: 80, zoom: 0.7 }
  );

  onPersistViews.mockClear();
  act(() => {
    root.render(
      <ViewManager
        currentWidgetStates={widgetStates}
        currentViewport={{ x: -510, y: 145, zoom: 0.85 }}
        onViewChange={onViewChange}
        savedViews={savedViews}
        savedCurrentViewId="saved-view"
        onPersistViews={onPersistViews}
        layoutStorageScope="viewport-test"
      />
    );
  });
  act(() => {
    jest.advanceTimersByTime(150);
  });

  expect(onPersistViews).toHaveBeenCalled();
  const [persistedViews, persistedCurrentViewId] = onPersistViews.mock.calls.at(-1);
  expect(persistedCurrentViewId).toBe('saved-view');
  expect(persistedViews.find((view) => view.id === 'saved-view').viewport).toEqual({
    x: -510,
    y: 145,
    zoom: 0.85,
  });

  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  jest.useRealTimers();
});
