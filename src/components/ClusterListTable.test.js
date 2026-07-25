import { matchesQuery } from './ClusterListTable';

const row = {
  id: 12,
  size: 640,
  peakChannel: 30,
  depth: 115.5,
  firingRateHz: 8.2,
  isiViolationRate: 0.01,
  meanAmplitude: 42,
  group: 'good',
  label: 'stable',
  note: 'reviewed',
};

test('filters clusters by channel aliases', () => {
  expect(matchesQuery(row, 'ch=30')).toBe(true);
  expect(matchesQuery(row, 'channel = 31')).toBe(false);
  expect(matchesQuery(row, 'peak_channel=30')).toBe(true);
});

test('supports compound filters with and/or precedence', () => {
  expect(matchesQuery(row, 'ch=30 and spikes>500')).toBe(true);
  expect(matchesQuery(row, 'ch=31 and spikes>500')).toBe(false);
  expect(matchesQuery(row, 'ch=31 or spikes>500')).toBe(true);
  expect(matchesQuery(row, 'group=noise or ch=30 and spikes>500')).toBe(true);
});

test('supports symbolic and comma separators', () => {
  expect(matchesQuery(row, 'ch=30, spikes>=640')).toBe(true);
  expect(matchesQuery(row, 'ch=31 || label=stable')).toBe(true);
  expect(matchesQuery(row, 'ch=30 && group!=noise')).toBe(true);
});

test('does not treat an incomplete boolean group as a match', () => {
  expect(matchesQuery(row, 'ch=31 or ')).toBe(false);
  expect(matchesQuery(row, ',')).toBe(false);
});
