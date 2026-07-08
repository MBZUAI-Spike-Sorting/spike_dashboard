import React, { useEffect, useMemo, useState } from 'react';
import {
  DATA_TYPE_LABELS,
  WIDGET_DATA_CONTRACTS,
  getCompatiblePipelineVariables,
  getWidgetDataContract,
  isVariableCompatibleWithInput,
  validateWidgetBindings
} from '../widgets/dataContracts';
import './WidgetDataWiringPanel.css';

const WidgetDataWiringPanel = ({
  widgetStates = {},
  widgetInputBindings = {},
  pipelineVariables = {},
  onBindingChange
}) => {
  const visibleWidgetIds = useMemo(
    () =>
      Object.keys(widgetStates).filter(
        (widgetId) => widgetStates[widgetId]?.visible
      ),
    [widgetStates]
  );

  const [selectedWidgetId, setSelectedWidgetId] = useState(
    visibleWidgetIds[0] || Object.keys(widgetStates)[0] || Object.keys(WIDGET_DATA_CONTRACTS)[0]
  );

  useEffect(() => {
    if (visibleWidgetIds.length === 0) return;
    if (!visibleWidgetIds.includes(selectedWidgetId)) {
      setSelectedWidgetId(visibleWidgetIds[0]);
    }
  }, [selectedWidgetId, visibleWidgetIds]);

  const contract = getWidgetDataContract(selectedWidgetId);
  const bindings = widgetInputBindings[selectedWidgetId] || {};
  const validation = validateWidgetBindings(
    selectedWidgetId,
    bindings,
    pipelineVariables
  );

  if (!contract) return null;

  const variableList = Object.values(pipelineVariables);

  return (
    <div className="widget-data-wiring">
      <select
        className="wiring-widget-select"
        value={selectedWidgetId}
        onChange={(event) => setSelectedWidgetId(event.target.value)}
      >
        {Object.keys(widgetStates).map((widgetId) => {
          const item = getWidgetDataContract(widgetId);
          const state = widgetStates[widgetId] || {};
          if (!item) return null;

          return (
          <option key={widgetId} value={widgetId}>
            {state.title || item.label}
            {state.visible ? '' : ' (hidden)'}
          </option>
          );
        })}
      </select>

      <div className={`wiring-status ${validation.valid ? 'valid' : 'invalid'}`}>
        {validation.valid ? 'Ready' : 'Needs wiring'}
      </div>

      <div className="wiring-input-list">
        {contract.inputs.map((input) => {
          const compatibleVariables = getCompatiblePipelineVariables(
            input,
            pipelineVariables
          );
          const selectedVariableId = bindings[input.id] || '';
          const selectedVariable = pipelineVariables[selectedVariableId];
          const validationItem = validation.items.find(
            (item) => item.input.id === input.id
          );

          return (
            <div className="wiring-input-row" key={input.id}>
              <div className="wiring-input-heading">
                <span>{input.label}</span>
                {input.required && <span className="required-marker">Required</span>}
              </div>

              <div className="wiring-type-list">
                {input.accepts.map((type) => (
                  <span key={type} className="wiring-type-pill">
                    {DATA_TYPE_LABELS[type] || type}
                  </span>
                ))}
              </div>

              <select
                className="wiring-variable-select"
                value={selectedVariableId}
                onChange={(event) =>
                  onBindingChange?.(
                    selectedWidgetId,
                    input.id,
                    event.target.value
                  )
                }
              >
                <option value="">
                  {input.required ? 'Select a variable' : 'Not wired'}
                </option>
                {variableList.map((variable) => {
                  const compatible = isVariableCompatibleWithInput(variable, input);
                  return (
                    <option
                      key={variable.id}
                      value={variable.id}
                      disabled={!compatible}
                    >
                      {variable.label} - {DATA_TYPE_LABELS[variable.dataType] || variable.dataType}
                    </option>
                  );
                })}
              </select>

              <div className={`wiring-message ${validationItem?.status || 'optional'}`}>
                {validationItem?.message ||
                  `${compatibleVariables.length} compatible variable(s) available.`}
                {selectedVariable?.isAvailable && !selectedVariable.hasData
                  ? ' No records loaded yet.'
                  : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WidgetDataWiringPanel;

