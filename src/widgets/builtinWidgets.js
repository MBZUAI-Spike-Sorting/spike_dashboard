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
import RasterPlotWidget from '../components/RasterPlotWidget';
import CorrelogramWidget from '../components/CorrelogramWidget';
import IsiHistogramWidget from '../components/IsiHistogramWidget';
import AmplitudeTimeWidget from '../components/AmplitudeTimeWidget';
import SpikeAttributeExplorerWidget from '../components/SpikeAttributeExplorerWidget';
import TemplateGalleryWidget from '../components/TemplateGalleryWidget';
import ClusterMetricScatterWidget from '../components/ClusterMetricScatterWidget';
import FeatureMatrixWidget from '../components/FeatureMatrixWidget';
import TemplateFeaturePairWidget from '../components/TemplateFeaturePairWidget';
import ProbeMapWidget from '../components/ProbeMapWidget';
import TraceHeatmapWidget from '../components/TraceHeatmapWidget';
import SimilarityTableWidget from '../components/SimilarityTableWidget';
import FiringRateTimelineWidget from '../components/FiringRateTimelineWidget';

/**
 * Built-in widget definitions
 * 
 * Each widget defines its metadata and component reference.
 * The component will be rendered inside a DockableWidget container.
 */
const BUILTIN_WIDGETS = [
  {
    id: 'clusterList',
    name: 'Cluster Curation Table',
    description: 'Sort, filter, label, annotate, and select clusters across linked widgets',
    icon: '📋',
    category: 'data',
    defaultSize: { width: 760, height: 430 },
    minWidth: 460,
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
    name: 'Amplitude Distribution',
    description: 'Waveform amplitude histograms with Gaussian KDE overlays',
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
  {
    id: 'rasterPlot',
    name: 'Raster Plot',
    description: 'Compact spike-event raster grouped by cluster or channel',
    icon: '|',
    category: 'visualization',
    defaultSize: { width: 760, height: 420 },
    minWidth: 420,
    minHeight: 260,
    component: RasterPlotWidget,
    requiredData: ['spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.rasterPlot,
    order: 10,
  },
  {
    id: 'correlogram',
    name: 'Correlogram Matrix',
    description: 'Auto- and cross-correlograms with refractory and baseline guides',
    icon: '▦',
    category: 'analysis',
    defaultSize: { width: 820, height: 620 },
    minWidth: 420,
    minHeight: 300,
    component: CorrelogramWidget,
    requiredData: ['clusters', 'spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.correlogram,
    order: 11,
  },
  {
    id: 'isiHistogram',
    name: 'ISI Histogram',
    description: 'Inter-spike intervals and refractory-period violation rates',
    icon: 'Ι',
    category: 'analysis',
    defaultSize: { width: 700, height: 430 },
    minWidth: 360,
    minHeight: 260,
    component: IsiHistogramWidget,
    requiredData: ['clusters', 'spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.isiHistogram,
    order: 12,
  },
  {
    id: 'amplitudeTime',
    name: 'Amplitude vs Time / Drift',
    description: 'Track raw spike amplitude through the recording and brush time ranges',
    icon: '↘',
    category: 'visualization',
    defaultSize: { width: 760, height: 440 },
    minWidth: 400,
    minHeight: 280,
    component: AmplitudeTimeWidget,
    requiredData: ['clusters', 'spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.amplitudeTime,
    order: 13,
  },
  {
    id: 'firingRateTimeline',
    name: 'Firing Rate Timeline',
    description: 'Inspect cluster activity and stability across recording time',
    icon: '⌁',
    category: 'analysis',
    defaultSize: { width: 760, height: 440 },
    minWidth: 400,
    minHeight: 280,
    component: FiringRateTimelineWidget,
    requiredData: ['clusters', 'spikes'],
    dataContract: WIDGET_DATA_CONTRACTS.firingRateTimeline,
    order: 14,
  },
  {
    id: 'similarityTable',
    name: 'Similarity Table',
    description: 'Rank and review clusters similar to the primary cluster',
    icon: '≈',
    category: 'analysis',
    defaultSize: { width: 760, height: 480 },
    minWidth: 480,
    minHeight: 280,
    component: SimilarityTableWidget,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.similarityTable,
    order: 15,
  },
  {
    id: 'probeMap',
    name: 'Probe Map',
    description: 'Inspect physical channel geometry and selected-cluster footprints',
    icon: '⌇',
    category: 'visualization',
    defaultSize: { width: 560, height: 620 },
    minWidth: 360,
    minHeight: 300,
    component: ProbeMapWidget,
    requiredData: ['datasetInfo'],
    dataContract: WIDGET_DATA_CONTRACTS.probeMap,
    order: 16,
  },
  {
    id: 'traceHeatmap',
    name: 'Trace Heatmap',
    description: 'Downsampled all-channel trace image with linked time navigation',
    icon: '▥',
    category: 'visualization',
    defaultSize: { width: 820, height: 520 },
    minWidth: 440,
    minHeight: 300,
    component: TraceHeatmapWidget,
    requiredData: ['datasetInfo'],
    dataContract: WIDGET_DATA_CONTRACTS.traceHeatmap,
    order: 17,
  },
  {
    id: 'featureMatrix',
    name: 'Feature Matrix',
    description: 'Compare retained spike features and lasso exact spikes for curation',
    icon: '▩',
    category: 'analysis',
    defaultSize: { width: 860, height: 680 },
    minWidth: 460,
    minHeight: 340,
    component: FeatureMatrixWidget,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.featureMatrix,
    order: 18,
  },
  {
    id: 'templateFeaturePair',
    name: 'Template Feature Pair',
    description: 'Review pairwise separation for exactly two linked clusters',
    icon: '⋈',
    category: 'analysis',
    defaultSize: { width: 720, height: 500 },
    minWidth: 400,
    minHeight: 280,
    component: TemplateFeaturePairWidget,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.templateFeaturePair,
    order: 19,
  },
  {
    id: 'templateGallery',
    name: 'Template Gallery',
    description: 'Browse ordered retained templates or deterministic mean waveforms',
    icon: '〽',
    category: 'visualization',
    defaultSize: { width: 840, height: 620 },
    minWidth: 440,
    minHeight: 320,
    component: TemplateGalleryWidget,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.templateGallery,
    order: 20,
  },
  {
    id: 'clusterMetricScatter',
    name: 'Cluster Metric Scatter',
    description: 'Compare the visible cluster population across configurable quality metrics',
    icon: '⠿',
    category: 'analysis',
    defaultSize: { width: 740, height: 500 },
    minWidth: 400,
    minHeight: 280,
    component: ClusterMetricScatterWidget,
    requiredData: ['clusters', 'statistics'],
    dataContract: WIDGET_DATA_CONTRACTS.clusterMetricScatter,
    order: 21,
  },
  {
    id: 'spikeAttributeExplorer',
    name: 'Spike Attribute Explorer',
    description: 'Discover and plot compatible retained scalar or two-dimensional spike attributes',
    icon: '◇',
    category: 'analysis',
    defaultSize: { width: 760, height: 500 },
    minWidth: 400,
    minHeight: 280,
    component: SpikeAttributeExplorerWidget,
    requiredData: ['clusters'],
    dataContract: WIDGET_DATA_CONTRACTS.spikeAttributeExplorer,
    order: 22,
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
