import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CurationActionsWidget from './CurationActionsWidget';

global.IS_REACT_ACT_ENVIRONMENT = true;

test('exposes merge, exact-ID split, and history controls from session state', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onMerge = jest.fn();
  const onSplit = jest.fn();
  const onUndo = jest.fn();
  const onRedo = jest.fn();
  const session = {
    revision: 3,
    cursor: 1,
    operations: [
      { id: 'op-1', type: 'merge', clusterIds: [2, 5], targetClusterId: 6 },
      { id: 'op-2', type: 'split', sourceClusterId: 6, targetClusterId: 7, spikeIds: ['2:0'] },
    ],
  };

  act(() => {
    root.render(
      <CurationActionsWidget
        session={session}
        currentClusterCount={1}
        selectedClusters={[2, 5]}
        selectedSpikes={[{ spikeId: '2:0' }]}
        onMerge={onMerge}
        onSplit={onSplit}
        onUndo={onUndo}
        onRedo={onRedo}
      />
    );
  });

  const button = (text) => [...host.querySelectorAll('button')]
    .find((candidate) => candidate.textContent.includes(text));
  act(() => button('Merge selected').click());
  act(() => button('Split selected').click());
  act(() => button('Undo').click());
  act(() => button('Redo').click());

  expect(onMerge).toHaveBeenCalledTimes(1);
  expect(onSplit).toHaveBeenCalledTimes(1);
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onRedo).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('.curation-history li.applied')).toHaveLength(1);
  expect(host.querySelectorAll('.curation-history li.undone')).toHaveLength(1);

  act(() => root.unmount());
  host.remove();
});
