#!/usr/bin/env bash
# =============================================================================
# SpikeScope — Full Setup Script
# =============================================================================
#
# Sets up everything needed to run the Spike Dashboard:
#   1. Clones/pulls the torchbci repository
#   2. Installs Miniconda (if not already installed)
#   3. Creates a conda environment with all Python dependencies
#   4. Installs Node.js frontend dependencies
#   5. Starts both the backend API and the frontend dev server
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# Options:
#   --skip-install   Skip dependency installation, just start the servers
#   --install-only   Install everything but don't start servers
#
# =============================================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TORCHBCI_REPO="git@github.com:dongning-ma/torchbci.git"
TORCHBCI_DIR="${SCRIPT_DIR}/torchbci"

CONDA_ENV_NAME="viz"
PYTHON_VERSION="3.11"

MINICONDA_DIR="${HOME}/miniconda3"
MINICONDA_URL="https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh"

BACKEND_PORT="${PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ── Colors ───────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }
step() { echo -e "\n${CYAN}${BOLD}━━━ $* ━━━${NC}\n"; }

# ── Parse Arguments ──────────────────────────────────────────────────────────

SKIP_INSTALL=false
INSTALL_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    --install-only) INSTALL_ONLY=true ;;
    --help|-h)
      echo "Usage: ./setup.sh [--skip-install] [--install-only]"
      echo ""
      echo "  --skip-install   Skip dependency installation, just start servers"
      echo "  --install-only   Install everything but don't start servers"
      exit 0
      ;;
    *) err "Unknown option: $arg"; exit 1 ;;
  esac
done

# ── Helper: Initialize Conda in Current Shell ────────────────────────────────

init_conda() {
  if [ -f "${MINICONDA_DIR}/etc/profile.d/conda.sh" ]; then
    source "${MINICONDA_DIR}/etc/profile.d/conda.sh"
  elif [ -f "${HOME}/anaconda3/etc/profile.d/conda.sh" ]; then
    source "${HOME}/anaconda3/etc/profile.d/conda.sh"
  else
    err "Cannot find conda.sh — is Miniconda installed?"
    exit 1
  fi
}

# =============================================================================
# STEP 1 — Clone or Pull torchbci
# =============================================================================

setup_torchbci() {
  step "1/5  Setting up torchbci repository"

  if [ -d "${TORCHBCI_DIR}/.git" ]; then
    log "torchbci already cloned — pulling latest changes..."
    (cd "${TORCHBCI_DIR}" && git pull --ff-only) || {
      warn "git pull failed (may have local changes). Continuing with existing code."
    }
    ok "torchbci up to date"
  else
    log "Cloning torchbci from ${TORCHBCI_REPO}..."
    git clone "${TORCHBCI_REPO}" "${TORCHBCI_DIR}"
    ok "torchbci cloned"
  fi
}

# =============================================================================
# STEP 2 — Install Miniconda
# =============================================================================

setup_miniconda() {
  step "2/5  Setting up Miniconda"

  if command -v conda &>/dev/null; then
    ok "Conda already installed: $(conda --version)"
    return 0
  fi

  if [ -f "${MINICONDA_DIR}/bin/conda" ]; then
    ok "Miniconda found at ${MINICONDA_DIR} (not on PATH — will initialize)"
    return 0
  fi

  log "Downloading Miniconda..."
  local installer="/tmp/miniconda_installer.sh"
  curl -fsSL "${MINICONDA_URL}" -o "${installer}"

  log "Installing Miniconda to ${MINICONDA_DIR}..."
  bash "${installer}" -b -p "${MINICONDA_DIR}"
  rm -f "${installer}"

  ok "Miniconda installed"

  # Add to shell profile if not present
  local shell_rc="${HOME}/.bashrc"
  if ! grep -q "conda.sh" "${shell_rc}" 2>/dev/null; then
    log "Adding conda init to ${shell_rc}..."
    "${MINICONDA_DIR}/bin/conda" init bash 2>/dev/null || true
  fi
}

# =============================================================================
# STEP 3 — Create Conda Environment & Install Python Dependencies
# =============================================================================

