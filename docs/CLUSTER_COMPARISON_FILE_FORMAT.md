# Cluster Comparison Upload Format

The Cluster Comparison widget can load `.json` or MATLAB `.mat` files that describe one algorithm's clusters. Load one file for Algorithm 1 and one file for Algorithm 2, then choose the matching window in samples.

## JSON Format

```json
{
  "algorithmName": "Kilosort4",
  "clusters": [
    {
      "id": 12,
      "primaryChannel": 179,
      "spikeTimes": [1024, 2048, 4096]
    },
    {
      "id": 19,
      "primaryChannel": 181,
      "spikeTimes": [1200, 2600, 3900]
    }
  ]
}
```

`primaryChannel` is optional. When both uploaded files include primary channels, matching is restricted to clusters with the same primary channel.

## MATLAB `.mat` Format

Use top-level variables:

```matlab
algorithm_name = "Kilosort4";
cluster_ids = [12, 19];
primary_channels = [179, 181];
spike_times = {
    [1024, 2048, 4096],
    [1200, 2600, 3900]
};

save("kilosort_clusters.mat", ...
    "algorithm_name", ...
    "cluster_ids", ...
    "primary_channels", ...
    "spike_times", ...
    "-v7");
```

`primary_channels` is optional. Save as MATLAB v7 or earlier; MATLAB v7.3 files are HDF5-backed and are not supported by the lightweight parser.

The parser also accepts camelCase names: `algorithmName`, `clusterIds`, `primaryChannels`, and `spikeTimes`.
