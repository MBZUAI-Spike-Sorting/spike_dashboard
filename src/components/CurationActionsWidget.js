import React from 'react';
import './CurationActionsWidget.css';

const operationSummary = (operation) => operation.type === 'merge'
  ? `Merge ${operation.clusterIds.map((clusterId) => `C${clusterId}`).join(' + ')} → C${operation.targetClusterId}`
  : `Split ${operation.spikeIds.length} spikes from C${operation.sourceClusterId} → C${operation.targetClusterId}`;

const CurationActionsWidget = ({
  session = null,
  currentClusterCount = 0,
  selectedClusters = [],
  selectedSpikes = [],
  error = '',
  recoveryMessage = '',
  exportPayload = null,
  exportFilename = 'spikescope-curated-assignments.json',
  onMerge,
  onSplit,
  onUndo,
  onRedo,
  onReset,
  onClearSpikeSelection,
}) => {
  const exportAssignments = () => {
    if (!exportPayload) return;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  if (!session) {
    return <div className="curation-actions-message">Load clustering results to start a curation session.</div>;
  }

  return (
    <div className="curation-actions-widget">
      <div className="curation-actions-toolbar">
        <button
          type="button"
          disabled={selectedClusters.length < 2}
          onClick={onMerge}
          title="Merge all currently selected clusters; this can be undone"
        >
          Merge selected ({selectedClusters.length})
        </button>
        <button
          type="button"
          disabled={selectedSpikes.length === 0}
          onClick={onSplit}
          title="Split the exact shared spike-ID selection into a new cluster"
        >
          Split selected spikes ({selectedSpikes.length})
        </button>
        <button type="button" disabled={session.cursor === 0} onClick={onUndo}>Undo</button>
        <button
          type="button"
          disabled={session.cursor >= session.operations.length}
          onClick={onRedo}
        >
          Redo
        </button>
        <button type="button" disabled={selectedSpikes.length === 0} onClick={onClearSpikeSelection}>
          Clear spikes
        </button>
        <button type="button" disabled={!exportPayload} onClick={exportAssignments}>
          Export assignments
        </button>
        <button
          type="button"
          className="curation-reset-button"
          onClick={() => {
            if (window.confirm('Discard this browser curation history and return to original assignments?')) {
              onReset?.();
            }
          }}
        >
          Reset session
        </button>
      </div>

      <div className="curation-session-summary">
        <span><strong>Revision</strong> {session.revision}</span>
        <span><strong>Clusters</strong> {currentClusterCount}</span>
        <span><strong>Applied operations</strong> {session.cursor}/{session.operations.length}</span>
        <span>Original sorter data remains unchanged.</span>
      </div>

      {(error || recoveryMessage) && (
        <div className={error ? 'curation-action-error' : 'curation-recovery-message'} role="status">
          {error || recoveryMessage}
        </div>
      )}

      <div className="curation-history">
        <h3>Deterministic operation history</h3>
        {session.operations.length === 0 ? (
          <div className="curation-history-empty">No merge or split operations yet.</div>
        ) : (
          <ol>
            {session.operations.map((operation, index) => (
              <li key={operation.id} className={index < session.cursor ? 'applied' : 'undone'}>
                <span>{operation.id}</span>
                <strong>{operationSummary(operation)}</strong>
                <em>{index < session.cursor ? 'applied' : 'undone'}</em>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="curation-actions-help">
        Use Ctrl/Cmd/Shift for additive cluster selection. Lasso or box spikes in PCA/feature views before splitting. Undo/redo changes only this browser session; export writes a new JSON file.
      </div>
    </div>
  );
};

export default CurationActionsWidget;
