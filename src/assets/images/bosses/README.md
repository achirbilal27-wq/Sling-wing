# Boss image assets

Upload one transparent PNG per boss with these exact filenames:

1. `iron-eagle.png` — النسر الحديدي، المرحلة الأولى
2. `storm-bomber.png` — قاذفة العاصفة، المرحلة الثانية
3. `Current-serpent.png` — أفعى التيارات، المرحلة الثالثة
4. `cloud-warden.png` — حارس السحاب، المرحلة الرابعة
5. `grey-ruler.png` — الحاكم الرمادي، المرحلة الخامسة

Repository folder: `src/assets/images/bosses/`

Recommended: transparent PNG, 1024×1024 or 1536×1536, with a centered aircraft and enough padding to remain readable in the mobile HUD. A right-facing aircraft profile is preferred.

The game loads the matching portrait automatically at the start of each boss fight. If a portrait is missing, its HUD area stays hidden and the fight continues normally.


## Supplied 3D embed reference

The supplied Sketchfab snippet points to a model titled **FTL: Faster Than Light; Rebel Flagship** by Heataker:
`https://sketchfab.com/models/4b3651f8bfa64f0ba3f66ed1f6d26272/embed`

That iframe is a remote model viewer, not a model file that the game's Three.js scene can control as an enemy. It is therefore documented as a reference only, rather than inserted over the gameplay screen. To make a native in-game 3D boss, provide an authorized `.glb`/`.gltf` model file; for the current portrait slot, upload the transparent image as `src/assets/images/bosses/Current-serpent.png`.
