/**
 * useWidgetState Hook
 * 
 * Manages widget state including visibility, position, size, and persistence.
 */

import { useState, useCallback, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

/**
 * Default widget states
 */
export const DEFAULT_WIDGET_STATES = {
  clusterList: { visible: false, minimized: false, maximized: false, order: 1, position: null, size: null },
  spikeList: { visible: true, minimized: false, maximized: false, order: 2, position: null, size: null },
  clusterStats: { visible: true, minimized: false, maximized: false, order: 3, position: null, size: null },
  signalView: { visible: true, minimized: false, maximized: false, order: 4, position: null, size: null },
  dimReduction: { visible: true, minimized: false, maximized: false, order: 5, position: null, size: null },
  waveform: { visible: true, minimized: false, maximized: false, order: 6, position: null, size: null },
  amplitudeProfile: { visible: false, minimized: false, maximized: false, order: 7, position: null, size: null },
  clusterComparison: { visible: false, minimized: false, maximized: false, order: 8, position: null, size: null },
  curator: { visible: false, minimized: false, maximized: false, order: 9, position: null, size: null },
  rasterPlot: { visible: false, minimized: false, maximized: false, order: 10, position: null, size: null },
};

/**
 * Storage keys
 */
const STORAGE_KEY = 'spike-dashboard-views';
const CURRENT_VIEW_KEY = 'spike-dashboard-current-view';

/**
 * Hook for widget state management
 * 
 * @param {Object} options - Hook options
 * @param {string} options.storageKey - localStorage key for saved views
 * @param {Object} options.initialStates - Initial widget states
 * @returns {Object} Widget state and operations
 */
export function useWidgetState({ 
  storageKey = STORAGE_KEY, 
  initialStates = DEFAULT_WIDGET_STATES 
} = {}) {
  const [widgetStates, setWidgetStates] = useState(initialStates);
  const [savedViews, setSavedViews] = useLocalStorage(storageKey, {});
  const [currentViewName, setCurrentViewName] = useLocalStorage(CURRENT_VIEW_KEY, 'Default');

  /**
   * Update a widget's state
   */
  const updateWidget = useCallback((widgetId, updates) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        ...updates,
      },
    }));
  }, []);

  /**
   * Toggle widget visibility
   */
  const toggleWidget = useCallback((widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: !prev[widgetId].visible,
      },
    }));
  }, []);

  /**
   * Toggle widget minimized state
   */
  const toggleMinimize = useCallback((widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        minimized: !prev[widgetId].minimized,
        maximized: false,
      },
    }));
  }, []);

  /**
   * Toggle widget maximized state
   */
  const toggleMaximize = useCallback((widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        maximized: !prev[widgetId].maximized,
        minimized: false,
      },
    }));
  }, []);

  /**
   * Show a widget
   */
  const showWidget = useCallback((widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: true,
        minimized: false,
      },
    }));
  }, []);

  /**
   * Hide a widget
   */
  const hideWidget = useCallback((widgetId) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        visible: false,
      },
    }));
  }, []);

  /**
   * Update widget position
   */
  const setWidgetPosition = useCallback((widgetId, position) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        position,
      },
    }));
  }, []);

  /**
   * Update widget size
   */
  const setWidgetSize = useCallback((widgetId, size) => {
    setWidgetStates(prev => ({
      ...prev,
      [widgetId]: {
        ...prev[widgetId],
        size,
      },
    }));
  }, []);

  /**
   * Reset all widgets to default state
   */
  const resetToDefault = useCallback(() => {
    setWidgetStates(initialStates);
    setCurrentViewName('Default');
  }, [initialStates, setCurrentViewName]);

  /**
   * Save current layout as a view
   */
  const saveView = useCallback((name) => {
    const viewData = {
      name,
      widgetStates,
      savedAt: new Date().toISOString(),
    };
    
    setSavedViews(prev => ({
      ...prev,
      [name]: viewData,
    }));
    
    setCurrentViewName(name);
    return viewData;
  }, [widgetStates, setSavedViews, setCurrentViewName]);

  /**
   * Load a saved view
   */
  const loadView = useCallback((name) => {
    const view = savedViews[name];
    if (view) {
      setWidgetStates(view.widgetStates);
      setCurrentViewName(name);
      return true;
    }
    return false;
  }, [savedViews, setCurrentViewName]);

  /**
   * Delete a saved view
   */
  const deleteView = useCallback((name) => {
    setSavedViews(prev => {
      const { [name]: removed, ...rest } = prev;
      return rest;
    });
    
    if (currentViewName === name) {
      setCurrentViewName('Default');
    }
  }, [currentViewName, setSavedViews, setCurrentViewName]);

  /**
   * Get list of saved view names
   */
  const getSavedViewNames = useCallback(() => {
    return Object.keys(savedViews);
  }, [savedViews]);

  /**
   * Get visible widgets
   */
  const getVisibleWidgets = useCallback(() => {
    return Object.entries(widgetStates)
      .filter(([_, state]) => state.visible)
      .map(([id, state]) => ({ id, ...state }))
      .sort((a, b) => a.order - b.order);
  }, [widgetStates]);

  /**
   * Get widget positions and sizes for saving
   */
  const getWidgetPositionsAndSizes = useCallback(() => {
    const result = {};
    Object.entries(widgetStates).forEach(([id, state]) => {
      if (state.position || state.size) {
        result[id] = {
          position: state.position,
          size: state.size,
        };
      }
    });
    return result;
  }, [widgetStates]);

  /**
   * Apply widget positions and sizes
   */
  const applyWidgetPositionsAndSizes = useCallback((positionsAndSizes) => {
    setWidgetStates(prev => {
      const newStates = { ...prev };
      Object.entries(positionsAndSizes).forEach(([id, { position, size }]) => {
        if (newStates[id]) {
          newStates[id] = {
            ...newStates[id],
            position,
            size,
          };
        }
      });
      return newStates;
    });
  }, []);

  return {
    // State
    widgetStates,
    savedViews,
    currentViewName,

    // Widget operations
    updateWidget,
    toggleWidget,
    toggleMinimize,
    toggleMaximize,
    showWidget,
    hideWidget,
    setWidgetPosition,
    setWidgetSize,
    resetToDefault,

    // View operations
    saveView,
    loadView,
    deleteView,
    getSavedViewNames,

    // Utilities
    getVisibleWidgets,
    getWidgetPositionsAndSizes,
    applyWidgetPositionsAndSizes,

    // Setters
    setWidgetStates,
  };
}

export default useWidgetState;
