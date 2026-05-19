import {
  DEFAULT_JIMS_PARAMETERS,
  DEFAULT_KILOSORT_PARAMETERS
} from '../constants/config';

export const HYPERPARAMETER_PRESETS_STORAGE_KEY =
  'spike_dashboard_algorithm_parameter_presets';

export const CUSTOM_PARAMETER_TYPES = Object.freeze({
  NUMBER: 'number',
  STRING: 'string',
  BOOLEAN: 'boolean'
});

export const ALGORITHM_PARAMETER_DEFINITIONS = Object.freeze({
  torchbci_jims: [
    {
      key: 'window_size',
      label: 'Window Size',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'threshold',
      label: 'Threshold',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'frame_size',
      label: 'Frame Size',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'normalize',
      label: 'Normalize',
      type: CUSTOM_PARAMETER_TYPES.STRING,
      options: [
        { value: 'zscore', label: 'Z-Score' },
        { value: 'none', label: 'None' }
      ]
    },
    {
      key: 'sort_by',
      label: 'Sort By',
      type: CUSTOM_PARAMETER_TYPES.STRING,
      options: [
        { value: 'value', label: 'Value' },
        { value: 'time', label: 'Time' }
      ]
    },
    {
      key: 'leniency_channel',
      label: 'Leniency Channel',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 0
    },
    {
      key: 'leniency_time',
      label: 'Leniency Time',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 0
    },
    {
      key: 'similarity_mode',
      label: 'Similarity Mode',
      type: CUSTOM_PARAMETER_TYPES.STRING,
      options: [
        { value: 'cosine', label: 'Cosine' },
        { value: 'euclidean', label: 'Euclidean' }
      ]
    },
    {
      key: 'outlier_threshold',
      label: 'Outlier Threshold',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'float',
      min: 0,
      max: 1,
      step: 0.1
    },
    {
      key: 'n_clusters',
      label: 'Number of Clusters',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'cluster_feature_size',
      label: 'Cluster Feature Size',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'n_jims_features',
      label: 'JIMS Features',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1
    },
    {
      key: 'pad_value',
      label: 'Pad Value',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer'
    }
  ],
  kilosort4: [
    {
      key: 'probe_path',
      label: 'Probe Path',
      type: CUSTOM_PARAMETER_TYPES.STRING,
      placeholder: 'torchbci/data/NeuroPix1_default.mat',
      description: 'Path to probe configuration file'
    },
    {
      key: 'sampling_rate',
      label: 'Sampling Rate (Hz)',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      numberMode: 'integer',
      min: 1000,
      description: 'Recording sampling rate'
    }
  ]
});

export function getDefaultAlgorithmParameters(algorithm) {
  if (algorithm === 'kilosort4') {
    return { ...DEFAULT_KILOSORT_PARAMETERS };
  }

  return { ...DEFAULT_JIMS_PARAMETERS };
}

export function getAlgorithmParameterDefinitions(algorithm, parameters = {}) {
  const builtInDefinitions = ALGORITHM_PARAMETER_DEFINITIONS[algorithm] ||
    ALGORITHM_PARAMETER_DEFINITIONS.torchbci_jims;
  const builtInKeys = new Set(builtInDefinitions.map((definition) => definition.key));
  const customDefinitions = Object.keys(parameters)
    .filter((key) => !builtInKeys.has(key))
    .sort()
    .map((key) => ({
      key,
      label: formatParameterLabel(key),
      type: inferParameterType(parameters[key]),
      custom: true
    }));

  return [...builtInDefinitions, ...customDefinitions];
}

export function inferParameterType(value) {
  if (typeof value === 'boolean') return CUSTOM_PARAMETER_TYPES.BOOLEAN;
  if (typeof value === 'number') return CUSTOM_PARAMETER_TYPES.NUMBER;
  return CUSTOM_PARAMETER_TYPES.STRING;
}

export function parseParameterValue(value, definition = {}) {
  if (definition.type === CUSTOM_PARAMETER_TYPES.BOOLEAN) {
    return Boolean(value);
  }

  if (definition.type === CUSTOM_PARAMETER_TYPES.NUMBER) {
    if (value === '') return '';

    const numericValue =
      definition.numberMode === 'float'
        ? parseFloat(value)
        : parseInt(value, 10);

    return Number.isNaN(numericValue) ? '' : numericValue;
  }

  return value;
}

export function formatParameterLabel(key) {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeParameterKey(value) {
  return value.trim().replace(/\s+/g, '_');
}

export function getPresetsForAlgorithm(presetState = {}, algorithm) {
  return presetState[algorithm] || [];
}

export function loadHyperparameterPresets() {
  try {
    const saved = localStorage.getItem(HYPERPARAMETER_PRESETS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Error loading hyperparameter presets:', error);
    return {};
  }
}

export function saveHyperparameterPresets(presetState) {
  localStorage.setItem(
    HYPERPARAMETER_PRESETS_STORAGE_KEY,
    JSON.stringify(presetState)
  );
}

