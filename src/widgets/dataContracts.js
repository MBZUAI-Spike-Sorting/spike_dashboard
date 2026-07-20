/**
 * Widget data contracts and pipeline variable wiring helpers.
 *
 * This is the frontend foundation for wiring pipeline outputs into dashboard
 * widgets. Each widget declares the typed inputs it accepts, and the dashboard
 * exposes known pipeline variables that can be connected to those inputs.
 */

export const DATA_TYPES = Object.freeze({
  CLUSTER_LIST: 'cluster_list',
  CLUSTER_IDS: 'cluster_ids',
  CLUSTER_ORDER: 'cluster_order',
  SPIKE_EVENTS: 'spike_events',
  SPIKE_SELECTION: 'spike_selection',
  CLUSTER_STATISTICS: 'cluster_statistics',
  CLUSTER_EMBEDDING: 'cluster_embedding',
  WAVEFORMS: 'waveforms',
  CLUSTERING_RESULTS: 'clustering_results',
  CLUSTER_COMPARISON_SET: 'cluster_comparison_set',
  SIGNAL_TRACE: 'signal_trace',
  DATASET_INFO: 'dataset_info',
  CURATION_STATE: 'curation_state',
  CORRELOGRAMS: 'correlograms',
  ISI_HISTOGRAMS: 'isi_histograms',
  SPIKE_AMPLITUDES: 'spike_amplitudes',
  TIME_RANGE: 'time_range'
});

export const DATA_TYPE_LABELS = Object.freeze({
  [DATA_TYPES.CLUSTER_LIST]: 'Cluster list',
  [DATA_TYPES.CLUSTER_IDS]: 'Cluster IDs',
  [DATA_TYPES.CLUSTER_ORDER]: 'Visible cluster order',
  [DATA_TYPES.SPIKE_EVENTS]: 'Spike events',
  [DATA_TYPES.SPIKE_SELECTION]: 'Spike selection',
  [DATA_TYPES.CLUSTER_STATISTICS]: 'Cluster statistics',
  [DATA_TYPES.CLUSTER_EMBEDDING]: 'Cluster embedding',
  [DATA_TYPES.WAVEFORMS]: 'Waveforms',
  [DATA_TYPES.CLUSTERING_RESULTS]: 'Clustering results',
  [DATA_TYPES.CLUSTER_COMPARISON_SET]: 'Cluster comparison set',
  [DATA_TYPES.SIGNAL_TRACE]: 'Signal trace',
  [DATA_TYPES.DATASET_INFO]: 'Dataset info',
  [DATA_TYPES.CURATION_STATE]: 'Cluster curation state',
  [DATA_TYPES.CORRELOGRAMS]: 'Correlograms',
  [DATA_TYPES.ISI_HISTOGRAMS]: 'ISI histograms',
  [DATA_TYPES.SPIKE_AMPLITUDES]: 'Spike amplitudes',
  [DATA_TYPES.TIME_RANGE]: 'Time range'
});

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNumberArray = (value) =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

const hasObjectEntries = (value) =>
  isPlainObject(value) && Object.keys(value).length > 0;

