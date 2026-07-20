import {
  DEFAULT_DISPLAY_SETTINGS,
  normalizeDisplaySettings,
  readDisplaySettings,
} from './displaySettings';

test('normalizes UI scale and density to supported display values', () => {
  expect(normalizeDisplaySettings({ scale: 1.13, density: 'compact' })).toEqual({
    scale: 1.15,
    density: 'compact',
  });
  expect(normalizeDisplaySettings({ scale: 3, density: 'unknown' })).toEqual({
    scale: 1.25,
    density: 'standard',
  });
});

test('falls back safely when persisted display settings are invalid', () => {
  const storage = { getItem: () => '{broken json' };
  expect(readDisplaySettings(storage, 'display')).toEqual(DEFAULT_DISPLAY_SETTINGS);
});

