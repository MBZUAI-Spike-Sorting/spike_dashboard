import React, { useState, useRef, useEffect } from 'react';
import './ViewManager.css';

const STORAGE_KEY = 'spike_dashboard_custom_views';
const CURRENT_VIEW_KEY = 'spike_dashboard_current_view';
const PROFILE_VIEWS_KEY = 'dashboardViews';
const PROFILE_CURRENT_VIEW_KEY = 'currentDashboardViewId';

const getScopedStorageKey = (key, scope) => {
  return scope ? `${key}:${scope}` : key;
};

const DEFAULT_VIEW = {
  id: 'default',
  name: 'Default Layout',
  isDefault: true,
  widgetStates: {
    clusterList: { visible: true, minimized: false, maximized: false, order: 1, position: null, size: null, type: 'clusterList' },
    spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null, type: 'spikeList' },
    clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null, type: 'clusterStats' },
    signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null, type: 'signalView' },
    dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null, type: 'dimReduction' },
    waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null, type: 'waveform' },
    amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null, type: 'amplitudeProfile' },
    clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null, type: 'clusterComparison' },
    curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null, type: 'curator' },
    rasterPlot: { visible: false, minimized: false, maximized: false, order: 10, position: null, size: null, type: 'rasterPlot' }
  }
};

const EMPTY_WIDGET_STATES = {
  clusterList: { visible: false, minimized: false, maximized: false, order: 1, position: null, size: null, type: 'clusterList' },
  spikeList: { visible: false, minimized: false, maximized: false, order: 2, position: null, size: null, type: 'spikeList' },
  clusterStats: { visible: false, minimized: false, maximized: false, order: 3, position: null, size: null, type: 'clusterStats' },
  signalView: { visible: false, minimized: false, maximized: false, order: 4, position: null, size: null, type: 'signalView' },
  dimReduction: { visible: false, minimized: false, maximized: false, order: 5, position: null, size: null, type: 'dimReduction' },
  waveform: { visible: false, minimized: false, maximized: false, order: 6, position: null, size: null, type: 'waveform' },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null, type: 'amplitudeProfile' },
  clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null, type: 'clusterComparison' },
  curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null, type: 'curator' },
  rasterPlot: { visible: false, minimized: false, maximized: false, order: 10, position: null, size: null, type: 'rasterPlot' }
};

const mergeWidgetStateDefaults = (widgetStates = {}, defaults = DEFAULT_VIEW.widgetStates) => {
  const merged = Object.entries(defaults).reduce((acc, [widgetId, defaultState]) => {
    acc[widgetId] = {
      ...defaultState,
      ...(widgetStates[widgetId] || {})
    };
    return acc;
  }, {});

  Object.entries(widgetStates || {}).forEach(([widgetId, state]) => {
    if (!merged[widgetId]) {
      merged[widgetId] = state;
    }
  });

  return merged;
};

const normalizeViews = (candidateViews) => {
  const sourceViews = Array.isArray(candidateViews) ? candidateViews : [];
  const viewsWithDefault = sourceViews.some((view) => view?.id === 'default')
    ? sourceViews
    : [DEFAULT_VIEW, ...sourceViews];

  return viewsWithDefault
    .filter((view) => view && typeof view === 'object')
    .map((view, index) => {
      const viewId = view.id || `view_${Date.now()}_${index}`;

      if (viewId === 'default') {
        return {
          ...DEFAULT_VIEW,
          name: view.name || DEFAULT_VIEW.name,
          widgetStates: mergeWidgetStateDefaults(DEFAULT_VIEW.widgetStates)
        };
      }

      return {
        ...view,
        id: viewId,
        name: view.name || 'Layout',
        isDefault: viewId === 'default' || Boolean(view.isDefault),
        widgetStates: mergeWidgetStateDefaults(view.widgetStates)
      };
    });
};

