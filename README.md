# Batter's Eye

An offline baseball vision-training app for one hitter. It focuses on what the evidence says matters most: picking up pitch information early (release, spin, early flight) and making good swing decisions under time pressure. Supporting visual-skill drills fill out each session, and the app measures everything so it can tell you honestly whether training is working.

- Installable PWA (phone, tablet, laptop). No accounts, no backend, no tracking.
- All data stays on the device (IndexedDB). There are no network calls after the first load; the Content-Security-Policy in `index.html` enforces `connect-src 'self'`.
- Plain HTML/CSS/ES modules with no build step. Three.js r186 is copied into `vendor/three/` (MIT).

> **This app trains visual skills for baseball. It does not diagnose or treat eye conditions and does not replace an eye exam. If you suspect an actual eyesight problem, see an optometrist.**

---

## Running it

```bash
npm run serve          # static server on http://localhost:8080 (no dependencies)
npm test               # unit tests (Node's built-in runner): physics, staircase, scoring, planner, data
npm run e2e            # browser tests in headless Chromium via Playwright (uses a global install)
npm run precache       # regenerate precache-list.js after adding or changing files
```

**Installing on a phone.** Service workers need HTTPS (or `localhost`). Host the folder on any static HTTPS host (GitHub Pages, Netlify, your own server), open it on the phone, then use "Add to Home Screen" (iOS Safari) or "Install app" (Android Chrome). After the first visit everything is cached and works offline. The precache list is checked by a unit test, so a stale cache fails `npm test`.

**First run** takes under 2 minutes:
1. Batting side.
2. Level: sets the velocity range.
3. Height: sets your strike zone.
4. Screen calibration: match a bank card on screen, then pick your viewing distance.

Then you can take the 8-minute Eye Check.

---

## What's in it

| Area | What it does |
|---|---|
| **Home** | One "Start today's session" button, this week's 3-session plan, minutes today against the daily cap, streak, composite score. |
| **Pitch Lab** | 3D batter's-eye pitch simulator with six modes, review/replay, an adaptive engine and bias detection. |
| **Gym** | Twelve supporting drills (60–180 s each, all adaptive) plus Strobe Mode. |
| **Eye Check** | An 8-minute baseline of 9 tests (+1 optional stereo test). Scores are relative to your own first run. |
| **Progress** | In-app improvement kept separate from the Real Results Log, plus the honesty checks. |
| **Settings** | Calibration, graphics quality, stereo, feedback, strobe/safety limits, timing self-check, export/import, About. |

### Pitch Lab
- **Physics.** Pitches are generated from release point, velocity, spin axis and spin rate. Flight is integrated with RK4 at 1 ms steps, with gravity, drag (Cd 0.33) and Magnus lift (Sawicki/Nathan lift curve), over the real 60.5 ft distance. A 95 mph fastball reaches the front of the plate in about 0.40 s and loses about 9 % of its speed on the way.
- **Pitch types.** Four-seam, sinker, cutter, slider, sweeper, curveball, changeup and splitter, from left- or right-handed pitchers. Arm slot can be over the top, three-quarter, low three-quarter or sidearm; the slot changes the release point and the movement direction. Release-point "tells" fade as difficulty rises, or can be turned off entirely (deception).
- **Aiming.** A Newton solver aims each pitch at a plate location, or through a shared tunnel point, to within ¼ in.
- **Rendering.**
  - The ball is a sphere with a procedural seam texture.
  - A shader spins it about the true axis at the true rate and averages several rotations per frame (exposure blur), so a four-seamer reads as stripes and a gyro slider shows its "dot".
  - Cue assist adds a red pole dot and a blue equator stripe, and fades automatically as you improve.
  - The pitcher is an abstract low-poly figure whose hand reaches the exact release point.
  - Depth cues: perspective, an optional head-sway parallax, a ball shadow aligned with the sun, and distance fog.
- **Camera.** The camera sits at your eyes in the batter's box. The field of view comes from your calibrated screen size and viewing distance, so the ball's angular size and speed match real life where the screen allows. On screens too small for that, the app says what scale it is showing.
- **Modes.**
  - Zone Call.
  - Pitch ID: 2–4 types, with a staircase per pitch pair.
  - Swing/Take: scored on decision and on timing error in milliseconds, early or late.
  - Location Call: tap where the pitch crossed; scored in inches.
  - Occlusion: the ball vanishes a set distance after release, about 42 ft down to 5 ft. This is the main progression.
  - Tunnel Trainer: pairs of pitches through a shared tunnel point; name the second pitch.
- **Review.** Replay forward or backward at 1×, 0.25× or 0.1×, or step 10 ms at a time. Camera views: batter, catcher, side, overhead and free orbit. Overlays show the path, release point, strike-zone volume, tunnel window and divergence point, along with the true spin numbers.
- **Stereo.** Off (default), red-cyan anaglyph (Dubois matrices), side-by-side for phone headsets (answers become full-height tap zones), and WebXR immersive mode when a headset browser supports it (trigger and grip answer). Physics, timing and scoring are identical in every mode.
- **Quality.** Low, medium, high or auto. Low reduces pixel ratio and turns off antialiasing and shadows; auto steps the pixel ratio down if frames run long. The scene is about 31 draw calls and 3k triangles.

