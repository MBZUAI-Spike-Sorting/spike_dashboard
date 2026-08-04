import { useEffect, useState } from 'react';
import apiClient from '../api/client';
import { buildLocalFeaturePayload } from '../utils/featureViews';
import {
  createSessionCacheKey,
  getOrLoadSessionCache,
  getSessionObjectId,
} from '../utils/sessionCache';

const useFeatureViewData = ({
  widgetId,
  loadingMessage,
  clusterIds,
  selectedChannels,
  maxSpikesPerCluster,
  includeBackground,
  maxBackgroundSpikes = 5000,
  clusterData,
  clusteringResults,
  selectedAlgorithm,
  datasetInfo,
  demoMode,
  dataCacheScope,
  onLoadingChange,
}) => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sampleRateHz = Number(datasetInfo?.sampleRateHz ?? datasetInfo?.samplingRate ?? 30000);

  useEffect(() => {
    onLoadingChange?.(widgetId, loading, loadingMessage);
  }, [loading, loadingMessage, onLoadingChange, widgetId]);

  useEffect(() => {
    if (clusterIds.length === 0) {
      setResult(null);
      setError('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        const cacheKey = createSessionCacheKey('widget-data', [
          dataCacheScope,
          widgetId,
          clusterIds,
          selectedChannels,
          maxSpikesPerCluster,
          includeBackground,
          maxBackgroundSpikes,
          demoMode ? getSessionObjectId(clusteringResults || clusterData) : selectedAlgorithm,
        ]);
        const payload = await getOrLoadSessionCache(cacheKey, () => demoMode
          ? buildLocalFeaturePayload({
              clusterData,
              clusteringResults,
              clusterIds,
              sampleRateHz,
              maxSpikesPerCluster,
              includeBackground,
              maxBackgroundSpikes,
              selectedChannels,
            })
          : apiClient.getClusterFeatures({
              clusterIds,
              algorithm: selectedAlgorithm,
              maxSpikesPerCluster,
              includeBackground,
              maxBackgroundSpikes,
              selectedChannels,
            }));
        if (!cancelled) setResult(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || 'Unable to load spike features.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [
    clusterData,
    clusterIds,
    clusteringResults,
    dataCacheScope,
    demoMode,
    includeBackground,
    maxBackgroundSpikes,
    maxSpikesPerCluster,
    sampleRateHz,
    selectedAlgorithm,
    selectedChannels,
    widgetId,
  ]);

  return { result, loading, error };
};

export default useFeatureViewData;
