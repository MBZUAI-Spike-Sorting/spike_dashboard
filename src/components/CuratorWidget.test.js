import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import CuratorWidget, { getCuratorClusterIds } from './CuratorWidget';
import apiClient from '../api/client';

jest.mock('../utils/curatorSessionStore', () => ({
  loadCuratorSessionDataset: jest.fn(() => Promise.resolve(null)),
  saveCuratorSessionDataset: jest.fn(() => Promise.resolve(true)),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const TEST_DATASET = {
  name: 'Test clusters',
  clusters: [{
    id: 12,
    primaryChannel: 4,
    spikeTimes: [100, 200, 300],
  }],
};

const mountCurator = (props = {}) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onClusterSelect = jest.fn();
  const onAnnotationChange = jest.fn();

  const render = (nextProps = {}) => {
    act(() => {
      root.render(
        <CuratorWidget
          initialDataset={TEST_DATASET}
          selectedClusters={[]}
          clusterAnnotations={{}}
          onClusterSelect={onClusterSelect}
          onAnnotationChange={onAnnotationChange}
          {...props}
          {...nextProps}
        />
      );
    });
  };

  render();

  return {
    host,
    onAnnotationChange,
    onClusterSelect,
    render,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
};

test('bulk curator selection uses the active cluster IDs', () => {
  expect(getCuratorClusterIds([
    { id: 12 },
    { id: 'unit-a' },
  ])).toEqual([12, 'unit-a']);
});

test('uses concise, normally cased curator labels', () => {
  const style = document.createElement('style');
  style.textContent = fs.readFileSync(path.join(__dirname, 'CuratorWidget.css'), 'utf8');
  document.head.appendChild(style);
  const curator = mountCurator();
  const sortLabels = Array.from(
    curator.host.querySelectorAll('.curator-table thead button')
  ).map((button) => button.textContent.replace(/\s+(up|down)$/, '').trim());

  expect(sortLabels).toEqual(['ID', 'CH', 'Spikes', 'First spike', 'Last spike']);
  expect(window.getComputedStyle(
    curator.host.querySelector('.curator-file-control label')
  ).textTransform).not.toBe('uppercase');
  expect(window.getComputedStyle(
    curator.host.querySelector('.curator-summary-card span')
  ).textTransform).not.toBe('uppercase');

  curator.unmount();
  style.remove();
});

test('shows a saved group and reports controlled group edits without selecting the row', () => {
  const curator = mountCurator({
    clusterAnnotations: {
      12: { group: 'mua' },
    },
  });
  const groupSelect = curator.host.querySelector('[aria-label="Group for cluster 12"]');

  expect(groupSelect).not.toBeNull();
  expect(groupSelect.value).toBe('mua');
  expect(Array.from(groupSelect.options).map((option) => option.value)).toEqual([
    'unsorted',
    'good',
    'mua',
    'noise',
  ]);

  act(() => {
    groupSelect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    groupSelect.value = 'good';
    groupSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(curator.onAnnotationChange).toHaveBeenCalledWith(12, { group: 'good' });
  expect(curator.onClusterSelect).not.toHaveBeenCalled();

  curator.render({
    clusterAnnotations: {
      12: { group: 'good' },
    },
  });
  expect(
    curator.host.querySelector('[aria-label="Group for cluster 12"]').value
  ).toBe('good');

  curator.unmount();
});

test('reports a successful custom upload so its data source can be selected', async () => {
  const onUploadComplete = jest.fn();
  const onSelectedClustersChange = jest.fn();
  const parseSpy = jest.spyOn(apiClient, 'parseClusterComparisonFile').mockResolvedValue({
    data: {
      dataset: {
        name: 'uploaded-clusters.json',
        clusters: [{ id: 44, spikeTimes: [10, 20] }],
      },
    },
  });
  const curator = mountCurator({ onUploadComplete, onSelectedClustersChange });
  const input = curator.host.querySelector('#curator-cluster-file');
  const file = new File(['{}'], 'uploaded-clusters.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onSelectedClustersChange).toHaveBeenCalledWith([]);
  expect(onUploadComplete).toHaveBeenCalledTimes(1);
  expect(onUploadComplete.mock.calls[0][0]).toMatchObject({
    name: 'uploaded-clusters.json',
    isLoaded: true,
  });
  expect(onUploadComplete.mock.calls[0][0].clusters[0].id).toBe(44);

  parseSpy.mockRestore();
  curator.unmount();
});
