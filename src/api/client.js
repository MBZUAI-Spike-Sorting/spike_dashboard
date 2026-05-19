/**
 * Centralized API Client for Spike Dashboard
 * 
 * Provides a single point of entry for all API calls with:
 * - Consistent error handling
 * - Request/response logging
 * - Automatic retries
 * - Type-safe method signatures
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Get stored auth token
 */
function getStoredToken() {
  return localStorage.getItem('spike_dashboard_token');
}

/**
 * Core request method with error handling
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Get auth token
  const token = options.token || getStoredToken();
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  };
  
  // Remove token from options to not include it in the request
  const { token: _, ...restOptions } = options;
  const finalOptions = { ...defaultOptions, ...restOptions };
  
  try {
    const response = await fetch(url, finalOptions);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || `HTTP Error: ${response.status}`,
        response.status,
        errorData.details
      );
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`API Error: ${endpoint}`, error);
    throw new ApiError(
      error.message || 'Network error',
      0,
      { originalError: error.toString() }
    );
  }
}

/**
 * Spike Dashboard API Client
 */
const apiClient = {
  // =====================
  // Authentication
  // =====================
  
  /**
   * Login with username and password
   * @param {string} username - Username or email
   * @param {string} password - Password
   */
  async login(username, password) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  
  /**
   * Register new user
   * @param {string} username - Username
   * @param {string} email - Email address
   * @param {string} password - Password
   */
  async register(username, email, password) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  },
  
  /**
   * Get current user info
   * @param {string} token - Auth token
   */
  async getCurrentUser(token) {
    return request('/api/auth/me', { token });
  },
  
  /**
   * Logout current user
   * @param {string} token - Auth token
   */
  async logout(token) {
    return request('/api/auth/logout', {
      method: 'POST',
      token,
    });
  },
  
  /**
   * Change password
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   */
  async changePassword(currentPassword, newPassword) {
    return request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },
  
  /**
   * List all users (admin only)
   */
  async listUsers() {
    return request('/api/auth/users');
  },
  
  /**
   * Update user role (admin only)
   * @param {number} userId - User ID
   * @param {string} role - New role ('user' or 'admin')
   */
  async updateUserRole(userId, role) {
    return request(`/api/auth/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  },
  
  /**
   * Delete user (admin only)
   * @param {number} userId - User ID
   */
  async deleteUser(userId) {
    return request(`/api/auth/users/${userId}`, {
      method: 'DELETE',
    });
  },
  
  // =====================
  // Health & Info
  // =====================
  
  /**
   * Check API health status
   */
  async healthCheck() {
    return request('/health');
  },
  
  /**
   * Get current dataset information
   */
  async getDatasetInfo() {
    return request('/api/dataset-info');
  },
  
  // =====================
  // Dataset Management
  // =====================
  
  /**
   * List all available datasets
   */
  async getDatasets() {
    return request('/api/datasets');
  },
  
  /**
   * Set the current active dataset
   * @param {string} datasetName - Name of the dataset to load
   */
  async setDataset(datasetName) {
    return request('/api/dataset/set', {
      method: 'POST',
      body: JSON.stringify({ dataset: datasetName }),
    });
  },
  
  /**
   * Delete a dataset
   * @param {string} datasetName - Name of the dataset to delete
   */
  async deleteDataset(datasetName) {
    return request('/api/dataset/delete', {
      method: 'DELETE',
      body: JSON.stringify({ dataset: datasetName }),
    });
  },
  
  /**
   * Upload a new dataset (uses FormData for file upload)
   * @param {File} file - The dataset file
   * @param {File} spikeTimesFile - Optional spike times file
   * @param {Function} onProgress - Optional progress callback
   */
  async uploadDataset(file, spikeTimesFile = null, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (spikeTimesFile) {
      formData.append('spike_times_file', spikeTimesFile);
    }
    
    const url = `${API_BASE_URL}/api/dataset/upload`;
    
    // Note: We can't use the standard request function here due to FormData
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type - browser will set it with boundary
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(
        errorData.error || `Upload failed: ${response.status}`,
        response.status
      );
    }
    
    return response.json();
  },
  
  // =====================
  // Label Mappings
  // =====================
  
  /**
   * Get all dataset-to-label mappings
   */
  async getLabelMappings() {
    return request('/api/label-mappings');
  },
  
  /**
   * Add or update a label mapping
   * @param {string} datasetName - Dataset name
   * @param {string} labelName - Label file name
   */
  async addLabelMapping(datasetName, labelName) {
    return request('/api/label-mappings', {
      method: 'POST',
      body: JSON.stringify({ dataset: datasetName, label: labelName }),
    });
  },
  
  /**
   * Delete a label mapping
   * @param {string} datasetName - Dataset name to remove mapping for
   */
  async deleteLabelMapping(datasetName) {
    return request(`/api/label-mappings/${encodeURIComponent(datasetName)}`, {
      method: 'DELETE',
    });
  },
  
  // =====================
  // Spike Data
  // =====================
  
  /**
   * Fetch spike data for specified channels
   * @param {Object} params - Request parameters
   */
  async getSpikeData({
    channels,
    startTime,
    endTime,
    spikeThreshold = null,
    invertData = false,
    usePrecomputed = false,
    dataType = 'raw',
    filterType = 'highpass',
  }) {
    return request('/api/spike-data', {
      method: 'POST',
      body: JSON.stringify({
        channels,
        startTime,
        endTime,
        spikeThreshold,
        invertData,
        usePrecomputed,
        dataType,
        filterType,
      }),
    });
  },
  
  /**
   * Check if precomputed spike times are available
   */
  async checkSpikeTimesAvailable() {
    return request('/api/spike-times-available');
  },
  
  /**
   * Navigate to next/previous spike
   * @param {number} currentTime - Current time position
   * @param {string} direction - 'next' or 'prev'
   * @param {number[]} channels - Channels to search
   */
  async navigateSpike(currentTime, direction, channels) {
    return request('/api/navigate-spike', {
      method: 'POST',
      body: JSON.stringify({ currentTime, direction, channels }),
    });
  },
  
  /**
   * Get spike waveform preview
   * @param {Object} params - Request parameters
   */
  async getSpikePreview({ spikeTime, channelId, window = 10, filterType = 'highpass', pointIndex = 0 }) {
    return request('/api/spike-preview', {
      method: 'POST',
      body: JSON.stringify({ spikeTime, channelId, window, filterType, pointIndex }),
    });
  },
  
  // =====================
  // Clustering
  // =====================
  
  /**
   * Get cluster data for visualization
   * @param {string} mode - 'synthetic', 'real', or 'algorithm_results'
   * @param {Object} channelMapping - Channel mapping for clusters
   */
  async getClusterData(mode = 'synthetic', channelMapping = {}) {
    return request('/api/cluster-data', {
      method: 'POST',
      body: JSON.stringify({ mode, channelMapping }),
    });
  },
  
  /**
   * Get cluster statistics
   * @param {number[]} clusterIds - IDs of clusters to get stats for
   * @param {string} algorithm - Algorithm used for clustering
   */
  async getClusterStatistics(clusterIds, algorithm = '') {
    return request('/api/cluster-statistics', {
      method: 'POST',
      body: JSON.stringify({ clusterIds, algorithm }),
    });
  },
  
  /**
   * Get cluster waveforms
   * @param {Object} params - Request parameters
   */
  async getClusterWaveforms({ clusterIds, maxWaveforms = 100, windowSize = 30, algorithm = '' }) {
    return request('/api/cluster-waveforms', {
      method: 'POST',
      body: JSON.stringify({ clusterIds, maxWaveforms, windowSize, algorithm }),
    });
  },
  
  /**
   * Get multi-channel waveforms for a cluster
   * @param {Object} params - Request parameters
   */
  async getClusterMultiChannelWaveforms({ clusterId, maxWaveforms = 50, windowSize = 30, algorithm = '' }) {
    return request('/api/cluster-multi-channel-waveforms', {
      method: 'POST',
      body: JSON.stringify({ clusterId, maxWaveforms, windowSize, algorithm }),
    });
  },
  
  // =====================
  // Spike Sorting
  // =====================
  
  /**
   * List available spike sorting algorithms
   */
  async getAlgorithms() {
    return request('/api/spike-sorting/algorithms');
  },

  /**
   * List linked custom spike sorting pipelines.
   */
  async getCustomPipelines() {
    return request('/api/spike-sorting/custom-pipelines');
  },

  /**
   * Register a linked custom spike sorting pipeline.
   * @param {Object} pipeline - Pipeline repository metadata
   */
  async addCustomPipeline(pipeline) {
    return request('/api/spike-sorting/custom-pipelines', {
      method: 'POST',
      body: JSON.stringify(pipeline),
    });
  },

  /**
   * Delete a linked custom spike sorting pipeline.
   * @param {string} pipelineId - Pipeline id
   */
  async deleteCustomPipeline(pipelineId) {
    return request(`/api/spike-sorting/custom-pipelines/${encodeURIComponent(pipelineId)}`, {
      method: 'DELETE',
    });
  },
  
  /**
   * Run spike sorting algorithm
   * @param {string} algorithm - Algorithm name
   * @param {Object} parameters - Algorithm parameters
   */
  async runSpikeSorting(algorithm, parameters = {}) {
    return request('/api/spike-sorting/run', {
      method: 'POST',
      body: JSON.stringify({ algorithm, parameters }),
    });
  },

  /**
   * Start a spike sorting pipeline job.
   * @param {string} algorithm - Algorithm name
   * @param {Object} parameters - Algorithm parameters
   */
  async startSpikeSortingPipeline(algorithm, parameters = {}) {
    return request('/api/spike-sorting/pipeline/run', {
      method: 'POST',
      body: JSON.stringify({ algorithm, parameters }),
    });
  },

  /**
   * Get current spike sorting pipeline job status.
   */
  async getSpikeSortingPipelineStatus() {
    return request('/api/spike-sorting/pipeline/status');
  },

  /**
   * Request stop for the active spike sorting pipeline job.
   */
  async stopSpikeSortingPipeline() {
    return request('/api/spike-sorting/pipeline/stop', {
      method: 'POST',
    });
  },
  
  /**
   * Get stored clustering results
   */
  async getClusteringResults() {
    return request('/api/clustering-results');
  },
};

// Export for ES modules
export { apiClient as default, ApiError, API_BASE_URL };
