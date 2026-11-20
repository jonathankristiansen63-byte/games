# Friminutt

Browser games for the boring bits. Seven 3D games, all with the Å panic button.

**Play:** open `index.html` through any web server (or GitHub Pages). No build step.

| Game | Season | What it is |
| --- | --- | --- |
| **Peak Rush** | Winter | Freestyle skiing on four mountains |
| **Sled Rush** | Winter | Endless downhill sledding: dodge trees, flatten snowmen, flip off ramps |
| **Ice Shootout** | Winter | Pond hockey: shoot on an AI goalie, or play goalie yourself |
| **Snowball Fight** | Winter | First-person snow fort battle against waves of kids |
| **Kart Racing** | Summer | Three tracks, five AI racers, drift boosts and items |
| **Skate Park** | Summer | Flips, grabs, grinds, manuals and vert in a plaza and a bowl |
| **Paper Plane** | Summer | Glide over an endless countryside, ride updrafts, thread rings |

Every game: `Esc` pause · `M` sound on / off (off by default) · `R` restart · `Å` panic button.

## Peak Rush

Four mountains: Terrain Park, Powder Forest, Slalom Race and Night Mountain.

| Key | Action |
| --- | --- |
| A / D or ← / → | Turn · spin in the air · balance on rails |
| W / ↑ | Tuck · front flip in the air |
| S / ↓ | Brake · back flip in the air |
| Space | Hold to crouch, release to jump |
| J K L I U O | Grabs: Mute, Safety, Japan, Tail, Truck Driver, Critical |

Spin and flip together for corks. Chain tricks to stack the combo multiplier.

## Sled Rush

Endless Run (three hearts, gets faster) or Gold Rush (60 seconds of coins). A / D steer, W tuck, S brake, Space jump. In the air A / D spins and W / S flips. Land straight or wipe out.

## Ice Shootout

Shootout: W / S skate, A / D deke, aim with the mouse, hold click to wind up and release to shoot. The goalie gets better every 3 goals. Goalie: move the mouse to where the puck is going, hold Space for the butterfly.

## Snowball Fight

Aim with the mouse, click to throw. Hold Space (or S, or right click) to duck behind your wall and pack new snowballs. A red ! means a kid is about to throw. Hit the floating present for giant snowballs, a rapid-fire mitten or hot cocoa.

## Kart Racing

Sunny Circuit, Canyon Loop and Neon Night. W / S drive and brake, A / D steer, hold Space while turning to drift (blue, orange, purple sparks for bigger boosts), E uses your item: Turbo, Rocket or Oil Slick.

## Skate Park

City Plaza and Sunset Bowl, as a 2 minute Session (find S-K-A-T-E) or Free Skate. W push, A / D turn and spin, Space ollie, J K L flip tricks, I U O grabs, Shift manual. Land on rails and ledges to grind.

## Paper Plane

Long Flight (distance) or Ring Rush (rings add time). W dives for speed, S climbs, A / D bank to turn. Sparkling columns and chimney smoke are updrafts.

## Code

- `js/ski/` Peak Rush
- `js/kit/` shared engine for the other games: renderer and sky, particles, sound, menus and HUD, game loop, a posable 3D character
- `js/<game>/game.js` and `play/<game>.html` one folder and page per game

Snow, rock and bark textures in `textures/` were baked in Blender. Built with [three.js](https://threejs.org).
