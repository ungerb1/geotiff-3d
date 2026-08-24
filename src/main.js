import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLUT, COLORMAPS, DEFAULT_COLORMAP } from './colormaps.js';
import { loadHeightfield } from './loader.js';
import { buildTerrainGeometry, applyColormap, worldExtents } from './mesh.js';
import { fillInteriorHoles } from './interp.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const infoEl = el('info');
const compassEl = el('compass');
const compassDial = el('compass-dial');
const welcomeEl = el('welcome');
const dropzoneEl = el('dropzone');
const loadingEl = el('loading');
const errorEl = el('error');
const fileInput = el('file-input');
const openBtn = el('open-btn');
const recenterBtn = el('recenter-btn');
const fillBtn = el('fill-btn');
const cmapSelect = el('colormap');
const resSelect = el('resolution');
const exagSlider = el('exaggeration');
const exagInput = el('exag-input');
const fillPanel = el('fill-panel');
const capSlider = el('cap-slider');
const capLabel = el('cap-label');
const applyCapBtn = el('apply-cap');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const BG_COLOR = new THREE.Color('#0a0f1c');
scene.background = BG_COLOR;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 50000);

const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x1c2430, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e8, 2.6);
sun.position.set(-600, 900, -350);
scene.add(sun);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = (88 * Math.PI) / 180;

let terrain = null;
let heightfield = null;
let sourceBuffer = null;
let exaggeration = 10;
let fillEnabled = false;
let appliedCap = 1000;

const CAP_MIN_LOG2 = 4;
const CAP_MAX_LOG2 = 17;

function pendingLog2() {
  return CAP_MIN_LOG2 + (capSlider.value / 1000) * (CAP_MAX_LOG2 - CAP_MIN_LOG2);
}

function updateCapLabel() {
  const f = capSlider.value / 1000;
  if (f >= 1) {
    capLabel.textContent = 'Unlimited';
    return;
  }
  const cells = Math.round(2 ** pendingLog2());
  const side = Math.max(1, Math.round(Math.sqrt(cells)));
  capLabel.textContent = `~${side}\u00d7${side} \u00b7 ${cells.toLocaleString()} cells`;
}

function syncFillState() {
  try {
    setLoading(true);
    if (fillEnabled) applyFill(heightfield);
    else {
      heightfield.data.set(heightfield.rawData);
      rescanStats(heightfield);
    }
    applyHeightfield(heightfield);
  } finally {
    setLoading(false);
  }
}

function rescanStats(hf) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < hf.data.length; i++) {
    const v = hf.data[i];
    if (Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (Number.isFinite(min)) hf.stats.min = min;
  if (Number.isFinite(max)) hf.stats.max = max;
}

function applyFill(hf) {
  hf.data.set(hf.rawData);
  fillInteriorHoles(hf.data, hf.width, hf.height, { maxHoleCells: appliedCap });
  rescanStats(hf);
}

function currentMaxGrid() {
  const v = parseInt(resSelect.value, 10);
  return v > 0 ? v : Infinity;
}

function setExaggeration(v, from) {
  if (!Number.isFinite(v) || v <= 0) return false;
  exaggeration = v;
  if (from !== 'slider') exagSlider.value = String(Math.min(Math.max(v, 0.1), 30));
  if (from !== 'input') exagInput.value = String(v);
  if (terrain) terrain.scale.y = v;
  if (terrain && heightfield) {
    controls.target.y = ((heightfield.stats.min + heightfield.stats.max) / 2) * exaggeration;
  }
  return true;
}

for (const name of Object.keys(COLORMAPS)) {
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name[0].toUpperCase() + name.slice(1);
  if (name === DEFAULT_COLORMAP) opt.selected = true;
  cmapSelect.appendChild(opt);
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 8000);
}

function setLoading(on) {
  loadingEl.classList.toggle('hidden', !on);
}

function formatInfo(hf) {
  const parts = [`${hf.nativeWidth}\u00d7${hf.nativeHeight} px`];
  if (hf.pixelScale) {
    parts.push(`${hf.pixelScale[0].toPrecision(3)} m/px`);
  }
  parts.push(hf.epsg ? `EPSG:${hf.epsg}` : 'CRS n/a');
  const { min, max } = hf.stats;
  parts.push(`elev ${min.toFixed(1)} \u2026 ${max.toFixed(1)} m`);
  parts.push(`grid ${hf.width}\u00d7${hf.height}`);
  return parts.join(' \u00b7 ');
}

