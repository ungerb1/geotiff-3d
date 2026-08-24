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
    const y0 = Math.floor((gy * h) / gh);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor((gx * w) / gw);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / gw));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        let i = y * w + x0;
        for (let x = x0; x < x1; x++, i++) {
          const v = src[i];
          if (Number.isFinite(v)) {
            sum += v;
            count++;
          }
        }
      }
      out[gy * gw + gx] = count > 0 ? sum / count : NaN;
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
