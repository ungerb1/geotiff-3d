import assert from 'node:assert/strict';
import { fillInteriorHoles } from '../src/interp.js';

const grid = (w, h, fill) => {
  const d = new Float32Array(w * h);
  if (fill !== undefined) d.fill(fill);
  return d;
};
const punch = (d, w, x0, x1, y0, y1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d[y * w + x] = NaN;
};

// A) Enclosed hole -> completely filled
{
  const d = grid(20, 20, 5);
  punch(d, 20, 7, 11, 7, 11);
  const { filled } = fillInteriorHoles(d, 20, 20);
  assert.equal(filled, 25);
  let nans = 0;
  for (const v of d) if (Number.isNaN(v)) nans++;
  assert.equal(nans, 0);
  console.log(`A) enclosed 5x5 hole -> ${filled} cells filled, no NaN ✓`);
}

// B) Border-connected strip -> untouched
{
  const d = grid(20, 20, 5);
  punch(d, 20, 0, 2, 0, 19); // full-height strip on left edge
  const { filled } = fillInteriorHoles(d, 20, 20);
  assert.equal(filled, 0);
  assert.ok(Number.isNaN(d[1 * 20 + 1]));
  console.log('B) border-connected strip -> untouched ✓');
}

// C) All-NaN except center island: everything touches border -> nothing filled
{
  const d = new Float32Array(30 * 30).fill(NaN);
  for (let y = 13; y <= 16; y++) for (let x = 13; x <= 16; x++) d[y * 30 + x] = 7;
  const { filled } = fillInteriorHoles(d, 30, 30);
  assert.equal(filled, 0);
  assert.equal(d[14 * 30 + 14], 7);
  console.log('C) island in open water -> island intact, nothing filled ✓');
}

// D) Enclosed lake with valid island inside -> lake fills, island survives
{
  const d = grid(40, 40, 3);
  punch(d, 40, 10, 29, 10, 29); // NaN lake
  for (let y = 18; y <= 21; y++) for (let x = 18; x <= 21; x++) d[y * 40 + x] = 9; // island
  const { filled } = fillInteriorHoles(d, 40, 40);
  assert.equal(filled, 400 - 16);
  assert.equal(d[19 * 40 + 19], 9);
  let minN = Infinity;
  for (let y = 10; y <= 29; y++)
    for (let x = 10; x <= 29; x++) {
      const v = d[y * 40 + x];
      assert.ok(Number.isFinite(v), 'lake must be fully filled');
      minN = Math.min(minN, v);
    }
  assert.ok(minN >= 3 && minN <= 9, `filled values bounded by data range, got ${minN}`);
  console.log(`D) lake+island -> ${filled} cells filled around intact island ✓`);
}

// E) All-valid input -> bit-identical
{
  const d = grid(8, 8, 2.5);
  const copy = d.slice();
  const { filled } = fillInteriorHoles(d, 8, 8);
  assert.equal(filled, 0);
  assert.deepEqual(d, copy);
  console.log('E) all-valid raster -> unchanged ✓');
}

// F) cap boundary: 25-cell and 400-cell holes
{
  const mk = () => {
    const d = grid(50, 50, 4);
    punch(d, 50, 2, 6, 2, 6);   // 25 cells
    punch(d, 50, 15, 34, 15, 34); // 400 cells
    return d;
  };
  let d = mk();
  fillInteriorHoles(d, 50, 50, { maxHoleCells: 24 });
  assert.ok(Number.isNaN(d[4 * 50 + 4]) && Number.isNaN(d[25 * 50 + 25]));
  console.log('F1) cap below both -> nothing filled ✓');

  d = mk();
  fillInteriorHoles(d, 50, 50, { maxHoleCells: 25 });
  assert.ok(!Number.isNaN(d[4 * 50 + 4]) && Number.isNaN(d[25 * 50 + 25]));
  console.log('F2) exact-boundary equality -> 25 filled, 400 open ✓');

  d = mk();
  const { filled } = fillInteriorHoles(d, 50, 50, { maxHoleCells: Infinity });
  assert.equal(filled, 425);
  console.log('F3) Unlimited -> all 425 filled ✓');
}
