"""
Clustering and spike sorting routes.

Handles cluster data, statistics, waveforms, and spike sorting algorithms.
"""

import io
import json

import numpy as np
from flask import Blueprint, request, jsonify, current_app

from app.logger import get_logger
from app.services.filter_processor import FilterProcessor
from app.utils.auth import algorithm_access_required, get_current_user, login_required
from app.utils.responses import server_error, validation_error, not_found_error, error_response, success_response

logger = get_logger(__name__)

clustering_bp = Blueprint('clustering', __name__)


@clustering_bp.route('/api/cluster-data', methods=['POST'])
def get_cluster_data():
    """Get cluster data for visualization."""
    try:
        data = request.get_json()
        mode = data.get('mode', 'synthetic')
        channel_mapping = data.get('channelMapping', {})
        algorithm = data.get('algorithm', '')
        
        clustering_manager = current_app.config['clustering_manager']
        
        # For preprocessed algorithms, load saved results into memory first
        if algorithm == 'preprocessed_torchbci':
            clustering_manager.load_preprocessed_torchbci()
            result = clustering_manager.get_cluster_data(mode, channel_mapping)
            return jsonify(result)
        
        if algorithm == 'preprocessed_kilosort4':
            clustering_manager.load_preprocessed_kilosort4()
            result = clustering_manager.get_cluster_data(mode, channel_mapping)
            return jsonify(result)
        
        result = clustering_manager.get_cluster_data(mode, channel_mapping)
        return jsonify(result)
    except FileNotFoundError as e:
        return not_found_error('Cluster data file')
    except Exception as e:
        logger.error(f"Error getting cluster data: {e}", exc_info=True)
        return server_error("Failed to get cluster data", exception=e)


@clustering_bp.route('/api/cluster-statistics', methods=['POST'])
def get_cluster_statistics():
    """Get statistics for specified clusters."""
    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        algorithm = data.get('algorithm', '')
        
        if not cluster_ids:
            return jsonify({'statistics': {}})
        
        clustering_manager = current_app.config['clustering_manager']
        
        # For preprocessed algorithms, load saved results into memory first
        if algorithm == 'preprocessed_torchbci':
            if clustering_manager.clustering_results is None:
                clustering_manager.load_preprocessed_torchbci()
        elif algorithm == 'preprocessed_kilosort4':
            if clustering_manager.clustering_results is None:
                clustering_manager.load_preprocessed_kilosort4()
        
        if clustering_manager.clustering_results is not None:
            statistics = _calculate_algorithm_statistics(clustering_manager, cluster_ids)
        else:
            return jsonify({'statistics': {}})
        
        return jsonify({'statistics': statistics})
    except Exception as e:
        logger.error(f"Error getting cluster statistics: {e}", exc_info=True)
        return server_error("Failed to get cluster statistics", exception=e)


def _calculate_algorithm_statistics(clustering_manager, cluster_ids):
    """Calculate statistics for algorithm clusters."""
    statistics = {}
    
    for cluster_id in cluster_ids:
        if cluster_id >= len(clustering_manager.clustering_results):
            continue
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        spike_times_samples = [spike['time'] for spike in cluster_spikes]
        spike_times_secs = np.array(spike_times_samples) / 30000.0
        
        if len(spike_times_secs) > 1:
            sorted_times = np.sort(spike_times_secs)
            isis = np.diff(sorted_times)
            isi_violations = np.sum(isis < 0.002)
            isi_violation_rate = isi_violations / len(isis) if len(isis) > 0 else 0
        else:
            isi_violation_rate = 0
        
        num_spikes = len(cluster_spikes)
        channels = [spike['channel'] for spike in cluster_spikes]
        peak_channel = max(set(channels), key=channels.count) if channels else 181
        
        mean_x = np.mean([spike['x'] for spike in cluster_spikes]) if cluster_spikes else 0
        mean_y = np.mean([spike['y'] for spike in cluster_spikes]) if cluster_spikes else 0
        
        statistics[cluster_id] = {
            'isiViolationRate': float(isi_violation_rate),
            'numSpikes': num_spikes,
            'peakChannel': int(peak_channel),
            'probePosition': {
                'x': int(round(mean_x)),
                'y': int(round(mean_y))
            }
        }
    
    return statistics




