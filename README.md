# SpikeScope

**An interactive web-based platform for visualizing and sorting extracellular neural recordings.**

SpikeScope provides a modern dashboard for exploring raw neural signals, running spike sorting algorithms, and analyzing clustering results — all from the browser.

<p align="center">
  <strong>Visualize & Sort Neural Spikes</strong>
</p>

---

## Key Features

- **Signal Visualization** — Explore raw, filtered, and spike-detected signals across hundreds of channels with interactive zoom and pan.
- **Spike Sorting** — Run clustering algorithms (Kilosort4, TorchBCI) to classify detected spikes into distinct neural units.
- **Multi-Panel View** — Arrange and customize multiple analysis panels side-by-side with a flexible dockable widget system.
- **Cluster Analysis** — Visualize clusters with dimensionality reduction, inspect waveform shapes, and navigate individual spikes on the timeline.
- **Dataset Management** — Upload, switch, and manage multiple neural recording datasets with support for PyTorch tensor (`.pt`), NumPy (`.npy`), and raw binary formats.
- **Runtime Analytics** — Track and compare algorithm performance metrics to optimize spike sorting pipelines.
- **Extensible Widgets** — Build custom visualization widgets with a documented plugin API.
- **Cluster Comparison Uploads** — Load `.json` or MATLAB `.mat` cluster files into the Cluster Comparison widget. See [`docs/CLUSTER_COMPARISON_FILE_FORMAT.md`](docs/CLUSTER_COMPARISON_FILE_FORMAT.md).
- **Widget Data I/O Protocol** — Standardized JSON-facing payloads for widget and backend block communication. See [`docs/SPIKESCOPE_WIDGET_DATA_IO.md`](docs/SPIKESCOPE_WIDGET_DATA_IO.md).

---

## Workflow

| Step | Description |
|------|-------------|
| **1. Upload & Explore** | Import datasets and explore raw signals, apply filters, set detection thresholds |
| **2. Detect & Cluster** | Run spike sorting algorithms with customizable parameters, view results as 2D cluster plots |
| **3. Analyze & Compare** | Dive into cluster statistics, compare algorithm results, navigate to individual spikes |

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, React Router, Plotly.js, Recharts, Lucide Icons |
| **Backend** | Python 3.11, Flask, Flask-SQLAlchemy, NumPy, SciPy, scikit-learn |
| **Deep Learning** | PyTorch (CUDA / CPU), torchaudio, torchbci |
| **Auth** | JWT-based authentication with role-based access (Guest / Regular / Pro / Admin) |
| **Database** | SQLite |

---

## Quick Start

### Automated Setup

The included setup script handles everything — cloning dependencies, creating a conda environment, installing packages, and starting the servers:

```bash
chmod +x run.sh
./run.sh
```

This will:

