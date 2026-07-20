"""Pure numerical helpers for cluster-quality diagnostic views.

The functions in this module deliberately do not depend on Flask.  Keeping the
analysis code separate makes the API routes small and gives the frontend a
stable, JSON-friendly contract for correlograms, ISIs, metrics, and drift.
"""

from collections import Counter

import numpy as np


def normalize_cluster_ids(clustering_results, cluster_ids=None, limit=None):
    """Return unique, valid integer cluster ids while preserving input order."""
    if clustering_results is None:
        return []

    requested = range(len(clustering_results)) if not cluster_ids else cluster_ids
    normalized = []
    seen = set()

    for raw_cluster_id in requested:
        try:
            cluster_id = int(raw_cluster_id)
        except (TypeError, ValueError):
            continue

        if cluster_id in seen or cluster_id < 0 or cluster_id >= len(clustering_results):
            continue

        normalized.append(cluster_id)
        seen.add(cluster_id)
        if limit is not None and len(normalized) >= limit:
            break

    return normalized


def _cluster_times(clustering_results, cluster_id):
    values = []
    for spike in clustering_results[cluster_id] or []:
        try:
            value = float(spike.get('time'))
        except (AttributeError, TypeError, ValueError):
            continue
        if np.isfinite(value) and value >= 0:
            values.append(value)
    return np.sort(np.asarray(values, dtype=np.float64))


def _evenly_sample(values, maximum):
    if maximum is None or maximum <= 0 or len(values) <= maximum:
        return values
    indices = np.linspace(0, len(values) - 1, num=maximum, dtype=np.int64)
    return values[indices]