@clustering_bp.route('/api/cluster-waveforms', methods=['POST'])
def get_cluster_waveforms():
    """Get waveforms for specified clusters."""
    try:
        data = request.get_json()
        cluster_ids = data.get('clusterIds', [])
        max_waveforms = data.get('maxWaveforms', 100)
        window_size = data.get('windowSize', 30)
        algorithm = data.get('algorithm', '')
        
        dataset_manager = current_app.config['dataset_manager']
        clustering_manager = current_app.config['clustering_manager']
        
        if not cluster_ids or dataset_manager.data_array is None:
            return jsonify({'waveforms': {}})
        
        # For preprocessed algorithms, load saved results into memory first
        if algorithm == 'preprocessed_torchbci':
            if clustering_manager.clustering_results is None:
                clustering_manager.load_preprocessed_torchbci()
        elif algorithm == 'preprocessed_kilosort4':
            if clustering_manager.clustering_results is None:
                clustering_manager.load_preprocessed_kilosort4()
        
        if clustering_manager.clustering_results is not None:
            waveforms_data = _get_algorithm_waveforms(
                clustering_manager, dataset_manager, cluster_ids, max_waveforms, window_size
            )
        else:
            return jsonify({'waveforms': {}})
        
        return jsonify({'waveforms': waveforms_data})
    except Exception as e:
        logger.error(f"Error getting cluster waveforms: {e}", exc_info=True)
        return server_error("Failed to get cluster waveforms", exception=e)


def _get_algorithm_waveforms(clustering_manager, dataset_manager, cluster_ids, max_waveforms, window_size):
    """Get waveforms for algorithm clusters."""
    waveforms_data = {}
    
    for cluster_id in cluster_ids:
        if cluster_id >= len(clustering_manager.clustering_results):
            continue
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        
        if len(cluster_spikes) > max_waveforms:
            indices = np.random.choice(len(cluster_spikes), max_waveforms, replace=False)
            selected_spikes = [cluster_spikes[i] for i in indices]
        else:
            selected_spikes = cluster_spikes
        
        waveforms = []
        for spike in selected_spikes:
            spike_time = spike['time']
            channel = spike['channel']
            channel_idx = channel - 1
            
            start_idx = max(0, int(spike_time) - window_size)
            end_idx = min(dataset_manager.data_array.shape[1], int(spike_time) + window_size)
            
            if start_idx < end_idx and 0 <= channel_idx < dataset_manager.data_array.shape[0]:
                waveform = dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                
                if len(waveform) > 0:
                    mean = np.mean(waveform)
                    std = np.std(waveform)
                    if std > 0:
                        waveform = (waveform - mean) / std
                
                time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                
                waveforms.append({
                    'timePoints': time_points,
                    'amplitude': waveform.tolist()
                })
        
        waveforms_data[cluster_id] = waveforms
    
    return waveforms_data