1. Clone/pull the [torchbci](https://github.com/dongning-ma/torchbci) repository
2. Install Miniconda (if not already installed)
3. Create a `viz` conda environment with Python 3.11
4. Install PyTorch (with CUDA support if a GPU is detected)
5. Install all Python and Node.js dependencies
6. Start both backend (port 5000) and frontend (port 3000)

**Options:**

```bash
./run.sh --skip-install    # Skip installation, just start the servers
./run.sh --install-only    # Install everything but don't start servers
```

### Manual Setup

**Backend:**

```bash
# Create and activate conda environment
conda create -n viz python=3.11 -y
conda activate viz

# Install PyTorch (CPU)
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Or with CUDA support
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install dependencies
pip install -r requirements.txt

# Install torchbci (optional, for TorchBCI algorithm)
git clone git@github.com:dongning-ma/torchbci.git
pip install -e ./torchbci

# Start the backend
python run.py
```

**Frontend:**

```bash
# Install Node.js dependencies
npm install

# Start the development server
npm start
```

The frontend will be available at `http://localhost:3000` and the backend API at `http://localhost:5000`.

---

## Project Structure

```
spike_dashboard/
├── app/                            # Flask backend
│   ├── __init__.py                 # Application factory
│   ├── config.py                   # Configuration management
│   ├── logger.py                   # Logging setup
│   ├── models/                     # Database models
│   │   ├── database.py             # Database initialization (SQLite)
│   │   └── user.py                 # User model & role-based access
│   ├── routes/                     # API route blueprints
│   │   ├── auth.py                 # Authentication (register, login, JWT)
│   │   ├── clustering.py           # Clustering & spike sorting
│   │   ├── datasets.py             # Dataset management & uploads
│   │   ├── health.py               # Health checks
│   │   └── spike_data.py           # Spike data retrieval
│   ├── services/                   # Business logic
│   │   ├── clustering_manager.py   # Kilosort4, TorchBCI algorithms
│   │   ├── dataset_manager.py      # Dataset loading & format handling
│   │   ├── filter_processor.py     # Signal filtering (bandpass, etc.)
│   │   ├── label_mapping_manager.py
│   │   ├── spike_data_processor.py # Data processing pipeline
│   │   └── spike_times_manager.py  # Spike times management
│   └── utils/                      # Helpers
│       ├── auth.py                 # JWT token utilities
│       └── responses.py            # Standardized API responses
├── src/                            # React frontend
│   ├── api/                        # API client
│   ├── components/                 # UI components
│   │   ├── ClusterView.js          # Cluster scatter plot
│   │   ├── MultiPanelView.js       # Multi-panel dashboard
│   │   ├── SignalViewPanel.js       # Signal waveform viewer
│   │   ├── DockableWidget.js       # Widget framework
│   │   ├── WidgetBank.js           # Widget management
│   │   └── ...                     # 30+ components
│   ├── context/                    # React context (auth)
│   ├── hooks/                      # Custom hooks
│   ├── pages/                      # Page components (Login, Register, Landing)
│   ├── utils/                      # Frontend utilities
│   └── widgets/                    # Extensible widget system
├── processing/                     # Background processing
├── docs/                           # Documentation
│   └── WIDGET_DEVELOPMENT_GUIDE.md # Widget plugin API guide
├── run.py                          # Backend entry point
├── run.sh                          # Automated setup & launch script
├── requirements.txt                # Python dependencies
└── package.json                    # Node.js dependencies
```

---

## API Overview

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT token |
| `GET` | `/api/auth/me` | Get current user info |
| `POST` | `/api/auth/logout` | Logout |

### Datasets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/datasets` | List all available datasets |
| `POST` | `/api/dataset/set` | Set the active dataset |
| `POST` | `/api/dataset/upload` | Upload a new dataset |
| `DELETE` | `/api/dataset/delete` | Delete a dataset |

### Spike Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/spike-data` | Get spike data for selected channels |
| `GET` | `/api/spike-times-available` | Check if spike times are loaded |
| `POST` | `/api/navigate-spike` | Navigate to next/previous spike |

### Clustering & Sorting

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/spike-sorting/algorithms` | List available algorithms |
| `POST` | `/api/spike-sorting/run` | Run a spike sorting algorithm |
| `POST` | `/api/cluster-data` | Get cluster data for visualization |
| `POST` | `/api/cluster-statistics` | Get statistics for selected clusters |
| `POST` | `/api/cluster-waveforms` | Get waveforms for selected clusters |
| `POST` | `/api/cluster-multi-channel-waveforms` | Get multi-channel waveforms |

---

---

## Extending with Custom Widgets

SpikeScope includes a widget plugin system. See the [Widget Development Guide](docs/WIDGET_DEVELOPMENT_GUIDE.md) for details on building custom visualizations.

For linkable custom spike sorting repositories, see the [Custom Pipeline Tutorial](docs/LINKABLE_CUSTOM_PIPELINE_TUTORIAL.md).

```javascript
// Example: register a custom widget
import { widgetRegistry } from './widgets/registry';

widgetRegistry.register({
  id: 'my-custom-widget',
  name: 'My Widget',
  component: MyWidgetComponent,
  defaultSize: { width: 400, height: 300 },
});
```
