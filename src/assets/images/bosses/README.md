# Boss image assets

Upload one transparent PNG per boss with these exact filenames:

1. `iron-eagle.png` — النسر الحديدي، المرحلة الأولى
2. `storm-bomber.png` — قاذفة العاصفة، المرحلة الثانية
3. `current-serpent.png` — أفعى التيارات، المرحلة الثالثة
4. `cloud-warden.png` — حارس السحاب، المرحلة الرابعة
5. `grey-ruler.png` — الحاكم الرمادي، المرحلة الخامسة

Repository folder: `src/assets/images/bosses/`

Recommended: transparent PNG, 1024×1024 or 1536×1536, with a centered aircraft and enough padding to remain readable in the mobile HUD. A right-facing aircraft profile is preferred.

The game loads the matching portrait automatically at the start of each boss fight. If a portrait is missing, its HUD area stays hidden and the fight continues normally.
