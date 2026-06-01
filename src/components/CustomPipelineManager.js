import React, { useState } from 'react';
import './CustomPipelineManager.css';

const INITIAL_FORM = {
  name: '',
  repositoryUrl: '',
  branch: 'main',
  entrypoint: '',
  description: ''
};

const CustomPipelineManager = ({
  pipelines = [],
  isLoading = false,
  error = null,
  onAddPipeline,
  onDeletePipeline,
  readOnly = false,
  readOnlyLabel = 'Demo only'
}) => {
  const [form, setForm] = useState(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!onAddPipeline || isSubmitting) return;

    setIsSubmitting(true);
    setLocalError(null);

    try {
      await onAddPipeline(form);
      setForm(INITIAL_FORM);
    } catch (submitError) {
      setLocalError(submitError.message || 'Failed to link custom pipeline');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (pipelineId) => {
    if (!onDeletePipeline || isSubmitting) return;
    setLocalError(null);

    try {
      await onDeletePipeline(pipelineId);
    } catch (deleteError) {
      setLocalError(deleteError.message || 'Failed to remove custom pipeline');
    }
  };

  return (
    <div className="custom-pipeline-manager">
      {readOnly ? (
        <div className="custom-pipeline-readonly">{readOnlyLabel}</div>
      ) : (
        <form className="custom-pipeline-form" onSubmit={handleSubmit}>
          <label className="custom-pipeline-field">
            <span>Name</span>
            <input
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="My sorter"
              maxLength={80}
              required
            />
          </label>

          <label className="custom-pipeline-field">
            <span>GitHub URL</span>
            <input
              type="url"
              value={form.repositoryUrl}
              onChange={handleChange('repositoryUrl')}
              placeholder="https://github.com/org/repo"
              required
            />
          </label>

          <div className="custom-pipeline-row">
            <label className="custom-pipeline-field">
              <span>Branch</span>
              <input
                type="text"
                value={form.branch}
                onChange={handleChange('branch')}
                placeholder="main"
                maxLength={120}
                required
              />
            </label>

            <label className="custom-pipeline-field">
              <span>Entry .py</span>
              <input
                type="text"
                value={form.entrypoint}
                onChange={handleChange('entrypoint')}
                placeholder="pipeline.py"
                required
              />
            </label>
          </div>

          <label className="custom-pipeline-field">
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={handleChange('description')}
              rows={2}
              maxLength={300}
            />
          </label>

          {(localError || error) && (
            <div className="custom-pipeline-error">{localError || error}</div>
          )}

          <button className="custom-pipeline-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Linking...' : 'Link Pipeline'}
          </button>
        </form>
      )}

      <div className="custom-pipeline-list">
        {isLoading && <div className="custom-pipeline-empty">Loading pipelines...</div>}

        {!isLoading && pipelines.length === 0 && (
          <div className="custom-pipeline-empty">No custom pipelines linked.</div>
        )}

        {!isLoading && pipelines.map((pipeline) => (
          <div className="custom-pipeline-item" key={pipeline.id}>
            <div className="custom-pipeline-item-main">
              <div className="custom-pipeline-name">{pipeline.name}</div>
              <div className="custom-pipeline-meta">
                {pipeline.branch} / {pipeline.entrypoint}
              </div>
              <a
                className="custom-pipeline-url"
                href={pipeline.repositoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                {pipeline.repositoryUrl}
              </a>
            </div>

            {!readOnly && (
              <button
                className="custom-pipeline-delete"
                type="button"
                onClick={() => handleDelete(pipeline.id)}
                title="Remove linked pipeline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomPipelineManager;
