"""Pure helpers for probe geometry and multiresolution trace-image views."""

from collections import Counter

import numpy as np

from processing.cluster_diagnostics import normalize_cluster_ids


def _probe_value(probe, *names):
    if probe is None:
        return None
    for name in names:
        if isinstance(probe, dict) and name in probe:
            return probe[name]
        if hasattr(probe, name):
            return getattr(probe, name)
    return None


def _as_flat_array(value):
    if value is None:
        return None
    try:
        if hasattr(value, 'detach'):
            value = value.detach().cpu().numpy()
        array = np.asarray(value).reshape(-1)
    except (TypeError, ValueError):
        return None
    return array if array.size else None


def _channel_id(raw_channel, channel_count):
    try:
        channel = int(round(float(raw_channel)))
    except (TypeError, ValueError):
        return None
    if 1 <= channel <= channel_count:
        return channel
    if 0 <= channel < channel_count:
        return channel + 1
    return None


def _fallback_position(index):
    x_pattern = (0.0, 32.0, 16.0, 48.0)
    return x_pattern[index % len(x_pattern)], float(index // len(x_pattern) * 20.0)


def build_probe_geometry(
    channel_count,
    probe=None,
    clustering_results=None,
    cluster_ids=None,
):
    """Return normalized channel geometry and selected-cluster footprints."""
    channel_count = min(max(int(channel_count), 0), 4096)
    x_positions = _as_flat_array(_probe_value(probe, 'xc', 'x', 'xcoords'))
    y_positions = _as_flat_array(_probe_value(probe, 'yc', 'y', 'ycoords'))
    channel_map = _as_flat_array(_probe_value(probe, 'chanMap', 'channel_map', 'channels'))
    shanks = _as_flat_array(_probe_value(probe, 'kcoords', 'shank', 'shanks'))
    connected = _as_flat_array(_probe_value(probe, 'connected', 'is_connected'))
    has_physical_geometry = (
        x_positions is not None
        and y_positions is not None
        and min(x_positions.size, y_positions.size) > 0
    )

    geometry_by_channel = {}
    if has_physical_geometry:
        physical_count = min(x_positions.size, y_positions.size, channel_count)
        channel_map_is_zero_based = (
            channel_map is not None
            and np.any(np.asarray(channel_map[:physical_count], dtype=np.float64) == 0)
        )
        for position_index in range(physical_count):
            raw_channel = channel_map[position_index] if channel_map is not None and position_index < channel_map.size else position_index
            channel_id = (
                int(round(float(raw_channel))) + 1
                if channel_map_is_zero_based
                else _channel_id(raw_channel, channel_count)
            )
            if (
                channel_id is None
                or channel_id < 1
                or channel_id > channel_count
                or channel_id in geometry_by_channel
            ):
                continue
            geometry_by_channel[channel_id] = {
                'channelId': channel_id,
                'channelIndex': channel_id - 1,
                'x': float(x_positions[position_index]),
                'y': float(y_positions[position_index]),
                'shank': int(shanks[position_index]) if shanks is not None and position_index < shanks.size else 0,
                'connected': bool(connected[position_index]) if connected is not None and position_index < connected.size else True,
            }

    for channel_index in range(channel_count):
        channel_id = channel_index + 1
        if channel_id in geometry_by_channel:
            continue
        x_position, y_position = _fallback_position(channel_index)
        geometry_by_channel[channel_id] = {
            'channelId': channel_id,
            'channelIndex': channel_index,
            'x': x_position,
            'y': y_position,
            'shank': 0,
            'connected': True,
        }

    normalized_cluster_ids = normalize_cluster_ids(
        clustering_results,
        cluster_ids,
        limit=20,
    ) if clustering_results is not None else []
    footprints = []
    for cluster_id in normalized_cluster_ids:
        counts = Counter()
        for spike in clustering_results[cluster_id] or []:
            try:
                channel_id = _channel_id(spike.get('channel'), channel_count)
            except AttributeError:
                channel_id = None
            if channel_id is not None:
                counts[channel_id] += 1
        peak_channel = counts.most_common(1)[0][0] if counts else None
        maximum = max(counts.values(), default=1)
        footprints.append({
            'clusterId': cluster_id,
            'peakChannel': peak_channel,
            'channels': [
                {
                    'channelId': channel_id,
                    'spikeCount': count,
                    'weight': float(count / maximum),
                }
                for channel_id, count in sorted(counts.items())
            ],
        })

    return {
        'source': 'physical_probe' if has_physical_geometry else 'fallback_grid',
        'channelConvention': 'one_based',
        'channelCount': channel_count,
        'channels': [geometry_by_channel[channel_id] for channel_id in sorted(geometry_by_channel)],
        'clusterFootprints': footprints,
    }


def downsample_trace_heatmap(
    data_array,
    start_sample=0,
    end_sample=None,
    channel_ids=None,
    max_time_bins=1000,
    max_channels=512,
    normalization='robust_zscore',
    sample_rate_hz=30000.0,
):
    """Create a bounded channel-by-time trace image using peak-preserving bins."""
    if data_array is None or getattr(data_array, 'ndim', 0) < 2:
        return {
            'channelIds': [],
            'timeBinCentersSamples': [],
            'values': [],
        }

    channel_count, sample_count = data_array.shape[:2]
    start_sample = min(max(int(start_sample), 0), sample_count)
    requested_end = sample_count if end_sample is None else int(end_sample)
    end_sample = min(max(requested_end, start_sample + 1), sample_count)
    max_time_bins = min(max(int(max_time_bins), 10), 4000)
    max_channels = min(max(int(max_channels), 1), 1024)
    sample_rate_hz = max(float(sample_rate_hz), 1.0)

    normalized_channels = []
    seen = set()
    for raw_channel in channel_ids or range(1, channel_count + 1):
        channel_id = _channel_id(raw_channel, channel_count)
        if channel_id is None or channel_id in seen:
            continue
        normalized_channels.append(channel_id)
        seen.add(channel_id)
    if len(normalized_channels) > max_channels:
        sampled_indices = np.linspace(
            0,
            len(normalized_channels) - 1,
            num=max_channels,
            dtype=np.int64,
        )
        normalized_channels = [normalized_channels[index] for index in sampled_indices]

    span = max(end_sample - start_sample, 1)
    bin_count = min(span, max_time_bins)
    edges = np.linspace(start_sample, end_sample, num=bin_count + 1)
    edge_indices = np.rint(edges).astype(np.int64)
    edge_indices[0] = start_sample
    edge_indices[-1] = end_sample
    for index in range(1, edge_indices.size):
        edge_indices[index] = max(edge_indices[index], edge_indices[index - 1] + 1)
    edge_indices[-1] = end_sample

    selected_indices = np.asarray([channel_id - 1 for channel_id in normalized_channels], dtype=np.int64)
    values = np.zeros((len(normalized_channels), bin_count), dtype=np.float64)
    for bin_index in range(bin_count):
        left = int(edge_indices[bin_index])
        right = int(edge_indices[bin_index + 1])
        block = np.asarray(data_array[selected_indices, left:right], dtype=np.float64)
        if block.size == 0:
            continue
        absolute_indices = np.argmax(np.abs(block), axis=1)
        values[:, bin_index] = block[np.arange(block.shape[0]), absolute_indices]

    value_unit = 'raw'
    if normalization == 'robust_zscore' and values.size:
        medians = np.median(values, axis=1, keepdims=True)
        deviations = np.median(np.abs(values - medians), axis=1, keepdims=True) * 1.4826
        standard_deviations = np.std(values, axis=1, keepdims=True)
        scales = np.where(deviations > 0, deviations, np.where(standard_deviations > 0, standard_deviations, 1.0))
        values = (values - medians) / scales
        value_unit = 'robust_zscore'

    centers = (edge_indices[:-1] + edge_indices[1:]) / 2.0
    return {
        'channelIds': normalized_channels,
        'timeBinEdgesSamples': edge_indices.astype(float).tolist(),
        'timeBinCentersSamples': centers.tolist(),
        'timeBinCentersSeconds': (centers / sample_rate_hz).tolist(),
        'values': values.tolist(),
        'startSample': start_sample,
        'endSample': end_sample,
        'sampleRateHz': sample_rate_hz,
        'normalization': normalization,
        'valueUnit': value_unit,
        'downsampleFactor': float(span / bin_count),
    }
