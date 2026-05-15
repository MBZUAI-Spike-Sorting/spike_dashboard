import React, { useState, useRef, useEffect } from 'react';
import './ViewManager.css';

const STORAGE_KEY = 'spike_dashboard_custom_views';
const CURRENT_VIEW_KEY = 'spike_dashboard_current_view';

// Default view configuration - all widgets visible
const DEFAULT_VIEW = {
  id: 'default',
  name: 'Default Layout',
  isDefault: true,
  widgetStates: {
    clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null },
    spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
    clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
    signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
    dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
    waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null },
    amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null }
  }
};

// Empty view configuration - all widgets hidden (for new custom views)
const EMPTY_WIDGET_STATES = {
  clusterList: { visible: false, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: false, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: false, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: false, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: false, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: false, minimized: false, maximized: false, order: 6, position: null, size: null },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null }
};

const mergeWidgetStateDefaults = (widgetStates = {}, defaults = DEFAULT_VIEW.widgetStates) => {
  return Object.entries(defaults).reduce((acc, [widgetId, defaultState]) => {
    acc[widgetId] = {
      ...defaultState,
      ...(widgetStates[widgetId] || {})
    };
    return acc;
  }, {});
};

const ViewManager = ({ 
  currentWidgetStates, 
  onViewChange, 
  getWidgetPositionsAndSizes 
}) => {
  const [views, setViews] = useState([DEFAULT_VIEW]);
  const [currentViewId, setCurrentViewId] = useState('default');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [editingViewId, setEditingViewId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Load views from localStorage on mount
  useEffect(() => {
    const savedViews = localStorage.getItem(STORAGE_KEY);
    const savedCurrentView = localStorage.getItem(CURRENT_VIEW_KEY);
    
    let loadedViews = [DEFAULT_VIEW];
    let loadedCurrentViewId = 'default';
    
    if (savedViews) {
      try {
        const parsed = JSON.parse(savedViews);
        const hasDefault = parsed.some(v => v.id === 'default');
        if (!hasDefault) {
          parsed.unshift(DEFAULT_VIEW);
        }
        loadedViews = parsed.map((view) => ({
          ...view,
          widgetStates: mergeWidgetStateDefaults(view.widgetStates)
        }));
      } catch (e) {
        console.error('Error loading saved views:', e);
      }
    }
    
    if (savedCurrentView && loadedViews.some(v => v.id === savedCurrentView)) {
      loadedCurrentViewId = savedCurrentView;
    }
    
    setViews(loadedViews);
    setCurrentViewId(loadedCurrentViewId);
    
    // Apply the loaded view
    const viewToApply = loadedViews.find(v => v.id === loadedCurrentViewId);
    if (viewToApply && onViewChange) {
      setTimeout(() => {
        onViewChange(viewToApply.widgetStates);
        setIsInitialized(true);
      }, 100);
    } else {
      setIsInitialized(true);
    }
  }, []);

  // Save views to localStorage when changed
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
    }
  }, [views, isInitialized]);

  // Save current view ID to localStorage
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem(CURRENT_VIEW_KEY, currentViewId);
    }
  }, [currentViewId, isInitialized]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
        setIsCreatingNew(false);
        setEditingViewId(null);
      }
    };
    
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isDropdownOpen]);

  // Focus input when creating new view
  useEffect(() => {
    if (isCreatingNew && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingNew]);

  // Get current view
  const currentView = views.find(v => v.id === currentViewId) || DEFAULT_VIEW;

  // Handle view selection
  const handleSelectView = (viewId) => {
    const view = views.find(v => v.id === viewId);
    if (view) {
      setCurrentViewId(viewId);
      onViewChange(view.widgetStates);
      setIsDropdownOpen(false);
    }
  };

  // Create new view with EMPTY widgets
  const handleCreateView = () => {
    if (!newViewName.trim()) return;
    
    const newView = {
      id: `view_${Date.now()}`,
      name: newViewName.trim(),
      isDefault: false,
      widgetStates: mergeWidgetStateDefaults(
        JSON.parse(JSON.stringify(EMPTY_WIDGET_STATES)),
        EMPTY_WIDGET_STATES
      ),
      createdAt: new Date().toISOString()
    };
    
    setViews(prev => [...prev, newView]);
    setCurrentViewId(newView.id);
    onViewChange(newView.widgetStates);
    setNewViewName('');
    setIsCreatingNew(false);
    setIsDropdownOpen(false);
  };

  // Delete a view
  const handleDeleteView = (e, viewId) => {
    e.stopPropagation();
    if (viewId === 'default') return;
    
    setViews(prev => prev.filter(v => v.id !== viewId));
    
    if (currentViewId === viewId) {
      setCurrentViewId('default');
      onViewChange(DEFAULT_VIEW.widgetStates);
    }
  };

  // Rename a view
  const handleStartRename = (e, viewId, currentName) => {
    e.stopPropagation();
    setEditingViewId(viewId);
    setEditingName(currentName);
  };

  const handleRename = (viewId) => {
    if (!editingName.trim()) {
      setEditingViewId(null);
      return;
    }
    
    setViews(prev => prev.map(view => {
      if (view.id === viewId) {
        return { ...view, name: editingName.trim() };
      }
      return view;
    }));
    setEditingViewId(null);
  };

  const handleKeyDown = (e, action, viewId = null) => {
    if (e.key === 'Enter') {
      if (action === 'create') {
        handleCreateView();
      } else if (action === 'rename' && viewId) {
        handleRename(viewId);
      }
    } else if (e.key === 'Escape') {
      setIsCreatingNew(false);
      setEditingViewId(null);
      setNewViewName('');
    }
  };

  return (
    <div className="view-manager" ref={dropdownRef}>
      <button 
        className={`view-manager-toggle ${isDropdownOpen ? 'active' : ''}`}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <span className="view-icon">📐</span>
        <span className="view-name">{currentView.name}</span>
        <span className={`view-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
      </button>

      {isDropdownOpen && (
        <div className="view-manager-dropdown">
          <div className="dropdown-header">
            <span>Layout Views</span>
          </div>

          <div className="view-list">
            {views.map(view => (
              <div
                key={view.id}
                className={`view-item ${view.id === currentViewId ? 'active' : ''} ${view.isDefault ? 'default' : ''}`}
                onClick={() => handleSelectView(view.id)}
              >
                {editingViewId === view.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, 'rename', view.id)}
                    onBlur={() => handleRename(view.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rename-input"
                    autoFocus
                  />
                ) : (
                  <>
                    <span className="view-item-icon">
                      {view.isDefault ? '🏠' : '📋'}
                    </span>
                    <span className="view-item-name">{view.name}</span>
                    {view.id === currentViewId && (
                      <span className="active-indicator">✓</span>
                    )}
                    {!view.isDefault && (
                      <div className="view-item-actions">
                        <button
                          className="rename-btn"
                          onClick={(e) => handleStartRename(e, view.id, view.name)}
                          title="Rename view"
                        >
                          ✏️
                        </button>
                        <button
                          className="delete-btn"
                          onClick={(e) => handleDeleteView(e, view.id)}
                          title="Delete view"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="dropdown-footer">
            {isCreatingNew ? (
              <div className="create-view-form">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="View name..."
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, 'create')}
                  className="new-view-input"
                />
                <button 
                  className="confirm-btn"
                  onClick={handleCreateView}
                  disabled={!newViewName.trim()}
                >
                  ✓
                </button>
                <button 
                  className="cancel-btn"
                  onClick={() => {
                    setIsCreatingNew(false);
                    setNewViewName('');
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button 
                className="create-view-btn"
                onClick={() => setIsCreatingNew(true)}
              >
                <span>+</span>
                <span>Create New View</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export { DEFAULT_VIEW, STORAGE_KEY, CURRENT_VIEW_KEY, EMPTY_WIDGET_STATES };
export default ViewManager;