@clustering_bp.route('/api/cluster-multi-channel-waveforms', methods=['POST'])
def get_cluster_multi_channel_waveforms():
    """Get multi-channel waveforms for a cluster."""
    try:
        data = request.get_json()
        cluster_id = data.get('clusterId')
        max_waveforms = data.get('maxWaveforms', 50)
        window_size = data.get('windowSize', 30)
        algorithm = data.get('algorithm', '')
        
        dataset_manager = current_app.config['dataset_manager']
        clustering_manager = current_app.config['clustering_manager']
        
        if cluster_id is None or dataset_manager.data_array is None:
            return validation_error('Invalid cluster ID or no data loaded')
        
        spike_times, spike_channels = _get_cluster_spike_info(
            cluster_id, algorithm, clustering_manager
        )
        
        if not spike_times:
            return not_found_error('Spikes for cluster', str(cluster_id))
        
        # Determine peak channel
        channel_counts = {}
        for ch in spike_channels:
            channel_counts[ch] = channel_counts.get(ch, 0) + 1
        
        peak_channel = max(channel_counts, key=channel_counts.get)
        neighbor_offsets = [-2, -1, 0, 1, 2]
        target_channels = [peak_channel + offset for offset in neighbor_offsets]
        
        if len(spike_times) > max_waveforms:
            indices = np.random.choice(len(spike_times), max_waveforms, replace=False)
            selected_times = [spike_times[i] for i in indices]
        else:
            selected_times = spike_times
        
        channels_data = {}
        for target_channel in target_channels:
            channel_idx = target_channel - 1
            
            if channel_idx < 0 or channel_idx >= dataset_manager.data_array.shape[0]:
                continue
            
            waveforms = []
            for spike_time in selected_times:
                start_idx = max(0, int(spike_time) - window_size)
                end_idx = min(dataset_manager.data_array.shape[1], int(spike_time) + window_size)
                
                if start_idx < end_idx:
                    waveform = dataset_manager.data_array[channel_idx, start_idx:end_idx].astype(float)
                    
                    if len(waveform) > 0:
                        mean = np.mean(waveform)
                        std = np.std(waveform)
                        if std > 0:
                            waveform = (waveform - mean) / std
                    
                    time_points = [(i - window_size) / 30.0 for i in range(len(waveform))]
                    
                    waveforms.append({
                        'timePoints': time_points,
                        'amplitude': waveform.tolist()
                    })
            
            channels_data[target_channel] = {
                'channelId': target_channel,
                'waveforms': waveforms,
                'isPeak': target_channel == peak_channel
            }
        
        return jsonify({
            'clusterId': cluster_id,
            'peakChannel': peak_channel,
            'channels': channels_data
        })
    except Exception as e:
        logger.error(f"Error getting multi-channel waveforms: {e}", exc_info=True)
        return server_error("Failed to get multi-channel waveforms", exception=e)


def _get_cluster_spike_info(cluster_id, algorithm, clustering_manager):
    """Get spike times and channels for a cluster."""
    spike_times = []
    spike_channels = []
    
    # For preprocessed algorithms, load saved results into memory first
    if algorithm == 'preprocessed_torchbci':
        if clustering_manager.clustering_results is None:
            clustering_manager.load_preprocessed_torchbci()
    elif algorithm == 'preprocessed_kilosort4':
        if clustering_manager.clustering_results is None:
            clustering_manager.load_preprocessed_kilosort4()
    
    if clustering_manager.clustering_results is not None:
        if cluster_id >= len(clustering_manager.clustering_results):
            return spike_times, spike_channels
        
        cluster_spikes = clustering_manager.clustering_results[cluster_id]
        for spike in cluster_spikes:
            spike_times.append(int(spike['time']))
            spike_channels.append(int(spike['channel']))
    
    return spike_times, spike_channels


def _to_scalar(value, default=None):
    """Convert common scipy/MATLAB scalar wrappers to a Python scalar."""
    if value is None:
        return default

    array = np.asarray(value)
    if array.size == 0:
        return default

    item = array.reshape(-1)[0]
    if isinstance(item, bytes):
        return item.decode('utf-8', errors='ignore')
    if isinstance(item, np.generic):
        return item.item()
    return item


def _to_number_list(value):
    """Convert arrays/cells to a flat list of finite float values."""
    if value is None:
        return []

    try:
        array = np.asarray(value)
    except ValueError:
        if isinstance(value, (list, tuple)):
            values = []
            for item in value:
                values.extend(_to_number_list(item))
            return values
        return []

    if array.dtype == object:
        values = []
        for item in array.reshape(-1):
            values.extend(_to_number_list(item))
        return values

    try:
        numeric = np.asarray(value, dtype=float).reshape(-1)
    except (TypeError, ValueError):
        return []

    return [float(item) for item in numeric if np.isfinite(item)]


def _to_string(value, default=''):
    scalar = _to_scalar(value, default)
    return str(scalar or default).strip()


def _pick(data, keys, default=None):
    for key in keys:
        if key in data:
            return data[key]
    return default


