import { buildLocalTemplateGallery } from './templateGallery';

test('preserves the shared visible cluster order and retained templates', () => {
  const payload = buildLocalTemplateGallery({
    clusterIds: [12, 4],
    clusterData: {
      clusters: [
        { clusterId: 4, templateWaveform: [-1, 2, 0] },
        { clusterId: 12, templateWaveform: [-2, 4, 1] },
      ],
    },
    sampleRateHz: 1000,
  });

  expect(payload.clusterIds).toEqual([12, 4]);
  expect(payload.templates.map((template) => template.clusterId)).toEqual([12, 4]);
  expect(payload.templates[0]).toMatchObject({ source: 'retained_template', peakToPeak: 6 });
  expect(payload.templates[0].timePointsMs).toEqual([-1, 0, 1]);
});

test('uses a deterministic mean of demo waveforms when templates are absent', () => {
  const payload = buildLocalTemplateGallery({
    clusterIds: [3],
    clusterData: { clusters: [{ clusterId: 3, spikeTimes: [10, 20] }] },
    clusterWaveforms: {
      3: [{ amplitude: [-1, 2, 0] }, { amplitude: [-3, 4, 2] }],
    },
  });

  expect(payload.templates[0]).toMatchObject({
    source: 'mean_demo_waveform',
    template: [-2, 3, 1],
    sampledWaveforms: 2,
  });
});
