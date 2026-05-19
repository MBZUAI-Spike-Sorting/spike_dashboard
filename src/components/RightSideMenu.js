import React, { useMemo, useState } from 'react';
import ViewManager from './ViewManager';
import WidgetDataWiringPanel from './WidgetDataWiringPanel';
import './RightSideMenu.css';

const DEMO_ALGORITHM_OPTIONS = [
  {
    name: 'kilosort4',
    displayName: 'Kilosort4',
    available: true,
    requiresRun: true
  },
  {
    name: 'mountainsort5',
    displayName: 'MountainSort5',
    available: true,
    requiresRun: true
  },
  {
    name: 'rtsort',
    displayName: 'RTSort',
    available: true,
    requiresRun: true
  }
];

const RightSideMenu = ({
  demoMode = false,
  isWidgetBankOpen,
  onWidgetBankToggle,
  widgetStates,
  onViewChange,
  getWidgetPositionsAndSizes,
  algorithms,
  selectedAlgorithm,
  onAlgorithmChange,
  onRunAlgorithm,
  onStopAlgorithm,
  isRunningAlgorithm,
  pipelineJob,
  pipelineStatus,
  pipelineMessage,
  pipelineError,
  onOpenParameters,
  pipelineVariables,
  widgetInputBindings,
  onWidgetBindingChange
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const displayAlgorithms = useMemo(() => {
    if (demoMode) return DEMO_ALGORITHM_OPTIONS;
    return algorithms || [];
  }, [algorithms, demoMode]);

  const selectedAlgo =
    displayAlgorithms.find((a) => a.name === selectedAlgorithm) ||
    displayAlgorithms[0];

  const showParametersButton =
    !demoMode &&
    (selectedAlgo?.name === 'torchbci_jims' || selectedAlgo?.name === 'kilosort4') &&
    selectedAlgo?.available;

  const showRunButton = true;
  const isRunDisabled = demoMode || !selectedAlgorithm || isRunningAlgorithm;
  const isStopDisabled =
    demoMode || !isRunningAlgorithm || pipelineStatus === 'cancel_requested';

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <div
        className={`right-menu-tab ${isOpen ? 'open' : ''}`}
        onClick={handleToggle}
        title={isOpen ? 'Close menu' : 'Open menu'}
      >
        <span className="tab-icon">{isOpen ? '›' : '‹'}</span>
        <span className="tab-text">Menu</span>
      </div>

      <div className={`right-side-menu ${isOpen ? 'open' : ''}`}>
        <div className="right-menu-header">
          <h3>Controls</h3>
          <button className="close-menu-btn" onClick={handleToggle}>
            ✕
          </button>
        </div>

        <div className="right-menu-content">
          <div className="menu-section">
            <div className="section-label">Widgets</div>
            <button
              className={`menu-widget-btn ${isWidgetBankOpen ? 'active' : ''}`}
              onClick={onWidgetBankToggle}
              title="Open Widget Bank"
            >
              <span className="btn-icon">🧩</span>
              <span className="btn-label">Widget Bank</span>
              <span className={`btn-arrow ${isWidgetBankOpen ? 'open' : ''}`}>▼</span>
            </button>
          </div>

          <div className="menu-section">
            <div className="section-label">Layout</div>
            <ViewManager
              currentWidgetStates={widgetStates}
              onViewChange={onViewChange}
              getWidgetPositionsAndSizes={getWidgetPositionsAndSizes}
            />
          </div>

          <div className="menu-section">
            <div className="section-label">Data Wiring</div>
            <WidgetDataWiringPanel
              widgetStates={widgetStates}
              widgetInputBindings={widgetInputBindings}
              pipelineVariables={pipelineVariables}
              onBindingChange={onWidgetBindingChange}
            />
          </div>

          <div className="menu-section">
            <div className="section-label">Algorithm</div>
            <div className="algorithm-controls">
              <select
                className="menu-select"
                value={selectedAlgorithm || displayAlgorithms[0]?.name || ''}
                onChange={(e) => onAlgorithmChange(e.target.value)}
                disabled={!displayAlgorithms || displayAlgorithms.length === 0}
              >
                {displayAlgorithms.map((algo) => (
                  <option key={algo.name} value={algo.name} disabled={!algo.available}>
                    {algo.displayName}{!algo.available ? ' (unavailable)' : ''}
                  </option>
                ))}
              </select>

              <div className="algorithm-actions">
                {showParametersButton && (
                  <button
                    className="menu-params-btn"
                    onClick={onOpenParameters}
                    title="Configure algorithm parameters"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6m0 6v6m8.66-13.66l-4.24 4.24m-4.24 4.24L7.34 22.66M23 12h-6m-6 0H1m20.66 8.66l-4.24-4.24m-4.24-4.24L1.34 1.34" />
                    </svg>
                  </button>
                )}

                {showRunButton && (
                  <button
                    className="menu-run-btn"
                    onClick={demoMode ? undefined : onRunAlgorithm}
                    disabled={isRunDisabled}
                    title={
                      demoMode
                        ? 'Run is disabled in playground mode'
                        : isRunningAlgorithm
                        ? 'Algorithm is running...'
                        : 'Run spike sorting algorithm'
                    }
                    style={
                      demoMode
                        ? {
                            cursor: 'not-allowed',
                            opacity: 0.5,
                            filter: 'grayscale(1)'
                          }
                        : undefined
                    }
                  >
                    {isRunningAlgorithm && !demoMode ? (
                      <>
                        <span className="spinner"></span>
                        {pipelineStatus === 'cancel_requested' ? 'Stopping...' : 'Running...'}
                      </>
                    ) : (
                      <>
                        <span className="run-icon">▶</span>
                        Run
                      </>
                    )}
                  </button>
                )}

                {showRunButton && (
                  <button
                    className="menu-stop-btn"
                    onClick={onStopAlgorithm}
                    disabled={isStopDisabled}
                    title={
                      demoMode
                        ? 'Stop is disabled in playground mode'
                        : pipelineStatus === 'cancel_requested'
                        ? 'Stop has already been requested'
                        : 'Stop the active pipeline'
                    }
                  >
                    Stop
                  </button>
                )}
              </div>

              <div className={`pipeline-status ${pipelineStatus || 'idle'}`}>
                <span className="pipeline-status-dot" />
                <span>
                  {pipelineMessage ||
                    (pipelineJob?.status
                      ? `Pipeline ${pipelineJob.status}`
                      : 'Pipeline idle')}
                </span>
              </div>

              {pipelineError && (
                <div className="pipeline-error">
                  {pipelineError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isOpen && <div className="right-menu-overlay" onClick={handleToggle} />}
    </>
  );
};

export default RightSideMenu;
