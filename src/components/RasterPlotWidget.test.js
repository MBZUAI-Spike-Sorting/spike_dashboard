import { panTimeDomain, zoomTimeDomain } from './RasterPlotWidget';

const fullDomain = { start: 0, end: 1000 };

test('zooms around the pointer position on the time axis', () => {
  expect(zoomTimeDomain(fullDomain, fullDomain, 0.5, 0.25)).toEqual({
    start: 125,
    end: 625
  });
});

test('keeps zoomed time windows inside the recording bounds', () => {
  expect(zoomTimeDomain({ start: 0, end: 200 }, fullDomain, 0.5, 0)).toEqual({
    start: 0,
    end: 100
  });
  expect(zoomTimeDomain({ start: 800, end: 1000 }, fullDomain, 0.5, 1)).toEqual({
    start: 900,
    end: 1000
  });
});

test('pans a zoomed time window and clamps at either recording edge', () => {
  expect(panTimeDomain({ start: 300, end: 500 }, fullDomain, 100)).toEqual({
    start: 400,
    end: 600
  });
  expect(panTimeDomain({ start: 800, end: 1000 }, fullDomain, 500)).toEqual({
    start: 800,
    end: 1000
  });
  expect(panTimeDomain({ start: 0, end: 200 }, fullDomain, -500)).toEqual({
    start: 0,
    end: 200
  });
});

test('returns to the full domain when zooming all the way out', () => {
  expect(zoomTimeDomain({ start: 250, end: 750 }, fullDomain, 2)).toBeNull();
});
