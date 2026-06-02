# Linkable Custom Spike Sorting Pipeline Tutorial

This document describes the current SpikeScope convention for custom spike
sorting pipelines that are linked from a GitHub repository.

The dashboard currently stores and displays linked repositories. It does not
execute arbitrary linked code yet. Execution should stay disabled until the
runner can clone repositories into an isolated environment, validate the
entrypoint contract, enforce per-user permissions, and apply resource limits.

## Access Rules

- Guests can use the GUI and inspect preprocessed outputs only.
- Regular users can run predefined CPU/torchBCI workflows.
- Pro users can link custom pipeline repositories and use GPU-backed workflows.
- Admin users can link custom pipelines and manage other user roles.

## Recommended Repository Layout

```text
my-spike-pipeline/
  README.md
  requirements.txt
  pipeline.py
  tests/
    test_pipeline_contract.py
```

The file selected in the dashboard's `Entry .py` field should expose a small,
predictable Python interface. The default entrypoint name is usually
`pipeline.py`.

## Entrypoint Contract

A linkable pipeline should provide:

- `PIPELINE_METADATA`: static information used for display and validation.
- `get_default_parameters()`: returns editable default parameters.
- `run_pipeline(input_path, output_dir, parameters)`: runs the sorter and
  returns a serializable result dictionary.

Example:

```python
from pathlib import Path


PIPELINE_METADATA = {
    "name": "Example Threshold Sorter",
    "version": "0.1.0",
    "description": "Minimal custom sorter example for SpikeScope.",
    "requires_gpu": False,
    "supported_input": ["pt", "npy", "h5"],
}


def get_default_parameters():
    return {
        "threshold": 5.0,
        "refractory_ms": 1.5,
        "max_clusters": 8,
    }


def run_pipeline(input_path, output_dir, parameters=None):
    parameters = {
        **get_default_parameters(),
        **(parameters or {}),
    }

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Replace this section with the actual sorter.
    clusters = [
        {
            "cluster_id": 0,
            "spike_times": [120, 340, 560],
            "spike_channels": [12, 12, 13],
            "amplitudes": [41.2, 39.8, 44.1],
        }
    ]

    return {
        "status": "completed",
        "clusters": clusters,
        "metrics": {
            "num_clusters": len(clusters),
            "threshold": parameters["threshold"],
        },
        "artifacts": {},
    }
```

## Result Format

`run_pipeline` should return JSON-serializable data:

```python
{
    "status": "completed",
    "clusters": [
        {
            "cluster_id": 0,
            "spike_times": [120, 340, 560],
            "spike_channels": [12, 12, 13],
            "amplitudes": [41.2, 39.8, 44.1],
        }
    ],
    "metrics": {
        "num_clusters": 1
    },
    "artifacts": {
        "labels": "labels.npy"
    }
}
```

Required cluster fields:

- `cluster_id`: integer or string identifier.
- `spike_times`: spike sample indices or timestamps.

Recommended cluster fields:

- `spike_channels`: channel IDs for each spike.
- `amplitudes`: spike amplitudes for visualizations such as Amplitude Profile.
- `waveforms`: optional waveform snippets when the pipeline can provide them.

## Linking From The Dashboard

1. Sign in as a Pro or Admin user.
2. Open `Dashboard`.
3. Open the right-side menu.
4. In `Custom Pipelines`, enter the GitHub repository URL, branch, entrypoint,
   name, and optional description.
5. Save the link.

For demo or non-Pro users, the custom pipeline area is read-only and shows a
placeholder pipeline or an access message.

## Security Notes

Before execution is enabled, the backend runner should:

- Clone only from an allowed provider or allowlist.
- Pin commits or immutable refs when possible.
- Run in a temporary isolated environment.
- Apply CPU, memory, GPU, wall-time, and disk quotas.
- Restrict network access during execution unless explicitly approved.
- Validate the returned result schema before exposing it to widgets.
- Store outputs per user and dataset to avoid cross-user leakage.

## Local Validation Checklist

Pipeline authors should verify:

- `python -m py_compile pipeline.py` succeeds.
- `get_default_parameters()` returns a JSON-serializable dictionary.
- `run_pipeline(...)` writes artifacts only inside `output_dir`.
- Returned arrays/lists have matching lengths per cluster.
- The repository README explains required dependencies and expected input data.