def calculate_cluster_metrics(
    clustering_results,
    cluster_ids=None,
    sample_rate_hz=30000.0,
    recording_duration_samples=None,
    refractory_period_ms=2.0,
):
    """Calculate sortable cluster-level metrics from spike assignments."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids)

    if recording_duration_samples is None:
        maxima = [
            times[-1]
            for cluster_id in cluster_ids
            if (times := _cluster_times(clustering_results, cluster_id)).size
        ]
        recording_duration_samples = max(maxima, default=0.0) + 1.0

    duration_seconds = max(float(recording_duration_samples) / sample_rate_hz, 0.0)
    refractory_seconds = max(float(refractory_period_ms), 0.0) / 1000.0
    metrics = {}

    for cluster_id in cluster_ids:
        spikes = clustering_results[cluster_id] or []
        times = _cluster_times(clustering_results, cluster_id)
        times_seconds = times / sample_rate_hz
        isis = np.diff(times_seconds)
        violation_count = int(np.count_nonzero(isis < refractory_seconds))
        isi_count = int(isis.size)

        channels = []
        amplitudes = []
        depths = []
        for spike in spikes:
            try:
                channel = int(spike.get('channel'))
                channels.append(channel)
            except (AttributeError, TypeError, ValueError):
                pass

            for key in ('amplitude', 'amp', 'peakAmplitude', 'spikeAmplitude'):
                try:
                    amplitude = float(spike.get(key))
                except (AttributeError, TypeError, ValueError):
                    continue
                if np.isfinite(amplitude):
                    amplitudes.append(amplitude)
                    break

            for key in ('depth', 'probeDepth', 'ypos', 'yPosition'):
                try:
                    depth = float(spike.get(key))
                except (AttributeError, TypeError, ValueError):
                    continue
                if np.isfinite(depth):
                    depths.append(depth)
                    break

        peak_channel = Counter(channels).most_common(1)[0][0] if channels else None
        metrics[str(cluster_id)] = {
            'clusterId': cluster_id,
            'numSpikes': int(times.size),
            'peakChannel': peak_channel,
            'depth': float(np.median(depths)) if depths else None,
            'firingRateHz': float(times.size / duration_seconds) if duration_seconds else 0.0,
            'isiViolationCount': violation_count,
            'isiViolationRate': float(violation_count / isi_count) if isi_count else 0.0,
            'firstSpikeSamples': float(times[0]) if times.size else None,
            'lastSpikeSamples': float(times[-1]) if times.size else None,
            'meanAmplitude': float(np.mean(amplitudes)) if amplitudes else None,
            'durationSeconds': duration_seconds,
        }

    return metrics


def _pair_histogram(source, target, window_samples, edges_samples, autocorrelation=False):
    counts = np.zeros(len(edges_samples) - 1, dtype=np.int64)
    if source.size == 0 or target.size == 0:
        return counts

    # Batch source spikes so NumPy performs one histogram per chunk instead of
    # one histogram per spike. This keeps large CCG matrices responsive while
    # bounding the temporary difference arrays.
    chunk_size = 4096
    for chunk_start in range(0, source.size, chunk_size):
        difference_chunks = []
        for spike_time in source[chunk_start:chunk_start + chunk_size]:
            left = np.searchsorted(target, spike_time - window_samples, side='left')
            right = np.searchsorted(target, spike_time + window_samples, side='right')
            differences = target[left:right] - spike_time
            if autocorrelation:
                differences = differences[differences != 0]
            if differences.size:
                difference_chunks.append(differences)

        if difference_chunks:
            counts += np.histogram(
                np.concatenate(difference_chunks),
                bins=edges_samples,
            )[0]

    return counts


def calculate_correlograms(
    clustering_results,
    cluster_ids,
    sample_rate_hz=30000.0,
    bin_size_ms=1.0,
    window_size_ms=50.0,
    max_spikes_per_cluster=100000,
    recording_duration_samples=None,
):
    """Return an ACG/CCG matrix for up to eight selected clusters."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    bin_size_ms = min(max(float(bin_size_ms), 0.05), 20.0)
    window_size_ms = min(max(float(window_size_ms), bin_size_ms), 1000.0)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=8)

    half_bin_count = max(1, int(np.ceil(window_size_ms / bin_size_ms)))
    actual_window_ms = half_bin_count * bin_size_ms
    edges_ms = np.linspace(-actual_window_ms, actual_window_ms, 2 * half_bin_count + 1)
    centers_ms = (edges_ms[:-1] + edges_ms[1:]) / 2.0
    edges_samples = edges_ms * sample_rate_hz / 1000.0
    window_samples = actual_window_ms * sample_rate_hz / 1000.0

    times_by_cluster = {
        cluster_id: _evenly_sample(
            _cluster_times(clustering_results, cluster_id),
            int(max_spikes_per_cluster) if max_spikes_per_cluster else None,
        )
        for cluster_id in cluster_ids
    }

    if recording_duration_samples is None:
        recording_duration_samples = max(
            (times[-1] for times in times_by_cluster.values() if times.size),
            default=0.0,
        ) + 1.0
    duration_samples = max(float(recording_duration_samples), 1.0)
    bin_size_samples = bin_size_ms * sample_rate_hz / 1000.0
    pairs = []

    for row_index, source_id in enumerate(cluster_ids):
        source = times_by_cluster[source_id]
        for column_index, target_id in enumerate(cluster_ids):
            target = times_by_cluster[target_id]
            counts = _pair_histogram(
                source,
                target,
                window_samples,
                edges_samples,
                autocorrelation=source_id == target_id,
            )
            baseline_count = (
                float(source.size * target.size * bin_size_samples / duration_samples)
                if duration_samples else 0.0
            )
            pairs.append({
                'row': row_index,
                'column': column_index,
                'sourceClusterId': source_id,
                'targetClusterId': target_id,
                'counts': counts.tolist(),
                'baselineCount': baseline_count,
            })

    return {
        'clusterIds': cluster_ids,
        'binEdgesMs': edges_ms.tolist(),
        'binCentersMs': centers_ms.tolist(),
        'binSizeMs': bin_size_ms,
        'windowSizeMs': actual_window_ms,
        'sampleRateHz': sample_rate_hz,
        'sampledSpikeCounts': {
            str(cluster_id): int(times_by_cluster[cluster_id].size)
            for cluster_id in cluster_ids
        },
        'pairs': pairs,
    }