### Timing accuracy
- Every clock is `performance.now()`. Taps are timestamped with `PointerEvent.timeStamp`, not handler time.
- The ball is drawn where it will be when the frame actually reaches the screen (about one frame ahead of the rAF timestamp).
- Settings has a **timing self-check**:
  - a frame-rate test (fps, median and 95th-percentile frame time, % late frames);
  - a tap-along test (average offset, spread, overall uncertainty, input delivery delay).

  You can optionally subtract the measured offset from timing-drill taps; this is off by default because the offset mixes device lag with your own tendency to tap early.
- In the browser tests, presses scheduled in the page come back within a few milliseconds of the intended swing timing (typically 1–7 ms; the test fails above 12 ms). That measures the software pipeline only; touch-screen and display latency on a real device come on top and are what the self-check estimates.

### Adaptive engine
- **Staircase.** A transformed up-down staircase (Levitt), 2-down/1-up, which settles near **70.7 % correct**. Go/No-Go uses 3-down/1-up (about 79 %). Steps halve at reversals, and the threshold is the mean of the last six reversals.
- **One staircase per job.** Each Pitch Lab mode, each pitch pair (Pitch ID, Tunnel) and each drill has its own staircase, stored in IndexedDB. After a week of inactivity a staircase resumes with a larger step so it re-converges quickly.
- **Level.** Level runs 0–20. Each ladder maps it to concrete difficulty variables: velocity, occlusion distance, pitch similarity (release tells and tunnel length), distance from the zone edge, response window, cue-assist fade, target size, exposure time and contrast.
- **Bias.** Ball/strike bias uses signal detection (d′ and criterion c). The app reports over-calling strikes or balls only after 20+ calls.

### Smart plan
- Three sessions a week of about 15 minutes each. Pitch Lab fills at least half of every session: 4 blocks, always including one decision mode and one recognition mode.
- Three Gym drills per session target the weakest skills from the Eye Check, plus a rotating variety slot. Multiple-object tracking is never a priority pick.
- After each completed session, and after each new Eye Check, the remaining sessions are rebuilt from the latest data. Recognition work moves toward occlusion and tunnelling as Pitch ID levels rise.

### Data
IndexedDB `battersEye` has these stores: `kv` (settings, usage), `sessions`, `trials` (every trial: stimulus parameters, response, correctness, reaction time, timing error, level, staircase key, timestamp), `staircases`, `assessments`, `plans` and `realResults`.

**Export/import.**
- *Settings → Your data* exports everything as JSON and imports it back. Import is a single IndexedDB transaction: either everything lands or nothing changes.
- Sessions and trials can also be exported as CSV, which gives per-pitch reports.
- The round-trip is tested both in Node and in the browser.

---

## How each drill maps to a skill

| Drill / test | Skill trained or measured | Notes |
|---|---|---|
| Pitch Lab: Zone Call, Swing/Take, Location | Ball/strike judgment, swing decisions, timing | Closest to the real task; weighted most in the plan |
| Pitch Lab: Pitch ID, Occlusion, Tunnel | Early pitch recognition (release, spin, early flight) | Occlusion is the main progression |
| Anticipation Timing (+ phone-swing variant) | Coincidence-anticipation timing | Similar to the LED-sweep drills used in the D1 study |
| Go / No-Go | Response inhibition (plate discipline) | Go = ball in zone, no-go = outside |
| Saccade Snap / Saccade Check | Saccade speed and accuracy | Snap = tap targets; Check (Eye Check) = read a briefly flashed target |
| Pursuit Trace | Smooth pursuit | A gap flashes mid-path; optional finger/mouse tracking error |
| Dynamic Acuity | Dynamic visual acuity | Landolt C crossing the screen |
| Contrast Hunter | Contrast sensitivity | Log staircase; 8-bit displays limit it to about 0.8 % |
| Peripheral Awareness | Peripheral detection with central fixation | A centre task detects fixation breaks |
| Near-Far Shift | Near-far fixation and focus shifting | Screen version shifts attention only; the guided version uses a real distant object to train focusing |
| Visual Span | Tachistoscopic recognition (50–300 ms) | Exposure rounded to whole frames; actual time logged |
| Visual Search | Search efficiency | Conjunction search with spin-dot balls |
| Multi-Object Tracking | Multiple-object tracking | **Lower priority** (weak transfer evidence) |
| Strobe Mode | Intermittent vision | Overlay for Pitch Lab and tracking/timing drills |
| Reaction time (Eye Check) | Simple reaction time | |
| Stereo depth (Eye Check, optional) | Stereo acuity | Random-dot stereograms plus a 3D ball-distance judgment, red-cyan or side-by-side |

