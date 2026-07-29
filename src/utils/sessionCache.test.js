import {
  clearSessionCache,
  createSessionCacheKey,
  getOrLoadSessionCache,
  stableSerialize,
} from './sessionCache';

afterEach(() => clearSessionCache());

test('serializes cache-key objects deterministically', () => {
  expect(stableSerialize({ b: 2, a: [1, 3] }))
    .toBe(stableSerialize({ a: [1, 3], b: 2 }));
});

test('reuses resolved values and deduplicates in-flight calculations', async () => {
  const loader = jest.fn(async () => ({ result: 42 }));
  const key = createSessionCacheKey('diagnostic', ['dataset', [1, 2]]);

  const [first, second] = await Promise.all([
    getOrLoadSessionCache(key, loader),
    getOrLoadSessionCache(key, loader),
  ]);
  const third = await getOrLoadSessionCache(key, loader);

  expect(first).toBe(second);
  expect(third).toBe(first);
  expect(loader).toHaveBeenCalledTimes(1);
});

test('clears only the requested cache namespace', async () => {
  await getOrLoadSessionCache('waveforms:a', async () => 1);
  await getOrLoadSessionCache('diagnostic:a', async () => 2);
  clearSessionCache('waveforms');

  const waveformLoader = jest.fn(async () => 3);
  const diagnosticLoader = jest.fn(async () => 4);
  expect(await getOrLoadSessionCache('waveforms:a', waveformLoader)).toBe(3);
  expect(await getOrLoadSessionCache('diagnostic:a', diagnosticLoader)).toBe(2);
  expect(diagnosticLoader).not.toHaveBeenCalled();
});
