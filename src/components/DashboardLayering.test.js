import fs from 'fs';
import path from 'path';

const readStylesheet = (filename) => (
  fs.readFileSync(path.join(__dirname, filename), 'utf8')
);

const getZIndex = (stylesheet, selector) => {
  const selectorStart = stylesheet.indexOf(`${selector} {`);
  if (selectorStart === -1) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }

  const selectorEnd = stylesheet.indexOf('}', selectorStart);
  const declaration = stylesheet
    .slice(selectorStart, selectorEnd)
    .match(/\bz-index:\s*(\d+)\s*;/);

  if (!declaration) {
    throw new Error(`Missing z-index for CSS selector: ${selector}`);
  }

  return Number(declaration[1]);
};

describe('dashboard layer ordering', () => {
  it('keeps the canvas minimap above canvas feedback and below the right menu', () => {
    const canvasStyles = readStylesheet('MultiPanelView.css');
    const menuStyles = readStylesheet('RightSideMenu.css');
    const minimapLayer = getZIndex(canvasStyles, '.canvas-minimap');
    const canvasFeedbackLayers = [
      getZIndex(canvasStyles, '.widget-selection-box'),
      getZIndex(canvasStyles, '.multi-panel-view.drag-over::after'),
      getZIndex(canvasStyles, '.drop-indicator'),
    ];
    const menuBackdropLayer = getZIndex(menuStyles, '.right-menu-overlay');
    const menuLayer = getZIndex(menuStyles, '.right-side-menu');

    expect(minimapLayer).toBeGreaterThan(Math.max(...canvasFeedbackLayers));
    expect(minimapLayer).toBeLessThan(menuBackdropLayer);
    expect(menuBackdropLayer).toBeLessThan(menuLayer);
  });
});
