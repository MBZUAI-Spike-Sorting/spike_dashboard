const cache = new Map();
const objectIds = new WeakMap();
let nextObjectId = 1;

export const stableSerialize = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stableSerialize(value[key])}`
  )).join(',')}}`;
};

export const getSessionObjectId = (value) => {
  if (!value || typeof value !== 'object') return stableSerialize(value);
  if (!objectIds.has(value)) {
    objectIds.set(value, nextObjectId);
    nextObjectId += 1;
  }
  return `object-${objectIds.get(value)}`;
};

export const createSessionCacheKey = (namespace, parts = []) => (
  `${namespace}:${parts.map(stableSerialize).join('|')}`
);

export const hasSessionCacheValue = (key) => cache.has(key);

export const getSessionCacheValue = (key) => cache.get(key);

export const setSessionCacheValue = (key, value) => {
  cache.set(key, value);
  return value;
};

export const getOrLoadSessionCache = (key, loader) => {
  if (cache.has(key)) return Promise.resolve(cache.get(key));

  const pending = Promise.resolve().then(loader);
  cache.set(key, pending);
  return pending.then(
    (value) => {
      if (cache.get(key) === pending) cache.set(key, value);
      return value;
    },
    (error) => {
      if (cache.get(key) === pending) cache.delete(key);
      throw error;
    }
  );
};

export const clearSessionCache = (namespace = '') => {
  Array.from(cache.keys()).forEach((key) => {
    if (!namespace || key.startsWith(`${namespace}:`)) cache.delete(key);
  });
};
