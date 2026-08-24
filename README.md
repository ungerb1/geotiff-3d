# GeoTIFF 3D Visualizer

Browser-based 3D terrain viewer for GeoTIFF elevation data. Drag and drop a `.tif` file and explore it as an interactive 3D surface, fully client-side.

## Features

- **Drag & drop loading** : drop any `.tif` / `.tiff` onto the page (or use the open button)
- **Interactive camera** : orbit, zoom, and pan with damping; lighting-based hillshading
- **Recenter view** : one-click reset of the camera to the default framing centered on the surface
- **Resolution selector** : resample the mesh from 256 up to native resolution; re-renders in place without re-loading the file
- **Vertical exaggeration** : slider plus a type-in box for precise values beyond the slider range
- **Colormaps** : Ocean (default), Viridis, Inferno, Terrain, Grayscale
- **NoData handling** : `NaN` and `GDAL_NODATA` values are masked out instead of rendering spikes
- **Georeferencing-aware** : true-world aspect ratio from pixel scale; CRS (EPSG code), dimensions, resolution, and elevation range shown in the info bar

## Getting started

Requires Node.js 20.19+ (or 22.12+) and npm.

```bash
npm install
npm run dev      # start dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Open the printed URL (default `http://localhost:5173`) and drop a GeoTIFF onto the page.

## Usage

| Input | Action |
|---|---|
| Left-drag | Orbit |
| Scroll | Zoom |
| Right-drag | Pan |
| Recenter view | Reset camera to default framing |
| Drop `.tif` | Load file |

**Resolution** controls the mesh density (longest side of the heightfield grid, bilinear-resampled). Lower values render faster; Native uses every pixel, so expect millions of triangles on large rasters. If the file is smaller than the selected size, it clamps to native.

**Vertical exaggeration** scales terrain height live. Typed values are not capped at the slider's maximum; empty or invalid input reverts to the last valid value. Changing it keeps the camera pinned on the surface center.

Tip: append `?src=<path>` to the URL to auto-load a raster served alongside the app (e.g. from `public/`).

## Supported data

The first band is interpreted as elevation. Float32, integer, and most GDAL-readable types work; cells that are `NaN` or equal to the file's `GDAL_NODATA` value are excluded from the mesh. Very large rasters are downsampled to the selected grid size before meshing.

## Project structure

```
index.html            UI layout, panel, styles
src/main.js           scene, camera, controls, UI wiring
src/loader.js         GeoTIFF parsing, resampling, NoData masking
src/mesh.js           heightfield -> BufferGeometry, colormap application
src/colormaps.js      colormap LUTs
scripts/test-loader.mjs   node-side loader sanity check
```

## Credits

Built with [three.js](https://threejs.org/), [geotiff.js](https://geotiffjs.github.io/), and [Vite](https://vite.dev/).

## License

[MIT](LICENSE)
