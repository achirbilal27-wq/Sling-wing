# Music and gameplay audio

The music tracks are connected to the game audio manager in `src/js/game.js`.

- `menu-theme.ogg` — hangar, menu, and pre-flight screens
- `flight-theme.ogg` — normal flight
- `boss-battle.ogg` — boss encounters
- `finale-theme.ogg` — final reveal and ending
- `coin-collect.ogg` — coin pickup sound effect (stored here for compatibility)
- `laser.ogg` — regular enemy-hit sound effect (stored here for compatibility)

Playback starts after the player's first interaction to comply with browser and Android WebView audio policies. Music follows game state and respects the mute control.