def _normalize_spike_time_groups(value, expected_count=None):
    """Return a list of spike-time arrays from MATLAB cells or numeric matrices."""
    if value is None:
        return []

    if isinstance(value, (list, tuple)):
        if not value:
            return []

        has_nested_values = any(
            isinstance(item, (list, tuple, np.ndarray))
            for item in value
        )

        if has_nested_values:
            return [_to_number_list(item) for item in value]

        if expected_count and expected_count > 1 and len(value) == expected_count:
            return [_to_number_list([item]) for item in value]

        return [_to_number_list(value)]

    try:
        array = np.asarray(value)
    except ValueError:
        return []

    if array.dtype == object:
        return [_to_number_list(item) for item in array.reshape(-1)]

    if array.ndim == 0:
        return [[float(array.item())]]

    if array.ndim == 1:
        if expected_count and expected_count > 1 and array.size == expected_count:
            return [[float(item)] for item in array if np.isfinite(item)]
        return [_to_number_list(array)]

    if expected_count and array.shape[0] == expected_count:
        return [_to_number_list(row) for row in array]

    if expected_count and array.shape[1] == expected_count:
        return [_to_number_list(array[:, index]) for index in range(array.shape[1])]

    return [_to_number_list(row) for row in array]


def _normalize_cluster_payload(payload, fallback_name='Uploaded clusters'):
    """Normalize JSON/MAT cluster comparison data to the frontend contract."""
    if not isinstance(payload, dict):
        raise ValueError('Cluster file must contain an object/dictionary')

    algorithm_name = _to_string(
        _pick(payload, ['algorithmName', 'algorithm_name', 'name'], fallback_name),
        fallback_name
    )

    clusters_payload = payload.get('clusters')
    if isinstance(clusters_payload, dict):
        clusters_payload = [clusters_payload]

    if isinstance(clusters_payload, list):
        clusters = []
        for index, cluster in enumerate(clusters_payload):
            if not isinstance(cluster, dict):
                continue

            cluster_id = _pick(cluster, ['id', 'clusterId', 'cluster_id'], index)
            spike_times = _to_number_list(_pick(cluster, ['spikeTimes', 'spike_times', 'times']))

            if not spike_times:
                continue

            primary_channel = _pick(cluster, ['primaryChannel', 'primary_channel', 'channel'])

            clusters.append({
                'id': str(cluster_id),
                'primaryChannel': _to_scalar(primary_channel, None),
                'spikeTimes': spike_times
            })

        if clusters:
            return {
                'algorithmName': algorithm_name,
                'clusters': clusters
            }

    cluster_ids = _to_number_list(
        _pick(payload, ['clusterIds', 'cluster_ids', 'ids'])
    )
    primary_channels = _to_number_list(
        _pick(payload, ['primaryChannels', 'primary_channels', 'channels'])
    )
    spike_groups = _normalize_spike_time_groups(
        _pick(payload, ['spikeTimes', 'spike_times', 'times']),
        expected_count=len(cluster_ids) if cluster_ids else None
    )

    if not cluster_ids:
        cluster_ids = list(range(len(spike_groups)))

    clusters = []
    for index, spike_times in enumerate(spike_groups):
        if not spike_times:
            continue

        cluster_id = cluster_ids[index] if index < len(cluster_ids) else index
        primary_channel = (
            primary_channels[index]
            if index < len(primary_channels)
            else None
        )

        clusters.append({
            'id': str(int(cluster_id) if float(cluster_id).is_integer() else cluster_id),
            'primaryChannel': (
                int(primary_channel)
                if primary_channel is not None and float(primary_channel).is_integer()
                else primary_channel
            ),
            'spikeTimes': spike_times
        })

    if not clusters:
        raise ValueError('No clusters with spike times were found')

    return {
        'algorithmName': algorithm_name,
        'clusters': clusters
    }


def _load_json_cluster_file(file_storage):
    return json.load(io.TextIOWrapper(file_storage.stream, encoding='utf-8'))


def _is_mat_struct(value):
    return hasattr(value, '_fieldnames')


def _contains_mat_struct(value):
    if _is_mat_struct(value):
        return True

    if isinstance(value, np.ndarray) and value.dtype == object:
        return any(_contains_mat_struct(item) for item in value.reshape(-1))

    return False


