"""
Flask application factory.

Creates and configures the Flask application with all services and routes.
"""

import os
import sys

from flask import Flask
from flask_cors import CORS

from app.config import Config, get_config
from app.logger import get_logger, log_info
from app.routes import health_bp, datasets_bp, spike_data_bp, clustering_bp
from app.routes.auth import auth_bp
from app.models.database import init_db
from app.services import (
    DatasetManager,
    LabelMappingManager,
    SpikeTimesManager,
    SpikeDataProcessor,
    ClusteringManager,
    PipelineJobManager,
    CustomPipelineManager
)
from app.services.gpu_backend import create_gpu_backend

logger = get_logger(__name__)


def create_app(config: Config = None) -> Flask:
    """
    Create and configure the Flask application.
    
    Args:
        config: Optional configuration object. If not provided, uses default config.
        
    Returns:
        Configured Flask application
    """
    if config is None:
        config = get_config()
    
    # Add torchbci to path
    torchbci_path = os.path.join(os.path.dirname(__file__), '..', 'torchbci')
    if torchbci_path not in sys.path:
        sys.path.insert(0, torchbci_path)
    
    # Create Flask app
    app = Flask(__name__)
    
    # Configure app
    app.config['MAX_CONTENT_LENGTH'] = config.MAX_CONTENT_LENGTH
    app.config['app_config'] = config
    
    # Configure CORS
    if config.CORS_ORIGINS == '*':
        CORS(app, supports_credentials=True)
    else:
        origins = [o.strip() for o in config.CORS_ORIGINS.split(',')]
        CORS(app, origins=origins, supports_credentials=True)
    
    # Configure secret key for sessions
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'spike-dashboard-secret-key')
    
    # Setup directories
    _setup_directories(config)
    
    # Initialize database
    init_db(app)
    logger.info("Database initialized")
    
    # Initialize services
    _init_services(app, config)
    
    # Register blueprints
    _register_blueprints(app)
    
    log_info("Flask application created successfully")
    
    return app


def _setup_directories(config: Config) -> None:
    """Create necessary directories."""
    os.makedirs(config.DATASETS_FOLDER, exist_ok=True)
    os.makedirs(config.LABELS_FOLDER, exist_ok=True)
    logger.info(f"Directories initialized: {config.DATASETS_FOLDER}, {config.LABELS_FOLDER}")


def _init_services(app: Flask, config: Config) -> None:
    """Initialize all service objects and store them in app config."""
    logger.info("Initializing services...")
    
    # Create service instances
    dataset_manager = DatasetManager(config)
    mapping_manager = LabelMappingManager(config)
    spike_times_manager = SpikeTimesManager(config, mapping_manager)
    spike_data_processor = SpikeDataProcessor(dataset_manager, spike_times_manager)
    
    # GPU backend: None for local mode, CloudRunGPUBackend for cloud_run mode
    gpu_backend = create_gpu_backend(config)
    clustering_manager = ClusteringManager(config, dataset_manager, gpu_backend=gpu_backend)
    pipeline_job_manager = PipelineJobManager()
    custom_pipeline_manager = CustomPipelineManager(config)
    
    # Store in app config for access in routes
    app.config['dataset_manager'] = dataset_manager
    app.config['mapping_manager'] = mapping_manager
    app.config['spike_times_manager'] = spike_times_manager
    app.config['spike_data_processor'] = spike_data_processor
    app.config['clustering_manager'] = clustering_manager
    app.config['pipeline_job_manager'] = pipeline_job_manager
    app.config['custom_pipeline_manager'] = custom_pipeline_manager
    
    # Migrate existing labels
    mapping_manager.migrate_existing_labels()
    
    # Load default dataset
    logger.info(f"Loading default dataset: {config.DEFAULT_DATASET}")
    dataset_manager.load_data()
    
    if dataset_manager.data_array is not None:
        spike_times_manager.load_spike_times(dataset_manager.current_dataset)
        logger.info(f"Dataset loaded: {dataset_manager.data_array.shape}")
    else:
        logger.warning("Default dataset not loaded")
    
    logger.info("Services initialized successfully")


def _register_blueprints(app: Flask) -> None:
    """Register all route blueprints."""
    app.register_blueprint(auth_bp)
    app.register_blueprint(health_bp)
    app.register_blueprint(datasets_bp)
    app.register_blueprint(spike_data_bp)
    app.register_blueprint(clustering_bp)
    
    logger.info("Blueprints registered: auth, health, datasets, spike_data, clustering")


def run_app(app: Flask = None, config: Config = None) -> None:
    """
    Run the Flask application.
    
    Args:
        app: Optional Flask app. If not provided, creates a new one.
        config: Optional configuration object.
    """
    if config is None:
        config = get_config()
    
    if app is None:
        app = create_app(config)
    
    logger.info("=" * 60)
    logger.info("Starting Spike Visualizer API")
    logger.info("=" * 60)
    logger.info(f"  Host: {config.HOST}")
    logger.info(f"  Port: {config.PORT}")
    logger.info(f"  Debug: {config.DEBUG}")
    logger.info(f"  CORS Origins: {config.CORS_ORIGINS}")
    logger.info("=" * 60)
    
    app.run(
        debug=config.DEBUG,
        host=config.HOST,
        port=config.PORT
    )
