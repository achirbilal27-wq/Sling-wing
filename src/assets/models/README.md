# 3D model assets

This directory contains reusable binary glTF models for the Sling-wing game. Assets under `src/assets/` are prepared for the Android web build by `npm run prepare-www`.

## Category folders

| Folder | Purpose |
|---|---|
| `environment/` | New regions, landmarks, and environment props |
| `assault-defender/` | Cannons, defensive towers, interceptor bases |
| `bonus/` | Bonus aircraft intended to reward coins |
| `planes-dead/` | Kamikaze / diving enemy aircraft |
| `rocket-attack/` | Air-to-air attacking or homing missile models |
| `wildlife/` | Ocean, water surfaces, coasts, and nature below the aircraft |
| `bosses/` | Boss aircraft and other boss GLBs |
| `aircraft/` | Player aircraft models |
| `glb/` | Existing reusable GLB models |

See `asset-catalog.json` for the category catalog and integration status. Each new category has its own README with naming and import notes.

## Important runtime note

These folders establish an organized place to add assets; they do **not** automatically spawn new objects or activate gameplay mechanics. Each category still needs runtime integration for loading, placement, animation, collisions, effects, rewards, and fallback behavior as appropriate. Keep procedural fallbacks where the game already has them.

## Small enemy aircraft

Runtime path: `src/assets/models/glb/plane_pc.glb`

The game loads this GLB for all small enemy aircraft. It centers and scales the imported scene and rotates it to match the game's forward direction. If loading fails, the procedural enemy plane remains as a fallback.

### Model attribution

- **Model:** Plane PC
- **Author:** Sinh Nguyễn (Sketchfab: nlsinh)
- **Source:** https://sketchfab.com/3d-models/plane-pc-366bc4e8e71449b69f62ba232764dadf
- **License:** Creative Commons Attribution 4.0 (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/

Keep model textures embedded in the GLB when exporting. Add a matching attribution entry for each future model and verify its license permits the intended use.
