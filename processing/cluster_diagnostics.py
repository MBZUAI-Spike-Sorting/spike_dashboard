"""Pure numerical helpers for cluster-quality diagnostic views.

The functions in this module deliberately do not depend on Flask.  Keeping the
analysis code separate makes the API routes small and gives the frontend a
stable, JSON-friendly contract for correlograms, ISIs, firing rates, metrics,
and drift.
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


def _cluster_feature_centroid(spikes):
    points = []
    for spike in spikes or []:
        try:
            x_value = float(spike.get('x'))
            y_value = float(spike.get('y'))
        except (AttributeError, TypeError, ValueError):
            continue
        if np.isfinite(x_value) and np.isfinite(y_value):
            points.append((x_value, y_value))
    return np.mean(np.asarray(points, dtype=np.float64), axis=0) if points else None


def _cluster_peak_channel_index(spikes, channel_count):
    channels = []
    for spike in spikes or []:
        try:
            channel = _channel_index(spike.get('channel'), channel_count)
        except AttributeError:
            channel = None
        if channel is not None:
            channels.append(channel)
    return Counter(channels).most_common(1)[0][0] if channels else None


def _mean_waveform_signature(
    spikes,
    data_array,
    channel_index,
    max_spikes,
    window_samples,
):
    if data_array is None or getattr(data_array, 'ndim', 0) < 2 or channel_index is None:
        return None

    sample_count = data_array.shape[1]
    times = _cluster_times([spikes], 0)
    times = _evenly_sample(times, max_spikes)
    waveforms = []
    for raw_time in times:
        spike_time = int(round(float(raw_time)))
        start = spike_time - window_samples
        end = spike_time + window_samples + 1
        if start < 0 or end > sample_count:
            continue
        waveform = np.asarray(data_array[channel_index, start:end], dtype=np.float64)
        if waveform.size != (2 * window_samples + 1) or not np.all(np.isfinite(waveform)):
            continue
        waveform = waveform - np.mean(waveform)
        scale = np.linalg.norm(waveform)
        if scale > 0:
            waveforms.append(waveform / scale)

    if not waveforms:
        return None
    signature = np.mean(np.asarray(waveforms), axis=0)
    signature = signature - np.mean(signature)
    signature_norm = np.linalg.norm(signature)
    return signature / signature_norm if signature_norm > 0 else None


def _infer_channel_count(clustering_results):
    channel_values = []
    for cluster in clustering_results or []:
        for spike in cluster or []:
            try:
                channel = int(round(float(spike.get('channel'))))
            except (AttributeError, TypeError, ValueError):
                continue
            if channel >= 0:
                channel_values.append(channel)
    return max(max(channel_values, default=1), 1)


def calculate_cluster_similarities(
    clustering_results,
    primary_cluster_id,
    data_array=None,
    candidate_cluster_ids=None,
    sorter_similarity_matrix=None,
    max_candidates=20,
    max_spikes_per_cluster=100,
    window_samples=15,
):
    """Rank clusters similar to a primary cluster using the best available source."""
    primary_ids = normalize_cluster_ids(clustering_results, [primary_cluster_id], limit=1)
    if not primary_ids:
        return {
            'primaryClusterId': None,
            'source': 'unavailable',
            'candidates': [],
        }

    primary_cluster_id = primary_ids[0]
    candidate_ids = normalize_cluster_ids(clustering_results, candidate_cluster_ids)
    candidate_ids = [cluster_id for cluster_id in candidate_ids if cluster_id != primary_cluster_id]
    max_candidates = min(max(int(max_candidates), 1), 100)
    max_spikes_per_cluster = min(max(int(max_spikes_per_cluster), 1), 1000)
    window_samples = min(max(int(window_samples), 1), 200)
    channel_count = (
        int(data_array.shape[0])
        if data_array is not None and getattr(data_array, 'ndim', 0) >= 2
        else _infer_channel_count(clustering_results)
    )
    channel_count = max(channel_count, 1)

    cluster_ids = [primary_cluster_id, *candidate_ids]
    peak_channels = {
        cluster_id: _cluster_peak_channel_index(
            clustering_results[cluster_id], channel_count
        )
        for cluster_id in cluster_ids
    }
    centroids = {
        cluster_id: _cluster_feature_centroid(clustering_results[cluster_id])
        for cluster_id in cluster_ids
    }
    signatures = {
        cluster_id: _mean_waveform_signature(
            clustering_results[cluster_id],
            data_array,
            peak_channels[cluster_id],
            max_spikes_per_cluster,
            window_samples,
        )
        for cluster_id in cluster_ids
    }

    sorter_matrix = None
    if sorter_similarity_matrix is not None:
        try:
            candidate_matrix = np.asarray(sorter_similarity_matrix, dtype=np.float64)
            if candidate_matrix.ndim == 2:
                sorter_matrix = candidate_matrix
        except (TypeError, ValueError):
            sorter_matrix = None

    primary_channel = peak_channels[primary_cluster_id]
    primary_centroid = centroids[primary_cluster_id]
    primary_signature = signatures[primary_cluster_id]
    rows = []
    used_sources = set()

    for candidate_id in candidate_ids:
        candidate_channel = peak_channels[candidate_id]
        channel_distance = (
            abs(candidate_channel - primary_channel)
            if candidate_channel is not None and primary_channel is not None
            else None
        )
        channel_similarity = (
            float(np.exp(-channel_distance / 4.0))
            if channel_distance is not None
            else 0.0
        )

        candidate_centroid = centroids[candidate_id]
        feature_distance = (
            float(np.linalg.norm(candidate_centroid - primary_centroid))
            if candidate_centroid is not None and primary_centroid is not None
            else None
        )
        feature_similarity = (
            float(1.0 / (1.0 + feature_distance))
            if feature_distance is not None
            else None
        )

        candidate_signature = signatures[candidate_id]
        waveform_similarity = None
        if primary_signature is not None and candidate_signature is not None:
            cosine = float(np.dot(primary_signature, candidate_signature))
            waveform_similarity = float(np.clip((cosine + 1.0) / 2.0, 0.0, 1.0))

        sorter_similarity = None
        if (
            sorter_matrix is not None
            and primary_cluster_id < sorter_matrix.shape[0]
            and candidate_id < sorter_matrix.shape[1]
        ):
            raw_similarity = sorter_matrix[primary_cluster_id, candidate_id]
            if np.isfinite(raw_similarity):
                sorter_similarity = float(np.clip(raw_similarity, 0.0, 1.0))

        if sorter_similarity is not None:
            similarity = sorter_similarity
            source = 'sorter_template'
        elif waveform_similarity is not None:
            similarity = 0.85 * waveform_similarity + 0.15 * channel_similarity
            source = 'mean_waveform_channel'
        elif feature_similarity is not None:
            similarity = 0.8 * feature_similarity + 0.2 * channel_similarity
            source = 'feature_centroid_channel'
        else:
            similarity = channel_similarity
            source = 'channel_distance'
        used_sources.add(source)

        rows.append({
            'clusterId': candidate_id,
            'similarity': float(np.clip(similarity, 0.0, 1.0)),
            'source': source,
            'sorterSimilarity': sorter_similarity,
            'waveformSimilarity': waveform_similarity,
            'featureSimilarity': feature_similarity,
            'channelSimilarity': channel_similarity,
            'channelDistance': channel_distance,
            'peakChannel': candidate_channel + 1 if candidate_channel is not None else None,
            'numSpikes': len(clustering_results[candidate_id] or []),
        })

    rows.sort(key=lambda row: (-row['similarity'], row['clusterId']))
    response_source = next(iter(used_sources)) if len(used_sources) == 1 else 'mixed_fallback'
    return {
        'primaryClusterId': primary_cluster_id,
        'primaryPeakChannel': primary_channel + 1 if primary_channel is not None else None,
        'source': response_source if rows else 'unavailable',
        'maxCandidates': max_candidates,
        'windowSamples': window_samples,
        'sampledSpikesPerCluster': max_spikes_per_cluster,
        'candidates': rows[:max_candidates],
    }


def calculate_firing_rate_histograms(
    clustering_results,
    cluster_ids,
    sample_rate_hz=30000.0,
    bin_size_seconds=1.0,
    recording_duration_samples=None,
    max_bins=5000,
):
    """Return full-recording spike counts and rates for selected clusters.

    The final bin may be shorter than the requested bin size, so rates are
    normalized by the width of each individual bin. Very long recordings are
    bounded by ``max_bins``; in that case the effective bin size is increased
    and reported in the response.
    """
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    requested_bin_size_seconds = max(float(bin_size_seconds), 1.0 / sample_rate_hz)
    max_bins = min(max(int(max_bins), 1), 20000)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=20)
    times_by_cluster = {
        cluster_id: _cluster_times(clustering_results, cluster_id)
        for cluster_id in cluster_ids
    }

    latest_spike_sample = max(
        (times[-1] for times in times_by_cluster.values() if times.size),
        default=0.0,
    )
    if recording_duration_samples is None:
        recording_duration_samples = latest_spike_sample + 1.0
    duration_samples = max(
        float(recording_duration_samples),
        float(latest_spike_sample) + 1.0,
        1.0,
    )

    requested_bin_samples = max(requested_bin_size_seconds * sample_rate_hz, 1.0)
    requested_bin_count = max(1, int(np.ceil(duration_samples / requested_bin_samples)))
    bin_count = min(requested_bin_count, max_bins)
    effective_bin_samples = (
        duration_samples / bin_count
        if requested_bin_count > max_bins
        else requested_bin_samples
    )

    edges_samples = np.arange(bin_count + 1, dtype=np.float64) * effective_bin_samples
    edges_samples[-1] = duration_samples
    widths_seconds = np.diff(edges_samples) / sample_rate_hz
    centers_seconds = (
        (edges_samples[:-1] + edges_samples[1:]) / (2.0 * sample_rate_hz)
    )
    duration_seconds = duration_samples / sample_rate_hz
    series = []

    for cluster_id in cluster_ids:
        times = times_by_cluster[cluster_id]
        counts = np.histogram(times, bins=edges_samples)[0]
        rates = np.divide(
            counts,
            widths_seconds,
            out=np.zeros_like(widths_seconds, dtype=np.float64),
            where=widths_seconds > 0,
        )
        series.append({
            'clusterId': cluster_id,
            'counts': counts.tolist(),
            'rateHz': rates.tolist(),
            'totalSpikes': int(times.size),
            'meanRateHz': float(times.size / duration_seconds) if duration_seconds else 0.0,
            'maxRateHz': float(np.max(rates)) if rates.size else 0.0,
        })

    return {
        'clusterIds': cluster_ids,
        'binEdgesSamples': edges_samples.tolist(),
        'binCentersSeconds': centers_seconds.tolist(),
        'binWidthsSeconds': widths_seconds.tolist(),
        'requestedBinSizeSeconds': requested_bin_size_seconds,
        'binSizeSeconds': float(effective_bin_samples / sample_rate_hz),
        'binSizeAdjusted': requested_bin_count > max_bins,
        'recordingDurationSamples': duration_samples,
        'recordingDurationSeconds': duration_seconds,
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
