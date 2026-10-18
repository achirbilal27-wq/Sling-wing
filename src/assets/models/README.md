# 3D model assets

Place reusable binary glTF models in `src/assets/models/glb/`. The game copies this directory into the Android web assets during `npm run prepare-www`.

## Small enemy aircraft

Runtime path: `src/assets/models/glb/plane_pc.glb`

The game loads this GLB for all small enemy aircraft. It centers and scales the imported scene and rotates it to match the game's forward direction. If loading fails, the procedural enemy plane remains as a fallback.

### Model attribution

- **Model:** Plane PC
- **Author:** Sinh Nguyễn (Sketchfab: nlsinh)
- **Source:** https://sketchfab.com/3d-models/plane-pc-366bc4e8e71449b69f62ba232764dadf
- **License:** Creative Commons Attribution 4.0 (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/

Keep model textures embedded in the GLB when exporting. Add a matching attribution entry here for each future model and make sure its license permits the intended use.
