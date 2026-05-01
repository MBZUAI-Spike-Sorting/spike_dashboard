import React from 'react';
import PropTypes from 'prop-types';
import DatasetSelector from './DatasetSelector';
import UserMenu from './UserMenu';
import './Header.css';
import { Link } from 'react-router-dom';
/**
 * Header Component
 * 
 * Main navigation header with view selection, dataset management,
 * user menu, and signal type controls.
 */
const Header = ({
  demoMode = false,
  datasets,
  currentDataset,
  onDatasetChange,
  onUploadClick,
  onDatasetDelete,
  selectedView,
  onViewChange,
  selectedSignalType,
  onSignalTypeChange
}) => {
  return (
    <div className="header">
      <div className="header-left">
        <Link to="/" className="dashboard-title-link">
   <div className="landing-nav-brand">
          <div className="landing-nav-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="url(#bolt-grad)" />
              <defs>
                <linearGradient id="bolt-grad" x1="3" y1="2" x2="21" y2="22">
                  <stop stopColor="#40e0d0" />
                  <stop offset="1" stopColor="#0d9488" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="landing-nav-title">SpikeScope</span>
        </div>
</Link>
{demoMode && <span className="playground-badge">Playground</span>}
      </div>

      <div className="header-controls">
        {selectedView === 'signal' && (
          <div className="view-selector-container">
            <label htmlFor="signal-type-select">Signal Type:</label>
            <select
              id="signal-type-select"
              className="view-selector"
              value={selectedSignalType}
              onChange={(e) => onSignalTypeChange(e.target.value)}
            >
              <option value="raw">Raw Data</option>
              <option value="filtered">Filtered Data</option>
              <option value="spikes">Detected Spikes</option>
            </select>
          </div>
        )}

        <div className="view-selector-container">
          <label htmlFor="view-select">View:</label>
          <select
            id="view-select"
            className="view-selector"
            value={selectedView}
            onChange={(e) => onViewChange(e.target.value)}
          >
            <option value="signal">Signal View</option>
            <option value="clusters">Cluster View</option>
            <option value="multipanel">Multi-Panel View</option>
            <option value="runtime">Runtime Analysis View</option>
          </select>
        </div>

        <DatasetSelector
          datasets={datasets}
          currentDataset={currentDataset}
          onDatasetChange={onDatasetChange}
          onDatasetDelete={onDatasetDelete}
        />
        {!demoMode && (

        <button 
          className="upload-button-header" 
          onClick={onUploadClick}
          title="Upload new dataset"
        >
          <svg 
            width="18" 
            height="18" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        )}
       {demoMode ? (
  <Link to="/login" className="demo-signin-button" title="Sign in">
    Sign In
  </Link>
) : (
  <UserMenu />
)}
      </div>
    </div>
  );
};

Header.propTypes = {
  /** Array of available datasets */
  datasets: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    size: PropTypes.number,
    sizeFormatted: PropTypes.string,
  })).isRequired,
  /** Currently selected dataset name */
  currentDataset: PropTypes.string,
  /** Callback when dataset is changed */
  onDatasetChange: PropTypes.func.isRequired,
  /** Callback when upload button is clicked */
  onUploadClick: PropTypes.func.isRequired,
  /** Callback when dataset delete is requested */
  onDatasetDelete: PropTypes.func.isRequired,
  /** Currently selected view */
  selectedView: PropTypes.oneOf(['signal', 'clusters', 'multipanel', 'runtime']).isRequired,
  /** Callback when view is changed */
  onViewChange: PropTypes.func.isRequired,
  /** Currently selected signal type (for signal view) */
  selectedSignalType: PropTypes.oneOf(['raw', 'filtered', 'spikes']),
  /** Callback when signal type is changed */
  onSignalTypeChange: PropTypes.func,
};

Header.defaultProps = {
  currentDataset: null,
  selectedSignalType: 'raw',
  onSignalTypeChange: () => {},
};

export default Header;