**Eye Check scoring.** Your first Eye Check sets every skill to 50. Later scores are `50 + 50·(Δ performance / a "large change")`, clamped to 0–100. Every score has a margin of error (bootstrap or analytic), and a re-test only calls a change "real" when it exceeds 1.96× the combined error; otherwise it says "within noise". The composite weights pitch recognition and ball/strike judgment the most.

---

## The evidence, honestly

These findings shaped the design:

- Hitters track the ball well until roughly 8–10 ft from the plate, then rely on anticipation built from early information: release point, spin and early flight. Head movement matters too. So the most valuable thing to train is **early information pickup and decision-making**, not "faster eyes". That is why Pitch Lab is at least half of every session, and why occlusion (calling pitches from less and less flight) is the main progression.
- A pre-registered, placebo-controlled study of 24 Division I players found that a mix of stroboscopic, anticipatory-timing and eye-quickness drills improved launch angle and hit distance in batting practice. A separate study of 80 players found adaptive batting training in a virtual environment beat extra regular practice, and the gains showed up in real statistics.
- Generic digital drills (dynamic acuity, contrast, depth) showed no significant gains in one 3-week controlled study. Systematic reviews describe far transfer from generic perceptual-cognitive training as weakly supported, and multiple-object-tracking claims in particular did not hold up in independent reviews.
- In the coaching experience the market research drew on, hitters were much better at ball/strike calls than at pitch-type calls. Results improved when someone helped interpret the numbers and kept the hitter on a routine.

**What the app does with this**
- It prioritises sport-specific, adaptive, time-pressured training that resembles the real task.
- Generic drills are kept as supporting work aimed at your weakest areas.
- In-app gains (near transfer) are kept strictly separate from real-world results.
- It never claims real-game improvement unless your own Real Results Log shows a change beyond chance (two-proportion test, p < 0.05, with minimum sample sizes). It says plainly when there is too little data, and it reminds you that even a real change has other possible causes.
- It contains no inflated marketing language (a unit test checks the strings).

## Safety
- **Strobe mode.**
  - Off by default.
  - The photosensitivity warning is shown every time it is switched on.
  - Hard cap of 4 flashes per second; the visible fraction of each cycle stays between 20 and 90 %.
  - Uses a dim grey occluder by default instead of full black.
  - Blocked while Reduce motion is on.
- **STOP.** The STOP button (or Esc) is always visible during training and stops everything instantly, including the strobe.
- **Breaks and limits.** A break reminder appears every 20 minutes (20-second look-far rest), and the daily cap defaults to 45 minutes; both are adjustable.
- **Discomfort.** "My eyes feel strained" stops training, shows rest guidance (see an optometrist if symptoms persist) and suggests 2 hours of rest.
- **Reduce motion** follows the OS setting by default.

## Known limitations
- Headless Chromium uses software WebGL, so the frame rate in the automated tests (~15 fps) says nothing about phones. The scene is small (31 draw calls, ~3k triangles, ~0.2 ms CPU per frame), but **60 fps on a mid-range phone still needs to be confirmed on a real device**: run the frame-rate test in Settings. Auto quality steps down if frames run long.
- WebXR mode follows the standard API but could not be tested without a headset.
- A flat screen cannot change your eyes' focus distance, so the on-screen Near-Far version trains attention shifts only; use the guided version for focusing.
- Contrast below about 0.8 % cannot be shown on 8-bit displays, and touch screens add latency that the self-check measures but cannot remove.
- True angular size needs a reasonably large screen at a known distance. On small phones the view is scaled, and the app tells you by how much.

## Extending
- **Translation:** copy `src/i18n/en.js` to `es.js`, translate the values and register it in `src/i18n/i18n.js`. Every UI string lives in the table; a unit test checks that each literal key exists.
- **New drill:** add a file in `src/modules/gym/drills/` that exports `{ id, skill, nameKey, descKey, howKey, stair, ladder(level), create(api) }`. `create` returns `nextTrial`, `start`, `frame`, input handlers and `score`; see `runner.js` for the API. Register it in `registry.js`. The conformance test runs it automatically.

## Folder layout
```
index.html  manifest.webmanifest  sw.js  precache-list.js  css/  icons/  vendor/three/
src/engine/      units, rng, physics, pitches, zone, staircase, scoring, timing, optics
src/render/      scene3d, ball (seam texture + spin shader), pitcher, stereo
src/modules/     pitchlab/ (modes, session, review, stats, zoneplot), gym/ (runner, registry, drills/),
                 assessment/ (eyecheck, metrics), progress/ (realresults), stairs.js
src/plan/        planner (pure), planner-store
src/data/        db (IndexedDB + memory adapters), repo, export, defaults
src/ui/          dom, router, training shell, safety, feedback, charts, calibration, selfcheck, views/
src/i18n/        en.js (all strings), i18n.js
tests/unit/      node:test suites      tests/e2e/   Playwright suites      tests/MANUAL_CHECKLIST.md
tools/           serve.mjs, gen-precache.mjs, make-icons.mjs
```
