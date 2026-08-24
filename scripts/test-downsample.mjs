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
