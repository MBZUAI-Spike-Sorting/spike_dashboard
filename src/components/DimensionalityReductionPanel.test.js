import { getPcaSpikeSelection } from './DimensionalityReductionPanel';

jest.mock('react-plotly.js', () => () => null);

test('publishes a complete deduplicated stable-ID PCA selection', () => {
  const first = {
    spikeId: '2:10', clusterId: 2, pointIndex: 3, spikeIndex: 10,
    timeSamples: 100, channel: 4,
  };
  const second = {
    spikeId: '2:11', clusterId: 2, pointIndex: 4, spikeIndex: 11,
    timeSamples: 120, channel: 4,
  };

  expect(getPcaSpikeSelection({ points: [
    { customdata: first }, { customdata: second }, { customdata: first },
  ] })).toEqual([first, second]);
});
