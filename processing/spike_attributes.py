"""Schema discovery and extraction for generic per-spike attribute views."""

import re

import numpy as np

from processing.cluster_diagnostics import normalize_cluster_ids


RESERVED_FIELDS = {
    'time', 'x', 'y', 'spikeIndex', 'spike_index', 'clusterId', 'cluster_id',
    'features', 'template_features', 'templateFeatures',
}
FIELD_UNITS = {
    'channel': 'channel_id',
    'depth': 'um',
    'probeDepth': 'um',
    'ypos': 'um',
    'yPosition': 'um',
}


def _finite_number(value):
    if isinstance(value, (bool, np.bool_)):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if np.isfinite(number) else None


def _safe_id(value):
    return re.sub(r'[^a-zA-Z0-9_.-]+', '_', str(value)).strip('_') or 'value'


def _label(value):
    spaced = re.sub(r'(?<!^)(?=[A-Z])', ' ', str(value)).replace('_', ' ')
    return spaced.strip().title()


def _sample_for_schema(spikes, maximum=256):
    spikes = list(spikes or [])
    if len(spikes) <= maximum:
        return spikes
    indices = np.linspace(0, len(spikes) - 1, num=maximum, dtype=np.int64)
    return [spikes[index] for index in indices]


def _numeric_vector(value, minimum=2, maximum=32):
    if not isinstance(value, (list, tuple, np.ndarray)):
        return None
    try:
        vector = np.asarray(value, dtype=np.float64).reshape(-1)
    except (TypeError, ValueError):
        return None
    if vector.size < minimum or vector.size > maximum or not np.all(np.isfinite(vector)):
        return None
    return vector


def _scalar_definition(attribute_id, field, provenance, label=None, unit=None):
    return {
        'id': attribute_id,
        'label': label or _label(field),
        'shape': 'scalar',
        'dimensions': [{'id': 'value', 'label': label or _label(field), 'unit': unit}],
        'provenance': provenance,
        '_kind': 'scalar',
        '_field': field,
    }


def _vector_definition(attribute_id, field, provenance, labels=None, kind='vector'):
    dimension_labels = labels or (f'{_label(field)} 1', f'{_label(field)} 2')
    return {
        'id': attribute_id,
        'label': _label(field),
        'shape': 'two_dimensional',
        'dimensions': [
            {'id': 'x', 'label': dimension_labels[0], 'unit': None},
            {'id': 'y', 'label': dimension_labels[1], 'unit': None},
        ],
        'provenance': provenance,
        '_kind': kind,
        '_field': field,
    }


def _discover_specs(clustering_results, cluster_ids):
    specs = {}
    for cluster_id in cluster_ids:
        for spike in _sample_for_schema(clustering_results[cluster_id]):
            if not isinstance(spike, dict):
                continue
            if _finite_number(spike.get('x')) is not None and _finite_number(spike.get('y')) is not None:
                specs.setdefault('embedding', _vector_definition(
                    'embedding',
                    'PCA embedding',
                    {'source': 'retained_embedding', 'fields': ['x', 'y']},
                    labels=('PC 1', 'PC 2'),
                    kind='embedding',
                ))

            for key, value in spike.items():
                if key in RESERVED_FIELDS:
                    continue
                if _finite_number(value) is not None:
                    safe_key = _safe_id(key)
                    specs.setdefault(f'metadata:{safe_key}', _scalar_definition(
                        f'metadata:{safe_key}',
                        key,
                        {'source': 'spike_metadata', 'field': key},
                        unit=FIELD_UNITS.get(key),
                    ))
                    continue
                vector = _numeric_vector(value)
                if vector is not None:
                    safe_key = _safe_id(key)
                    specs.setdefault(f'vector:{safe_key}', _vector_definition(
                        f'vector:{safe_key}',
                        key,
                        {'source': 'spike_metadata_vector', 'field': key, 'indices': [0, 1]},
                    ))

            features = spike.get('features')
            if isinstance(features, dict):
                for key, value in features.items():
                    if _finite_number(value) is None:
                        continue
                    safe_key = _safe_id(key)
                    specs.setdefault(f'feature:{safe_key}', _scalar_definition(
                        f'feature:{safe_key}',
                        key,
                        {'source': 'retained_feature_map', 'field': str(key)},
                    ))
            elif _numeric_vector(features) is not None:
                specs.setdefault('features', _vector_definition(
                    'features',
                    'Feature vector',
                    {'source': 'retained_feature_vector', 'field': 'features', 'indices': [0, 1]},
                    labels=('Feature 1', 'Feature 2'),
                    kind='features_vector',
                ))

            template_features = spike.get('template_features', spike.get('templateFeatures'))
            if _numeric_vector(template_features) is not None:
                specs.setdefault('template_features', _vector_definition(
                    'template_features',
                    'Template features',
                    {'source': 'retained_template_features', 'indices': [0, 1]},
                    labels=('Template feature 1', 'Template feature 2'),
                    kind='template_features',
                ))

    preferred = ['embedding', 'template_features', 'features', 'metadata:amplitude', 'metadata:channel']
    ordered_ids = [attribute_id for attribute_id in preferred if attribute_id in specs]
    ordered_ids.extend(sorted(set(specs) - set(ordered_ids)))
    return [specs[attribute_id] for attribute_id in ordered_ids[:128]]


