import React, { useMemo, useState } from 'react';
import {
  createManifestFilename,
  createNotebookSnippet,
} from '../utils/analysisWorkspace';
import './AnalysisWorkspaceWidget.css';

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const AnalysisWorkspaceWidget = ({ manifest }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [copyStatus, setCopyStatus] = useState('');
  const manifestJson = useMemo(() => JSON.stringify(manifest, null, 2), [manifest]);
  const pythonSnippet = useMemo(() => createNotebookSnippet(manifest), [manifest]);
  const visibleWidgets = (manifest?.dashboard?.widgets || []).filter((widget) => widget.visible);

  const copy = async (value, label) => {
    try {
      await copyText(value);
      setCopyStatus(`${label} copied`);
    } catch (_error) {
      setCopyStatus(`Unable to copy ${label.toLowerCase()}`);
    }
  };

  const downloadManifest = () => {
    const blob = new Blob([manifestJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = createManifestFilename(manifest);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="analysis-workspace-widget">
      <div className="analysis-workspace-toolbar">
        <div className="analysis-workspace-tabs" aria-label="Analysis workspace sections">
          {['overview', 'json', 'python'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'json' ? 'Session JSON' : tab === 'python' ? 'Python' : 'Overview'}
            </button>
          ))}
        </div>
        <button type="button" onClick={downloadManifest}>Export JSON</button>
        <button type="button" onClick={() => copy(manifestJson, 'Session JSON')}>Copy JSON</button>
        <button type="button" onClick={() => copy(pythonSnippet, 'Python snippet')}>Copy Python</button>
        <span className="analysis-copy-status" role="status">{copyStatus}</span>
      </div>

      <div className="analysis-security-note">
        Read-only workspace: no entered text is evaluated, and no arbitrary code runs in Flask or the browser. Exports omit credentials and raw signal samples.
      </div>

      <div className="analysis-workspace-content">
        {activeTab === 'overview' && (
          <div className="analysis-overview">
            <section>
              <h3>Current source</h3>
              <dl>
                <dt>Dataset</dt><dd>{manifest?.source?.dataset?.name || manifest?.source?.dataset?.id || 'Not selected'}</dd>
                <dt>Mode</dt><dd>{manifest?.source?.dataset?.mode || 'live'}</dd>
                <dt>Algorithm</dt><dd>{manifest?.source?.algorithm || 'Not selected'}</dd>
                <dt>Channels</dt><dd>{manifest?.source?.datasetInfo?.totalChannels ?? '—'}</dd>
                <dt>Samples</dt><dd>{manifest?.source?.datasetInfo?.totalDataPoints?.toLocaleString?.() ?? '—'}</dd>
              </dl>
            </section>
            <section>
              <h3>Cluster and selection state</h3>
              <dl>
                <dt>Clusters</dt><dd>{manifest?.clusters?.records?.length || 0}</dd>
                <dt>Visible order</dt><dd>{manifest?.clusters?.visibleOrder?.length || 0}</dd>
                <dt>Selected clusters</dt><dd>{manifest?.selection?.clusterIds?.join(', ') || 'None'}</dd>
                <dt>Selected spikes</dt><dd>{manifest?.selection?.spikes?.length || 0}</dd>
                <dt>Time range</dt><dd>{manifest?.selection?.timeRangeSamples
                  ? `${manifest.selection.timeRangeSamples.start}–${manifest.selection.timeRangeSamples.end} samples`
                  : 'None'}</dd>
              </dl>
            </section>
            <section className="analysis-widget-section">
              <h3>Visible widgets and data wiring</h3>
              {visibleWidgets.length === 0 ? <p>No visible widgets.</p> : (
                <div className="analysis-widget-list">
                  {visibleWidgets.map((widget) => (
                    <article key={widget.widgetId}>
                      <strong>{widget.title || widget.type}</strong>
                      <span>{widget.widgetId}</span>
                      <code>{Object.entries(widget.inputBindings || {}).map(([input, variable]) => (
                        `${input} ← ${variable || 'not wired'}`
                      )).join('\n') || 'No declared bindings'}</code>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="analysis-provenance-section">
              <h3>Documented data APIs</h3>
              <p>Base URL: <code>{manifest?.source?.apiBaseUrl || '(same origin)'}</code></p>
              <div className="analysis-api-list">
                {(manifest?.provenance?.apiContracts || []).map((contract) => (
                  <div key={`${contract.method}:${contract.path}`}>
                    <strong>{contract.method}</strong><code>{contract.path}</code><span>{contract.purpose}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        {activeTab === 'json' && <pre className="analysis-code-preview">{manifestJson}</pre>}
        {activeTab === 'python' && (
          <div className="analysis-python-panel">
            <p>Save the JSON export beside a local notebook, then run this snippet. Add your own authorization header if the deployment requires one.</p>
            <pre className="analysis-code-preview">{pythonSnippet}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisWorkspaceWidget;