export const PIPELINE_VARIABLE_DEFINITIONS = Object.freeze({
  clusters: {
    id: 'clusters',
    label: 'Clusters',
    dataType: DATA_TYPES.CLUSTER_LIST,
    shape: 'Array<{ id, size? }>',
    validate: (value) => Array.isArray(value)
  },
  selectedClusters: {
    id: 'selectedClusters',
    label: 'Selected clusters',
    dataType: DATA_TYPES.CLUSTER_IDS,
    shape: 'number[]',
    validate: isNumberArray
  },
  visibleClusterOrder: {
    id: 'visibleClusterOrder',
    label: 'Visible cluster order',
    dataType: DATA_TYPES.CLUSTER_ORDER,
    shape: 'number[]',
    validate: isNumberArray
  },
  spikes: {
    id: 'spikes',
    label: 'Spike events',
    dataType: DATA_TYPES.SPIKE_EVENTS,
    shape: 'Array<{ time, clusterId, channel? }>',
    validate: (value) => Array.isArray(value)
  },
  highlightedSpikes: {
    id: 'highlightedSpikes',
    label: 'Highlighted spikes',
    dataType: DATA_TYPES.SPIKE_SELECTION,
    shape: 'Array<{ clusterId, pointIndex, time? }>',
    validate: (value) => Array.isArray(value)
  },
  clusterStats: {
    id: 'clusterStats',
    label: 'Cluster statistics',
    dataType: DATA_TYPES.CLUSTER_STATISTICS,
    shape: 'Record<clusterId, statistics>',
    validate: isPlainObject
  },
  clusterAnnotations: {
    id: 'clusterAnnotations',
    label: 'Cluster annotations',
    dataType: DATA_TYPES.CURATION_STATE,
    shape: 'Record<clusterId, { group, label, note }>',
    validate: isPlainObject
  },
  clusterData: {
    id: 'clusterData',
    label: 'Cluster embedding',
    dataType: DATA_TYPES.CLUSTER_EMBEDDING,
    shape: '{ clusters, clusterIds, numClusters }',
    validate: (value) =>
      isPlainObject(value) &&
      Array.isArray(value.clusters) &&
      Array.isArray(value.clusterIds)
  },
  clusterWaveforms: {
    id: 'clusterWaveforms',
    label: 'Cluster waveforms',
    dataType: DATA_TYPES.WAVEFORMS,
    shape: 'Record<clusterId, waveform[]>',
    validate: isPlainObject
  },
  clusteringResults: {
    id: 'clusteringResults',
    label: 'Clustering results',
    dataType: DATA_TYPES.CLUSTERING_RESULTS,
    shape: '{ available, clusters?, fullData? }',
    validate: (value) => isPlainObject(value) && value.available !== undefined
  },
  signalData: {
    id: 'signalData',
    label: 'Signal trace',
    dataType: DATA_TYPES.SIGNAL_TRACE,
    shape: '{ data, channels?, timeRange? }',
    validate: (value) => isPlainObject(value) || Array.isArray(value)
  },
  datasetInfo: {
    id: 'datasetInfo',
    label: 'Dataset info',
    dataType: DATA_TYPES.DATASET_INFO,
    shape: '{ totalChannels, totalDataPoints }',
    validate: (value) =>
      isPlainObject(value) &&
      (value.totalChannels !== undefined || value.totalDataPoints !== undefined)
  },
  correlograms: {
    id: 'correlograms',
    label: 'Correlograms',
    dataType: DATA_TYPES.CORRELOGRAMS,
    shape: '{ clusterIds, binCentersMs, pairs }',
    validate: (value) => isPlainObject(value) && Array.isArray(value.pairs)
  },
  isiHistograms: {
    id: 'isiHistograms',
    label: 'ISI histograms',
    dataType: DATA_TYPES.ISI_HISTOGRAMS,
    shape: '{ clusterIds, binCentersMs, series }',
    validate: (value) => isPlainObject(value) && Array.isArray(value.series)
  },
  spikeAmplitudes: {
    id: 'spikeAmplitudes',
    label: 'Spike amplitudes',
    dataType: DATA_TYPES.SPIKE_AMPLITUDES,
    shape: '{ clusterIds, sampleRateHz, series }',
    validate: (value) => isPlainObject(value) && Array.isArray(value.series)
  },
  focusedTimeRange: {
    id: 'focusedTimeRange',
    label: 'Focused time range',
    dataType: DATA_TYPES.TIME_RANGE,
    shape: '{ start, end }',
    validate: (value) => isPlainObject(value) && Number.isFinite(Number(value.start)) && Number.isFinite(Number(value.end))
  }
});

