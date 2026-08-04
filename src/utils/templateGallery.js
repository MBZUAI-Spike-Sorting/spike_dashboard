const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clusterIdOf = (cluster, fallback) => cluster?.clusterId ?? cluster?.id ?? fallback;

const waveformValues = (waveform) => {
  const candidate = Array.isArray(waveform) ? waveform : waveform?.amplitude;
  if (!Array.isArray(candidate) || candidate.length < 2) return null;
  const values = candidate.map(finiteNumber);
  return values.every((value) => value !== null) ? values : null;
};

const meanWaveform = (waveforms) => {
  const valid = (waveforms || []).map(waveformValues).filter(Boolean);
  if (!valid.length) return null;
  const length = Math.min(...valid.map((waveform) => waveform.length));
  return Array.from({ length }, (_, index) => (
    valid.reduce((sum, waveform) => sum + waveform[index], 0) / valid.length
  ));
};

const retainedTemplate = (cluster) => {
  const candidates = [
    cluster?.templateWaveform,
    cluster?.template_waveform,
    cluster?.meanWaveform,
    cluster?.mean_waveform,
    cluster?.template,
  ];
  return candidates.map(waveformValues).find(Boolean) || null;
};

export const buildLocalTemplateGallery = ({
  clusterIds = [],
  clusterData = null,
  clusterWaveforms = {},
  sampleRateHz = 30000,
} = {}) => {
  const clusters = clusterData?.clusters || [];
  const rate = Math.max(finiteNumber(sampleRateHz) ?? 30000, 1);
  const templates = clusterIds.map((clusterId) => {
    const cluster = clusters.find((candidate, index) => (
      String(clusterIdOf(candidate, index)) === String(clusterId)
    ));
    let template = retainedTemplate(cluster);
    let source = 'retained_template';
    let sampledWaveforms = 0;
    if (!template) {
      const waveforms = clusterWaveforms[clusterId]
        || clusterWaveforms[String(clusterId)]
        || cluster?.waveforms
        || [];
      template = meanWaveform(waveforms);
      sampledWaveforms = waveforms.length;
      source = template ? 'mean_demo_waveform' : 'unavailable';
    }
    const values = template || [];
    const center = (values.length - 1) / 2;
    return {
      clusterId,
      template: values,
      timePointsMs: values.map((_, index) => (index - center) * 1000 / rate),
      source,
      retainedKey: source === 'retained_template' ? 'cluster_metadata' : null,
      peakChannel: cluster?.primaryChannel ?? cluster?.channelId
        ?? cluster?.spikeChannels?.[0] ?? null,
      numSpikes: cluster?.pointCount ?? cluster?.numSpikes
        ?? cluster?.spikeTimes?.length ?? 0,
      sampledWaveforms,
      peakToPeak: values.length ? Math.max(...values) - Math.min(...values) : null,
    };
  });
  return { clusterIds, sampleRateHz: rate, templates };
};
