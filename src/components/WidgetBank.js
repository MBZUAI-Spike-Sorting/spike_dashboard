import React, { useState, useRef, useEffect } from 'react';
import './WidgetBank.css';

// Widget definitions with icons and metadata
const WIDGET_DEFINITIONS = {
  clusterList: {
    id: 'clusterList',
    name: 'Cluster Curation Table',
    description: 'Sort, filter, label, annotate, and select clusters across linked widgets',
    icon: '📋',
    category: 'data',
    defaultSize: { width: 760, height: 430 }
  },
  spikeList: {
    id: 'spikeList',
    name: 'Spike List Table',
    description: 'Browse spike events chronologically',
    icon: '⚡',
    category: 'data',
    defaultSize: { width: 200, height: 350 }
  },
  clusterStats: {
    id: 'clusterStats',
    name: 'Cluster Statistics',
    description: 'ISI violations, spike counts, quality metrics',
    icon: '📊',
    category: 'analysis',
    defaultSize: { width: 200, height: 350 }
  },
  signalView: {
    id: 'signalView',
    name: 'Signal View',
    description: 'Raw/filtered neural signal traces',
    icon: '📈',
    category: 'visualization',
    defaultSize: { width: 600, height: 350 }
  },
  dimReduction: {
    id: 'dimReduction',
    name: 'PCA Plot',
    description: 'Dimensionality reduction visualization',
    icon: '🎯',
    category: 'visualization',
    defaultSize: { width: 500, height: 400 }
  },
  waveform: {
    id: 'waveform',
    name: 'Waveform View',
    description: 'Spike waveform overlays',
    icon: '〰️',
    category: 'visualization',
    defaultSize: { width: 500, height: 400 }
  },
  amplitudeProfile: {
    id: 'amplitudeProfile',
    name: 'Amplitude Distribution',
    description: 'Waveform amplitude histograms with Gaussian KDE overlays',
    icon: 'A',
    category: 'visualization',
    defaultSize: { width: 620, height: 430 }
  },
  clusterComparison: {
    id: 'clusterComparison',
    name: 'Cluster Comparison',
    description: 'Compare spike-time agreement between two cluster sets',
    icon: 'C',
    category: 'analysis',
    defaultSize: { width: 820, height: 500 }
  },
  curator: {
    id: 'curator',
    name: 'Curator',
    description: 'Review one cluster set and drive linked analysis widgets',
    icon: 'R',
    category: 'analysis',
    defaultSize: { width: 760, height: 480 }
  },
  rasterPlot: {
    id: 'rasterPlot',
    name: 'Raster Plot',
    description: 'Compact spike-event raster grouped by cluster or channel',
    icon: '|',
    category: 'visualization',
    defaultSize: { width: 760, height: 420 }
  },
  correlogram: {
    id: 'correlogram',
    name: 'Correlogram Matrix',
    description: 'Auto- and cross-correlograms with refractory and baseline guides',
    icon: '▦',
    category: 'analysis',
    defaultSize: { width: 820, height: 620 }
  },
  isiHistogram: {
    id: 'isiHistogram',
    name: 'ISI Histogram',
    description: 'Inter-spike intervals and refractory-period violation rates',
    icon: 'Ι',
    category: 'analysis',
    defaultSize: { width: 700, height: 430 }
  },
  amplitudeTime: {
    id: 'amplitudeTime',
    name: 'Amplitude vs Time / Drift',
    description: 'Track raw spike amplitude through the recording and brush time ranges',
    icon: '↘',
    category: 'visualization',
    defaultSize: { width: 760, height: 440 }
  }
};

const CATEGORIES = {
  data: { name: 'Data Tables', icon: '📁' },
  analysis: { name: 'Analysis', icon: '🔬' },
  visualization: { name: 'Visualization', icon: '👁️' }
};

const WidgetBank = ({ 
  isOpen, 
  onClose, 
  widgetStates, 
  onAddWidget,
  onToggleWidget 
}) => {
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const bankRef = useRef(null);

  // Filter widgets based on search and category
  const filteredWidgets = Object.values(WIDGET_DEFINITIONS).filter(widget => {
    const matchesSearch = widget.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          widget.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group widgets by category
  const groupedWidgets = filteredWidgets.reduce((acc, widget) => {
    const category = widget.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(widget);
    return acc;
  }, {});

  // Handle drag start
  const handleDragStart = (e, widget) => {
    setDraggedWidget(widget);
    e.dataTransfer.setData('application/json', JSON.stringify(widget));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Create custom drag image
    const dragImage = document.createElement('div');
    dragImage.className = 'widget-drag-preview';
    dragImage.innerHTML = `
      <span class="drag-icon">${widget.icon}</span>
      <span class="drag-name">${widget.name}</span>
    `;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 25);
    
    // Cleanup drag image after a short delay
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
  };

  const getWidgetActiveCount = (widgetId) => {
    return Object.entries(widgetStates || {}).filter(([instanceId, state]) => (
      state?.visible && (state.type || instanceId.split('__')[0]) === widgetId
    )).length;
  };

  const handleWidgetClick = (widget) => {
    onAddWidget(widget);
    onClose();
  };

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (bankRef.current && !bankRef.current.contains(e.target) && 
          !e.target.closest('.widget-bank-floating-toggle')) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="widget-bank-overlay">
      <div className="widget-bank" id="widget-bank" ref={bankRef}>
        <div className="widget-bank-header">
          <h3>
            <span className="header-icon">🧩</span>
            Widget Bank
          </h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="widget-bank-search">
          <input
            type="text"
            placeholder="Search widgets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="widget-bank-categories">
          <button
            className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              className={`category-btn ${selectedCategory === key ? 'active' : ''}`}
              onClick={() => setSelectedCategory(key)}
            >
              <span className="cat-icon">{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        <div className="widget-bank-content">
          <p className="drag-hint">
            <span className="hint-icon">💡</span>
            Drag widgets to the canvas or click to add another
          </p>

          {Object.entries(groupedWidgets).map(([category, widgets]) => (
            <div key={category} className="widget-category-group">
              <h4 className="category-title">
                <span>{CATEGORIES[category]?.icon}</span>
                {CATEGORIES[category]?.name || category}
              </h4>
              <div className="widget-items">
                {widgets.map(widget => {
                  const activeCount = getWidgetActiveCount(widget.id);
                  const visible = activeCount > 0;
                  return (
                    <div
                      key={widget.id}
                      className={`widget-bank-item ${visible ? 'active' : ''} ${draggedWidget?.id === widget.id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, widget)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleWidgetClick(widget)}
                    >
                      <div className="widget-item-icon">{widget.icon}</div>
                      <div className="widget-item-info">
                        <span className="widget-item-name">{widget.name}</span>
                        <span className="widget-item-desc">{widget.description}</span>
                      </div>
                      <div className={`widget-status ${visible ? 'visible' : 'hidden'}`}>
                        {visible ? '✓' : '+'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredWidgets.length === 0 && (
            <div className="no-results">
              <span className="no-results-icon">🔎</span>
              <p>No widgets found</p>
            </div>
          )}
        </div>

        <div className="widget-bank-footer">
          <span className="widget-count">
            {Object.values(widgetStates).filter(w => w.visible).length} / {Object.keys(WIDGET_DEFINITIONS).length} active
          </span>
        </div>
      </div>
    </div>
  );
};

// Export widget definitions for use in other components
export { WIDGET_DEFINITIONS, CATEGORIES };
export default WidgetBank;
