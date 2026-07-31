import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ClusterListTable, {
  matchesQuery,
  normalizeClusterGroups,
} from './ClusterListTable';

global.IS_REACT_ACT_ENVIRONMENT = true;

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

test('normalizes editable group names and preserves observed custom groups', () => {
  expect(normalizeClusterGroups(
    ['unsorted', 'Good', 'good', ''],
    ['review later']
  )).toEqual(['unsorted', 'Good', 'review later']);
});

test('lets users add and rename cluster groups', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onGroupsChange = jest.fn();
  const setInputValue = (input, value) => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  act(() => {
    root.render(
      <ClusterListTable
        clusters={[{ id: 1, size: 10 }]}
        groups={['unsorted', 'good']}
        onGroupsChange={onGroupsChange}
      />
    );
  });

  act(() => {
    host.querySelector('.cluster-groups-edit-button').click();
  });

  const newGroupInput = host.querySelector('[aria-label="New group name"]');
  act(() => {
    setInputValue(newGroupInput, 'review later');
  });
  act(() => {
    host.querySelector('.cluster-group-editor-add button').click();
  });
  expect(onGroupsChange).toHaveBeenCalledWith(['unsorted', 'good', 'review later']);

  const renameInput = host.querySelector('[aria-label="Rename group good"]');
  act(() => {
    setInputValue(renameInput, 'accepted');
  });
  act(() => {
    renameInput.closest('.cluster-group-editor-row').querySelector('button').click();
  });
  expect(onGroupsChange).toHaveBeenLastCalledWith(
    ['unsorted', 'accepted'],
    { renamedFrom: 'good', renamedTo: 'accepted' }
  );

  act(() => root.unmount());
  host.remove();
});
