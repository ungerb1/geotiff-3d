import * as THREE from 'three';

export function worldExtents(hf) {
  const sx = hf.pixelScale?.[0] ?? 1;
  const sy = hf.pixelScale?.[1] ?? 1;
  return {
    width: Math.max(1, (hf.nativeWidth - 1) * sx),
    height: Math.max(1, (hf.nativeHeight - 1) * sy),
  };
}

export function buildTerrainGeometry(hf) {
  const { data, width, height, stats } = hf;
  const { width: worldW, height: worldH } = worldExtents(hf);

  const count = width * height;
  const positions = new Float32Array(count * 3);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      positions[i * 3] = (c / (width - 1) - 0.5) * worldW;
      positions[i * 3 + 1] = Number.isFinite(data[i]) ? data[i] : stats.min;
      positions[i * 3 + 2] = (0.5 - r / (height - 1)) * worldH;
    }
  }

  let quads = 0;
  for (let r = 0; r < height - 1; r++) {
    for (let c = 0; c < width - 1; c++) {
      const i = r * width + c;
      if (
        Number.isFinite(data[i]) &&
        Number.isFinite(data[i + 1]) &&
        Number.isFinite(data[i + width]) &&
        Number.isFinite(data[i + width + 1])
      ) {
        quads++;
      }
    }
  }

  const indices = new Uint32Array(quads * 6);
  let k = 0;
  for (let r = 0; r < height - 1; r++) {
    for (let c = 0; c < width - 1; c++) {
      const a = r * width + c;
      if (
        !Number.isFinite(data[a]) ||
        !Number.isFinite(data[a + 1]) ||
        !Number.isFinite(data[a + width]) ||
        !Number.isFinite(data[a + width + 1])
      ) {
        continue;
      }
      const b = a + 1;
      const d = a + width;
      const e = d + 1;
      indices[k++] = a;
      indices[k++] = d;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = d;
      indices[k++] = e;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export function applyColormap(geometry, lut, min, max) {
  const posAttr = geometry.getAttribute('position');
  const n = posAttr.count;
  let colorAttr = geometry.getAttribute('color');
  if (!colorAttr || colorAttr.count !== n) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geometry.setAttribute('color', colorAttr);
  }
  const colors = colorAttr.array;
  const range = max - min || 1;
  const last = lut.length / 3 - 1;

  for (let i = 0; i < n; i++) {
    const y = posAttr.getY(i);
    let t = (y - min) / range;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const li = Math.round(t * last) * 3;
    colors[i * 3] = lut[li];
    colors[i * 3 + 1] = lut[li + 1];
    colors[i * 3 + 2] = lut[li + 2];
  }
  colorAttr.needsUpdate = true;
}
