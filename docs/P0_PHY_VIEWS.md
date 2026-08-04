# Phy-inspired curation views

SpikeScope's first Phy-inspired curation increment adds four linked P0 views and a shared selection model. The first P1 view, Firing Rate Timeline, is now included as well.

## Views

- **Cluster Curation Table** replaces the cluster checklist. It supports sortable quality metrics, text and expression filters (for example `n_spikes > 100`), `good`/`mua`/`noise`/`unsorted` groups, custom labels, notes, and additive selection. Labels and notes are stored per dataset and algorithm in browser storage; they do not yet rewrite sorting output files. Its filtered sort order also drives the Raster view.
- **Correlogram Matrix** shows auto- and cross-correlograms for up to four linked clusters. It exposes local cluster controls plus bin, window, performance-limit, refractory, and count/rate/baseline-ratio controls.
- **ISI Histogram** overlays up to twelve linked clusters and reports refractory violation rates in the legend. Local cluster choices, bin size, visible interval, refractory period, and linear/log x scale are configurable.
- **Amplitude vs Time / Drift** extracts raw peak-to-peak amplitudes for up to twelve linked clusters, displays them against recording time with same-channel background spikes and marginal amplitude histograms, and supports box/lasso time selection.
- **Firing Rate Timeline** bins all spikes for up to twelve linked clusters across the full recording. It switches between rate/count values and overlay/small-multiple layouts; clicking or brushing bins focuses the linked time range.

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
- `/api/cluster-waveforms`

Times are represented as recording samples at the API boundary. Correlogram and ISI bin coordinates are milliseconds. Firing-rate results expose sample-domain bin edges, second-domain centers, counts, and per-bin rates; a short final bin is normalized by its actual duration. Amplitude points include both `timeSamples` and `timeSeconds`; amplitudes are unstandardized peak-to-peak values from the loaded dataset. Waveform requests use deterministic, bounded sampling and always include explicitly highlighted spikes.

The numerical implementations live in `processing/cluster_diagnostics.py` and are independent of Flask for direct testing. Demo mode uses matching local contracts from `src/utils/clusterDiagnostics.js`.

## P1 pair review

The **Similarity Table** ranks merge candidates for the primary cluster and publishes a primary/secondary pair to linked diagnostic views. It uses retained sorter-template similarity when the clustering manager exposes it; otherwise it clearly labels a deterministic mean-waveform/channel or feature-centroid/channel fallback. The API contract is `POST /api/cluster-similarities`.

## Backlog position

The completed sequence is Cluster Curation Table, Correlogram Matrix, ISI Histogram, Amplitude vs Time / Drift, Firing Rate Timeline, and Similarity Table. The next view in the gap-analysis order is Probe Map.