const readLocalViewSnapshot = (storageScope) => {
  const savedViews = localStorage.getItem(getScopedStorageKey(STORAGE_KEY, storageScope));
  const savedCurrentView = localStorage.getItem(getScopedStorageKey(CURRENT_VIEW_KEY, storageScope));

  if (!savedViews) {
    return {
      views: [DEFAULT_VIEW],
      currentViewId: 'default'
    };
  }

  try {
    const views = normalizeViews(JSON.parse(savedViews));
    return {
      views,
      currentViewId:
        savedCurrentView && views.some((view) => view.id === savedCurrentView)
          ? savedCurrentView
          : 'default'
    };
  } catch (e) {
    console.error('Error loading saved views:', e);
    return {
      views: [DEFAULT_VIEW],
      currentViewId: 'default'
    };
  }
};

const buildViewSnapshot = (savedViews, savedCurrentViewId, storageScope) => {
  if (Array.isArray(savedViews) && savedViews.length > 0) {
    const views = normalizeViews(savedViews);
    return {
      views,
      currentViewId:
        savedCurrentViewId && views.some((view) => view.id === savedCurrentViewId)
          ? savedCurrentViewId
          : 'default'
    };
  }

  return readLocalViewSnapshot(storageScope);
};

const ViewManager = ({
  currentWidgetStates,
  onViewChange,
  getWidgetPositionsAndSizes,
  savedViews,
  savedCurrentViewId,
  onPersistViews,
  layoutStorageScope
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
  const lastAppliedAccountSnapshotRef = useRef(null);
  const lastPersistedSnapshotRef = useRef(null);

  useEffect(() => {
    let applyViewTimer = null;
    const snapshot = buildViewSnapshot(savedViews, savedCurrentViewId, layoutStorageScope);
    const snapshotKey = JSON.stringify(snapshot);
    const hasAccountSavedViews = Array.isArray(savedViews) && savedViews.length > 0;

    lastAppliedAccountSnapshotRef.current = snapshotKey;
    lastPersistedSnapshotRef.current = hasAccountSavedViews ? snapshotKey : null;

    setViews(snapshot.views);
    setCurrentViewId(snapshot.currentViewId);

    const viewToApply = snapshot.views.find((v) => v.id === snapshot.currentViewId);
    if (viewToApply && onViewChange) {
      applyViewTimer = setTimeout(() => {
        onViewChange(
          JSON.parse(JSON.stringify(viewToApply.widgetStates)),
          viewToApply.id
        );
        setIsInitialized(true);
      }, 100);
    } else {
      setIsInitialized(true);
    }

    return () => {
      if (applyViewTimer) clearTimeout(applyViewTimer);
    };
  }, [layoutStorageScope, savedViews, savedCurrentViewId, onViewChange]);

  useEffect(() => {
    if (!isInitialized || !Array.isArray(savedViews) || savedViews.length === 0) {
      return;
    }

    const snapshot = buildViewSnapshot(savedViews, savedCurrentViewId, layoutStorageScope);
    const snapshotKey = JSON.stringify(snapshot);

    if (lastAppliedAccountSnapshotRef.current === snapshotKey) {
      return;
    }

    lastAppliedAccountSnapshotRef.current = snapshotKey;
    lastPersistedSnapshotRef.current = snapshotKey;

    setViews(snapshot.views);
    setCurrentViewId(snapshot.currentViewId);

    const viewToApply = snapshot.views.find((v) => v.id === snapshot.currentViewId);
    if (viewToApply && onViewChange) {
      onViewChange(
        JSON.parse(JSON.stringify(viewToApply.widgetStates)),
        viewToApply.id
      );
    }
  }, [savedViews, savedCurrentViewId, isInitialized, onViewChange, layoutStorageScope]);

  /**
   * IMPORTANT FIX:
   * Save the live React widget state directly.
   * Do not re-read positions from the DOM here.
   */
  useEffect(() => {
    if (!isInitialized || currentViewId === 'default' || !currentWidgetStates) {
      return;
    }

    const normalizedWidgetStates = mergeWidgetStateDefaults(
      JSON.parse(JSON.stringify(currentWidgetStates))
    );

    setViews((previousViews) => {
      const viewIndex = previousViews.findIndex(
        (view) => view.id === currentViewId && !view.isDefault
      );

      if (viewIndex === -1) return previousViews;

      const activeView = previousViews[viewIndex];
      if (JSON.stringify(activeView.widgetStates) === JSON.stringify(normalizedWidgetStates)) {
        return previousViews;
      }

      const nextViews = [...previousViews];
      nextViews[viewIndex] = {
        ...activeView,
        widgetStates: normalizedWidgetStates,
        updatedAt: new Date().toISOString()
      };

      return nextViews;
    });
  }, [currentWidgetStates, currentViewId, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    localStorage.setItem(
      getScopedStorageKey(STORAGE_KEY, layoutStorageScope),
      JSON.stringify(views)
    );
    localStorage.setItem(
      getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope),
      currentViewId
    );

    if (!onPersistViews) return;

    const snapshotKey = JSON.stringify({ views, currentViewId });
    if (lastPersistedSnapshotRef.current === snapshotKey) {
      return;
    }

    lastPersistedSnapshotRef.current = snapshotKey;
    lastAppliedAccountSnapshotRef.current = snapshotKey;
    onPersistViews(views, currentViewId);
  }, [views, currentViewId, isInitialized, onPersistViews, layoutStorageScope]);

  useEffect(() => {
    if (!isInitialized) return undefined;

    const viewsStorageKey = getScopedStorageKey(STORAGE_KEY, layoutStorageScope);
    const currentViewStorageKey = getScopedStorageKey(CURRENT_VIEW_KEY, layoutStorageScope);

    const handleStorageChange = (event) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== viewsStorageKey && event.key !== currentViewStorageKey) return;

      const snapshot = readLocalViewSnapshot(layoutStorageScope);
      const snapshotKey = JSON.stringify(snapshot);

      if (lastAppliedAccountSnapshotRef.current === snapshotKey) {
        return;
      }

      lastAppliedAccountSnapshotRef.current = snapshotKey;
      lastPersistedSnapshotRef.current = snapshotKey;

      setViews(snapshot.views);
      setCurrentViewId(snapshot.currentViewId);

      const viewToApply = snapshot.views.find((view) => view.id === snapshot.currentViewId);
      if (viewToApply && onViewChange) {
        onViewChange(
          JSON.parse(JSON.stringify(viewToApply.widgetStates)),
          viewToApply.id
        );
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isInitialized, layoutStorageScope, onViewChange]);

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

  useEffect(() => {
    if (isCreatingNew && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingNew]);

  const currentView = views.find((v) => v.id === currentViewId) || DEFAULT_VIEW;

  const handleSelectView = (viewId) => {
    const view = views.find((v) => v.id === viewId);
    if (!view) return;

    setCurrentViewId(viewId);

    const widgetStatesToApply =
      viewId === 'default'
        ? mergeWidgetStateDefaults(DEFAULT_VIEW.widgetStates)
        : mergeWidgetStateDefaults(view.widgetStates);

    onViewChange(JSON.parse(JSON.stringify(widgetStatesToApply)), view.id);
    setIsDropdownOpen(false);
  };

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

    setViews((prev) => [...prev, newView]);
    setCurrentViewId(newView.id);
    onViewChange(JSON.parse(JSON.stringify(newView.widgetStates)), newView.id);
    setNewViewName('');
    setIsCreatingNew(false);
    setIsDropdownOpen(false);
  };

  const handleDeleteView = (e, viewId) => {
    e.stopPropagation();
    if (viewId === 'default') return;

    setViews((prev) => prev.filter((v) => v.id !== viewId));

    if (currentViewId === viewId) {
      setCurrentViewId('default');
      onViewChange(
        JSON.parse(JSON.stringify(mergeWidgetStateDefaults(DEFAULT_VIEW.widgetStates))),
        'default'
      );
    }
  };

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

    setViews((prev) =>
      prev.map((view) =>
        view.id === viewId ? { ...view, name: editingName.trim() } : view
      )
    );
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

  const handleOpenInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
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
            {views.map((view) => (
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
            <button className="open-tab-btn" onClick={handleOpenInNewTab}>
              Open In New Tab
            </button>

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

export {
  DEFAULT_VIEW,
  STORAGE_KEY,
  CURRENT_VIEW_KEY,
  PROFILE_VIEWS_KEY,
  PROFILE_CURRENT_VIEW_KEY,
  EMPTY_WIDGET_STATES,
  getScopedStorageKey
};

export default ViewManager;
