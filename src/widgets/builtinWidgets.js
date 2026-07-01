/**
 * Built-in Widget Registration
 * 
 * This file registers all built-in widgets with the widget registry.
 * Import and call initializeBuiltinWidgets() at app startup.
 * 
 * @module widgets/builtinWidgets
 */

import { registerWidget } from './registry';
import { WIDGET_DATA_CONTRACTS } from './dataContracts';

// Import built-in widget components
import ClusterListTable from '../components/ClusterListTable';
import SpikeListTable from '../components/SpikeListTable';
import ClusterStatisticsWindow from '../components/ClusterStatisticsWindow';
import SignalViewPanel from '../components/SignalViewPanel';
import DimensionalityReductionPanel from '../components/DimensionalityReductionPanel';
import WaveformSingleChannelView from '../components/WaveformSingleChannelView';
import AmplitudeProfileWidget from '../components/AmplitudeProfileWidget';
import ClusterComparisonWidget from '../components/ClusterComparisonWidget';
import CuratorWidget from '../components/CuratorWidget';

/**
 * Built-in widget definitions
 * 
 * Each widget defines its metadata and component reference.
 * The component will be rendered inside a DockableWidget container.
 */
const BUILTIN_WIDGETS = [
  {
    id: 'clusterList',
    name: 'Cluster List',
    description: 'View and select neuron clusters',
    icon: '📋',
    category: 'data',
    defaultSize: { width: 180, height: 350 },
    minWidth: 150,
    minHeight: 200,
    component: ClusterListTable,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.clusterList,
    order: 1,
  },
  {
    id: 'spikeList',
    name: 'Spike List Table',
    description: 'Browse spike events chronologically',
    icon: '⚡',
    category: 'data',
    defaultSize: { width: 200, height: 350 },
    minWidth: 180,
    minHeight: 200,
    component: SpikeListTable,
    requiredData: ['spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.spikeList,
    order: 2,
  },
  {
    id: 'clusterStats',
    name: 'Cluster Statistics',
    description: 'ISI violations, spike counts, quality metrics',
    icon: '📊',
    category: 'analysis',
    defaultSize: { width: 200, height: 350 },
    minWidth: 180,
    minHeight: 200,
    component: ClusterStatisticsWindow,
    requiredData: ['clusters', 'statistics'],
    dataContract: WIDGET_DATA_CONTRACTS.clusterStats,
    order: 3,
  },
  {
    id: 'signalView',
    name: 'Signal View',
    description: 'Raw/filtered neural signal traces',
    icon: '📈',
    category: 'visualization',
    defaultSize: { width: 600, height: 350 },
    minWidth: 400,
    minHeight: 250,
    component: SignalViewPanel,
    requiredData: ['signal'],
    dataContract: WIDGET_DATA_CONTRACTS.signalView,
    order: 4,
  },
  {
    id: 'dimReduction',
    name: 'PCA Plot',
    description: 'Dimensionality reduction visualization',
    icon: '🎯',
    category: 'visualization',
    defaultSize: { width: 500, height: 400 },
    minWidth: 350,
    minHeight: 300,
    component: DimensionalityReductionPanel,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.dimReduction,
    order: 5,
  },
  {
    id: 'waveform',
    name: 'Waveform View',
    description: 'Spike waveform overlays',
    icon: '〰️',
    category: 'visualization',
    defaultSize: { width: 500, height: 400 },
    minWidth: 350,
    minHeight: 300,
    component: WaveformSingleChannelView,
    requiredData: ['waveforms'],
    dataContract: WIDGET_DATA_CONTRACTS.waveform,
    order: 6,
  },
  {
    id: 'amplitudeProfile',
    name: 'Amplitude Profile',
    description: 'Amplitude histograms with Gaussian KDE overlays',
    icon: 'A',
    category: 'visualization',
    defaultSize: { width: 620, height: 430 },
    minWidth: 360,
    minHeight: 260,
    component: AmplitudeProfileWidget,
    requiredData: ['clusters', 'waveforms'],
    dataContract: WIDGET_DATA_CONTRACTS.amplitudeProfile,
    order: 7,
  },
  {
    id: 'clusterComparison',
    name: 'Cluster Comparison',
    description: 'Compare spike-time agreement between two cluster sets',
    icon: 'C',
    category: 'analysis',
    defaultSize: { width: 820, height: 500 },
    minWidth: 520,
    minHeight: 320,
    component: ClusterComparisonWidget,
    requiredData: [],
    dataContract: WIDGET_DATA_CONTRACTS.clusterComparison,
    order: 8,
  },
  {
    id: 'curator',
    name: 'Curator',
    description: 'Review one cluster set and drive linked analysis widgets',
    icon: 'R',
    category: 'analysis',
    defaultSize: { width: 760, height: 480 },
    minWidth: 480,
    minHeight: 300,
    component: CuratorWidget,
    requiredData: [],
    dataContract: WIDGET_DATA_CONTRACTS.curator,
    order: 9,
  },
];

/**
 * Initialize and register all built-in widgets
 * Call this function at application startup
 * 
 * @returns {void}
 */
export function initializeBuiltinWidgets() {
  console.log('Initializing built-in widgets...');
  
  BUILTIN_WIDGETS.forEach(widget => {
    try {
      registerWidget(widget);
    } catch (error) {
      console.error(`Failed to register widget "${widget.id}":`, error);
    }
  });
  
  console.log(`Registered ${BUILTIN_WIDGETS.length} built-in widgets`);
}

/**
 * Get list of built-in widget IDs
 * Useful for determining which widgets are built-in vs custom
 * 
 * @returns {string[]}
 */
export function getBuiltinWidgetIds() {
  return BUILTIN_WIDGETS.map(w => w.id);
}

export { BUILTIN_WIDGETS };
export default initializeBuiltinWidgets;
