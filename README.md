# Friminutt

Browser games for the boring bits. Ten 3D games, all with the Å panic button, leaderboards, and multiplayer with friends.

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
| **Mini Golf** | Summer | Nine crazy holes by the sea: windmill, ramp jump, loop, volcano, castle |
| **Highway Rush** | Motor | Cars and motorbikes weaving through traffic on an endless highway |
| **Wheelie Run** | Motor | Hold a wheelie on a coastal road without looping out |

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

## Mini Golf

Full Course (9 holes, par 26) or Quick Round (3 random holes). Drag back from anywhere like a slingshot and let go to putt, or aim with A / D and hold Space for power. Hold C for an overview of the hole. Water costs a stroke, and you pick up after 8.

## Highway Rush

Pick a ride (Sports Car, Muscle Car, Superbike or Dirt Bike), a paint colour and Sunset or Night. The road runs through the city, over a cable-stayed bridge, past wind farms in the hills and through a tunnel, again and again. Rush Hour is one-way traffic with three hearts; Wrong Way adds oncoming lanes that pay double; Checkpoint Run is against the clock.

W gas, S brake, A / D steer, Shift nitro, H horn (the car ahead moves over), C camera. Pass within a metre of a car for a near miss: they fill the nitro and chain into combos. On a bike, Space pulls a wheelie for double points, and you can split two lanes at once to thread the needle.

## Wheelie Run

W is the throttle and lifts the front wheel, S is the rear brake that brings it down, Space pops the clutch. Keep the needle in the green for double points; past the red you loop out. Endless Road has three hearts and obstacles; Wheelie Challenge is the most wheelie metres in 60 seconds.

## Play with friends

Every game except Peak Rush has **PLAY WITH FRIENDS** in its menu (and **FRIENDS** on the hub). Nothing to set up:

- Everyone gets a friend code like `K7QX-M2PA`. Add a friend by typing theirs; when they're online it adds you back.
- Invite a friend from the hub or a game menu. They get a pop-up and land in your game with one click (or share the `?join=CODE` link).
- The host picks the mode and everyone starts together on the same map. Friends show up as ghosts with name tags, a live scoreboard runs during the run, and the results show who won.
- In Kart Racing everyone races in the same race against the same AI karts.

It connects browsers directly (WebRTC through the free PeerJS broker), so there's no server to run. Up to six players per party.

## Names and leaderboards

The first time someone opens the site it asks for their name, and shows it as a letter avatar (Jonathan → **J**), also on the fake doc's account picture. Click the avatar to change it. Every game posts finished runs to a leaderboard under that name: see them on the results screen, from **LEADERBOARD** in each game's menu, or from **LEADERBOARDS** on the hub.

Out of the box the boards are saved in the browser, so everyone playing on the same computer competes.

### Online leaderboards (everyone, everywhere)

1. Make a free project at [supabase.com](https://supabase.com).
2. In its SQL editor, run:

   ```sql
   create table scores (
     id bigint generated always as identity primary key,
     game text not null, mode text not null,
     name text not null check (char_length(name) between 1 and 16),
     value double precision not null,
     created_at timestamptz default now()
   );
   create index on scores (game, mode, value);
   alter table scores enable row level security;
   create policy "anyone can read" on scores for select using (true);
   create policy "anyone can post" on scores for insert with check (true);
   ```

3. Copy the project URL and the **anon public** key (Project Settings → API) into the `ONLINE` line at the top of `js/scores.js`.

The anon key is meant to be public. Anyone could post a fake score, so it's for fun between friends, not prizes.

## Code

- `js/ski/` Peak Rush
- `js/kit/` shared engine for the other games: renderer and sky, particles, sound, menus and HUD, game loop, a posable 3D character, motorbikes and cars (`vehicles.js`)
- `js/profile.js`, `js/scores.js`, `js/net.js` names, leaderboards and multiplayer
- `js/<game>/game.js` and `play/<game>.html` one folder and page per game

Snow, rock and bark textures in `textures/` were baked in Blender. Built with [three.js](https://threejs.org).