function fitCamera(hf) {
  const { width: worldW, height: worldH } = worldExtents(hf);
  const radius = Math.max(worldW, worldH);
  const relief = (hf.stats.max - hf.stats.min) * exaggeration;
  const dist = Math.max(radius * 1.25, relief * 3);

  const azimuth = 0;
  const elevation = (38 * Math.PI) / 180;
  const horiz = dist * Math.cos(elevation);
  camera.position.set(
    horiz * Math.sin(azimuth),
    dist * Math.sin(elevation),
    horiz * Math.cos(azimuth)
  );
  controls.target.set(0, ((hf.stats.min + hf.stats.max) / 2) * exaggeration, 0);

  camera.near = Math.max(dist / 500, 0.01);
  camera.far = dist * 30;
  camera.updateProjectionMatrix();

  sun.position.set(-worldW, worldH, -worldW * 0.6);
  scene.fog = new THREE.Fog(BG_COLOR, dist * 2.2, dist * 9);
}

function clearTerrain() {
  if (!terrain) return;
  scene.remove(terrain);
  terrain.geometry.dispose();
  terrain.material.dispose();
  terrain = null;
}

function applyHeightfield(hf) {
  clearTerrain();
  heightfield = hf;

  const geometry = buildTerrainGeometry(hf);
  applyColormap(geometry, buildLUT(cmapSelect.value), hf.stats.min, hf.stats.max);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  terrain = new THREE.Mesh(geometry, material);
  terrain.scale.y = exaggeration;
  scene.add(terrain);

  infoEl.textContent = formatInfo(hf);
  infoEl.classList.remove('hidden');
  compassEl.classList.remove('hidden');
  welcomeEl.classList.add('hidden');
}

async function visualize(arrayBuffer, { refit = true } = {}) {
  const hf = await loadHeightfield(arrayBuffer, { maxGrid: currentMaxGrid() });
  sourceBuffer = arrayBuffer;
  hf.rawData = hf.data.slice();
  if (fillEnabled) applyFill(hf);
  applyHeightfield(hf);
  if (refit) fitCamera(hf);
}

async function loadFile(file) {
  if (!/\.(tif|tiff)$/i.test(file.name)) {
    showError(`Unsupported file type: ${file.name}`);
    return;
  }
  try {
    setLoading(true);
    const buffer = await file.arrayBuffer();
    await visualize(buffer);
  } catch (err) {
    console.error(err);
    showError(`Failed to load ${file.name}:\n${err.message}`);
  } finally {
    setLoading(false);
  }
}

openBtn.addEventListener('click', () => fileInput.click());
recenterBtn.addEventListener('click', () => {
  if (heightfield) fitCamera(heightfield);
});

fillBtn.addEventListener('click', () => {
  fillEnabled = !fillEnabled;
  fillBtn.classList.toggle('active', fillEnabled);
  fillPanel.classList.toggle('hidden', !fillEnabled);
  if (!heightfield) return;
  syncFillState();
});

capSlider.addEventListener('input', updateCapLabel);

applyCapBtn.addEventListener('click', () => {
  const f = capSlider.value / 1000;
  appliedCap = f >= 1 ? Infinity : Math.max(1, Math.round(2 ** pendingLog2()));
  if (!heightfield) return;
  syncFillState();
});

updateCapLabel();
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) loadFile(fileInput.files[0]);
  fileInput.value = '';
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropzoneEl.classList.remove('hidden');
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropzoneEl.classList.add('hidden');
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzoneEl.classList.add('hidden');
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

exagSlider.addEventListener('input', () => {
  setExaggeration(parseFloat(exagSlider.value), 'slider');
});
exagInput.addEventListener('change', () => {
  if (!setExaggeration(parseFloat(exagInput.value), 'input')) {
    exagInput.value = String(exaggeration);
  }
});
setExaggeration(10);

resSelect.addEventListener('change', async () => {
  if (!sourceBuffer) return;
  try {
    setLoading(true);
    await visualize(sourceBuffer, { refit: false });
  } catch (err) {
    console.error(err);
    showError(`Failed to re-render:\n${err.message}`);
  } finally {
    setLoading(false);
  }
});

cmapSelect.addEventListener('change', () => {
  if (!heightfield || !terrain) return;
  applyColormap(terrain.geometry, buildLUT(cmapSelect.value), heightfield.stats.min, heightfield.stats.max);
});

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

const NORTH = new THREE.Vector3(0, 0, -1);
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _screenUp = new THREE.Vector3();

function updateCompass() {
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, camera.up).normalize();
  _screenUp.crossVectors(_right, _fwd);
  const angle = Math.atan2(_right.dot(NORTH), _screenUp.dot(NORTH));
  compassDial.style.transform = `rotate(${angle}rad)`;
}

renderer.setAnimationLoop(() => {
  controls.update();
  updateCompass();
  renderer.render(scene, camera);
});

const srcParam = new URLSearchParams(location.search).get('src');
if (srcParam) {
  try {
    setLoading(true);
    const res = await fetch(srcParam);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await visualize(await res.arrayBuffer());
  } catch (err) {
    showError(`Failed to load "${srcParam}":\n${err.message}`);
  } finally {
    setLoading(false);
  }
}
