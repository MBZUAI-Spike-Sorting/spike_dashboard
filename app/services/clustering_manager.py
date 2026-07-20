"""
Clustering management service.

Handles spike sorting algorithms and clustering operations.
"""

import colorsys
import os
import shutil
import tempfile
from typing import Any, Dict, List, Optional

import numpy as np

from app.config import Config
from app.services.dataset_manager import DatasetManager
from app.logger import get_logger

try:
    import torch
except ImportError:
    torch = None

logger = get_logger(__name__)

# Try to import spike sorting algorithms
try:
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'torchbci'))
    from torchbci.algorithms import JimsAlgorithm
    JIMS_AVAILABLE = True
    logger.info("Successfully imported JimsAlgorithm")
except ImportError as e:
    JIMS_AVAILABLE = False
    logger.warning(f"JimsAlgorithm not available: {e}")

try:
    from torchbci.algorithms.kilosort_paper_attempt import KS4Pipeline
    from torchbci.kilosort4.io import load_probe
    KILOSORT4_AVAILABLE = True
    logger.info("Successfully imported Kilosort4")
except ImportError as e:
    KILOSORT4_AVAILABLE = False
    logger.warning(f"Kilosort4 not available: {e}")


class ClusteringManager:
    """Manages clustering and spike sorting operations.
    
    Supports two execution modes:
      - local: algorithms run in-process (gpu_backend is None)
      - cloud_run: algorithms are offloaded via gpu_backend
    """
    
    def __init__(self, config: Config, dataset_manager: DatasetManager, gpu_backend=None):
        self.config = config
        self.dataset_manager = dataset_manager
        self.clustering_results: Optional[List[List[Dict]]] = None
        self.clustering_results_source: Optional[str] = None
        self.gpu_backend = gpu_backend  # None → local execution
    
    @staticmethod
    def is_jims_available() -> bool:
        """Check if JimsAlgorithm is available locally."""
        return JIMS_AVAILABLE
    
    @staticmethod
    def is_kilosort4_available() -> bool:
        """Check if Kilosort4 is available locally."""
        return KILOSORT4_AVAILABLE
    
    def check_algorithm_available(self, algorithm: str) -> bool:
        """Check availability accounting for GPU backend mode.
        
        In cloud_run mode, algorithms are always available (the worker has them).
        In local mode, checks the local imports.
        """
        if self.gpu_backend is not None:
            return True
        if algorithm in ('jims', 'torchbci_jims'):
            return JIMS_AVAILABLE
        if algorithm == 'kilosort4':
            return KILOSORT4_AVAILABLE
        return False
    
    def run_jims_algorithm(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run JimsAlgorithm spike sorting."""
        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')
        
        logger.info("Running JimsAlgorithm")
        logger.info(f"Data Shape: {self.dataset_manager.data_array.shape}")

        # ----- Remote execution (Cloud Run GPU) -----
        if self.gpu_backend is not None:
            result = self.gpu_backend.run_algorithm(
                algorithm='jims',
                data=np.asarray(self.dataset_manager.data_array),
                params=params,
            )
            self.clustering_results = result['clustering_results']
            data_shape = result.get('data_shape', list(self.dataset_manager.data_array.shape))
        else:
            # ----- Local execution -----
            if not JIMS_AVAILABLE:
                raise RuntimeError('TorchBCI not available')
            
            data_tensor = self._prepare_tensor()
            jims_sort_pipe = self._create_jims_pipeline(params)
            
            logger.info("Running jims_sort_pipe.forward(data_tensor)...")
            clusters, centroids, clusters_meta = jims_sort_pipe.forward(data_tensor)
            
            n_clustered_spikes = sum([len(meta) for meta in clusters_meta])
            logger.info(f"JimsAlgorithm Results: {len(clusters)} clusters, {n_clustered_spikes} spikes")
            
            self._store_clustering_results(clusters, centroids, clusters_meta)
            data_shape = list(data_tensor.shape)

        # Common: save results and build response
        self.clustering_results_source = 'torchbci_jims'
        self._save_torchbci_results_to_file()

        n_spikes = sum(len(c) for c in self.clustering_results)
        response = {
            'success': True,
            'dataShape': data_shape,
            'numClusters': len(self.clustering_results),
            'numSpikes': n_spikes,
            'clusters': []
        }
        
        for i, cluster_data in enumerate(self.clustering_results):
            cluster_info = {
                'clusterId': i,
                'numSpikes': len(cluster_data),
                'spikeTimes': [s['time'] for s in cluster_data],
                'spikeChannels': [s['channel'] for s in cluster_data]
            }
            response['clusters'].append(cluster_info)
        
        return response
    
    def _prepare_tensor(self) -> torch.Tensor:
        """Prepare data tensor for JimsAlgorithm."""
        if self.dataset_manager.data_array.dtype == np.float32:
            logger.info("Data is already float32, creating torch tensor (zero-copy)...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array))
        else:
            logger.info(f"Converting {self.dataset_manager.data_array.dtype} to float32...")
            return torch.from_numpy(np.asarray(self.dataset_manager.data_array)).float()
    
    def _create_jims_pipeline(self, params: Dict[str, Any]):
        """Create JimsAlgorithm pipeline with parameters."""
        return JimsAlgorithm(
            window_size=int(params.get('window_size', 3)),
            threshold=int(params.get('threshold', 36)),
            frame_size=int(params.get('frame_size', 13)),
            normalize=params.get('normalize', 'zscore'),
            sort_by=params.get('sort_by', 'value'),
            leniency_channel=int(params.get('leniency_channel', 7)),
            leniency_time=int(params.get('leniency_time', 32)),
            similarity_mode=params.get('similarity_mode', 'cosine'),
            outlier_threshold=float(params.get('outlier_threshold', 0.8)),
            n_clusters=int(params.get('n_clusters', 8)),
            cluster_feature_size=int(params.get('cluster_feature_size', 7)),
            n_jims_features=int(params.get('n_jims_features', 7)),
            jims_pad_value=int(params.get('pad_value', 0))
        )
    
    def run_kilosort4(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run Kilosort4 spike sorting."""
        if self.dataset_manager.data_array is None:
            raise RuntimeError('No dataset loaded')

        logger.info("Running Kilosort4")
        logger.info(f"Data Shape: {self.dataset_manager.data_array.shape}")

        # ----- Remote execution (Cloud Run GPU) -----
        if self.gpu_backend is not None:
            dataset_info = {
                'probe_path': self.config.DEFAULT_PROBE_PATH,
                'sampling_rate': self.config.SAMPLING_RATE,
            }
            result = self.gpu_backend.run_algorithm(
                algorithm='kilosort4',
                data=np.asarray(self.dataset_manager.data_array),
                params=params,
                dataset_info=dataset_info,
            )
            self.clustering_results = result['clustering_results']
            data_shape = result.get('data_shape', list(self.dataset_manager.data_array.shape))
        else:
            # ----- Local execution -----
            if not KILOSORT4_AVAILABLE:
                raise RuntimeError('Kilosort4 not available')

            # Get parameters
            probe_path = params.get('probe_path', self.config.DEFAULT_PROBE_PATH)
            sampling_rate = params.get('sampling_rate', self.config.SAMPLING_RATE)

            # Prepare data - Kilosort4 expects (n_samples, n_channels)
            data = np.asarray(self.dataset_manager.data_array)
            if data.shape[0] < data.shape[1]:
                data = data.T

            logger.info(f"Transposed data shape for Kilosort4: {data.shape}")

            # Save to temporary binary file
            temp_bin = tempfile.NamedTemporaryFile(delete=False, suffix='.bin')
            data_c = np.ascontiguousarray(data)
            data_c.tofile(temp_bin.name)
            temp_bin.close()

            logger.debug(f"Saved temporary binary file: {temp_bin.name}")

            settings = {
                "n_chan_bin": data.shape[1],
                "fs": sampling_rate,
                "filename": temp_bin.name,
                "batch_size": 60000,
                "nblocks": 1
            }

            probe = load_probe(probe_path)
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Using device: {device}")

            original_cwd = os.getcwd()
            temp_results_dir = tempfile.mkdtemp(prefix='kilosort4_')

            try:
                os.chdir(temp_results_dir)
                logger.debug(f"Running in temporary directory: {temp_results_dir}")

                pipeline = KS4Pipeline(
                    settings=settings,
                    probe=probe,
                    results_dir=temp_results_dir,
                    device=device
                )

                logger.info("Running Kilosort4 pipeline...")
                with torch.no_grad():
                    out = pipeline()
            finally:
                os.chdir(original_cwd)
                try:
                    shutil.rmtree(temp_results_dir)
                except Exception:
                    pass

            spike_times_samples = out["st"][:, 0]
            spike_clusters = out["clu"]

            logger.info(f"Kilosort4 Results: {np.unique(spike_clusters).size} clusters, {out['st'].shape[0]} spikes")

            self._store_kilosort4_results(spike_times_samples, spike_clusters, out)
            data_shape = list(data.shape)

            try:
                os.unlink(temp_bin.name)
            except Exception:
                pass

        # Common: save results and build response
        self.clustering_results_source = 'kilosort4'
        self._save_kilosort4_results_to_file()

        n_spikes = sum(len(c) for c in self.clustering_results)
        cluster_summaries = []
        for cluster_idx, cluster_data in enumerate(self.clustering_results):
            cluster_summaries.append({
                'clusterId': cluster_idx,
                'numSpikes': len(cluster_data),
                'channels': list(set([spike['channel'] for spike in cluster_data])) if cluster_data else [],
                'timeRange': [
                    min([spike['time'] for spike in cluster_data]) if cluster_data else 0,
                    max([spike['time'] for spike in cluster_data]) if cluster_data else 0
                ] if cluster_data else [0, 0]
            })

        response = {
            'success': True,
            'dataShape': data_shape,
            'numClusters': len(self.clustering_results),
            'numSpikes': n_spikes,
            'clusters': cluster_summaries,
            'available': True,
            'totalSpikes': n_spikes,
            'fullData': self.clustering_results
        }

        return response

    def _store_kilosort4_results(self, spike_times, spike_clusters, kilosort_output):
        """Store Kilosort4 results with PCA transformation."""
        from sklearn.decomposition import PCA

        unique_clusters = np.unique(spike_clusters)
        self.clustering_results = []

        logger.info(f"Processing {len(spike_times)} spikes across {len(unique_clusters)} clusters...")

        all_spike_waveforms = []
        all_spike_channels = []
        cluster_sizes = []

        for cluster_id in unique_clusters:
            cluster_mask = spike_clusters == cluster_id
            cluster_times = spike_times[cluster_mask]

            waveforms = []
            peak_channels = []
            
            for spike_time in cluster_times:
                spike_sample = int(spike_time)
                window_size = 15
                if window_size < spike_sample < self.dataset_manager.data_array.shape[1] - window_size:
                    window = self.dataset_manager.data_array[:, spike_sample-window_size:spike_sample+window_size]
                    window_baseline_corrected = window - np.mean(window, axis=1, keepdims=True)
                    channel_amplitudes = np.max(np.abs(window_baseline_corrected), axis=1)
                    peak_channel = int(np.argmax(channel_amplitudes)) + 1
                    
                    waveforms.append(window.flatten())
                    peak_channels.append(peak_channel)

            if len(waveforms) > 0:
                all_spike_waveforms.extend(waveforms)
                all_spike_channels.extend(peak_channels)
                cluster_sizes.append(len(waveforms))

        if len(all_spike_waveforms) > 0:
            all_waveforms_array = np.array(all_spike_waveforms)
            pca = PCA(n_components=2)
            
            if len(all_spike_waveforms) > 5000:
                logger.info(f"Optimizing PCA: Fitting on 5000 sample spikes")
                sample_indices = np.random.choice(len(all_spike_waveforms), 5000, replace=False)
                sample_waveforms = all_waveforms_array[sample_indices]
                pca.fit(sample_waveforms)
                pca_coords = pca.transform(all_waveforms_array)
            else:
                pca_coords = pca.fit_transform(all_waveforms_array)

            start_idx = 0
            channel_idx = 0
            for cluster_id, size in zip(unique_clusters, cluster_sizes):
                cluster_mask = spike_clusters == cluster_id
                cluster_times = spike_times[cluster_mask]
                cluster_pca = pca_coords[start_idx:start_idx + size]
                cluster_channels = all_spike_channels[channel_idx:channel_idx + size]

                cluster_data = []
                for i, (pca_point, spike_time, peak_channel) in enumerate(zip(cluster_pca, cluster_times[:size], cluster_channels)):
                    spike_data = {
                        'x': float(pca_point[0]),
                        'y': float(pca_point[1]),
                        'channel': peak_channel,
                        'time': int(spike_time),
                        'spikeIndex': i
                    }
                    cluster_data.append(spike_data)

                self.clustering_results.append(cluster_data)
                start_idx += size
                channel_idx += size

        logger.info(f"Stored Kilosort4 results: {len(self.clustering_results)} clusters")

    def _store_clustering_results(self, clusters, centroids, clusters_meta):
        """Store clustering results with PCA transformation."""
        from sklearn.decomposition import PCA
        
        centroids_picked = []
        clusters_meta_picked = []
        clusters_picked = []
        
        for cluster, centroid, meta in zip(clusters, centroids, clusters_meta):
            meta = sorted(meta, key=lambda x: x[1])
            centroids_picked.append(centroid)
            clusters_meta_picked.append(meta)
            clusters_picked.append(cluster)
        
        pca = PCA(n_components=2)
        all_clustered_spikes = []
        
        for cluster in clusters_picked:
            all_clustered_spikes.append(torch.stack(cluster).numpy())
        
        all_clustered_spikes = np.concatenate(all_clustered_spikes, axis=0)
        all_clustered_spikes_pca = pca.fit_transform(all_clustered_spikes)
        
        all_clustered_spikes_pca_per_cluster = []
        start_idx = 0
        for meta in clusters_meta_picked:
            cluster_size = len(meta)
            cluster_pca = all_clustered_spikes_pca[start_idx:start_idx + cluster_size]
            all_clustered_spikes_pca_per_cluster.append(cluster_pca)
            start_idx += cluster_size
        
        self.clustering_results = []
        for cluster_idx, (pca_coords, meta_list) in enumerate(zip(all_clustered_spikes_pca_per_cluster, clusters_meta_picked)):
            cluster_data = []
            for spike_idx, (pca_point, meta) in enumerate(zip(pca_coords, meta_list)):
                spike_data = {
                    'x': float(pca_point[0]),
                    'y': float(pca_point[1]),
                    'channel': int(meta[0]),
                    'time': int(meta[1]),
                    'spikeIndex': spike_idx
                }
                cluster_data.append(spike_data)
            self.clustering_results.append(cluster_data)
        
        logger.info(f"Stored clustering results: {len(self.clustering_results)} clusters")
    
    def get_cluster_data(self, mode: str, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Get cluster data for visualization."""
        if self.clustering_results is not None:
            logger.info(f"Using stored clustering results ({len(self.clustering_results)} clusters)")
            return self._get_stored_clustering_data(channel_mapping)
        
        return self._get_synthetic_cluster_data(channel_mapping)
    
    def _get_stored_clustering_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Format stored clustering results for visualization."""
        clusters = []
        total_points = 0
        
        for cluster_idx, cluster_spikes in enumerate(self.clustering_results):
            if not cluster_spikes:
                continue
            
            points = [[spike['x'], spike['y']] for spike in cluster_spikes]
            spike_times = [spike['time'] for spike in cluster_spikes]
            
            channels = [spike['channel'] for spike in cluster_spikes]
            peak_channel = max(set(channels), key=channels.count) if channels else 181
            
            channel_id = channel_mapping.get(str(cluster_idx), peak_channel)
            color = self._generate_cluster_color(cluster_idx, len(self.clustering_results))
            
            clusters.append({
                'clusterId': cluster_idx,
                'points': points,
                'spikeTimes': spike_times,
                'color': color,
                'channelId': channel_id,
                'pointCount': len(points)
            })
            
            total_points += len(points)
        
        return {
            'mode': 'algorithm_results',
            'clusters': clusters,
            'numClusters': len(clusters),
            'totalPoints': total_points,
            'clusterIds': list(range(len(clusters)))
        }
    
    def _get_synthetic_cluster_data(self, channel_mapping: Dict[str, int]) -> Dict[str, Any]:
        """Generate synthetic cluster data."""
        channel_ids = [179, 181, 183]
        np.random.seed(42)
        clusters = []
        colors = ['#FF6B6B', '#4ECDC4', '#FFD700']
        centers = [[2.0, 5.0], [8.0, 2.5], [4.0, 2.0]]
        spreads = [0.8, 0.9, 0.7]
        
        for cluster_idx in range(3):
            cluster_x = np.random.normal(centers[cluster_idx][0], spreads[cluster_idx], 100)
            cluster_y = np.random.normal(centers[cluster_idx][1], spreads[cluster_idx], 100)
            
            clusters.append({
                'clusterId': cluster_idx,
                'points': [[float(x), float(y)] for x, y in zip(cluster_x, cluster_y)],
                'spikeTimes': [],
                'center': centers[cluster_idx],
                'color': colors[cluster_idx],
                'channelId': channel_ids[cluster_idx] if cluster_idx < len(channel_ids) else None,
                'pointCount': 100
            })
        
        return {
            'mode': 'synthetic',
            'clusters': clusters,
            'numClusters': 3,
            'pointsPerCluster': 100,
            'channelIds': channel_ids,
            'totalPoints': 300
        }
    
    @staticmethod
    def _generate_cluster_color(cluster_idx: int, total_clusters: int) -> str:
        """Generate a color for a cluster using HSV color space."""
        golden_ratio = 0.618033988749895
        hue = (cluster_idx * golden_ratio) % 1.0
        saturation = 0.7 + (cluster_idx % 3) * 0.1
        value = 0.85 + (cluster_idx % 2) * 0.1

        r, g, b = colorsys.hsv_to_rgb(hue, saturation, value)
        return f'#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}'
    
    def get_clustering_results(self) -> Optional[List[List[Dict]]]:
        """Get stored clustering results."""
        return self.clustering_results
    
    def clear_results(self) -> None:
        """Clear stored clustering results."""
        self.clustering_results = None
        self.clustering_results_source = None

    # ---- Preprocessed TorchBCI persistence ----

    def _get_torchbci_results_path(self) -> str:
        """Get the file path for saved TorchBCI results."""
        return os.path.join(self.config.LABELS_FOLDER, 'torchbci_results.npy')

    def has_preprocessed_torchbci(self) -> bool:
        """Check if preprocessed TorchBCI results file exists."""
        return os.path.exists(self._get_torchbci_results_path())

    def _save_torchbci_results_to_file(self) -> None:
        """Save current clustering_results to a numpy file for later reloading."""
        if self.clustering_results is None:
            return

        results_path = self._get_torchbci_results_path()
        os.makedirs(os.path.dirname(results_path), exist_ok=True)

        # Build a flat array: [x, y, cluster_id, time_samples, channel]
        rows = []
        for cluster_idx, cluster_spikes in enumerate(self.clustering_results):
            for spike in cluster_spikes:
                rows.append([
                    spike['x'],
                    spike['y'],
                    cluster_idx,
                    spike['time'],
                    spike['channel']
                ])

        if rows:
            arr = np.array(rows, dtype=np.float64)
            np.save(results_path, arr)
            logger.info(f"Saved TorchBCI results ({len(rows)} spikes) to {results_path}")
        else:
            logger.warning("No spikes to save for TorchBCI results")

    def load_preprocessed_torchbci(self) -> None:
        """Load preprocessed TorchBCI results from file into clustering_results."""
        results_path = self._get_torchbci_results_path()
        if not os.path.exists(results_path):
            raise FileNotFoundError(f'Preprocessed TorchBCI results not found at {results_path}')

        logger.info(f"Loading preprocessed TorchBCI results from: {results_path}")
        arr = np.load(results_path)
        # Columns: x, y, cluster_id, time_samples, channel

        xy = arr[:, :2]
        cluster_ids = arr[:, 2].astype(np.int64)
        times = arr[:, 3].astype(np.int64)
        channels = arr[:, 4].astype(np.int64)

        unique_clusters = np.unique(cluster_ids)
        self.clustering_results = []
        self.clustering_results_source = 'preprocessed_torchbci'

        for cluster_id in unique_clusters:
            mask = cluster_ids == cluster_id
            cluster_data = []
            for i, idx in enumerate(np.where(mask)[0]):
                cluster_data.append({
                    'x': float(xy[idx, 0]),
                    'y': float(xy[idx, 1]),
                    'channel': int(channels[idx]),
                    'time': int(times[idx]),
                    'spikeIndex': i
                })
            self.clustering_results.append(cluster_data)

        total_spikes = sum(len(c) for c in self.clustering_results)
        logger.info(f"Loaded preprocessed TorchBCI: {len(self.clustering_results)} clusters, {total_spikes} spikes")

    # ---- Preprocessed Kilosort4 persistence ----

    def _get_kilosort4_results_path(self) -> str:
        """Get the file path for saved Kilosort4 results."""
        return os.path.join(self.config.LABELS_FOLDER, 'kilosort4_results.npy')

    def has_preprocessed_kilosort4(self) -> bool:
        """Check if preprocessed Kilosort4 results file exists."""
        return os.path.exists(self._get_kilosort4_results_path())

    def _save_kilosort4_results_to_file(self) -> None:
        """Save current clustering_results to a numpy file for later reloading."""
        if self.clustering_results is None:
            return

        results_path = self._get_kilosort4_results_path()
        os.makedirs(os.path.dirname(results_path), exist_ok=True)

        rows = []
        for cluster_idx, cluster_spikes in enumerate(self.clustering_results):
            for spike in cluster_spikes:
                rows.append([
                    spike['x'],
                    spike['y'],
                    cluster_idx,
                    spike['time'],
                    spike['channel']
                ])

        if rows:
            arr = np.array(rows, dtype=np.float64)
            np.save(results_path, arr)
            logger.info(f"Saved Kilosort4 results ({len(rows)} spikes) to {results_path}")
        else:
            logger.warning("No spikes to save for Kilosort4 results")

    def load_preprocessed_kilosort4(self) -> None:
        """Load preprocessed Kilosort4 results from file into clustering_results."""
        results_path = self._get_kilosort4_results_path()
        if not os.path.exists(results_path):
            raise FileNotFoundError(f'Preprocessed Kilosort4 results not found at {results_path}')

        logger.info(f"Loading preprocessed Kilosort4 results from: {results_path}")
        arr = np.load(results_path)

        xy = arr[:, :2]
        cluster_ids = arr[:, 2].astype(np.int64)
        times = arr[:, 3].astype(np.int64)
        channels = arr[:, 4].astype(np.int64)

        unique_clusters = np.unique(cluster_ids)
        self.clustering_results = []
        self.clustering_results_source = 'preprocessed_kilosort4'

        for cluster_id in unique_clusters:
            mask = cluster_ids == cluster_id
            cluster_data = []
            for i, idx in enumerate(np.where(mask)[0]):
                cluster_data.append({
                    'x': float(xy[idx, 0]),
                    'y': float(xy[idx, 1]),
                    'channel': int(channels[idx]),
                    'time': int(times[idx]),
                    'spikeIndex': i
                })
            self.clustering_results.append(cluster_data)

        total_spikes = sum(len(c) for c in self.clustering_results)
        logger.info(f"Loaded preprocessed Kilosort4: {len(self.clustering_results)} clusters, {total_spikes} spikes")
