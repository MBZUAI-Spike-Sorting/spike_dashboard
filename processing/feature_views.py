"""Pure feature extraction helpers for Phy-inspired spike feature views."""

import re

import numpy as np

from processing.cluster_diagnostics import normalize_cluster_ids


def _finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if np.isfinite(number) else None


def _spike_channel(spike):
    value = _finite_number(spike.get('channel')) if isinstance(spike, dict) else None
    return int(round(value)) if value is not None else None


def _feature_values(spike, sample_rate_hz):
    values = {}
    time_samples = _finite_number(spike.get('time'))
    if time_samples is not None:
        values['timeSeconds'] = time_samples / sample_rate_hz
    pc1 = _finite_number(spike.get('x'))
    pc2 = _finite_number(spike.get('y'))
    if pc1 is not None:
        values['pc1'] = pc1
    if pc2 is not None:
        values['pc2'] = pc2
    channel = _spike_channel(spike)
    if channel is not None:
        values['channel'] = channel

    for key in ('amplitude', 'amp', 'peakAmplitude', 'spikeAmplitude'):
        amplitude = _finite_number(spike.get(key))
        if amplitude is not None:
            values['amplitude'] = amplitude
            break

    for key, value in spike.items():
        match = re.fullmatch(r'pc[_-]?(\d+)', str(key), re.IGNORECASE)
        number = _finite_number(value)
        if match and number is not None:
            values[f'pc{int(match.group(1))}'] = number

    features = spike.get('features')
    if isinstance(features, dict):
        for key, value in features.items():
            number = _finite_number(value)
            if number is not None:
                safe_key = re.sub(r'[^a-zA-Z0-9_]+', '_', str(key)).strip('_') or 'value'
                values[f'feature_{safe_key}'] = number
    elif isinstance(features, (list, tuple, np.ndarray)):
        for index, value in enumerate(features):
            number = _finite_number(value)
            if number is not None:
                values[f'feature{index + 1}'] = number

    template_features = spike.get('template_features', spike.get('templateFeatures'))
    if isinstance(template_features, (list, tuple, np.ndarray)):
        for index, value in enumerate(template_features):
            number = _finite_number(value)
            if number is not None:
                values[f'templateFeature{index + 1}'] = number
    else:
        number = _finite_number(spike.get('templateFeature'))
        if number is not None:
            values['templateFeature1'] = number
    return values


def _sample_indexed_spikes(indexed, maximum):
    indexed = list(indexed or [])
    indexed.sort(key=lambda item: _finite_number(item[1].get('time')) or 0.0)
    if len(indexed) <= maximum:
        return indexed
    indices = np.linspace(0, len(indexed) - 1, num=maximum, dtype=np.int64)
    return [indexed[index] for index in indices]


def _build_point(cluster_id, point_index, spike, sample_rate_hz):
    raw_spike_index = spike.get('spikeIndex', point_index)
    try:
        spike_index = int(raw_spike_index)
    except (TypeError, ValueError):
        spike_index = int(point_index)
    time_samples = _finite_number(spike.get('time'))
    return {
        'spikeId': f'{cluster_id}:{spike_index}',
        'clusterId': cluster_id,
        'pointIndex': int(point_index),
        'spikeIndex': spike_index,
        'timeSamples': time_samples,
        'channel': _spike_channel(spike),
        'values': _feature_values(spike, sample_rate_hz),
    }


def _add_pair_projection(series):
    if len(series) != 2:
        return None
    retained_dimension = next((
        dimension
        for dimension in ('templateFeature1', 'templateFeature2')
        if all(any(dimension in point['values'] for point in item['points']) for item in series)
    ), None)
    if retained_dimension:
        for item in series:
            for point in item['points']:
                if retained_dimension in point['values']:
                    point['values']['pairProjection'] = point['values'][retained_dimension]
        return 'retained_template_features'

    centroid_values = []
    for item in series:
        coordinates = [
            (point['values']['pc1'], point['values']['pc2'])
            for point in item['points']
            if 'pc1' in point['values'] and 'pc2' in point['values']
        ]
        if not coordinates:
            return None
        centroid_values.append(np.mean(np.asarray(coordinates, dtype=np.float64), axis=0))
    axis = centroid_values[1] - centroid_values[0]
    norm = np.linalg.norm(axis)
    axis = axis / norm if norm > 0 else np.asarray([1.0, 0.0])
    origin = (centroid_values[0] + centroid_values[1]) / 2.0
    for item in series:
        for point in item['points']:
            if 'pc1' not in point['values'] or 'pc2' not in point['values']:
                continue
            coordinates = np.asarray([point['values']['pc1'], point['values']['pc2']])
            point['values']['pairProjection'] = float(np.dot(coordinates - origin, axis))
    return 'pca_centroid_axis'


