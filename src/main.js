import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLUT, COLORMAPS, DEFAULT_COLORMAP } from './colormaps.js';
import { loadHeightfield } from './loader.js';
import { buildTerrainGeometry, applyColormap, worldExtents } from './mesh.js';

const el = (id) => document.getElementById(id);
const canvas = el('scene');
const infoEl = el('info');
const welcomeEl = el('welcome');
const dropzoneEl = el('dropzone');
const loadingEl = el('loading');
const errorEl = el('error');
const fileInput = el('file-input');
const openBtn = el('open-btn');
const recenterBtn = el('recenter-btn');
const cmapSelect = el('colormap');
const resSelect = el('resolution');
const exagSlider = el('exaggeration');
const exagInput = el('exag-input');

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

  const azimuth = (35 * Math.PI) / 180;
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
  welcomeEl.classList.add('hidden');
}

async function visualize(arrayBuffer, { refit = true } = {}) {
  const hf = await loadHeightfield(arrayBuffer, { maxGrid: currentMaxGrid() });
  sourceBuffer = arrayBuffer;
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

renderer.setAnimationLoop(() => {
  controls.update();
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