def _extract_values(spike, spec):
    kind = spec['_kind']
    if kind == 'embedding':
        values = (_finite_number(spike.get('x')), _finite_number(spike.get('y')))
    elif kind == 'scalar':
        source = spec['provenance']['source']
        if source == 'retained_feature_map':
            features = spike.get('features')
            value = features.get(spec['provenance']['field']) if isinstance(features, dict) else None
        else:
            value = spike.get(spec['_field'])
        number = _finite_number(value)
        return {'value': number} if number is not None else None
    elif kind == 'features_vector':
        vector = _numeric_vector(spike.get('features'))
        values = (vector[0], vector[1]) if vector is not None else (None, None)
    elif kind == 'template_features':
        vector = _numeric_vector(spike.get('template_features', spike.get('templateFeatures')))
        values = (vector[0], vector[1]) if vector is not None else (None, None)
    else:
        vector = _numeric_vector(spike.get(spec['_field']))
        values = (vector[0], vector[1]) if vector is not None else (None, None)
    if any(value is None for value in values):
        return None
    return {'x': float(values[0]), 'y': float(values[1])}


def _public_definition(spec):
    return {key: value for key, value in spec.items() if not key.startswith('_')}


def extract_spike_attribute(
    clustering_results,
    cluster_ids,
    attribute_id=None,
    sample_rate_hz=30000.0,
    max_spikes_per_cluster=5000,
):
    """Discover compatible attributes and extract one bounded typed payload."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    maximum = min(max(int(max_spikes_per_cluster), 10), 20000)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=12)
    specs = _discover_specs(clustering_results, cluster_ids)
    spec = next((item for item in specs if item['id'] == attribute_id), None)
    if spec is None:
        spec = specs[0] if specs else None

    series = []
    for cluster_id in cluster_ids:
        candidates = []
        if spec is not None:
            for point_index, spike in enumerate(clustering_results[cluster_id] or []):
                values = _extract_values(spike, spec)
                time_samples = _finite_number(spike.get('time')) if isinstance(spike, dict) else None
                if values is None or (spec['shape'] == 'scalar' and time_samples is None):
                    continue
                raw_spike_index = spike.get('spikeIndex', spike.get('spike_index', point_index))
                spike_index = _finite_number(raw_spike_index)
                spike_index = int(round(spike_index)) if spike_index is not None else point_index
                channel = _finite_number(spike.get('channel'))
                candidates.append({
                    'spikeId': f'{cluster_id}:{spike_index}',
                    'clusterId': cluster_id,
                    'pointIndex': point_index,
                    'spikeIndex': spike_index,
                    'timeSamples': time_samples,
                    'timeSeconds': time_samples / sample_rate_hz if time_samples is not None else None,
                    'channel': int(round(channel)) if channel is not None else None,
                    'values': values,
                })
        candidates.sort(key=lambda point: (
            point['timeSamples'] if point['timeSamples'] is not None else point['pointIndex']
        ))
        total_points = len(candidates)
        if len(candidates) > maximum:
            indices = np.linspace(0, len(candidates) - 1, num=maximum, dtype=np.int64)
            candidates = [candidates[index] for index in indices]
        series.append({
            'clusterId': cluster_id,
            'points': candidates,
            'totalPoints': total_points,
            'returnedPoints': len(candidates),
        })

    return {
        'clusterIds': cluster_ids,
        'sampleRateHz': sample_rate_hz,
        'attributeDefinitions': [_public_definition(item) for item in specs],
        'selectedAttributeId': spec['id'] if spec is not None else None,
        'attributeDefinition': _public_definition(spec) if spec is not None else None,
        'series': series,
    }
