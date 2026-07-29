import {
  clearCuratorSessionDataset,
  getCuratorSessionId,
  loadCuratorSessionDataset,
  saveCuratorSessionDataset,
} from './curatorSessionStore';

beforeEach(() => {
  window.sessionStorage.clear();
});

test('keeps the curator session identity across reload-style module usage', () => {
  const first = getCuratorSessionId(window.sessionStorage);
  const second = getCuratorSessionId(window.sessionStorage);

  expect(second).toBe(first);
  expect(first).toBeTruthy();
});

test('restores and replaces curator data using sessionStorage fallback', async () => {
  const first = { name: 'first.json', clusters: [{ id: 1, spikeTimes: [10] }] };
  const second = { name: 'second.json', clusters: [{ id: 2, spikeTimes: [20] }] };
  const options = {
    scope: 'guest',
    storage: window.sessionStorage,
    indexedDbFactory: null,
  };

  expect(await saveCuratorSessionDataset(first, options)).toBe(true);
  expect(await loadCuratorSessionDataset(options)).toEqual(first);

  expect(await saveCuratorSessionDataset(second, options)).toBe(true);
  expect(await loadCuratorSessionDataset(options)).toEqual(second);
});

test('clears the reload-safe curator dataset', async () => {
  const options = {
    scope: 'guest',
    storage: window.sessionStorage,
    indexedDbFactory: null,
  };
  await saveCuratorSessionDataset({ clusters: [{ id: 1 }] }, options);
  await clearCuratorSessionDataset(options);

  expect(await loadCuratorSessionDataset(options)).toBeNull();
});
