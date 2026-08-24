function classifyState(data, w, h) {
  const n = w * h;
  // 0 = NaN unclassified, 1 = valid, 2 = NaN edge-connected, 3 = filled interior, 5 = interior over cap
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) state[i] = Number.isFinite(data[i]) ? 1 : 0;

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const seed = (i) => {
    if (state[i] === 0) {
      state[i] = 2;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i / w) | 0;
    const x0 = x > 0 ? x - 1 : 0;
    const x1 = x + 1 < w ? x + 1 : w - 1;
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y + 1 < h ? y + 1 : h - 1;
    for (let ny = y0; ny <= y1; ny++) {
      for (let nx = x0; nx <= x1; nx++) {
        const j = ny * w + nx;
        if (state[j] === 0) {
          state[j] = 2;
          queue[tail++] = j;
        }
      }
    }
  }
  return state;
}

function analyzeInterior(state, w, h) {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);
  const sizes = [];
  const queue = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (state[s] !== 0 || labels[s] !== -1) continue;
    const id = sizes.length;
    let head = 0;
    let tail = 0;
    let count = 0;
    labels[s] = id;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      count++;
      const x = i % w;
      const y = (i / w) | 0;
      const x0 = x > 0 ? x - 1 : 0;
      const x1 = x + 1 < w ? x + 1 : w - 1;
      const y0 = y > 0 ? y - 1 : 0;
      const y1 = y + 1 < h ? y + 1 : h - 1;
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const j = ny * w + nx;
          if (state[j] === 0 && labels[j] === -1) {
            labels[j] = id;
            queue[tail++] = j;
          }
        }
      }
    }
    sizes.push(count);
  }
  return { labels, sizes };
}

export function fillInteriorHoles(data, w, h, { smoothPasses = 3, maxHoleCells = Infinity } = {}) {
  const n = w * h;
  const state = classifyState(data, w, h);
  const { labels, sizes } = analyzeInterior(state, w, h);
  for (let i = 0; i < n; i++) {
    if (state[i] === 0 && sizes[labels[i]] > maxHoleCells) state[i] = 5;
  }

  let interiorCount = 0;
  for (let i = 0; i < n; i++) if (state[i] === 0) interiorCount++;
  if (interiorCount === 0) return { filled: 0 };

  const interior = new Int32Array(interiorCount);
  let k = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (state[i] === 0) interior[k++] = i;
    else if (state[i] === 1) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const clamp = (v) => (v < min ? min : v > max ? max : v);

  const neighborMean = (i) => {
    const x = i % w;
    const y = (i / w) | 0;
    const x0 = x > 0 ? x - 1 : 0;
    const x1 = x + 1 < w ? x + 1 : w - 1;
    const y0 = y > 0 ? y - 1 : 0;
    const y1 = y + 1 < h ? y + 1 : h - 1;
    let sum = 0;
    let cnt = 0;
    for (let ny = y0; ny <= y1; ny++) {
      const row = ny * w;
      for (let nx = x0; nx <= x1; nx++) {
        const j = row + nx;
        if (state[j] === 1 || state[j] === 3) {
          sum += data[j];
          cnt++;
        }
      }
    }
    return cnt > 0 ? sum / cnt : null;
  };

  let filled = 0;
  for (;;) {
    let newly = 0;
    for (let m = 0; m < interiorCount; m++) {
      const i = interior[m];
      if (state[i] !== 0) continue;
      const mean = neighborMean(i);
      if (mean !== null) {
        data[i] = clamp(mean);
        state[i] = 3;
        newly++;
      }
    }
    filled += newly;
    if (newly === 0) break;
  }

  for (let p = 0; p < smoothPasses; p++) {
    for (let m = 0; m < interiorCount; m++) {
      const i = interior[m];
      if (state[i] !== 3) continue;
      const mean = neighborMean(i);
      if (mean !== null) data[i] = clamp(mean);
    }
  }

  return { filled };
}