setup_python_env() {
  step "3/5  Setting up Python environment (${CONDA_ENV_NAME})"

  init_conda

  # Create environment if it doesn't exist
  if conda env list | grep -qw "^${CONDA_ENV_NAME} "; then
    ok "Conda environment '${CONDA_ENV_NAME}' already exists"
  else
    log "Creating conda environment '${CONDA_ENV_NAME}' with Python ${PYTHON_VERSION}..."
    conda create -y -n "${CONDA_ENV_NAME}" python="${PYTHON_VERSION}"
    ok "Conda environment created"
  fi

  log "Activating environment '${CONDA_ENV_NAME}'..."
  conda activate "${CONDA_ENV_NAME}"

  # Install PyTorch (CPU or CUDA depending on availability)
  log "Installing PyTorch..."
  if command -v nvidia-smi &>/dev/null; then
    log "CUDA GPU detected — installing PyTorch with CUDA support"
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121 --quiet
  else
    log "No CUDA GPU detected — installing CPU-only PyTorch"
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu --quiet
  fi
  ok "PyTorch installed"

  # Install spike_dashboard Python dependencies
  log "Installing spike_dashboard requirements..."
  pip install -r "${SCRIPT_DIR}/requirements.txt" --quiet
  ok "spike_dashboard dependencies installed"

  # Install torchbci as editable package
  if [ -d "${TORCHBCI_DIR}" ]; then
    log "Installing torchbci in editable mode..."
    pip install -e "${TORCHBCI_DIR}" --quiet
    ok "torchbci installed"
  else
    warn "torchbci directory not found — skipping torchbci install"
  fi

  ok "Python environment ready"
}

# =============================================================================
# STEP 4 — Install Node.js / Frontend Dependencies
# =============================================================================

setup_frontend() {
  step "4/5  Setting up frontend dependencies"

  # Check for Node.js
  if ! command -v node &>/dev/null; then
    err "Node.js is not installed."
    err "Install Node.js 18+ from: https://nodejs.org/"
    err "Or via conda:  conda install -y -c conda-forge nodejs=18"
    exit 1
  fi
  ok "Node.js $(node --version) found"

  # Check for npm
  if ! command -v npm &>/dev/null; then
    err "npm is not installed."
    exit 1
  fi

  # Install dependencies
  log "Installing npm packages..."
  (cd "${SCRIPT_DIR}" && npm install --silent 2>&1 | tail -1)
  ok "Frontend dependencies installed"
}

# =============================================================================
# STEP 5 — Start Backend & Frontend
# =============================================================================

start_servers() {
  step "5/5  Starting servers"

  init_conda
  conda activate "${CONDA_ENV_NAME}"

  # Create datasets directory if missing
  mkdir -p "${SCRIPT_DIR}/datasets/labels"

  log "Starting backend API on port ${BACKEND_PORT}..."
  (cd "${SCRIPT_DIR}" && PORT="${BACKEND_PORT}" python run.py) &
  BACKEND_PID=$!
  log "Backend PID: ${BACKEND_PID}"

  # Wait for backend to be ready
  log "Waiting for backend to start..."
  for i in $(seq 1 30); do
    if curl -sf "http://localhost:${BACKEND_PORT}/health" &>/dev/null; then
      ok "Backend is ready on http://localhost:${BACKEND_PORT}"
      break
    fi
    sleep 1
    if [ "$i" -eq 30 ]; then
      warn "Backend didn't respond within 30s — it may still be loading a dataset"
    fi
  done

  log "Starting frontend dev server on port ${FRONTEND_PORT}..."
  (cd "${SCRIPT_DIR}" && PORT="${FRONTEND_PORT}" npm start) &
  FRONTEND_PID=$!
  log "Frontend PID: ${FRONTEND_PID}"

  echo ""
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}${BOLD}  SpikeScope is running!${NC}"
  echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${CYAN}Frontend${NC}  →  http://localhost:${FRONTEND_PORT}"
  echo -e "  ${CYAN}Backend${NC}   →  http://localhost:${BACKEND_PORT}"
  echo ""
  echo -e "  Press ${BOLD}Ctrl+C${NC} to stop both servers."
  echo ""

  # Trap Ctrl+C to kill both processes
  trap "echo ''; log 'Shutting down...'; kill ${BACKEND_PID} ${FRONTEND_PID} 2>/dev/null; exit 0" INT TERM

  # Wait for either process to exit
  wait
}

# =============================================================================
# Main
# =============================================================================

echo ""
echo -e "${CYAN}${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║          SpikeScope — Setup & Launch              ║${NC}"
echo -e "${CYAN}${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

cd "${SCRIPT_DIR}"

if [ "${SKIP_INSTALL}" = false ]; then
  setup_torchbci
  setup_miniconda
  setup_python_env
  setup_frontend
fi

if [ "${INSTALL_ONLY}" = false ]; then
  start_servers
else
  echo ""
  ok "Installation complete. Run ${BOLD}./setup.sh --skip-install${NC} to start the servers."
  echo ""
fi
