# Blade Duels

A first-person blade duel tournament that runs in the browser (HTML5 canvas, no dependencies, no build step).
8 fighters, 3 matches (quarterfinal, semifinal, final), each match best of 3 rounds.

## Play

Open `index.html` in a browser (or run `python3 -m http.server` inside this folder).

## Rules

Every turn you pick **in secret** three things, and so does the bot. Then the picks are revealed and resolved at once:

1. **Attack**: Quick, Heavy, Thrust, Feint or Rest.
2. **Direction** of the attack: high, mid or low.
3. **Block**: high, mid or low.

| Situation | Result |
|---|---|
| Attack hits the zone the rival is blocking | Blocked |
| Quick vs Heavy | The Heavy is interrupted |
| Heavy vs block | Guard break (partial damage) |
| Feint vs block | The rival is left **open** (their block does not count next turn) |
| Thrust vs Feint | Punish: a hit that ignores the block |
| Quick/Thrust blocked with a streak >= 2 | **Parry**: the attacker is left open |

**Combo tree.** Every attack that is not cut off adds to your streak and the tree narrows:
streak 0 = everything is open; 1 = no repeating the direction and fewer types; 2 = adjacent directions and 1-2 types;
3 = forced finisher (Heavy or Thrust), after which the streak resets. Certain sequences are **combos** with a damage
multiplier (Scissors, Stinger, Charge, Decoy, Tide, Guillotine, Eclipse).
Everything costs **stamina**; with no stamina you can only rest.

**3-second clock.** You have 3 s each turn. Once all 3 picks are set the turn is sent automatically. How fast you decide
is power: the attack hits from ×0.8 (slow) to ×1.3 (instant), and the faster you pick your block the less punishment
leaks through (guard break, thrust). A very fast block (>= 0.8) is **perfect** and also breaks the attacker's streak.
If time runs out, whatever is missing is filled in at random with no bonus (if you picked nothing, you rest).
The bot decides at a speed that depends on its level. Changing a pick you already made does not reset the clock.
While you decide, the mannequin stays alive in a relaxed stance: slow weight shifts, a breathing sway and an occasional
probing jab, getting slightly more restless as the clock runs down.

**Comic-book hits.** Every impact lands as a comic panel: a starburst with a sound-effect word (SLASH!, WHAM!, STAB!,
CLANG!, KRAKOOM!, or the combo name), halftone Ben-Day dots, kinetic lines radiating from the point of impact, and on big
hits a red inked freeze frame with black silhouettes (primal) or a glitch flash (neon).

**Blur and motion.** Directional blur on slashes, radial zoom on thrusts and charges, speed lines when you attack fast,
and blurred vision when you are badly hurt or left open.

**No health bar.** Damage shows on the bodies: every hit opens a persistent wound on the mannequin (cut, hole or big
gash depending on the attack) that runs and drips until the end of the round, leaves pools and splashes the camera;
as damage builds the mannequin cracks, slumps and loses its guard. Your own damage shows in your vision: blood on the
lens, slashes, a red vignette with a heartbeat and a trembling hand. Condition is also summed up in words
(Unhurt, Scratched, Wounded, Badly hurt, Near death) on screen and in the panel.

Keys: `Q W E R T` attack type, `1 2 3` direction, `Z X C` block.

## Install as an app (phone)

The page is an installable web app (manifest, icons, offline fallback). It needs to be served over HTTPS.
Free option, since the repo is on GitHub: **GitHub Pages**.

1. On GitHub open the repo -> **Settings** -> **Pages**.
2. Under *Build and deployment* choose **Source: Deploy from a branch**, **Branch: `main`**,
   folder **`/ (root)`**, and press **Save**.
3. Wait 1-2 minutes. The game is then at `https://<user>.github.io/<repo>/`
   (for this repo: `https://matipetersen.github.io/blade-duels/`).

Every push to that branch redeploys automatically. Then open that address on the phone and:

- **iPhone / iPad (Safari):** Share -> Add to Home Screen.
- **Android (Chrome):** menu -> Install app / Add to Home screen.

It then opens full screen with the Blade Duels icon. The service worker is network-first, so when you update the game
the installed app loads the new version as soon as it is online; the cache is only a fallback for offline play.
The icons are generated from one SVG: `node tools/make-icons.js` (needs Playwright with Chromium).

## Layout

| File | Role |
|---|---|
| `core.js` | Pure rules (no DOM): combo tree, `step()` that returns events |
| `ai.js` | Bot: models your habits and simulates candidates with the same `step()`. It cannot see your move |
| `render.js` | First-person camera, procedural mannequin with persistent wounds, fluids and splatter, **Neon** and **Primal** skins, hitstop, shake and blur |
| `audio.js` | Sound effects synthesized with WebAudio |
| `main.js`, `index.html`, `style.css` | Tournament flow and interface |
| `manifest.webmanifest`, `sw.js`, `icons/`, `tools/make-icons.js` | Installable web app: manifest, service worker, icon set and its generator |
| `tests/sim.js` | Rules tests and a bot-vs-bot balance simulation |

## Tests and balance

```
node tests/sim.js 60
```

Runs the rules tests and simulates bot-vs-bot duels (weapons, levels and personalities) to keep an eye on balance.
