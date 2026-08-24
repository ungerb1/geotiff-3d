import assert from 'node:assert/strict';
import { buildTerrainGeometry } from '../src/mesh.js';

// Synthetic 4x4 heightfield, flat elevation, 1 m pixel scale
const n = 4;
const data = new Float32Array(n * n).fill(10);
const hf = {
  data,
  width: n,
  height: n,
  nativeWidth: n,
  nativeHeight: n,
  stats: { min: 10, max: 10 },
  pixelScale: [1, 1, 0],
  epsg: null,
};

const g = buildTerrainGeometry(hf);
g.computeBoundingBox();
const pos = g.getAttribute('position');
const nrm = g.getAttribute('normal');

const zOfRow = (r) => pos.getZ(r * n);
assert.ok(zOfRow(0) < 0, `row 0 (north) must be at -Z, got ${zOfRow(0)}`);
assert.ok(zOfRow(n - 1) > 0, `last row (south) must be at +Z, got ${zOfRow(n - 1)}`);
assert.equal(g.boundingBox.min.z, -1.5);
assert.equal(g.boundingBox.max.z, 1.5);

let minNy = Infinity;
for (let i = 0; i < nrm.count; i++) minNy = Math.min(minNy, nrm.getY(i));
assert.ok(minNy > 0.99, `all normals must point up (+Y), got min ${minNy}`);

console.log('orientation: north(row0) at -Z ✓');
console.log(`winding: normals +Y across all ${nrm.count} verts (min y=${minNy.toFixed(4)}) ✓`);
