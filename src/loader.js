import { fromArrayBuffer } from 'geotiff';

export const DEFAULT_MAX_GRID = 1024;

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

export async function loadHeightfield(arrayBuffer, { maxGrid = DEFAULT_MAX_GRID } = {}) {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();

  const shrink = Math.max(1, Math.max(width, height) / maxGrid);
  const gridW = Math.max(2, Math.round(width / shrink));
  const gridH = Math.max(2, Math.round(height / shrink));

  const rasters = await image.readRasters({
    samples: [0],
    width: gridW,
    height: gridH,
    resampleMethod: 'bilinear',
  });
  const data = Float32Array.from(rasters[0]);

  const fd = image.getFileDirectory();
  const nodata = toFinite(await readTag(fd, 'GDAL_NODATA'));
  let valid = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v) || (nodata !== null && v === nodata)) {
      data[i] = NaN;
    } else {
      valid++;
    }
  }
  if (valid === 0) throw new Error('No valid elevation data found in the first band.');

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  const pixelScale = (await readTag(fd, 'ModelPixelScale')) ?? null;
  await readTag(fd, 'GeoKeyDirectory');
  const geoKeys = image.getGeoKeys() ?? {};
  const epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey || null;

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