def _mat_struct_to_python(value):
    if _is_mat_struct(value):
        return {
            field: _mat_struct_to_python(getattr(value, field))
            for field in value._fieldnames
        }

    if isinstance(value, np.ndarray) and value.dtype == object:
        converted = [_mat_struct_to_python(item) for item in value.reshape(-1)]
        return converted[0] if len(converted) == 1 else converted

    return value


def _load_mat_cluster_file(file_storage):
    try:
        from scipy.io import loadmat
    except ImportError as exc:
        raise ValueError('MAT file support requires scipy') from exc

    mat_data = loadmat(
        io.BytesIO(file_storage.read()),
        squeeze_me=True,
        struct_as_record=False
    )

    return {
        key: _mat_struct_to_python(value) if _contains_mat_struct(value) else value
        for key, value in mat_data.items()
        if not key.startswith('__')
    }


@clustering_bp.route('/api/cluster-comparison/parse-file', methods=['POST'])
@login_required
def parse_cluster_comparison_file():
    """Parse an uploaded JSON or MATLAB .mat cluster comparison file."""
    try:
        uploaded_file = request.files.get('file')
        if not uploaded_file:
            return validation_error('File is required')

        filename = uploaded_file.filename or ''
        extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

        if extension == 'json':
            payload = _load_json_cluster_file(uploaded_file)
        elif extension == 'mat':
            payload = _load_mat_cluster_file(uploaded_file)
        else:
            return validation_error('Only .json and .mat cluster files are supported')

        normalized = _normalize_cluster_payload(
            payload,
            fallback_name=filename.rsplit('.', 1)[0] or 'Uploaded clusters'
        )

        return success_response({
            'dataset': normalized
        })
    except ValueError as e:
        return validation_error(str(e))
    except NotImplementedError:
        return validation_error('MAT v7.3 files are not supported. Save the file as MATLAB v7.')
    except Exception as e:
        logger.error(f"Error parsing cluster comparison file: {e}", exc_info=True)
        return server_error('Failed to parse cluster comparison file', exception=e)


def _format_custom_pipeline_algorithm(pipeline):
    """Format a linked custom pipeline as an algorithm list entry."""
    return {
        'name': f"custom:{pipeline['id']}",
        'displayName': pipeline['name'],
        'description': (
            f"Linked custom pipeline from {pipeline['repositoryUrl']} "
            f"({pipeline['entrypoint']})"
        ),
        'available': False,
        'requiresRun': True,
        'kind': 'custom',
        'pipeline': pipeline,
        'executionStatus': pipeline.get('executionStatus', 'linked_not_executable')
    }


@clustering_bp.route('/api/spike-sorting/algorithms', methods=['GET'])
def list_spike_sorting_algorithms():
    """List all available spike sorting algorithms."""
    clustering_manager = current_app.config['clustering_manager']
    custom_pipeline_manager = current_app.config.get('custom_pipeline_manager')
    current_user = get_current_user()
    
    algorithms = [
        {
            'name': 'preprocessed_torchbci',
            'displayName': 'TorchBCI Algorithm (Preprocessed)',
            'description': 'Pre-computed cluster data from TorchBCI Algorithm',
            'available': clustering_manager.has_preprocessed_torchbci(),
            'requiresRun': False
        },
        {
            'name': 'preprocessed_kilosort4',
            'displayName': 'Kilosort4 (Preprocessed)',
            'description': 'Pre-computed cluster data from Kilosort4',
            'available': clustering_manager.has_preprocessed_kilosort4(),
            'requiresRun': False
        },
        {
            'name': 'torchbci_jims',
            'displayName': 'TorchBCI Algorithm',
            'description': "Jim's spike sorting algorithm with clustering",
            'available': clustering_manager.check_algorithm_available('torchbci_jims'),
            'requiresRun': True
        },
        {
            'name': 'kilosort4',
            'displayName': 'Kilosort4',
            'description': 'State-of-the-art spike sorting with Kilosort4',
            'available': clustering_manager.check_algorithm_available('kilosort4'),
            'requiresRun': True
        }
    ]

    if current_user and current_user.can_link_custom_pipelines() and custom_pipeline_manager:
        algorithms.extend(
            _format_custom_pipeline_algorithm(pipeline)
            for pipeline in custom_pipeline_manager.list_pipelines(
                owner_user_id=current_user.id,
                include_all=current_user.is_admin()
            )
        )
    
    return jsonify({'algorithms': algorithms})


