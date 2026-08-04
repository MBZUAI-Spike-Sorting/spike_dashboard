"""Pure template extraction for Phy-inspired population views."""

from collections import Counter

import numpy as np

from processing.cluster_diagnostics import normalize_cluster_ids


RETAINED_TEMPLATE_KEYS = (
    'templateWaveform',
    'template_waveform',
    'meanWaveform',
    'mean_waveform',
    'template',
    'waveform',
)


def _finite_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if np.isfinite(number) else None


def _peak_channel(spikes):
    channels = []
    for spike in spikes or []:
        channel = _finite_number(spike.get('channel')) if isinstance(spike, dict) else None
        if channel is not None:
            channels.append(int(round(channel)))
    return Counter(channels).most_common(1)[0][0] if channels else None


def _channel_reference(channel, num_channels):
    if channel is None or num_channels <= 0:
        return None, None
    channel = int(round(channel))
    if channel == 0:
        return 0, 1
    if 1 <= channel <= num_channels:
        return channel - 1, channel
    if 0 <= channel < num_channels:
        return channel, channel + 1
    return None, None


def _template_vector(value, channel_index, num_channels):
    try:
        template = np.asarray(value, dtype=np.float64).squeeze()
    except (TypeError, ValueError):
        return None
    if template.ndim == 0 or template.size < 2:
        return None
    if template.ndim == 2:
        if channel_index is not None and template.shape[0] == num_channels:
            template = template[channel_index]
        elif channel_index is not None and template.shape[1] == num_channels:
            template = template[:, channel_index]
        elif template.shape[0] <= template.shape[1]:
            template = template[int(np.argmax(np.ptp(template, axis=1)))]
        else:
            template = template[:, int(np.argmax(np.ptp(template, axis=0)))]
    if template.ndim != 1 or template.size < 2:
        return None
    finite = np.isfinite(template)
    if not np.any(finite):
        return None
    return np.where(finite, template, 0.0)


def _retained_template(spikes, channel_index, num_channels):
    for spike in spikes or []:
        if not isinstance(spike, dict):
            continue
        for key in RETAINED_TEMPLATE_KEYS:
            if key not in spike:
                continue
            template = _template_vector(spike[key], channel_index, num_channels)
            if template is not None:
                return template, key
    return None, None


def _sample_spikes(spikes, maximum):
    candidates = []
    for spike in spikes or []:
        time = _finite_number(spike.get('time')) if isinstance(spike, dict) else None
        if time is not None:
            candidates.append((time, spike))
    candidates.sort(key=lambda item: item[0])
    if len(candidates) <= maximum:
        return candidates
    indices = np.linspace(0, len(candidates) - 1, num=maximum, dtype=np.int64)
    return [candidates[index] for index in indices]


def _infer_channel(data_array, sampled_spikes, window_samples):
    if data_array is None or data_array.ndim < 2:
        return None, None
    scores = np.zeros(data_array.shape[0], dtype=np.float64)
    usable = 0
    for spike_time, _ in sampled_spikes[:16]:
        center = int(round(spike_time))
        start = max(0, center - window_samples)
        end = min(data_array.shape[1], center + window_samples + 1)
        window = np.asarray(data_array[:, start:end], dtype=np.float64)
        if window.ndim != 2 or window.shape[1] < 2:
            continue
        scores += np.ptp(window, axis=1)
        usable += 1
    if usable == 0 or not np.any(scores):
        return None, None
    index = int(np.argmax(scores))
    return index, index + 1


def _mean_raw_waveform(data_array, sampled_spikes, channel_index, window_samples):
    if data_array is None or data_array.ndim < 2 or channel_index is None:
        return None, 0
    waveforms = []
    width = window_samples * 2 + 1
    for spike_time, _ in sampled_spikes:
        center = int(round(spike_time))
        start = center - window_samples
        end = center + window_samples + 1
        if start < 0 or end > data_array.shape[1]:
            continue
        waveform = np.asarray(data_array[channel_index, start:end], dtype=np.float64)
        if waveform.size != width or not np.all(np.isfinite(waveform)):
            continue
        edge_count = max(1, min(5, waveform.size // 4))
        baseline = np.mean(np.concatenate((waveform[:edge_count], waveform[-edge_count:])))
        waveforms.append(waveform - baseline)
    if not waveforms:
        return None, 0
    return np.mean(np.asarray(waveforms), axis=0), len(waveforms)


def extract_cluster_templates(
    clustering_results,
    data_array,
    cluster_ids,
    sample_rate_hz=30000.0,
    window_samples=30,
    max_waveforms=64,
):
    """Return retained templates or deterministic mean-waveform fallbacks."""
    sample_rate_hz = max(float(sample_rate_hz), 1.0)
    window_samples = min(max(int(window_samples), 1), 500)
    max_waveforms = min(max(int(max_waveforms), 1), 256)
    cluster_ids = normalize_cluster_ids(clustering_results, cluster_ids, limit=500)
    num_channels = int(data_array.shape[0]) if data_array is not None and data_array.ndim >= 2 else 0
    templates = []

    for cluster_id in cluster_ids:
        spikes = clustering_results[cluster_id] or []
        sampled_spikes = _sample_spikes(spikes, max_waveforms)
        peak_channel = _peak_channel(spikes)
        channel_index, channel_label = _channel_reference(peak_channel, num_channels)
        if channel_index is None:
            channel_index, channel_label = _infer_channel(
                data_array,
                sampled_spikes,
                window_samples,
            )

        template, retained_key = _retained_template(spikes, channel_index, num_channels)
        source = 'retained_template'
        sampled_count = 0
        if template is None:
            template, sampled_count = _mean_raw_waveform(
                data_array,
                sampled_spikes,
                channel_index,
                window_samples,
            )
            source = 'mean_raw_waveform' if template is not None else 'unavailable'

        values = template.tolist() if template is not None else []
        center = (len(values) - 1) / 2.0
        time_points_ms = [
            (index - center) * 1000.0 / sample_rate_hz
            for index in range(len(values))
        ]
        templates.append({
            'clusterId': cluster_id,
            'template': values,
            'timePointsMs': time_points_ms,
            'source': source,
            'retainedKey': retained_key,
            'peakChannel': channel_label if channel_label is not None else peak_channel,
            'numSpikes': len(spikes),
            'sampledWaveforms': sampled_count,
            'peakToPeak': float(np.ptp(template)) if template is not None else None,
        })

    return {
        'clusterIds': cluster_ids,
        'sampleRateHz': sample_rate_hz,
        'windowSamples': window_samples,
        'maxWaveforms': max_waveforms,
        'templates': templates,
    }
