# Sound effects and gameplay mapping

The game audio manager in `src/js/game.js` connects these sounds to gameplay events.

- `ui-confirm.ogg` — aircraft selection, upgrades, and confirmation
- `launch.ogg` — aircraft launch
- `engine-loop.ogg` — looping engine sound during powered flight; pauses when flight is paused or fuel is exhausted
- `weapon-fire.ogg` — cannon firing
- `missile-launch.ogg` — guided missile launch
- `missile-impact.ogg` — guided missile impact
- `boss-warning.ogg` — boss arrival and dive warning
- `boss-hit.ogg` — cannon or missile damage to a boss
- `explosion.ogg` — enemy/missile explosion and fallback sound when a boss is defeated
- `fuel-pickup.ogg` — fuel pickups and refuelling ability
- `shield.ogg` — active and automatic shield
- `victory-stinger.ogg` — final victory after the fifth boss

Note: several existing SFX paths contain invisible U+200C characters at the start of their filenames. The game currently resolves those exact paths; renaming them should be done together with updating the asset references. A separate `boss-defeat.ogg` file is not present, so `explosion.ogg` is used for that event.