export const WIDGET_DATA_CONTRACTS = Object.freeze({
  clusterList: {
    widgetId: 'clusterList',
    label: 'Cluster Curation Table',
    inputs: [
      {
        id: 'clusters',
        label: 'Clusters',
        accepts: [DATA_TYPES.CLUSTER_LIST],
        required: true
      },
      {
        id: 'statistics',
        label: 'Cluster statistics',
        accepts: [DATA_TYPES.CLUSTER_STATISTICS],
        required: false
      },
      {
        id: 'annotations',
        label: 'Curation annotations',
        accepts: [DATA_TYPES.CURATION_STATE],
        required: false
      }
    ]
  },
  spikeList: {
    widgetId: 'spikeList',
    label: 'Spike List Table',
    inputs: [
      {
        id: 'spikes',
        label: 'Spike events',
        accepts: [DATA_TYPES.SPIKE_EVENTS],
        required: true
      },
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: false
      }
    ]
  },
  clusterStats: {
    widgetId: 'clusterStats',
    label: 'Cluster Statistics',
    inputs: [
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: true
      },
      {
        id: 'statistics',
        label: 'Statistics',
        accepts: [DATA_TYPES.CLUSTER_STATISTICS],
        required: true
      }
    ]
  },
  signalView: {
    widgetId: 'signalView',
    label: 'Signal View',
    inputs: [
      {
        id: 'datasetInfo',
        label: 'Dataset info',
        accepts: [DATA_TYPES.DATASET_INFO],
        required: true
      },
      {
        id: 'signal',
        label: 'Signal data',
        accepts: [DATA_TYPES.SIGNAL_TRACE],
        required: false
      },
      {
        id: 'highlightedSpikes',
        label: 'Highlighted spikes',
        accepts: [DATA_TYPES.SPIKE_SELECTION],
        required: false
      },
      {
        id: 'timeRange',
        label: 'Focused time range',
        accepts: [DATA_TYPES.TIME_RANGE],
        required: false
      }
    ]
  },
  dimReduction: {
    widgetId: 'dimReduction',
    label: 'PCA Plot',
    inputs: [
      {
        id: 'clusterData',
        label: 'Cluster embedding',
        accepts: [DATA_TYPES.CLUSTER_EMBEDDING, DATA_TYPES.CLUSTERING_RESULTS],
        required: true
      },
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: false
      },
      {
        id: 'highlightedSpikes',
        label: 'Highlighted spikes',
        accepts: [DATA_TYPES.SPIKE_SELECTION],
        required: false
      }
    ]
  },
  waveform: {
    widgetId: 'waveform',
    label: 'Waveform View',
    inputs: [
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: true
      },
      {
        id: 'waveforms',
        label: 'Waveforms',
        accepts: [DATA_TYPES.WAVEFORMS],
        required: true
      },
      {
        id: 'highlightedSpikes',
        label: 'Highlighted spikes',
        accepts: [DATA_TYPES.SPIKE_SELECTION],
        required: false
      }
    ]
  },
  amplitudeProfile: {
    widgetId: 'amplitudeProfile',
    label: 'Amplitude Distribution',
    inputs: [
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: true
      },
      {
        id: 'waveforms',
        label: 'Waveforms',
        accepts: [DATA_TYPES.WAVEFORMS],
        required: true
      },
      {
        id: 'clusterData',
        label: 'Cluster embedding',
        accepts: [DATA_TYPES.CLUSTER_EMBEDDING],
        required: false
      },
      {
        id: 'clusteringResults',
        label: 'Clustering results',
        accepts: [DATA_TYPES.CLUSTERING_RESULTS],
        required: false
      }
    ]
  },
  clusterComparison: {
    widgetId: 'clusterComparison',
    label: 'Cluster Comparison',
    inputs: [
      {
        id: 'algorithmAData',
        label: 'Algorithm 1 cluster set',
        accepts: [DATA_TYPES.CLUSTER_COMPARISON_SET, DATA_TYPES.CLUSTERING_RESULTS],
        required: false
      },
      {
        id: 'algorithmBData',
        label: 'Algorithm 2 cluster set',
        accepts: [DATA_TYPES.CLUSTER_COMPARISON_SET, DATA_TYPES.CLUSTERING_RESULTS],
        required: false
      }
    ]
  },
  curator: {
    widgetId: 'curator',
    label: 'Curator',
    inputs: [
      {
        id: 'clusterSetData',
        label: 'Cluster set',
        accepts: [DATA_TYPES.CLUSTER_COMPARISON_SET, DATA_TYPES.CLUSTERING_RESULTS],
        required: false
      },
      {
        id: 'signalData',
        label: 'Signal data',
        accepts: [DATA_TYPES.SIGNAL_TRACE],
        required: false
      },
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: false
      }
    ]
  },
  rasterPlot: {
    widgetId: 'rasterPlot',
    label: 'Raster Plot',
    inputs: [
      {
        id: 'spikes',
        label: 'Spike events',
        accepts: [DATA_TYPES.SPIKE_EVENTS],
        required: false
      },
      {
        id: 'selectedClusters',
        label: 'Selected clusters',
        accepts: [DATA_TYPES.CLUSTER_IDS],
        required: false
      },
      {
        id: 'clusterData',
        label: 'Cluster embedding',
        accepts: [DATA_TYPES.CLUSTER_EMBEDDING, DATA_TYPES.CLUSTERING_RESULTS],
        required: false
      },
      {
        id: 'visibleClusters',
        label: 'Visible cluster order',
        accepts: [DATA_TYPES.CLUSTER_ORDER],
        required: false
      }
    ]
  },
  correlogram: {
    widgetId: 'correlogram',
    label: 'Correlogram Matrix',
    inputs: [
      { id: 'clusterData', label: 'Available clusters', accepts: [DATA_TYPES.CLUSTER_EMBEDDING, DATA_TYPES.CLUSTERING_RESULTS], required: true },
      { id: 'selectedClusters', label: 'Selected clusters', accepts: [DATA_TYPES.CLUSTER_IDS], required: false },
      { id: 'spikes', label: 'Spike events', accepts: [DATA_TYPES.SPIKE_EVENTS], required: true },
      { id: 'correlograms', label: 'Precomputed correlograms', accepts: [DATA_TYPES.CORRELOGRAMS], required: false }
    ]
  },
  isiHistogram: {
    widgetId: 'isiHistogram',
    label: 'ISI Histogram',
    inputs: [
      { id: 'clusterData', label: 'Available clusters', accepts: [DATA_TYPES.CLUSTER_EMBEDDING, DATA_TYPES.CLUSTERING_RESULTS], required: true },
      { id: 'selectedClusters', label: 'Selected clusters', accepts: [DATA_TYPES.CLUSTER_IDS], required: false },
      { id: 'spikes', label: 'Spike events', accepts: [DATA_TYPES.SPIKE_EVENTS], required: true },
      { id: 'isiHistograms', label: 'Precomputed ISIs', accepts: [DATA_TYPES.ISI_HISTOGRAMS], required: false }
    ]
  },
  amplitudeTime: {
    widgetId: 'amplitudeTime',
    label: 'Amplitude vs Time / Drift',
    inputs: [
      { id: 'clusterData', label: 'Available clusters', accepts: [DATA_TYPES.CLUSTER_EMBEDDING, DATA_TYPES.CLUSTERING_RESULTS], required: true },
      { id: 'selectedClusters', label: 'Selected clusters', accepts: [DATA_TYPES.CLUSTER_IDS], required: false },
      { id: 'spikes', label: 'Spike events', accepts: [DATA_TYPES.SPIKE_EVENTS], required: true },
      { id: 'amplitudes', label: 'Spike amplitudes', accepts: [DATA_TYPES.SPIKE_AMPLITUDES], required: false },
      { id: 'timeRange', label: 'Focused time range', accepts: [DATA_TYPES.TIME_RANGE], required: false }
    ]
  }
});

