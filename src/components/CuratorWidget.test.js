import { getCuratorClusterIds } from './CuratorWidget';

test('bulk curator selection uses the active cluster IDs', () => {
  expect(getCuratorClusterIds([
    { id: 12 },
    { id: 'unit-a' },
  ])).toEqual([12, 'unit-a']);
});
