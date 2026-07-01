/**
 * Components Module Entry Point
 * 
 * Re-exports all components for easy importing.
 */

// Common components
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as ErrorBoundary, ErrorFallback, withErrorBoundary } from './ErrorBoundary';
export { default as DockableWidget } from './DockableWidget';

// Layout components
export { default as Header } from './Header';
export { default as Sidebar } from './Sidebar';
export { default as RightSideMenu } from './RightSideMenu';
export { default as WidgetBank } from './WidgetBank';
export { default as ViewManager } from './ViewManager';

// Form components
export { default as DatasetSelector } from './DatasetSelector';
export { default as DataTypeSelector } from './DataTypeSelector';
export { default as ChannelSelector } from './ChannelSelector';
export { default as Upload } from './Upload';
export { default as AlgorithmParametersMenu } from './AlgorithmParametersMenu';

// Visualization components
export { default as ClusterView } from './ClusterView';
export { default as MultiPanelView } from './MultiPanelView';
export { default as VisualizationArea } from './VisualizationArea';
export { default as SignalViewPanel } from './SignalViewPanel';
export { default as DimensionalityReductionPanel } from './DimensionalityReductionPanel';
export { default as AmplitudeProfileWidget } from './AmplitudeProfileWidget';
export { default as ClusterComparisonWidget } from './ClusterComparisonWidget';
export { default as CuratorWidget } from './CuratorWidget';

// Data display components  
export { default as ClusterListTable } from './ClusterListTable';
export { default as SpikeListTable } from './SpikeListTable';
export { default as ClusterStatisticsWindow } from './ClusterStatisticsWindow';

// Signal components
export { default as SpikeChannel } from './SpikeChannel';
export { default as SpikeGrid } from './SpikeGrid';
export { default as Timeline } from './Timeline';
export { default as ChannelGrid } from './ChannelGrid';

// Waveform components
export { default as WaveformSingleChannelView } from './WaveformSingleChannelView';
export { default as WaveformNeighboringChannelsView } from './WaveformNeighboringChannelsView';

// Analysis components
export { default as RuntimeAnalysisView } from './RuntimeAnalysisView';

// Sub-components (from feature folders)
export * from './visualization';
export * from './common';