def _dimension_metadata(dimension_id):
    labels = {
        'timeSeconds': ('Recording time', 's', 'spike_time'),
        'pc1': ('PC 1', None, 'retained_embedding'),
        'pc2': ('PC 2', None, 'retained_embedding'),
        'channel': ('Channel', 'channel_id', 'spike_assignment'),
        'amplitude': ('Amplitude', None, 'sorter_or_spike_metadata'),
        'pairProjection': ('Pair separation', None, 'pair_projection'),
    }
    label, unit, source = labels.get(
        dimension_id,
        (re.sub(r'(?<!^)(?=[A-Z])', ' ', dimension_id).replace('_', ' ').title(), None, 'spike_metadata'),
    )
    return {'id': dimension_id, 'label': label, 'unit': unit, 'source': source}


def extract_cluster_features(
    clustering_results,
    cluster_ids,
    sample_rate_hz=30000.0,
    max_spikes_per_cluster=5000,
    include_background=True,
    max_background_spikes=5000,
    selected_channels=None,
):
    """Return bounded, stable per-spike features and optional gray background."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=12)
    maximum = min(max(int(max_spikes_per_cluster), 10), 20000)
    background_maximum = min(max(int(max_background_spikes), 0), 20000)
    channel_filter = {
        int(round(float(channel)))
        for channel in (selected_channels or [])
        if _finite_number(channel) is not None
    }

    series = []
    for cluster_id in cluster_ids:
        indexed_spikes = [
            (point_index, spike)
            for point_index, spike in enumerate(clustering_results[cluster_id] or [])
            if not channel_filter or _spike_channel(spike) in channel_filter
        ]
        points = [
            _build_point(cluster_id, point_index, spike, sample_rate_hz)
            for point_index, spike in _sample_indexed_spikes(
                indexed_spikes,
                maximum,
            )
        ]
        series.append({
            'clusterId': cluster_id,
            'points': points,
            'totalSpikes': len(clustering_results[cluster_id] or []),
            'returnedSpikes': len(points),
        })

    pair_feature_source = _add_pair_projection(series)
    background_points = []
    if include_background and background_maximum:
        selected = set(cluster_ids)
        candidates = [
            (cluster_id, point_index, spike)
            for cluster_id, spikes in enumerate(clustering_results or [])
            if cluster_id not in selected
            for point_index, spike in enumerate(spikes or [])
            if not channel_filter or _spike_channel(spike) in channel_filter
        ]
        if len(candidates) > background_maximum:
            indices = np.linspace(0, len(candidates) - 1, num=background_maximum, dtype=np.int64)
            candidates = [candidates[index] for index in indices]
        background_points = [
            _build_point(cluster_id, point_index, spike, sample_rate_hz)
            for cluster_id, point_index, spike in candidates
        ]

    dimension_ids = set()
    for item in series:
        for point in item['points']:
            dimension_ids.update(point['values'])
    for point in background_points:
        dimension_ids.update(point['values'])
    preferred = ['timeSeconds', 'pc1', 'pc2', 'pairProjection', 'amplitude', 'channel']
    ordered_dimensions = [dimension for dimension in preferred if dimension in dimension_ids]
    ordered_dimensions.extend(sorted(dimension_ids - set(ordered_dimensions)))

    return {
        'clusterIds': cluster_ids,
        'sampleRateHz': sample_rate_hz,
        'dimensions': [_dimension_metadata(dimension) for dimension in ordered_dimensions],
        'series': series,
        'backgroundPoints': background_points,
        'pairFeatureSource': pair_feature_source,
        'selectedChannels': sorted(channel_filter),
    }
