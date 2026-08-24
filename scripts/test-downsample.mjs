import assert from 'node:assert/strict';
import { downsampleBox } from '../src/loader.js';

// Raster 100x100, value = x + y*0.01, with a centered 3x3 NaN hole
const W = 100;
const H = 100;
const src = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) src[y * W + x] = x + y * 0.01;
}
for (let y = 49; y <= 51; y++) {
  for (let x = 49; x <= 51; x++) src[y * W + x] = NaN;
}

// 1) Heavy downsample (10x): hole must vanish entirely
{
  const out = downsampleBox(src, W, H, 10, 10);
  let nans = 0;
  for (const v of out) if (Number.isNaN(v)) nans++;
  assert.equal(nans, 0, `10x: sub-cell hole must disappear, got ${nans} NaN cells`);
  console.log('1) 3x3 hole @ 10x downsample -> vanishes (0 NaN) ✓');
}

// 2) Light downsample (2x): hole persists but stays proportional (~<=4 cells)
{
  const out = downsampleBox(src, W, H, 50, 50);
  let nans = 0;
  for (const v of out) if (Number.isNaN(v)) nans++;
  assert.ok(nans > 0, '2x: hole should still exist at this scale');
  assert.ok(nans <= 4, `2x: hole must stay proportional, got ${nans} cells`);
  console.log(`2) 3x3 hole @ 2x downsample -> ${nans} NaN cells (proportional) ✓`);
}

// 3) Values are area means: full-valid raster, 100x100 -> 10x10
{
  const full = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) full[y * W + x] = x;
  const out = downsampleBox(full, W, H, 10, 10);
  const expected = (50 + 59) / 2;
  assert.equal(out[5 * 10 + 5], expected);
  console.log(`3) box-average correctness: cell(5,5)=${out[5 * 10 + 5]} == ${expected} ✓`);
}

// 4) Fully-NoData region -> NaN
{
  const blank = new Float32Array(16).fill(NaN);
  const out = downsampleBox(blank, 4, 4, 2, 2);
  let nans = 0;
  for (const v of out) if (Number.isNaN(v)) nans++;
  assert.equal(nans, 4);
  console.log('4) all-NaN input -> all-NaN output ✓');
}

// 5) Fractional-overlap weighting is exact: 3 px -> 2 cells (split pixel shared 0.5/0.5)
{
  const s = Float32Array.from([0, 10, 20]);
  const o = downsampleBox(s, 3, 1, 2, 1);
  assert.ok(Math.abs(o[0] - 10 / 3) < 1e-6, `out0=${o[0]} want ${10 / 3}`);
  assert.ok(Math.abs(o[1] - 50 / 3) < 1e-6, `out1=${o[1]} want ${50 / 3}`);
  console.log('5) fractional weights: [0,10,20] -> [10/3, 50/3] ✓');
}

// 6) Phase uniformity: alternating 1/0 rows at ratio ~1.81 must average ~0.5 everywhere
{
  const W = 100;
  const H = 181;
  const GH = Math.round(H / 1.8125);
  const s = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) s[y * W + x] = y % 2 === 0 ? 1 : 0;
  }
  const o = downsampleBox(s, W, H, W, GH);
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < o.length; i++) {
    minV = Math.min(minV, o[i]);
    maxV = Math.max(maxV, o[i]);
  }
  assert.ok(minV >= 0.44 && maxV <= 0.56, `phase band violated: [${minV.toFixed(3)}, ${maxV.toFixed(3)}]`);
  console.log(`6) alternating-row probe @x${(H / GH).toFixed(2)} -> range [${minV.toFixed(3)}, ${maxV.toFixed(3)}] ⊂ 0.5±0.06 ✓`);
}

// 7) Same pattern with NaN odd rows: every output cell stays finite (no phase-dependent holes)
{
  const W = 100;
  const H = 181;
  const GH = Math.round(H / 1.8125);
  const s = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) s[y * W + x] = y % 2 === 0 ? 1 : NaN;
  }
  const o = downsampleBox(s, W, H, W, GH);
  let nans = 0;
  for (const v of o) if (Number.isNaN(v)) nans++;
  assert.equal(nans, 0);
  console.log('7) NaN-alternating probe -> 0 phase-dependent NaN cells ✓');
}
