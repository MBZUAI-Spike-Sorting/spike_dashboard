import {
  buildLocalSpikeAttributePayload,
  getSpikeAttributeSelection,
} from './spikeAttributes';

const clusteringResults = {
  available: true,
  clusters: [{ clusterId: 4 }, { clusterId: 8 }],
  fullData: [
    [
      { time: 100, channel: 1, x: 0.1, y: 0.2, amplitude: 3, spikeIndex: 12 },
      { time: 200, channel: 2, x: 0.3, y: 0.4, amplitude: 5, spikeIndex: 13 },
    ],
    [{ time: 300, channel: 2, x: 2, y: 3, features: [7, 8], spikeIndex: 20 }],
  ],
};

test('discovers scalar and two-dimensional attributes with provenance', () => {
  const payload = buildLocalSpikeAttributePayload({ clusteringResults, clusterIds: [4, 8] });
  const definitions = Object.fromEntries(payload.attributeDefinitions.map((item) => [item.id, item]));

  expect(definitions.embedding).toMatchObject({ shape: 'two_dimensional' });
  expect(definitions['metadata:amplitude']).toMatchObject({ shape: 'scalar' });
  expect(definitions['metadata:channel'].dimensions[0].unit).toBe('channel_id');
  expect(definitions.features.provenance.source).toBe('retained_feature_vector');
});

test('keeps stable identities for scalar time/value data', () => {
  const payload = buildLocalSpikeAttributePayload({
    clusteringResults,
    clusterIds: [4],
    attributeId: 'metadata:amplitude',
    sampleRateHz: 1000,
  });

  expect(payload.series[0].points[0]).toMatchObject({
    spikeId: '4:12', pointIndex: 0, spikeIndex: 12, timeSeconds: 0.1,
    values: { value: 3 },
  });
});

test('deduplicates exact points selected in the generic explorer', () => {
  const first = { spikeId: '4:12', clusterId: 4, spikeIndex: 12 };
  const second = { spikeId: '8:20', clusterId: 8, spikeIndex: 20 };
  expect(getSpikeAttributeSelection({ points: [
    { customdata: first }, { customdata: second }, { customdata: first },
  ] })).toEqual([first, second]);
});
