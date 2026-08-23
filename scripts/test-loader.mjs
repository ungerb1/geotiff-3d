import { readFile } from 'node:fs/promises';
import { loadHeightfield } from '../src/loader.js';

const path = process.argv[2] ?? '/home/ben/code/tmp/bathymetry_05res.tif';
const buf = await readFile(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

for (const maxGrid of [256, 512, 1024, 2048, Infinity]) {
  const hf = await loadHeightfield(ab.slice(0), { maxGrid });
  console.log(
    `maxGrid=${String(maxGrid).padEnd(9)} grid=${String(hf.width).padStart(4)}x${String(hf.height).padEnd(4)}` +
      ` elev=[${hf.stats.min.toFixed(2)}, ${hf.stats.max.toFixed(2)}] epsg=${hf.epsg}` +
      ` px=${hf.pixelScale?.[0]}`
  );
}
