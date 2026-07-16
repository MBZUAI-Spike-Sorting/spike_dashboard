# Phy-inspired P0 views

SpikeScope's first Phy-inspired curation increment adds four linked views and a shared selection model.

## Views

- **Cluster Curation Table** replaces the cluster checklist. It supports sortable quality metrics, text and expression filters (for example `n_spikes > 100`), `good`/`mua`/`noise`/`unsorted` groups, custom labels, notes, and additive selection. Labels and notes are stored per dataset and algorithm in browser storage; they do not yet rewrite sorting output files. Its filtered sort order also drives the Raster view.
- **Correlogram Matrix** shows auto- and cross-correlograms for the first four selected clusters. It exposes bin, window, performance-limit, refractory, and count/rate/baseline-ratio controls.
- **ISI Histogram** overlays per-cluster interval distributions and reports refractory violation rates in the legend. Bin size, visible interval, refractory period, and linear/log x scale are configurable.
- **Amplitude vs Time / Drift** extracts raw peak-to-peak amplitudes from the recording, displays them against recording time with same-channel background spikes and marginal amplitude histograms, and supports box/lasso time selection.

All views are available from the Widget Bank. Existing saved layouts are migrated by merging the new widget definitions as hidden entries.

## Linked interactions

The dashboard owns cluster, spike, and time selections. Widgets publish selection events rather than calling one another:

- cluster selection updates every cluster-aware view;
- spike clicks in PCA, raster, spike table, or amplitude view highlight the same spike in PCA, raster, waveform, and signal views;
- a time brush in the amplitude view focuses both the raw signal and raster views.

## API contracts

The diagnostic views use these POST endpoints:

- `/api/cluster-statistics`
- `/api/cluster-correlograms`
- `/api/cluster-isi-histograms`
- `/api/cluster-amplitudes`

Times are represented as recording samples at the API boundary. Correlogram and ISI bin coordinates are milliseconds. Amplitude points include both `timeSamples` and `timeSeconds`; amplitudes are unstandardized peak-to-peak values from the loaded dataset.

The numerical implementations live in `processing/cluster_diagnostics.py` and are independent of Flask for direct testing. Demo mode uses matching local contracts from `src/utils/clusterDiagnostics.js`.
