# 3D model assets

Place reusable binary glTF models in `src/assets/models/glb/`. The game copies this directory into the Android web assets during `npm run prepare-www`.

## Current mapping

- `plane_pc.glb` — used by all small enemy aircraft.

The model is loaded through Three.js `GLTFLoader`. The runtime normalizes the model's position and size and adjusts its orientation to the game's coordinate system. A procedural aircraft remains as a runtime fallback if the model cannot load. Keep textures embedded in GLB when exporting, and make sure each model's license permits use in the game.
