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

// Gradient normals: linear ramp h = x -> analytic normal (-1/sqrt(2), 1/sqrt(2), 0)
{
  const w2 = 5;
  const h2 = 4;
  const d2 = new Float32Array(w2 * h2);
  for (let r = 0; r < h2; r++) for (let c = 0; c < w2; c++) d2[r * w2 + c] = c;
  const g2 = buildTerrainGeometry({
    data: d2,
    width: w2,
    height: h2,
    nativeWidth: w2,
    nativeHeight: h2,
    stats: { min: 0, max: w2 - 1 },
    pixelScale: [1, 1, 0],
    epsg: null,
  });
  const n2 = g2.getAttribute('normal');
  const invSqrt2 = Math.SQRT1_2;
  let maxErr = 0;
  for (let i = 0; i < n2.count; i++) {
    assert.ok(Math.abs(n2.getY(i) - invSqrt2) < 1e-6, `ny[${i}]=${n2.getY(i)}`);
    maxErr = Math.max(maxErr, Math.abs(n2.getX(i) + invSqrt2), Math.abs(n2.getZ(i)));
  }
  assert.ok(maxErr < 1e-6, `maxErr=${maxErr}`);
  console.log(`ramp normals match analytic (-1/√2, 1/√2, 0), maxErr=${maxErr.toExponential(1)} ✓`);
}

// One-sided fallback: NaN last column keeps interior normals correct and finite
{
  const w3 = 5;
  const h3 = 4;
  const d3 = new Float32Array(w3 * h3);
  for (let r = 0; r < h3; r++) {
    for (let c = 0; c < w3; c++) d3[r * w3 + c] = c === w3 - 1 ? NaN : c;
  }
  const g3 = buildTerrainGeometry({
    data: d3,
    width: w3,
    height: h3,
    nativeWidth: w3,
    nativeHeight: h3,
    stats: { min: 0, max: w3 - 2 },
    pixelScale: [1, 1, 0],
    epsg: null,
  });
  const n3 = g3.getAttribute('normal');
  for (let r = 0; r < h3; r++) {
    for (let c = 0; c < w3 - 1; c++) {
      const i = r * w3 + c;
      assert.ok(
        Number.isFinite(n3.getX(i)) && Math.abs(Math.abs(n3.getX(i)) - Math.SQRT1_2) < 1e-6,
        `normal at ${i} not analytic: ${n3.getX(i)}, ${n3.getY(i)}`
      );
      assert.ok(Math.abs(n3.getY(i) - Math.SQRT1_2) < 1e-6);
    }
  }
  console.log('NaN-edge normals: one-sided differences stay analytic ✓');
}
