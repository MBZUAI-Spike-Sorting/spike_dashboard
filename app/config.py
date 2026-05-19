"""
Application configuration module.

Provides environment-based configuration for the Spike Dashboard API.
All settings can be overridden via environment variables.
"""

import os
from dataclasses import dataclass, field
from typing import Set


def get_bool_env(key: str, default: bool = False) -> bool:
    """Get boolean value from environment variable."""
    value = os.getenv(key, str(default)).lower()
    return value in ('true', '1', 'yes', 'on')


def get_int_env(key: str, default: int) -> int:
    """Get integer value from environment variable."""
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


def get_set_env(key: str, default: str) -> Set[str]:
    """Get set of values from comma-separated environment variable."""
    value = os.getenv(key, default)
    return set(v.strip() for v in value.split(',') if v.strip())


@dataclass
class Config:
    """Application configuration with environment variable support."""
    
    # Flask settings
    DEBUG: bool = field(default_factory=lambda: get_bool_env('FLASK_DEBUG', False))
    HOST: str = field(default_factory=lambda: os.getenv('HOST', '0.0.0.0'))
    PORT: int = field(default_factory=lambda: get_int_env('PORT', 5000))
    
    # CORS settings
    CORS_ORIGINS: str = field(default_factory=lambda: os.getenv('CORS_ORIGINS', '*'))
    
    # File storage settings
    DATASETS_FOLDER: str = field(default_factory=lambda: os.getenv('DATASETS_FOLDER', 'datasets'))
    
    # Computed paths (based on DATASETS_FOLDER)
    @property
    def LABELS_FOLDER(self) -> str:
        return os.path.join(self.DATASETS_FOLDER, 'labels')
    
    @property
    def MAPPING_DB_PATH(self) -> str:
        return os.path.join(self.DATASETS_FOLDER, 'dataset_labels_mapping.json')

    @property
    def CUSTOM_PIPELINES_PATH(self) -> str:
        return os.getenv(
            'CUSTOM_PIPELINES_PATH',
            os.path.join(self.DATASETS_FOLDER, 'custom_pipelines.json')
        )
    
    # File upload settings
    ALLOWED_EXTENSIONS: Set[str] = field(
        default_factory=lambda: get_set_env('ALLOWED_EXTENSIONS', 'bin,dat,raw,pt,npy')
    )
    MAX_CONTENT_LENGTH: int = field(
        default_factory=lambda: get_int_env('MAX_CONTENT_LENGTH', 50 * 1024 * 1024 * 1024)  # 50GB
    )
    
    # Default data settings
    DEFAULT_DATASET: str = field(
        default_factory=lambda: os.getenv('DEFAULT_DATASET', 'c46_data_5percent.pt')
    )
    DEFAULT_CHANNELS: int = field(
        default_factory=lambda: get_int_env('DEFAULT_CHANNELS', 385)
    )
    
    # Logging settings
    LOG_LEVEL: str = field(default_factory=lambda: os.getenv('LOG_LEVEL', 'INFO'))
    LOG_FORMAT: str = field(
        default_factory=lambda: os.getenv(
            'LOG_FORMAT', 
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    )
    
    # Signal processing settings
    SAMPLING_RATE: int = field(
        default_factory=lambda: get_int_env('SAMPLING_RATE', 30000)
    )
    
    # Probe settings
    DEFAULT_PROBE_PATH: str = field(
        default_factory=lambda: os.getenv('DEFAULT_PROBE_PATH', 'torchbci/data/NeuroPix1_default.mat')
    )
    
    # GPU execution settings
    # 'local'     — algorithms run in-process (default, for local/GPU deployments)
    # 'cloud_run' — algorithms are offloaded to a Cloud Run service with L4 GPU
    GPU_EXECUTION_MODE: str = field(
        default_factory=lambda: os.getenv('GPU_EXECUTION_MODE', 'local')
    )
    GPU_WORKER_URL: str = field(
        default_factory=lambda: os.getenv('GPU_WORKER_URL', '')
    )
    GCS_BUCKET: str = field(
        default_factory=lambda: os.getenv('GCS_BUCKET', '')
    )
    GCP_PROJECT: str = field(
        default_factory=lambda: os.getenv('GCP_PROJECT', '')
    )
    
    def __post_init__(self):
        """Validate configuration after initialization."""
        if self.PORT < 1 or self.PORT > 65535:
            raise ValueError(f"Invalid port number: {self.PORT}")
        if self.MAX_CONTENT_LENGTH < 0:
            raise ValueError(f"Invalid max content length: {self.MAX_CONTENT_LENGTH}")


# Global configuration instance
config = Config()


def get_config() -> Config:
    """Get the global configuration instance."""
    return config


def reload_config() -> Config:
    """Reload configuration from environment variables."""
    global config
    config = Config()
    return config
