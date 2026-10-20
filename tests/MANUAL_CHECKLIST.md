# Manual test checklist

Run on a real phone (landscape and portrait) and on a desktop browser. The automated suites (`npm test`, `npm run e2e`) cover logic and flows; this list covers what only a person on real hardware can judge.

## Install and offline
- [ ] Open the hosted HTTPS URL, finish setup, install to the home screen.
- [ ] Turn on airplane mode, launch from the home screen: Home loads, a Pitch Lab block runs, data saves.
- [ ] Reload: settings, plan and history are still there.

## Setup and calibration
- [ ] Onboarding takes under 2 minutes.
- [ ] Card calibration: the box matches a real bank card within a millimetre or two.
- [ ] Settings → Timing self-check: the frame-rate test reports ≥ 55 fps with < 5 % late frames on the phone. Write down the tap-test uncertainty.

## Pitch Lab (do each mode once)
- [ ] Zone Call: answers register on the first tap; F/J keys work on desktop; "Too slow" appears when the window ends.
- [ ] A 95 mph fastball feels about as fast as live pitching at true size (use the fixed 95 mph speed).
- [ ] Seams and spin: with cue assist on, sliders show the red dot and four-seamers show stripes; with assist off, the ball still shows a spin pattern.
- [ ] Pitch ID with 4 types; Swing/Take shows ms early/late; Location picker taps land where expected.
- [ ] Occlusion: the ball really disappears at the stated distance; the level rises after correct runs.
- [ ] Tunnel Trainer: the two pitches look the same early, then split; Review shows the tunnel window and divergence point.
- [ ] Review: play backward/forward, 0.1× speed, side/overhead/orbit (drag to rotate), close and continue.
- [ ] Left-handed and mixed pitchers, each arm slot: the release point and break direction look right.
- [ ] Graphics quality Low/High both look right; Auto keeps motion smooth.
- [ ] Stereo: anaglyph looks correct with red-cyan glasses (red on the left eye); side-by-side works in a phone viewer (tap left/right halves); Enter VR on a headset browser (if available).

## Gym
- [ ] Every drill starts, adapts (the level badge changes after a session) and ends on time.
- [ ] Peripheral: the flash direction and centre-arrow questions work with the thumb.
- [ ] Near-Far guided version with a real distant object; Anticipation phone-swing variant (iOS asks for motion permission).
- [ ] Visual Span: a 50 ms flash is visible but brief.

## Eye Check
- [ ] The full run takes about 8 minutes with no feedback during tests; results show margins of error.
- [ ] A second run on another day shows "within noise" / "real" verdicts.

## Plan and progress
- [ ] Home's "Start today's session" runs blocks in order; finishing a session moves to session 2.
- [ ] Progress: charts render with tooltips in dark and light themes; the "Show as table" views match.
- [ ] Real Results Log: add entries; with few entries the verdict says there is too little data; deleting works.
- [ ] Export JSON → Delete all data → Import JSON: everything returns.

## Safety
- [ ] Strobe: the warning appears every time it is enabled; it can't be enabled while Reduce motion is on; the rate can't exceed 4 Hz; STOP clears it instantly.
- [ ] The break reminder appears after the set minutes; the daily cap blocks training until overridden.
- [ ] "My eyes feel strained" shows rest guidance and the rest reminder on the next start.
- [ ] About section shows the medical disclaimer.

## Accessibility
- [ ] Everything outside training works with the keyboard alone (visible focus ring).
- [ ] Screen reader announces feedback messages; buttons have labels.
- [ ] Reduce motion removes head sway and animations.
