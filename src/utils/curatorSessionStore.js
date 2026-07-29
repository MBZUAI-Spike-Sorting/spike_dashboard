const DATABASE_NAME = 'spike-dashboard-session-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'curator-datasets';
const SESSION_ID_KEY = 'spike_dashboard_curator_session_id:v1';
const FALLBACK_KEY_PREFIX = 'spike_dashboard_curator_dataset:v1';

const getBrowserStorage = () => {
  try {
    return window.sessionStorage;
  } catch (error) {
    return null;
  }
};

const createSessionId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const getCuratorSessionId = (storage = getBrowserStorage()) => {
  const existing = storage?.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const sessionId = createSessionId();
  storage?.setItem(SESSION_ID_KEY, sessionId);
  return sessionId;
};

const getRecordKey = (scope, storage) => (
  `${String(scope || 'default')}:${getCuratorSessionId(storage)}`
);

const getFallbackKey = (scope, storage) => (
  `${FALLBACK_KEY_PREFIX}:${getRecordKey(scope, storage)}`
);

const openDatabase = (indexedDbFactory) => new Promise((resolve, reject) => {
  if (!indexedDbFactory) {
    reject(new Error('IndexedDB is unavailable'));
    return;
  }

  const request = indexedDbFactory.open(DATABASE_NAME, DATABASE_VERSION);
  request.onerror = () => reject(request.error || new Error('Unable to open session cache'));
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
});

const runTransaction = async (mode, operation, indexedDbFactory) => {
  const database = await openDatabase(indexedDbFactory);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onerror = () => reject(request.error || new Error('Session cache request failed'));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () => reject(
        transaction.error || new Error('Session cache transaction was aborted')
      );
    });
  } finally {
    database.close();
  }
};

const readFallback = (scope, storage) => {
  if (!storage) return null;
  try {
    const value = storage.getItem(getFallbackKey(scope, storage));
    return value ? JSON.parse(value)?.dataset || null : null;
  } catch (error) {
    return null;
  }
};

const writeFallback = (scope, dataset, storage) => {
  if (!storage) return false;
  try {
    storage.setItem(
      getFallbackKey(scope, storage),
      JSON.stringify({ dataset, updatedAt: Date.now() })
    );
    return true;
  } catch (error) {
    return false;
  }
};

export const loadCuratorSessionDataset = async ({
  scope = 'default',
  storage = getBrowserStorage(),
  indexedDbFactory = globalThis.indexedDB,
} = {}) => {
  const key = getRecordKey(scope, storage);
  try {
    const record = await runTransaction(
      'readonly',
      (store) => store.get(key),
      indexedDbFactory
    );
    return record?.dataset || readFallback(scope, storage);
  } catch (error) {
    return readFallback(scope, storage);
  }
};

export const saveCuratorSessionDataset = async (dataset, {
  scope = 'default',
  storage = getBrowserStorage(),
  indexedDbFactory = globalThis.indexedDB,
} = {}) => {
  if (!dataset || !Array.isArray(dataset.clusters)) return false;

  const record = {
    key: getRecordKey(scope, storage),
    dataset,
    updatedAt: Date.now(),
  };

  try {
    await runTransaction('readwrite', (store) => store.put(record), indexedDbFactory);
    storage?.removeItem(getFallbackKey(scope, storage));
    return true;
  } catch (error) {
    return writeFallback(scope, dataset, storage);
  }
};

export const clearCuratorSessionDataset = async ({
  scope = 'default',
  storage = getBrowserStorage(),
  indexedDbFactory = globalThis.indexedDB,
} = {}) => {
  const key = getRecordKey(scope, storage);
  storage?.removeItem(getFallbackKey(scope, storage));

  try {
    await runTransaction('readwrite', (store) => store.delete(key), indexedDbFactory);
  } catch (error) {
    // The fallback has already been removed, so there is nothing else to clear.
  }
};
