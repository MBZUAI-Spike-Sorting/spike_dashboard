"""
Spike data routes.

Handles spike data retrieval and navigation.
"""

import numpy as np
from flask import Blueprint, request, jsonify, current_app

from app.logger import get_logger
from app.services.filter_processor import FilterProcessor
from app.utils.responses import not_found_error, server_error, validation_error
from processing.spatial_views import downsample_trace_heatmap

logger = get_logger(__name__)

spike_data_bp = Blueprint('spike_data', __name__)


@spike_data_bp.route('/api/spike-data', methods=['POST'])
def get_spike_data():
    """Get spike data for channels."""
    try:
        data = request.get_json()
        channels = data.get('channels', [])
        spike_threshold = data.get('spikeThreshold')
        invert_data = data.get('invertData', False)
        start_time = data.get('startTime', 0)
        end_time = data.get('endTime', 20000)
        use_precomputed = data.get('usePrecomputed', False)
        data_type = data.get('dataType', 'raw')
        filter_type = data.get('filterType', 'highpass')
        
        max_points = 20000
        end_time = min(end_time, start_time + max_points)
        
        spike_data_processor = current_app.config['spike_data_processor']
        spike_times_manager = current_app.config['spike_times_manager']
        
        if use_precomputed and spike_times_manager.spike_times_data is not None:
            spike_data = spike_data_processor.get_precomputed_spike_data(
                channels, start_time, end_time, filter_type, invert_data, data_type
            )
        else:
            spike_data = spike_data_processor.get_real_data(
                channels, spike_threshold, invert_data, start_time, end_time, data_type, filter_type
            )
        
        return jsonify(spike_data)
    except Exception as e:
        logger.error(f"Error in get_spike_data: {e}", exc_info=True)
        return server_error("Failed to get spike data", exception=e)


@spike_data_bp.route('/api/trace-heatmap', methods=['POST'])
def get_trace_heatmap():
    """Return a bounded all-channel trace image for a requested time range."""
    try:
        data = request.get_json() or {}
        dataset_manager = current_app.config['dataset_manager']
        data_array = dataset_manager.data_array
        if data_array is None:
            return jsonify({'channelIds': [], 'timeBinCentersSamples': [], 'values': []})

        sample_rate_hz = float(current_app.config['app_config'].SAMPLING_RATE)
        result = downsample_trace_heatmap(
            data_array,
            start_sample=data.get('startSample', 0),
            end_sample=data.get('endSample'),
            channel_ids=data.get('channelIds'),
            max_time_bins=data.get('maxTimeBins', 1000),
            max_channels=data.get('maxChannels', 512),
            normalization=data.get('normalization', 'robust_zscore'),
            sample_rate_hz=sample_rate_hz,
        )
        return jsonify(result)
    except Exception as error:
        logger.error(f"Error creating trace heatmap: {error}", exc_info=True)
        return server_error("Failed to create trace heatmap", exception=error)


@spike_data_bp.route('/api/spike-times-available', methods=['GET'])
def spike_times_available():
    """Check if spike times are available."""
    try:
        spike_times_manager = current_app.config['spike_times_manager']
        info = spike_times_manager.get_spike_times_info()
        return jsonify(info)
    except Exception as e:
        logger.error(f"Error checking spike times: {e}", exc_info=True)
        return server_error("Failed to check spike times", exception=e)


@spike_data_bp.route('/api/navigate-spike', methods=['POST'])
def navigate_spike():
    """Navigate to next or previous spike."""
    try:
        data = request.get_json()
        current_time = data.get('currentTime', 0)
        direction = data.get('direction', 'next')
        channels = data.get('channels', [])
        
        spike_times_manager = current_app.config['spike_times_manager']
        result = spike_times_manager.navigate_spike(current_time, direction, channels)
        
        if result is None:
            return not_found_error('Spike')
        
        spike_time, total_spikes = result
        return jsonify({
            'spikeTime': spike_time,
            'totalSpikes': total_spikes
        })
    except Exception as e:
        logger.error(f"Error in navigate_spike: {e}", exc_info=True)
        return server_error("Failed to navigate spike", exception=e)


@spike_data_bp.route('/api/spike-preview', methods=['POST'])
def get_spike_preview():
    """Get waveform preview for a specific spike."""
    try:
        data = request.get_json()
        spike_time = data.get('spikeTime')
        channel_id = data.get('channelId', 1)
        window = data.get('window', 10)
        filter_type = data.get('filterType', 'highpass')
        point_index = data.get('pointIndex', 0)
        
        if spike_time is None:
            return validation_error('No spike time provided', field='spikeTime')
        
        dataset_manager = current_app.config['dataset_manager']
        
        if dataset_manager.data_array is None:
            return server_error('No data loaded')
        
        spike_time = int(spike_time)
        array_index = channel_id - 1
        
        if array_index >= dataset_manager.data_array.shape[0] or array_index < 0:
            return validation_error('Invalid channel', field='channelId')
        
        channel_data = dataset_manager.data_array[array_index, :]
        
        if filter_type != 'none':
            try:
                filtered_channel = FilterProcessor.apply_filter(
                    channel_data.astype(float), 
                    filter_type=filter_type
                )
            except Exception:
                logger.warning("Filter failed, using raw data")
                filtered_channel = channel_data
        else:
            filtered_channel = channel_data
        
        start_idx = max(0, spike_time - window)
        end_idx = min(len(filtered_channel), spike_time + window + 1)
        waveform = filtered_channel[start_idx:end_idx]
        waveform = np.round(waveform).astype(int)
        
        return jsonify({
            'waveform': waveform.tolist(),
            'pointIndex': point_index,
            'spikeTime': spike_time,
            'channelId': channel_id,
            'window': window,
            'filterType': filter_type
        })
    except Exception as e:
        logger.error(f"Error getting spike preview: {e}", exc_info=True)
        return server_error("Failed to get spike preview", exception=e)
