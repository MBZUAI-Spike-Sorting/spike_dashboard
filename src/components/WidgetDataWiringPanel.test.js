import {
  getSelectableWiringWidgetIds,
  resolveSelectedWiringWidgetId
} from './WidgetDataWiringPanel';

const widgetStates = {
  clusterList: { visible: true },
  correlogram: { visible: false },
  isiHistogram: { visible: false },
  unknownWidget: { visible: true }
};

test('hidden views remain selectable in Data Wiring', () => {
  expect(resolveSelectedWiringWidgetId('correlogram', widgetStates)).toBe(
    'correlogram'
  );
  expect(resolveSelectedWiringWidgetId('isiHistogram', widgetStates)).toBe(
    'isiHistogram'
  );
});

test('selection falls back only when the selected view is unavailable', () => {
  expect(getSelectableWiringWidgetIds(widgetStates)).toEqual([
    'clusterList',
    'correlogram',
    'isiHistogram'
  ]);
  expect(resolveSelectedWiringWidgetId('unknownWidget', widgetStates)).toBe(
    'clusterList'
  );
});
