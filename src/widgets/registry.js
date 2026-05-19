/**
 * Widget Registry
 * 
 * Central registry for all dashboard widgets. This system allows developers
 * to easily add new widgets by registering them with their metadata and components.
 * 
 * @module widgets/registry
 */

import React from 'react';

/**
 * Widget Categories
 * Add new categories here as needed
 */
export const WIDGET_CATEGORIES = {
  data: { 
    id: 'data',
    name: 'Data Tables', 
    icon: '📁',
    description: 'Widgets for viewing and browsing data'
  },
  analysis: { 
    id: 'analysis',
    name: 'Analysis', 
    icon: '🔬',
    description: 'Widgets for data analysis and statistics'
  },
  visualization: { 
    id: 'visualization',
    name: 'Visualization', 
    icon: '👁️',
    description: 'Widgets for data visualization and plotting'
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    icon: '🧩',
    description: 'User-created custom widgets'
  }
};

/**
 * Widget Registry - stores all registered widgets
 * @type {Map<string, WidgetDefinition>}
 */
const widgetRegistry = new Map();

/**
 * @typedef {Object} WidgetDefinition
 * @property {string} id - Unique identifier for the widget
 * @property {string} name - Display name
 * @property {string} description - Short description
 * @property {string} icon - Emoji or icon identifier
 * @property {string} category - Category ID from WIDGET_CATEGORIES
 * @property {Object} defaultSize - Default width and height
 * @property {number} defaultSize.width - Default width in pixels
 * @property {number} defaultSize.height - Default height in pixels
 * @property {React.Component} component - The React component to render
 * @property {Object} [defaultProps] - Default props for the component
 * @property {string[]} [requiredData] - Data dependencies (e.g., ['clusters', 'spikes'])
 * @property {Object} [dataContract] - Typed inputs accepted by this widget
 * @property {boolean} [resizable] - Whether widget is resizable (default: true)
 * @property {boolean} [closable] - Whether widget can be closed (default: true)
 * @property {number} [minWidth] - Minimum width in pixels
 * @property {number} [minHeight] - Minimum height in pixels
 * @property {number} [order] - Default order in the layout
 */

/**
 * Register a new widget
 * 
 * @param {WidgetDefinition} definition - Widget definition object
 * @throws {Error} If widget ID already exists or required fields are missing
 * 
 * @example
 * registerWidget({
 *   id: 'myWidget',
 *   name: 'My Custom Widget',
 *   description: 'A custom widget that does something cool',
 *   icon: '🎨',
 *   category: 'custom',
 *   defaultSize: { width: 400, height: 300 },
 *   component: MyWidgetComponent,
 *   requiredData: ['clusters'],
 * });
 */
export function registerWidget(definition) {
  // Validate required fields
  const requiredFields = ['id', 'name', 'description', 'icon', 'category', 'defaultSize', 'component'];
  for (const field of requiredFields) {
    if (!definition[field]) {
      throw new Error(`Widget registration failed: missing required field "${field}"`);
    }
  }

  // Validate category
  if (!WIDGET_CATEGORIES[definition.category]) {
    console.warn(`Widget "${definition.id}" has unknown category "${definition.category}". Using "custom" instead.`);
    definition.category = 'custom';
  }

  // Check for duplicate ID
  if (widgetRegistry.has(definition.id)) {
    console.warn(`Widget with ID "${definition.id}" already exists. Overwriting...`);
  }

  // Apply defaults
  const widgetDef = {
    resizable: true,
    closable: true,
    minWidth: 150,
    minHeight: 100,
    order: widgetRegistry.size + 1,
    defaultProps: {},
    requiredData: [],
    ...definition,
  };

  widgetRegistry.set(definition.id, widgetDef);
  console.log(`Widget registered: ${definition.id}`);
  
  return widgetDef;
}

/**
 * Unregister a widget
 * 
 * @param {string} widgetId - ID of widget to remove
 * @returns {boolean} True if widget was removed
 */
export function unregisterWidget(widgetId) {
  return widgetRegistry.delete(widgetId);
}

/**
 * Get a widget definition by ID
 * 
 * @param {string} widgetId - Widget ID
 * @returns {WidgetDefinition|undefined}
 */
export function getWidget(widgetId) {
  return widgetRegistry.get(widgetId);
}

/**
 * Get all registered widgets
 * 
 * @returns {WidgetDefinition[]}
 */
export function getAllWidgets() {
  return Array.from(widgetRegistry.values());
}

/**
 * Get widgets by category
 * 
 * @param {string} categoryId - Category ID
 * @returns {WidgetDefinition[]}
 */
export function getWidgetsByCategory(categoryId) {
  return getAllWidgets().filter(w => w.category === categoryId);
}

/**
 * Get widget definitions as an object (for compatibility)
 * 
 * @returns {Object.<string, WidgetDefinition>}
 */
export function getWidgetDefinitions() {
  const definitions = {};
  widgetRegistry.forEach((value, key) => {
    definitions[key] = value;
  });
  return definitions;
}

/**
 * Get default widget states for all registered widgets
 * 
 * @param {string[]} [visibleWidgetIds] - IDs of widgets that should be visible by default
 * @returns {Object.<string, WidgetState>}
 */
export function getDefaultWidgetStates(visibleWidgetIds = null) {
  const states = {};
  const widgets = getAllWidgets();
  
  widgets.forEach((widget, index) => {
    const isVisible = visibleWidgetIds 
      ? visibleWidgetIds.includes(widget.id)
      : true;
      
    states[widget.id] = {
      visible: isVisible,
      minimized: false,
      maximized: false,
      order: widget.order || index + 1,
      position: null,
      size: null,
    };
  });
  
  return states;
}

/**
 * Check if a widget requires specific data
 * 
 * @param {string} widgetId - Widget ID
 * @param {string} dataType - Data type to check
 * @returns {boolean}
 */
export function widgetRequiresData(widgetId, dataType) {
  const widget = getWidget(widgetId);
  return widget ? widget.requiredData.includes(dataType) : false;
}

/**
 * Get the React component for a widget
 * 
 * @param {string} widgetId - Widget ID
 * @returns {React.Component|null}
 */
export function getWidgetComponent(widgetId) {
  const widget = getWidget(widgetId);
  return widget ? widget.component : null;
}

/**
 * Render a widget by ID
 * 
 * @param {string} widgetId - Widget ID
 * @param {Object} props - Props to pass to the widget
 * @returns {React.Element|null}
 */
export function renderWidget(widgetId, props = {}) {
  const widget = getWidget(widgetId);
  if (!widget) {
    console.error(`Widget "${widgetId}" not found`);
    return null;
  }
  
  const Component = widget.component;
  const mergedProps = { ...widget.defaultProps, ...props };
  
  return <Component {...mergedProps} />;
}

// Export the registry for advanced usage
export { widgetRegistry };

export default {
  WIDGET_CATEGORIES,
  registerWidget,
  unregisterWidget,
  getWidget,
  getAllWidgets,
  getWidgetsByCategory,
  getWidgetDefinitions,
  getDefaultWidgetStates,
  widgetRequiresData,
  getWidgetComponent,
  renderWidget,
};