export function createDashboardPipelineVariables(values = {}) {
  return Object.entries(PIPELINE_VARIABLE_DEFINITIONS).reduce(
    (variables, [id, definition]) => {
      const value = values[id];
      const hasValue = value !== undefined && value !== null;
      const formatValid = hasValue ? Boolean(definition.validate(value)) : false;

      variables[id] = {
        ...definition,
        value,
        isAvailable: hasValue,
        isFormatValid: formatValid,
        hasData:
          hasValue &&
          (Array.isArray(value) ? value.length > 0 : hasObjectEntries(value))
      };

      return variables;
    },
    {}
  );
}

export function getWidgetDataContract(widgetId) {
  const baseWidgetId = String(widgetId || '').split('__')[0];
  return WIDGET_DATA_CONTRACTS[widgetId] || WIDGET_DATA_CONTRACTS[baseWidgetId] || null;
}

export function isVariableCompatibleWithInput(variable, input) {
  if (!variable || !input) return false;
  return input.accepts.includes(variable.dataType);
}

export function getCompatiblePipelineVariables(input, pipelineVariables) {
  return Object.values(pipelineVariables || {}).filter((variable) =>
    isVariableCompatibleWithInput(variable, input)
  );
}

export function createDefaultWidgetInputBindings(pipelineVariables = PIPELINE_VARIABLE_DEFINITIONS) {
  return Object.entries(WIDGET_DATA_CONTRACTS).reduce((bindings, [widgetId, contract]) => {
    bindings[widgetId] = {};

    contract.inputs.forEach((input) => {
      const compatibleVariable = Object.values(pipelineVariables).find((variable) =>
        input.accepts.includes(variable.dataType)
      );

      bindings[widgetId][input.id] = compatibleVariable?.id || '';
    });

    return bindings;
  }, {});
}

