# Versioned curation sessions

SpikeScope performs manual merge and split operations in browser state. Raw sorter outputs are immutable inputs: no curation action writes back to the uploaded or server-side source files.

## Identity and replay

Each source spike receives a stable ID derived from its original cluster and retained sorter spike index (falling back to the original point index). A versioned session stores only deterministic operations over those IDs:

- `merge` records current source cluster IDs, the allocated target ID, and merged metadata;
- `split` records one current source cluster, a complete list of selected stable spike IDs, the allocated target ID, and copied metadata.

Current assignments are derived by replaying operations up to the history cursor. Undo and redo move that cursor; applying a new operation after undo truncates the abandoned redo branch. Target cluster and operation counters remain monotonic so replay is deterministic.

## Metadata

Quality group, label, and note values are carried into each operation. A merge preserves a common group or falls back to `unsorted`, keeps a common label or creates a descriptive merged label, and combines distinct notes. A split copies the current source metadata. Later edits remain keyed by current cluster ID and are included in export.

## Persistence and recovery

Sessions are stored in browser local storage under the current dataset and algorithm scope. The stored session includes a schema version and a source signature based on original cluster membership. On restore, SpikeScope validates the schema, signature, counters, cursor, current state, and the full operation log (including the undone redo branch). If validation fails, it starts a clean session and displays a recovery warning; original data remains available and untouched.

## Non-destructive export

**Export assignments** downloads a separate `spikescope.*.curation-rN.json` file containing:

- source dataset, algorithm, and signature;
- applied and undone operation history;
- current cluster metadata and source-cluster lineage;
- one row per original spike with original and curated cluster/point assignments;
- explicit `nonDestructive: true` and `rawSorterInputsModified: false` flags.

The export is suitable for validation or conversion in an external notebook. Writing a new sorter-specific result directory remains an explicit downstream step; SpikeScope never silently replaces the source.
