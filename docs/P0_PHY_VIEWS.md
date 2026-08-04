# Phy-inspired curation views

SpikeScope's Phy-inspired curation work adds linked diagnostic, feature, population, schema-driven, spatial, and raw-trace views, a safe analysis workspace, and a non-destructive manual curation loop with a shared selection model.

## Views

- **Cluster Curation Table** replaces the cluster checklist. It supports sortable quality metrics, text and expression filters (for example `n_spikes > 100`), `good`/`mua`/`noise`/`unsorted` groups, custom labels, notes, and additive selection. Labels and notes are stored per dataset and algorithm in browser storage; they do not yet rewrite sorting output files. Its filtered sort order also drives the Raster view.
- **Correlogram Matrix** shows auto- and cross-correlograms for up to four linked clusters. It exposes local cluster controls plus bin, window, performance-limit, refractory, and count/rate/baseline-ratio controls.
- **ISI Histogram** overlays up to twelve linked clusters and reports refractory violation rates in the legend. Local cluster choices, bin size, visible interval, refractory period, and linear/log x scale are configurable.
- **Amplitude vs Time / Drift** extracts raw peak-to-peak amplitudes for up to twelve linked clusters, displays them against recording time with same-channel background spikes and marginal amplitude histograms, and supports box/lasso time selection.
- **Firing Rate Timeline** bins all spikes for up to twelve linked clusters across the full recording. It switches between rate/count values and overlay/small-multiple layouts; clicking or brushing bins focuses the linked time range.
- **Feature Matrix** compares up to six clusters across retained time, PCA, channel, amplitude, sorter, and template dimensions. Dimensions and channels are selectable, datasets are deterministically bounded, and box/lasso selection publishes exact stable spike identities.
- **Template Feature Pair** focuses on exactly two clusters. It prefers retained sorter template features and otherwise exposes a clearly labeled deterministic projection along the two PCA centroids; selections are shared with the Feature Matrix and linked spike views.
- **Template Gallery** follows the Cluster Curation Table's exact visible sort/filter order. It uses retained sorter templates when present and labels the deterministic, bounded raw mean-waveform fallback when they are not.
- **Cluster Metric Scatter** compares the currently visible population with configurable X, Y, marker-size, and color metrics. Missing metric values are omitted from the current projection rather than fabricated.
- **Raster Plot** follows the same visible order/filter and now publishes plain or additive cluster selection as well as exact spike selection.
- **Spike Attribute Explorer** discovers compatible scalar and two-dimensional per-spike fields and renders them through one typed schema rather than attribute-specific components. Scalar fields use recording time on X; two-dimensional fields use their retained axes. Labels, units, provenance, stable spike IDs, and deterministic per-cluster limits travel with the payload.
- **Analysis Workspace** is a read-only counterpart to Phy's IPython view. It inspects dataset, algorithm, cluster, selection, widget, wiring, and provenance state; exports a structured session manifest; and supplies a copyable local-notebook snippet. It never evaluates user code.
- **Curation Actions** merges selected current clusters and splits a complete lasso/box selection of stable original spike IDs. A deterministic operation log provides undo/redo; current assignments immediately drive linked views, while export always writes a new JSON artifact instead of overwriting sorter inputs.

All views are available from the Widget Bank. Existing saved layouts are migrated by merging the new widget definitions as hidden entries.

## Linked interactions

The dashboard owns cluster, spike, and time selections. Widgets publish selection events rather than calling one another:

- cluster selection updates every cluster-aware view;
- spike clicks in PCA, raster, spike table, or amplitude view highlight the same spike in PCA, raster, waveform, and signal views;
- a time brush in the amplitude or firing-rate view focuses the raw signal, raster, and other time-aware diagnostic views.

## API contracts

The diagnostic views use these POST endpoints:

- `/api/cluster-statistics`
- `/api/cluster-correlograms`
- `/api/cluster-isi-histograms`
- `/api/cluster-firing-rates`
- `/api/cluster-amplitudes`
- `/api/spike-attributes`
- `/api/cluster-templates`
- `/api/cluster-features`
- `/api/cluster-waveforms`

Times are represented as recording samples at the API boundary. Correlogram and ISI bin coordinates are milliseconds. Firing-rate results expose sample-domain bin edges, second-domain centers, counts, and per-bin rates; a short final bin is normalized by its actual duration. Amplitude points include both `timeSamples` and `timeSeconds`; amplitudes are unstandardized peak-to-peak values from the loaded dataset. Waveform requests use deterministic, bounded sampling and always include explicitly highlighted spikes.

The numerical implementations live in `processing/cluster_diagnostics.py`, `processing/feature_views.py`, `processing/spatial_views.py`, `processing/template_gallery.py`, and `processing/spike_attributes.py` and are independent of Flask for direct testing. Demo mode uses matching local contracts from `src/utils/clusterDiagnostics.js`, `src/utils/featureViews.js`, `src/utils/spatialViews.js`, `src/utils/templateGallery.js`, and `src/utils/spikeAttributes.js`.

The Analysis Workspace security boundary and manifest format are documented in [`ANALYSIS_WORKSPACE.md`](ANALYSIS_WORKSPACE.md).

Session versioning, persistence, recovery, and non-destructive export are documented in [`CURATION_SESSIONS.md`](CURATION_SESSIONS.md).

## P1 pair review

The **Similarity Table** ranks merge candidates for the primary cluster and publishes a primary/secondary pair to linked diagnostic views. It uses retained sorter-template similarity when the clustering manager exposes it; otherwise it clearly labels a deterministic mean-waveform/channel or feature-centroid/channel fallback. The API contract is `POST /api/cluster-similarities`.

## Spatial and raw-trace views

- **Probe Map** renders retained physical probe coordinates when available and a clearly labeled deterministic grid otherwise. Selected-cluster channel footprints and peak channels are overlaid on the geometry.
- **Trace Heatmap** provides a bounded, peak-preserving channel-by-time image with raw or per-channel robust-z scaling.
- Probe, Signal, Trace Heatmap, and neighboring Waveform views share one-based channel selection. Signal also overlays the selected clusters' spike identities in the visible time interval.

The spatial contracts use `POST /api/probe-geometry` and `POST /api/trace-heatmap`. Trace heatmaps cap channel and time-bin counts before JSON serialization.

## Backlog position

The completed sequence is Cluster Curation Table, Correlogram Matrix, ISI Histogram, Amplitude vs Time / Drift, Firing Rate Timeline, Similarity Table, Probe Map, Trace Heatmap, Feature Matrix, Template Feature Pair, Template Gallery, Cluster Metric Scatter, Spike Attribute Explorer, Analysis Workspace, and Curation Actions.