export function mergeWidgetInputBindings(savedBindings = {}, pipelineVariables = PIPELINE_VARIABLE_DEFINITIONS) {
  const defaults = createDefaultWidgetInputBindings(pipelineVariables);

  const mergedBindings = Object.entries(defaults).reduce((merged, [widgetId, defaultInputs]) => {
    merged[widgetId] = {
      ...defaultInputs,
      ...(savedBindings[widgetId] || {})
    };
    return merged;
  }, {});

  Object.entries(savedBindings || {}).forEach(([widgetId, bindings]) => {
    if (mergedBindings[widgetId]) return;

    const baseWidgetId = String(widgetId || '').split('__')[0];
    mergedBindings[widgetId] = {
      ...(defaults[baseWidgetId] || {}),
      ...(bindings || {})
    };
  });

  return mergedBindings;
}

export function validateWidgetBindings(widgetId, bindings = {}, pipelineVariables = {}) {
  const contract = getWidgetDataContract(widgetId);

  if (!contract) {
    return {
      valid: false,
      items: [],
      messages: [`Unknown widget contract: ${widgetId}`]
    };
  }

  const items = contract.inputs.map((input) => {
    const variableId = bindings[input.id] || '';
    const variable = pipelineVariables[variableId];

    if (!variableId) {
      return {
        input,
        variable,
        status: input.required ? 'missing' : 'optional',
        message: input.required ? 'Required input is not wired.' : 'Optional input is not wired.'
      };
    }

    if (!variable) {
      return {
        input,
        variable,
        status: 'missing',
        message: `Variable "${variableId}" is not available.`
      };
    }

    if (!isVariableCompatibleWithInput(variable, input)) {
      return {
        input,
        variable,
        status: 'type-mismatch',
        message: `${DATA_TYPE_LABELS[variable.dataType] || variable.dataType} cannot be used here.`
      };
    }

    if (variable.isAvailable && !variable.isFormatValid) {
      return {
        input,
        variable,
        status: 'format-mismatch',
        message: `Expected ${variable.shape}.`
      };
    }

    return {
      input,
      variable,
      status: 'valid',
      message: variable.isAvailable ? 'Connected.' : 'Connected, waiting for data.'
    };
  });

  const messages = items
    .filter((item) =>
      ['missing', 'type-mismatch', 'format-mismatch'].includes(item.status) &&
      item.input.required
    )
    .map((item) => `${item.input.label}: ${item.message}`);

  return {
    valid: messages.length === 0,
    items,
    messages
  };
}
