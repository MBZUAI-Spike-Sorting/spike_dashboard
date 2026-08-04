const jsonSafe = (value) => {
  try {
    return JSON.parse(JSON.stringify(value, (_key, candidate) => (
      typeof candidate === 'number' && !Number.isFinite(candidate) ? null : candidate
    )));
  } catch (_error) {
    return null;
  }
};

const datasetIdentity = (dataset, demoMode) => {
  if (dataset && typeof dataset === 'object') {
    return jsonSafe({
      id: dataset.id ?? null,
      name: dataset.name ?? dataset.displayName ?? dataset.filename ?? null,
      filename: dataset.filename ?? null,
      source: dataset.source ?? null,
      mode: demoMode ? 'demo' : 'live',
    });
  }
  return {
    id: dataset ?? (demoMode ? 'demo' : null),
    name: dataset ?? (demoMode ? 'Demo dataset' : null),
    filename: null,
    source: null,
    mode: demoMode ? 'demo' : 'live',
  };
};

const clusterIdOf = (cluster, fallback) => cluster?.id ?? cluster?.clusterId ?? fallback;

const summarizePipelineVariables = (pipelineVariables = {}) => Object.values(pipelineVariables)
  .map((variable) => ({
    id: variable.id,
    label: variable.label,
    dataType: variable.dataType,
    shape: variable.shape,
    isAvailable: Boolean(variable.isAvailable),
    isFormatValid: Boolean(variable.isFormatValid),
    hasData: Boolean(variable.hasData),
  }));

export const ANALYSIS_API_CONTRACTS = Object.freeze([
  { method: 'GET', path: '/api/dataset-info', purpose: 'Current dataset dimensions and sampling metadata' },
  { method: 'POST', path: '/api/cluster-statistics', purpose: 'Metrics for explicit clusterIds' },
  { method: 'POST', path: '/api/cluster-waveforms', purpose: 'Bounded waveforms for explicit clusterIds' },
  { method: 'POST', path: '/api/cluster-correlograms', purpose: 'Bounded auto/cross-correlograms' },
  { method: 'POST', path: '/api/cluster-isi-histograms', purpose: 'Bounded inter-spike interval histograms' },
]);

export const createAnalysisManifest = ({
  exportedAt = new Date().toISOString(),
  apiBaseUrl = '',
  demoMode = false,
  selectedDataset = null,
  selectedAlgorithm = '',
  datasetInfo = null,
  clusters = [],
  selectedClusters = [],
  visibleClusterOrder = [],
  clusterStats = {},
  clusterAnnotations = {},
  highlightedSpikes = [],
  focusedTimeRange = null,
  currentViewId = 'default',
  widgetStates = {},
  widgetInputBindings = {},
  pipelineVariables = {},
} = {}) => {
  const records = clusters.map((cluster, index) => {
    const clusterId = clusterIdOf(cluster, index);
    return {
      clusterId,
      size: cluster.size ?? cluster.pointCount ?? cluster.numSpikes ?? null,
      statistics: jsonSafe(clusterStats[clusterId] ?? clusterStats[String(clusterId)] ?? {}),
      annotation: jsonSafe(clusterAnnotations[clusterId] ?? clusterAnnotations[String(clusterId)] ?? {}),
    };
  });
  const widgets = Object.entries(widgetStates).map(([widgetId, state]) => ({
    widgetId,
    type: state?.type || String(widgetId).split('__')[0],
    title: state?.title || null,
    visible: Boolean(state?.visible),
    minimized: Boolean(state?.minimized),
    maximized: Boolean(state?.maximized),
    order: Number.isFinite(Number(state?.order)) ? Number(state.order) : null,
    position: jsonSafe(state?.position ?? null),
    size: jsonSafe(state?.size ?? null),
    inputBindings: jsonSafe(widgetInputBindings[widgetId] || {}),
  }));

  return {
    schema: 'spikescope.analysis-session',
    schemaVersion: 1,
    exportedAt,
    application: {
      name: 'SpikeScope',
      workspace: 'read_only',
      arbitraryCodeExecution: false,
    },
    source: {
      dataset: datasetIdentity(selectedDataset, demoMode),
      algorithm: selectedAlgorithm || null,
      apiBaseUrl,
      datasetInfo: jsonSafe(datasetInfo),
    },
    clusters: {
      records,
      visibleOrder: jsonSafe(visibleClusterOrder),
    },
    selection: {
      clusterIds: jsonSafe(selectedClusters),
      spikes: jsonSafe(highlightedSpikes),
      timeRangeSamples: jsonSafe(focusedTimeRange),
    },
    dashboard: {
      currentViewId,
      widgets,
      pipelineVariables: summarizePipelineVariables(pipelineVariables),
    },
    provenance: {
      generatedInBrowser: true,
      credentialsExported: false,
      rawSignalExported: false,
      apiContracts: ANALYSIS_API_CONTRACTS,
    },
  };
};

export const createManifestFilename = (manifest) => {
  const dataset = manifest?.source?.dataset?.name || manifest?.source?.dataset?.id || 'session';
  const safeDataset = String(dataset).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'session';
  const date = String(manifest?.exportedAt || '').slice(0, 10) || 'export';
  return `spikescope-${safeDataset}-${date}.json`;
};

export const createNotebookSnippet = (manifest) => {
  const filename = createManifestFilename(manifest);
  const apiBaseUrl = (manifest?.source?.apiBaseUrl || 'http://127.0.0.1:5000')
    .replace(/\/+$/, '');
  const algorithm = manifest?.source?.algorithm || '';
  return `from pathlib import Path
import json

# Load the browser-exported, read-only SpikeScope session manifest.
manifest = json.loads(Path(${JSON.stringify(filename)}).read_text())
cluster_ids = manifest["selection"]["clusterIds"]
dataset = manifest["source"]["dataset"]
print(dataset, cluster_ids)

# Optional: request fresh bounded data from the documented SpikeScope API.
# Credentials are never included in the export; add your own Authorization header if required.
import requests
api_base_url = ${JSON.stringify(apiBaseUrl)}
payload = {"clusterIds": cluster_ids, "algorithm": ${JSON.stringify(algorithm)}}
response = requests.post(
    f"{api_base_url}/api/cluster-statistics",
    json=payload,
    timeout=30,
)
response.raise_for_status()
statistics = response.json()
`;
};
