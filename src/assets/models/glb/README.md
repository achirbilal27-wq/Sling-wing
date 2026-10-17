# GLB assets

This directory stores the game's ready-to-use binary `.glb` models.

- `plane_pc.glb` — the current model for all small enemy aircraft.

Add future GLB files here, then map each filename to its intended aircraft or boss in `src/js/game.js`. Android preparation copies the folder into the packaged game, and the integrity test checks that the enemy model is included.
