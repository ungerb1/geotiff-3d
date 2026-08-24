import { fromArrayBuffer } from 'geotiff';

const DEFAULT_MAX_GRID = 1024;
const NATIVE_READ_CELL_CAP = 64e6;

async function readTag(fd, tag) {
  try {
    if (typeof fd.loadValue === 'function') return await fd.loadValue(tag);
    return fd[tag];
  } catch {
    return undefined;
  }
}

function toFinite(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function downsampleBox(src, w, h, gw, gh) {
  const out = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    const sy0 = (gy * h) / gh;
    const sy1 = ((gy + 1) * h) / gh;
    const iy0 = Math.floor(sy0);
    const iy1 = Math.min(h - 1, Math.ceil(sy1) - 1);
    for (let gx = 0; gx < gw; gx++) {
      const sx0 = (gx * w) / gw;
      const sx1 = ((gx + 1) * w) / gw;
      const ix0 = Math.floor(sx0);
      const ix1 = Math.min(w - 1, Math.ceil(sx1) - 1);
      let sum = 0;
      let wsum = 0;
      for (let y = iy0; y <= iy1; y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        if (wy <= 0) continue;
        const row = y * w;
        for (let x = ix0; x <= ix1; x++) {
          const v = src[row + x];
          if (!Number.isFinite(v)) continue;
          const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
          if (wx <= 0) continue;
          sum += v * wx * wy;
          wsum += wx * wy;
        }
      }
      out[gy * gw + gx] = wsum > 0 ? sum / wsum : NaN;
    }
  }
  return out;
}

function maskNodata(data, nodata) {
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v) || (nodata !== null && v === nodata)) {
      data[i] = NaN;
    }
  }
}

export async function loadHeightfield(arrayBuffer, { maxGrid = DEFAULT_MAX_GRID } = {}) {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();

  const shrink = Math.max(1, Math.max(width, height) / maxGrid);
  const gridW = Math.max(2, Math.round(width / shrink));
  const gridH = Math.max(2, Math.round(height / shrink));

  const fd = image.getFileDirectory();
  const nodata = toFinite(await readTag(fd, 'GDAL_NODATA'));
  const pixelScale = (await readTag(fd, 'ModelPixelScale')) ?? null;
  await readTag(fd, 'GeoKeyDirectory');
  const geoKeys = image.getGeoKeys() ?? {};
  const epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey || null;

  let data;
  if (width * height <= NATIVE_READ_CELL_CAP) {
    const raw = Float32Array.from((await image.readRasters({ samples: [0] }))[0]);
    maskNodata(raw, nodata);
    data = shrink > 1 ? downsampleBox(raw, width, height, gridW, gridH) : raw;
  } else {
    data = Float32Array.from(
      (
        await image.readRasters({
          samples: [0],
          width: gridW,
          height: gridH,
          resampleMethod: 'bilinear',
        })
      )[0]
    );
    maskNodata(data, nodata);
  }

  let valid = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    valid++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (valid === 0) throw new Error('No valid elevation data found in the first band.');

  return {
    data,
    width: gridW,
    height: gridH,
    nativeWidth: width,
    nativeHeight: height,
    stats: { min, max },
    pixelScale,
    epsg,
  };
}