@clustering_bp.route('/api/spike-sorting/custom-pipelines', methods=['GET'])
@login_required
def list_custom_pipelines():
    """List linked custom spike sorting pipeline repositories."""
    current_user = get_current_user()
    custom_pipeline_manager = current_app.config['custom_pipeline_manager']
    return jsonify({
        'pipelines': custom_pipeline_manager.list_pipelines(
            owner_user_id=current_user.id,
            include_all=current_user.is_admin()
        )
    }), 200


@clustering_bp.route('/api/spike-sorting/custom-pipelines', methods=['POST'])
@login_required
def add_custom_pipeline():
    """Register a linked custom spike sorting pipeline repository."""
    try:
        request_data = request.get_json() or {}
        current_user = get_current_user()
        if not current_user.can_link_custom_pipelines():
            return error_response(
                'Pro or admin access is required to link custom pipelines',
                status=403,
                error_code='PRO_REQUIRED'
            )

        custom_pipeline_manager = current_app.config['custom_pipeline_manager']
        pipeline = custom_pipeline_manager.add_pipeline(
            request_data,
            owner={
                'id': current_user.id,
                'username': current_user.username,
                'email': current_user.email
            }
        )
        return jsonify({'success': True, 'pipeline': pipeline}), 201
    except ValueError as e:
        return validation_error(str(e))
    except Exception as e:
        logger.error(f"Error registering custom pipeline: {e}", exc_info=True)
        return server_error("Failed to register custom pipeline", exception=e)


@clustering_bp.route('/api/spike-sorting/custom-pipelines/<pipeline_id>', methods=['DELETE'])
@login_required
def delete_custom_pipeline(pipeline_id):
    """Delete a linked custom spike sorting pipeline repository."""
    try:
        current_user = get_current_user()
        if not current_user.can_link_custom_pipelines():
            return error_response(
                'Pro or admin access is required to manage custom pipelines',
                status=403,
                error_code='PRO_REQUIRED'
            )

        custom_pipeline_manager = current_app.config['custom_pipeline_manager']
        if not custom_pipeline_manager.delete_pipeline(
            pipeline_id,
            owner_user_id=current_user.id,
            include_all=current_user.is_admin()
        ):
            return not_found_error('Custom pipeline', pipeline_id)

        return jsonify({'success': True}), 200
    except Exception as e:
        logger.error(f"Error deleting custom pipeline: {e}", exc_info=True)
        return server_error("Failed to delete custom pipeline", exception=e)


@clustering_bp.route('/api/spike-sorting/run', methods=['POST'])
@login_required
@algorithm_access_required
def run_spike_sorting():
    """Run spike sorting algorithm."""
    try:
        request_data = request.get_json() or {}
        algorithm = request_data.get('algorithm', 'torchbci_jims')
        params = request_data.get('parameters', {})

        if str(algorithm).startswith('custom:'):
            return validation_error(
                'Linked custom pipelines are registered for discovery only. '
                'Execution will be enabled by the custom pipeline runner.'
            )
        
        clustering_manager = current_app.config['clustering_manager']

        if algorithm == 'kilosort4':
            response = clustering_manager.run_kilosort4(params)
        else:
            response = clustering_manager.run_jims_algorithm(params)

        return jsonify(response), 200
    except RuntimeError as e:
        logger.error(f"Runtime error running spike sorting: {e}")
        return server_error(str(e))
    except Exception as e:
        logger.error(f"Error running spike sorting: {e}", exc_info=True)
        return server_error("Failed to run spike sorting", exception=e)


