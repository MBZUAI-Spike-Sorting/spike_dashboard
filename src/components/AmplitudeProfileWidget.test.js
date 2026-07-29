jest.mock('react-plotly.js', () => () => null);

import {
  getProfiles,
  resolveAmplitudeWaveforms,
} from './AmplitudeProfileWidget';

test('connects the contract-named waveforms input while retaining the legacy alias', () => {
  const contractWaveforms = { 4: [{ amplitude: [-2, 3] }] };
  const legacyWaveforms = { 4: [{ amplitude: [-1, 2] }] };

  expect(resolveAmplitudeWaveforms(contractWaveforms, legacyWaveforms))
    .toBe(contractWaveforms);
  expect(resolveAmplitudeWaveforms(undefined, legacyWaveforms))
    .toBe(legacyWaveforms);
});

test('builds amplitude profiles from connected waveform data', () => {
  const profiles = getProfiles({
    selectedClusters: [4],
    clusterWaveforms: {
      4: [
        { amplitude: [-2, 1, 3] },
        { amplitude: [-1, 2] },
      ],
    },
  });

  expect(profiles).toEqual([
    expect.objectContaining({
      id: 4,
      label: 'Cluster 4',
      values: [5, 3],
    }),
  ]);
});
