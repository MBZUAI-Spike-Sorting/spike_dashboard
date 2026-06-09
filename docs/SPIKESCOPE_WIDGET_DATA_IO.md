# SpikeScope Widget Data I/O

This document describes the JSON-facing data format used when SpikeScope dashboard widgets exchange data with backend blocks, frontend widgets, or saved pipeline outputs.

The long-term rule is:

- Backend block to widget, widget to backend block, and widget to widget data should be represented as JSON-compatible payloads.
- Backend block to backend block data may remain in optimized backend containers such as tensors or arrays.
- Widget payloads should carry both `metadata` and `data` so consumers can validate shape, units, and provenance before rendering.

## Common Envelope

Use this envelope when serializing data across the frontend/backend boundary:

```json
{
  "kind": "spikescope.cluster_set",
  "version": "1.0",
  "metadata": {
    "source": "kilosort4",
    "dataset": "c46_data_5percent.pt",
    "units": {
      "time": "samples"
    }
  },
  "data": {}
}
```

Fields:

- `kind`: Stable payload type identifier.
- `version`: Format version for the payload type.
- `metadata`: Optional labels, provenance, units, algorithm names, and dataset identifiers.
- `data`: Required widget data payload.

## Shared Payload Types

### `spikescope.cluster_list`

Used by Cluster List.

```json
{
  "kind": "spikescope.cluster_list",
  "version": "1.0",
  "metadata": {},
  "data": {
    "clusters": [
      { "id": 0, "size": 1518 },
      { "id": 1, "size": 944 }
    ]
  }
}
```

### `spikescope.cluster_ids`

Used when a widget needs selected clusters.

```json
{
  "kind": "spikescope.cluster_ids",
  "version": "1.0",
  "metadata": {},
  "data": {
    "clusterIds": [0, 1, 2]
  }
}
```

### `spikescope.spike_events`

Used by Spike List and other spike-aware widgets.

```json
{
  "kind": "spikescope.spike_events",
  "version": "1.0",
  "metadata": {
    "units": { "time": "samples" }
  },
  "data": {
    "spikes": [
      { "time": 204, "clusterId": 0, "channel": 179 },
      { "time": 214, "clusterId": 1, "channel": 181 }
    ]
  }
}
```

### `spikescope.cluster_statistics`

Used by Cluster Statistics.

```json
{
  "kind": "spikescope.cluster_statistics",
  "version": "1.0",
  "metadata": {},
  "data": {
    "statistics": {
      "0": {
        "isiViolationRate": 0.007,
        "numSpikes": 1518,
        "peakChannel": 30
      }
    }
  }
}
```

### `spikescope.signal_trace`

Used by Signal View.

```json
{
  "kind": "spikescope.signal_trace",
  "version": "1.0",
  "metadata": {
    "units": { "time": "samples", "amplitude": "uV" }
  },
  "data": {
    "channels": [179],
    "timeRange": { "start": 0, "end": 1000 },
    "samples": [[-12.4, -10.1, -8.7]]
  }
}
```

### `spikescope.cluster_embedding`

Used by PCA or dimensionality reduction views.

```json
{
  "kind": "spikescope.cluster_embedding",
  "version": "1.0",
  "metadata": {
    "method": "pca"
  },
  "data": {
    "clusters": [
      {
        "clusterId": 0,
        "points": [[-1.2, 0.4], [-1.1, 0.5]],
        "spikeTimes": [204, 408]
      }
    ],
    "clusterIds": [0],
    "numClusters": 1
  }
}
```

### `spikescope.waveforms`

Used by Waveform View and Amplitude Profile.

```json
{
  "kind": "spikescope.waveforms",
  "version": "1.0",
  "metadata": {
    "units": { "time": "ms", "amplitude": "normalized" }
  },
  "data": {
    "waveforms": {
      "0": [
        {
          "timePoints": [-1.0, -0.5, 0.0, 0.5],
          "amplitude": [0.1, -0.3, -1.2, 0.2]
        }
      ]
    }
  }
}
```

### `spikescope.cluster_comparison_set`

Used by Cluster Comparison. This format can also be loaded from `.json` or MATLAB `.mat` files as described in `CLUSTER_COMPARISON_FILE_FORMAT.md`.

```json
{
  "kind": "spikescope.cluster_comparison_set",
  "version": "1.0",
  "metadata": {
    "algorithmName": "Kilosort4",
    "units": { "time": "samples" }
  },
  "data": {
    "clusters": [
      {
        "id": 12,
        "primaryChannel": 179,
        "spikeTimes": [1024, 2048, 4096]
      }
    ]
  }
}
```

## Widget Inputs

| Widget | Required Inputs | Optional Inputs |
|--------|-----------------|-----------------|
| Cluster List | `spikescope.cluster_list` | None |
| Spike List Table | `spikescope.spike_events` | `spikescope.cluster_ids` |
| Cluster Statistics | `spikescope.cluster_ids`, `spikescope.cluster_statistics` | None |
| Signal View | `spikescope.dataset_info` | `spikescope.signal_trace`, `spikescope.spike_events` |
| PCA Plot | `spikescope.cluster_embedding` | `spikescope.cluster_ids`, `spikescope.spike_events` |
| Waveform View | `spikescope.cluster_ids`, `spikescope.waveforms` | `spikescope.spike_events` |
| Amplitude Profile | `spikescope.cluster_ids`, `spikescope.waveforms` | `spikescope.cluster_embedding`, `spikescope.clustering_results` |
| Cluster Comparison | Two `spikescope.cluster_comparison_set` payloads | Uploaded `.json` / `.mat` files |

## Compatibility Notes

- Use sample indices for spike-time comparison unless metadata states another unit.
- Keep cluster IDs stable as strings or numbers; widgets normalize them for display.
- If a widget receives unknown fields, it should ignore them.
- If a required field is missing, the widget should show an empty or validation state instead of crashing.
- Future torchBCI blocks can use matching pack/unpack helpers to convert backend tensors into these JSON-facing envelopes.
