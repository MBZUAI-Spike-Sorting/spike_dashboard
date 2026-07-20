import {
  getAvailableDiagnosticClusterIds,
  getLinkedDiagnosticClusterIds,
  reconcileDiagnosticClusterIds,
} from './diagnosticClusterSelection';

test('discovers every cluster id instead of depending on dashboard selection', () => {
  const clusterData = {
    clusters: Array.from({ length: 12 }, (_, clusterId) => ({ clusterId })),
  };

  expect(getAvailableDiagnosticClusterIds({ clusterData })).toEqual(
    Array.from({ length: 12 }, (_, clusterId) => clusterId)
  );
});

test('preserves explicit high cluster ids when reconciling local widget selection', () => {
  const availableIds = Array.from({ length: 12 }, (_, clusterId) => clusterId);

  expect(reconcileDiagnosticClusterIds([9, 11], availableIds, 4)).toEqual([9, 11, 0, 1]);
  expect(reconcileDiagnosticClusterIds([], availableIds, 12)).toEqual(availableIds);
});

test('fills newly available slots after an eight-cluster source is replaced', () => {
  const initialIds = Array.from({ length: 8 }, (_, clusterId) => clusterId);
  const expandedIds = Array.from({ length: 96 }, (_, clusterId) => clusterId);
  const initialSelection = reconcileDiagnosticClusterIds([], initialIds, 12);

  expect(reconcileDiagnosticClusterIds(initialSelection, expandedIds, 12)).toEqual(
    Array.from({ length: 12 }, (_, clusterId) => clusterId)
  );
});

test('linked dashboard selection drives diagnostics and retains high IDs', () => {
  const availableIds = Array.from({ length: 96 }, (_, clusterId) => clusterId);
  expect(getLinkedDiagnosticClusterIds([2, 11, 42], availableIds, 2)).toEqual([2, 11]);
  expect(getLinkedDiagnosticClusterIds([], availableIds, 4)).toBeNull();
});