def _run_spike_sorting_algorithm(clustering_manager, algorithm, params):
    """Dispatch a spike sorting run to the selected algorithm."""
    if str(algorithm).startswith('custom:'):
        raise RuntimeError(
            'Linked custom pipelines are registered, but no custom pipeline runner is enabled yet'
        )

    if algorithm == 'kilosort4':
        return clustering_manager.run_kilosort4(params)

    if algorithm in ('torchbci_jims', 'jims'):
        return clustering_manager.run_jims_algorithm(params)

    raise RuntimeError(f'Algorithm "{algorithm}" cannot be run as a pipeline')


@clustering_bp.route('/api/spike-sorting/pipeline/run', methods=['POST'])
@login_required
@algorithm_access_required
def start_spike_sorting_pipeline():
    """Start spike sorting as a background pipeline job."""
    try:
        request_data = request.get_json() or {}
        algorithm = request_data.get('algorithm', 'torchbci_jims')
        params = request_data.get('parameters', {})

        if str(algorithm).startswith('custom:'):
            return validation_error(
                'Linked custom pipelines are registered for discovery only. '
                'Execution will be enabled by the custom pipeline runner.'
            )

        if algorithm in ('preprocessed_torchbci', 'preprocessed_kilosort4'):
            return validation_error('Preprocessed algorithms do not need a pipeline run')

        clustering_manager = current_app.config['clustering_manager']
        pipeline_job_manager = current_app.config['pipeline_job_manager']

        job = pipeline_job_manager.start_job(
            algorithm=algorithm,
            parameters=params,
            runner=lambda: _run_spike_sorting_algorithm(clustering_manager, algorithm, params),
            cancel_callback=clustering_manager.clear_results,
        )

        return jsonify({'success': True, 'job': job}), 202
    except RuntimeError as e:
        logger.error(f"Runtime error starting spike sorting pipeline: {e}")
        return error_response(str(e), status=409, error_code='PIPELINE_ALREADY_RUNNING')
    except Exception as e:
        logger.error(f"Error starting spike sorting pipeline: {e}", exc_info=True)
        return server_error("Failed to start spike sorting pipeline", exception=e)


@clustering_bp.route('/api/spike-sorting/pipeline/status', methods=['GET'])
@login_required
def get_spike_sorting_pipeline_status():
    """Get current spike sorting pipeline job status."""
    pipeline_job_manager = current_app.config['pipeline_job_manager']
    return jsonify({'success': True, 'job': pipeline_job_manager.get_status()}), 200


@clustering_bp.route('/api/spike-sorting/pipeline/stop', methods=['POST'])
@login_required
def stop_spike_sorting_pipeline():
    """Request stop for the active spike sorting pipeline job."""
    pipeline_job_manager = current_app.config['pipeline_job_manager']
    job = pipeline_job_manager.request_stop()
    return jsonify({'success': True, 'job': job}), 200


@clustering_bp.route('/api/clustering-results', methods=['GET'])
def get_clustering_results():
    """Get stored clustering results."""
    clustering_manager = current_app.config['clustering_manager']
    
    if clustering_manager.clustering_results is None:
        return jsonify({
            'available': False,
            'message': 'No clustering results available. Run the spike sorting algorithm first.'
        }), 200
    
    try:
        cluster_summaries = []
        for cluster_idx, cluster_data in enumerate(clustering_manager.clustering_results):
            cluster_summaries.append({
                'clusterId': cluster_idx,
                'numSpikes': len(cluster_data),
                'channels': list(set([spike['channel'] for spike in cluster_data])) if cluster_data else [],
                'timeRange': [
                    min([spike['time'] for spike in cluster_data]) if cluster_data else 0,
                    max([spike['time'] for spike in cluster_data]) if cluster_data else 0
                ] if cluster_data else [0, 0]
            })
        
        return jsonify({
            'available': True,
            'numClusters': len(clustering_manager.clustering_results),
            'totalSpikes': sum(len(cluster) for cluster in clustering_manager.clustering_results),
            'clusters': cluster_summaries,
            'fullData': clustering_manager.clustering_results
        }), 200
    except Exception as e:
        logger.error(f"Error fetching clustering results: {e}", exc_info=True)
        return server_error("Failed to fetch clustering results", exception=e)
