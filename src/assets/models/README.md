# 3D model assets

Place reusable binary glTF models in `src/assets/models/glb/`. The game copies this directory into the Android web assets during `npm run prepare-www`.

The small enemy aircraft model is loaded from:

`src/assets/models/glb/plane_pc.glb`

The runtime keeps the procedural aircraft as a fallback until that file exists or if loading fails. Keep any model textures embedded in the GLB when exporting, and make sure you have permission to use each model in the game.
