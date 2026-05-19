import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CUSTOM_PARAMETER_TYPES,
  getAlgorithmParameterDefinitions,
  getDefaultAlgorithmParameters,
  getPresetsForAlgorithm,
  loadHyperparameterPresets,
  normalizeParameterKey,
  parseParameterValue,
  saveHyperparameterPresets
} from '../utils/hyperparameters';
import './AlgorithmParametersMenu.css';

const DEFAULT_PRESET_ID = '__default_parameters__';

const getAlgorithmLabel = (algorithm) => {
  if (algorithm === 'kilosort4') return 'Kilosort4';
  if (algorithm === 'torchbci_jims') return 'TorchBCI JimsAlgorithm';
  return algorithm || 'Algorithm';
};

const AlgorithmParametersMenu = ({ isOpen, onClose, parameters, onSave, algorithm }) => {
  const [localParams, setLocalParams] = useState(parameters);
  const [presetState, setPresetState] = useState(loadHyperparameterPresets);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [customParam, setCustomParam] = useState({
    name: '',
    type: CUSTOM_PARAMETER_TYPES.NUMBER,
    value: ''
  });
  const [formError, setFormError] = useState('');
  const menuRef = useRef(null);

  const algorithmPresets = useMemo(
    () => getPresetsForAlgorithm(presetState, algorithm),
    [presetState, algorithm]
  );

  const parameterDefinitions = useMemo(
    () => getAlgorithmParameterDefinitions(algorithm, localParams || {}),
    [algorithm, localParams]
  );

  useEffect(() => {
    setLocalParams(parameters);
    setSelectedPresetId('');
    setPresetName('');
    setFormError('');
  }, [algorithm, parameters, isOpen]);

  useEffect(() => {
    saveHyperparameterPresets(presetState);
  }, [presetState]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleChange = (definition, value) => {
    setLocalParams((prev) => ({
      ...prev,
      [definition.key]: parseParameterValue(value, definition)
    }));
  };

  const handleSave = () => {
    onSave(localParams);
    onClose();
  };

  const handleReset = () => {
    setLocalParams(getDefaultAlgorithmParameters(algorithm));
    setSelectedPresetId(DEFAULT_PRESET_ID);
    setFormError('');
  };

  const handlePresetSelect = (presetId) => {
    setSelectedPresetId(presetId);
    setFormError('');

    if (presetId === DEFAULT_PRESET_ID) {
      setLocalParams(getDefaultAlgorithmParameters(algorithm));
      return;
    }

    const preset = algorithmPresets.find((item) => item.id === presetId);
    if (preset) {
      setLocalParams({ ...preset.parameters });
      setPresetName(preset.name);
    }
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      setFormError('Preset name is required.');
      return;
    }

    const existingPreset = algorithmPresets.find(
      (preset) => preset.name.toLowerCase() === name.toLowerCase()
    );
    const presetId = existingPreset?.id || `${algorithm || 'algorithm'}-${Date.now()}`;
    const nextPreset = {
      id: presetId,
      name,
      algorithm,
      parameters: { ...localParams },
      updatedAt: new Date().toISOString()
    };

    setPresetState((prev) => {
      const nextAlgorithmPresets = [
        ...getPresetsForAlgorithm(prev, algorithm).filter((preset) => preset.id !== presetId),
        nextPreset
      ].sort((a, b) => a.name.localeCompare(b.name));

      return {
        ...prev,
        [algorithm]: nextAlgorithmPresets
      };
    });

    setSelectedPresetId(presetId);
    setFormError('');
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId || selectedPresetId === DEFAULT_PRESET_ID) return;

    setPresetState((prev) => ({
      ...prev,
      [algorithm]: getPresetsForAlgorithm(prev, algorithm).filter(
        (preset) => preset.id !== selectedPresetId
      )
    }));
    setSelectedPresetId('');
    setPresetName('');
  };

  const handleCustomParamChange = (field, value) => {
    setCustomParam((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddCustomParam = () => {
    const key = normalizeParameterKey(customParam.name);
    if (!key) {
      setFormError('Custom parameter name is required.');
      return;
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      setFormError('Parameter names must start with a letter or underscore.');
      return;
    }

    if (Object.prototype.hasOwnProperty.call(localParams, key)) {
      setFormError(`"${key}" already exists.`);
      return;
    }

    const definition = {
      key,
      type: customParam.type,
      numberMode: 'float'
    };

    setLocalParams((prev) => ({
      ...prev,
      [key]: parseParameterValue(customParam.value, definition)
    }));
    setCustomParam({
      name: '',
      type: CUSTOM_PARAMETER_TYPES.NUMBER,
      value: ''
    });
    setFormError('');
  };

  const handleRemoveCustomParam = (key) => {
    setLocalParams((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const renderParameterInput = (definition) => {
    const value = localParams?.[definition.key];

    if (definition.options) {
      return (
        <select
          value={value ?? ''}
          onChange={(event) => handleChange(definition, event.target.value)}
        >
          {definition.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (definition.type === CUSTOM_PARAMETER_TYPES.BOOLEAN) {
      return (
        <label className="param-checkbox">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => handleChange(definition, event.target.checked)}
          />
          <span>{value ? 'Enabled' : 'Disabled'}</span>
        </label>
      );
    }

    return (
      <input
        type={definition.type === CUSTOM_PARAMETER_TYPES.NUMBER ? 'number' : 'text'}
        value={value ?? ''}
        onChange={(event) => handleChange(definition, event.target.value)}
        min={definition.min}
        max={definition.max}
        step={definition.step || (definition.numberMode === 'float' ? 'any' : '1')}
        placeholder={definition.placeholder}
      />
    );
  };

  return (
    <div className="algorithm-params-overlay">
      <div className="algorithm-params-menu" ref={menuRef}>
        <div className="params-header">
          <div>
            <h3>Algorithm Parameters</h3>
            <p>{getAlgorithmLabel(algorithm)}</p>
          </div>
          <button className="close-button" onClick={onClose}>x</button>
        </div>

        <div className="params-content">
          <div className="param-presets-panel">
            <div className="param-group">
              <label>Preset</label>
              <select
                value={selectedPresetId}
                onChange={(event) => handlePresetSelect(event.target.value)}
              >
                <option value="">Current parameters</option>
                <option value={DEFAULT_PRESET_ID}>Default parameters</option>
                {algorithmPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="preset-actions">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Preset name"
              />
              <button className="secondary-button" onClick={handleSavePreset}>
                Save Preset
              </button>
              <button
                className="danger-button"
                onClick={handleDeletePreset}
                disabled={!selectedPresetId || selectedPresetId === DEFAULT_PRESET_ID}
              >
                Delete
              </button>
            </div>
          </div>

          {formError && <div className="param-error">{formError}</div>}

          <div className="params-section-title">Registered Hyperparameters</div>
          {parameterDefinitions.map((definition) => (
            <div className="param-group" key={definition.key}>
              <div className="param-label-row">
                <label>{definition.label}</label>
                {definition.custom && (
                  <button
                    className="remove-param-button"
                    onClick={() => handleRemoveCustomParam(definition.key)}
                  >
                    Remove
                  </button>
                )}
              </div>
              {renderParameterInput(definition)}
              {definition.description && <small>{definition.description}</small>}
            </div>
          ))}

          <div className="custom-param-panel">
            <div className="params-section-title">Add Hyperparameter</div>
            <div className="custom-param-grid">
              <input
                type="text"
                value={customParam.name}
                onChange={(event) => handleCustomParamChange('name', event.target.value)}
                placeholder="parameter_name"
              />
              <select
                value={customParam.type}
                onChange={(event) => handleCustomParamChange('type', event.target.value)}
              >
                <option value={CUSTOM_PARAMETER_TYPES.NUMBER}>Number</option>
                <option value={CUSTOM_PARAMETER_TYPES.STRING}>Text</option>
                <option value={CUSTOM_PARAMETER_TYPES.BOOLEAN}>Boolean</option>
              </select>
              {customParam.type === CUSTOM_PARAMETER_TYPES.BOOLEAN ? (
                <label className="param-checkbox custom-param-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(customParam.value)}
                    onChange={(event) =>
                      handleCustomParamChange('value', event.target.checked)
                    }
                  />
                  <span>{customParam.value ? 'True' : 'False'}</span>
                </label>
              ) : (
                <input
                  type={customParam.type === CUSTOM_PARAMETER_TYPES.NUMBER ? 'number' : 'text'}
                  value={customParam.value}
                  onChange={(event) => handleCustomParamChange('value', event.target.value)}
                  placeholder="Default value"
                />
              )}
              <button className="secondary-button" onClick={handleAddCustomParam}>
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="params-footer">
          <button className="reset-button" onClick={handleReset}>Reset to Defaults</button>
          <div className="footer-actions">
            <button className="cancel-button" onClick={onClose}>Cancel</button>
            <button className="save-button" onClick={handleSave}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlgorithmParametersMenu;

