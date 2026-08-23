const SRGB_TO_LINEAR = (c) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const COLORMAPS = {
  ocean: ['#04102e', '#083a6b', '#0f6e93', '#27a6a2', '#83d3b6', '#dff0cf'],
  viridis: ['#440154', '#443983', '#31688e', '#21918c', '#35b779', '#90d743', '#fde725'],
  inferno: ['#000004', '#320a5a', '#781c6d', '#bb3654', '#ed6925', '#fdb42f', '#fcffa4'],
  terrain: ['#1d3a8f', '#5aa1d8', '#c9b98a', '#5f9e54', '#8f6f46', '#e8e8e8'],
  grayscale: ['#000000', '#ffffff'],
};

export const DEFAULT_COLORMAP = 'ocean';

const lutCache = new Map();

export function buildLUT(name, size = 256) {
  const key = `${name}:${size}`;
  if (lutCache.has(key)) return lutCache.get(key);

  const stops = COLORMAPS[name] ?? COLORMAPS[DEFAULT_COLORMAP];
  const rgb = stops.map(hexToRgb);
  const lut = new Float32Array(size * 3);
  const segs = rgb.length - 1;

  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segs;
    const s = Math.min(Math.floor(t), segs - 1);
    const f = t - s;
    for (let ch = 0; ch < 3; ch++) {
      const v = rgb[s][ch] + (rgb[s + 1][ch] - rgb[s][ch]) * f;
      lut[i * 3 + ch] = SRGB_TO_LINEAR(v / 255);
    }
  }
  lutCache.set(key, lut);
  return lut;
}
