# Read-only Analysis Workspace

The Analysis Workspace is SpikeScope's safe browser counterpart to Phy's interactive IPython view. It exposes structured state and export helpers, not a code editor or execution environment.

## Security boundary

- No user text is passed to `eval`, `exec`, a shell, Python, Flask, or a dynamic module loader.
- The widget performs only local inspection, clipboard writes, and an explicit browser download initiated by the user.
- Session exports omit authentication credentials, raw signal samples, and full pipeline values.
- Python is shown as inert, copyable text for execution in a notebook controlled by the user.
- API authentication remains the responsibility of the notebook user; exported snippets never include browser tokens.

## Session manifest

Exports use the versioned `spikescope.analysis-session` schema. A manifest contains:

- dataset identity, sampling metadata, selected algorithm, and API base URL;
- cluster records, metrics, annotations, and visible table order;
- selected cluster IDs, highlighted spike identities, and the focused sample range;
- active layout, widget geometry, per-widget input bindings, and typed pipeline-variable summaries;
- provenance flags and documented bounded data endpoints.

The export intentionally contains summaries and references rather than raw recordings. This keeps it inspectable and suitable as a reproducible starting point for a local notebook.

## Notebook use

Use **Export JSON**, save the manifest beside a notebook, and copy the Python tab. The snippet loads the manifest with Python's standard `json` module and demonstrates a bounded request to `/api/cluster-statistics` using the exported selection and algorithm.

Other documented endpoints listed in the manifest can be called in the same way:

- `GET /api/dataset-info`
- `POST /api/cluster-statistics`
- `POST /api/cluster-waveforms`
- `POST /api/cluster-correlograms`
- `POST /api/cluster-isi-histograms`

Add an `Authorization` header in the notebook when required by the deployment. Do not paste credentials into the dashboard export.