def calculate_isi_histograms(
    clustering_results,
    cluster_ids,
    sample_rate_hz=30000.0,
    bin_size_ms=0.5,
    window_size_ms=100.0,
    refractory_period_ms=2.0,
):
    """Return per-cluster ISI histograms and refractory violation summaries."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    bin_size_ms = min(max(float(bin_size_ms), 0.05), 50.0)
    window_size_ms = min(max(float(window_size_ms), bin_size_ms), 10000.0)
    refractory_period_ms = min(max(float(refractory_period_ms), 0.0), window_size_ms)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=20)

    bin_count = max(1, int(np.ceil(window_size_ms / bin_size_ms)))
    actual_window_ms = bin_count * bin_size_ms
    edges_ms = np.linspace(0.0, actual_window_ms, bin_count + 1)
    centers_ms = (edges_ms[:-1] + edges_ms[1:]) / 2.0
    series = []

    for cluster_id in cluster_ids:
        times_ms = _cluster_times(clustering_results, cluster_id) * 1000.0 / sample_rate_hz
        intervals_ms = np.diff(times_ms)
        visible_intervals = intervals_ms[intervals_ms <= actual_window_ms]
        counts = np.histogram(visible_intervals, bins=edges_ms)[0]
        violation_count = int(np.count_nonzero(intervals_ms < refractory_period_ms))
        series.append({
            'clusterId': cluster_id,
            'counts': counts.tolist(),
            'totalIntervals': int(intervals_ms.size),
            'visibleIntervals': int(visible_intervals.size),
            'violationCount': violation_count,
            'violationRate': (
                float(violation_count / intervals_ms.size) if intervals_ms.size else 0.0
            ),
        })

    return {
        'clusterIds': cluster_ids,
        'binEdgesMs': edges_ms.tolist(),
        'binCentersMs': centers_ms.tolist(),
        'binSizeMs': bin_size_ms,
        'windowSizeMs': actual_window_ms,
        'refractoryPeriodMs': refractory_period_ms,
        'sampleRateHz': sample_rate_hz,
        'series': series,
    }


def _channel_index(channel, channel_count):
    try:
        value = int(round(float(channel)))
    except (TypeError, ValueError):
        return None
    if 1 <= value <= channel_count:
        return value - 1
    if 0 <= value < channel_count:
        return value
    return None


def _extract_amplitude_point(
    spike,
    cluster_id,
    fallback_index,
    data_array,
    channel_index,
    sample_count,
    sample_rate_hz,
    window_samples,
):
    try:
        spike_time = int(round(float(spike.get('time'))))
    except (AttributeError, TypeError, ValueError):
        return None
    if spike_time < 0 or spike_time >= sample_count:
        return None

    start = max(0, spike_time - window_samples)
    end = min(sample_count, spike_time + window_samples + 1)
    waveform = np.asarray(data_array[channel_index, start:end], dtype=np.float64)
    waveform = waveform[np.isfinite(waveform)]
    if waveform.size == 0:
        return None

    raw_spike_index = spike.get('spikeIndex', fallback_index)
    try:
        spike_index = int(raw_spike_index)
    except (TypeError, ValueError):
        spike_index = int(fallback_index)
    try:
        channel_label = int(round(float(spike.get('channel'))))
    except (AttributeError, TypeError, ValueError):
        channel_label = channel_index + 1

    return {
        'spikeId': f'{cluster_id}:{spike_index}',
        'spikeIndex': spike_index,
        'pointIndex': int(fallback_index),
        'timeSamples': spike_time,
        'timeSeconds': float(spike_time / sample_rate_hz),
        'channel': channel_label,
        'amplitude': float(np.ptp(waveform)),
        'clusterId': cluster_id,
    }


def extract_spike_amplitudes(
    clustering_results,
    cluster_ids,
    data_array,
    sample_rate_hz=30000.0,
    max_spikes_per_cluster=5000,
    window_samples=15,
    include_background=False,
    max_background_spikes=5000,
):
    """Extract unstandardized peak-to-peak amplitudes for drift inspection."""
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=20)
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    maximum = min(max(int(max_spikes_per_cluster), 1), 20000)
    window_samples = min(max(int(window_samples), 1), 200)
    if data_array is None or getattr(data_array, 'ndim', 0) < 2:
        return {
            'clusterIds': cluster_ids,
            'sampleRateHz': sample_rate_hz,
            'amplitudeUnit': 'raw',
            'series': [],
            'backgroundPoints': [],
        }

    channel_count, sample_count = data_array.shape[:2]
    series = []
    selected_channel_indices = set()

    for cluster_id in cluster_ids:
        indexed_spikes = list(enumerate(clustering_results[cluster_id] or []))
        indexed_spikes.sort(key=lambda item: float(item[1].get('time', 0)))
        if len(indexed_spikes) > maximum:
            indices = np.linspace(0, len(indexed_spikes) - 1, num=maximum, dtype=np.int64)
            indexed_spikes = [indexed_spikes[index] for index in indices]

        points = []
        for original_spike_index, spike in indexed_spikes:
            channel_index = _channel_index(spike.get('channel'), channel_count)
            if channel_index is None:
                continue
            selected_channel_indices.add(channel_index)
            point = _extract_amplitude_point(
                spike,
                cluster_id,
                original_spike_index,
                data_array,
                channel_index,
                sample_count,
                sample_rate_hz,
                window_samples,
            )
            if point is not None:
                points.append(point)

        amplitudes = [point['amplitude'] for point in points]
        series.append({
            'clusterId': cluster_id,
            'points': points,
            'summary': {
                'count': len(points),
                'meanAmplitude': float(np.mean(amplitudes)) if amplitudes else None,
                'medianAmplitude': float(np.median(amplitudes)) if amplitudes else None,
                'minAmplitude': float(np.min(amplitudes)) if amplitudes else None,
                'maxAmplitude': float(np.max(amplitudes)) if amplitudes else None,
            },
        })

    background_points = []
    if include_background and selected_channel_indices:
        selected_id_set = set(cluster_ids)
        candidate_count = sum(
            1
            for background_cluster_id, spikes in enumerate(clustering_results)
            if background_cluster_id not in selected_id_set
            for spike in (spikes or [])
            if _channel_index(spike.get('channel'), channel_count) in selected_channel_indices
        )
        background_maximum = min(max(int(max_background_spikes), 0), 20000)
        if candidate_count and background_maximum:
            selected_positions = set(np.linspace(
                0,
                candidate_count - 1,
                num=min(candidate_count, background_maximum),
                dtype=np.int64,
            ).tolist())
            candidate_position = 0
            for background_cluster_id, spikes in enumerate(clustering_results):
                if background_cluster_id in selected_id_set:
                    continue
                for fallback_index, spike in enumerate(spikes or []):
                    channel_index = _channel_index(spike.get('channel'), channel_count)
                    if channel_index not in selected_channel_indices:
                        continue
                    if candidate_position in selected_positions:
                        point = _extract_amplitude_point(
                            spike,
                            background_cluster_id,
                            fallback_index,
                            data_array,
                            channel_index,
                            sample_count,
                            sample_rate_hz,
                            window_samples,
                        )
                        if point is not None:
                            background_points.append(point)
                    candidate_position += 1

    return {
        'clusterIds': cluster_ids,
        'sampleRateHz': sample_rate_hz,
        'amplitudeUnit': 'raw',
        'series': series,
        'backgroundPoints': background_points,
    }
