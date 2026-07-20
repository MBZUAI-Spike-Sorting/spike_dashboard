export const DEFAULT_DISPLAY_SETTINGS = Object.freeze({
  scale: 1,
  density: 'standard',
});

const VALID_DENSITIES = new Set(['compact', 'standard', 'comfortable']);

export const normalizeDisplaySettings = (settings = {}) => {
  const requestedScale = Number(settings.scale);
  const scale = Number.isFinite(requestedScale)
    ? Math.min(1.25, Math.max(0.85, Math.round(requestedScale * 20) / 20))
    : DEFAULT_DISPLAY_SETTINGS.scale;
  const density = VALID_DENSITIES.has(settings.density)
    ? settings.density
    : DEFAULT_DISPLAY_SETTINGS.density;

  return { scale, density };
};

export const readDisplaySettings = (storage, key) => {
  try {
    const saved = storage?.getItem(key);
    return saved
      ? normalizeDisplaySettings(JSON.parse(saved))
      : { ...DEFAULT_DISPLAY_SETTINGS };
  } catch (error) {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
};

