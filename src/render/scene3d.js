// The Pitch Lab 3D scene: field, pitcher, ball, overlays, cameras, stereo/XR.
import * as THREE from 'three';
import { BALL_RADIUS, PLATE_FRONT_Y, PLATE_HALF_WIDTH, RUBBER_Y, MOUND_HEIGHT, IN, moundHeightAt } from '../engine/units.js';
import { stateAt, crossingAt } from '../engine/physics.js';
import { screenFov } from '../engine/optics.js';
import { FrameClock } from '../engine/timing.js';
import { createBall } from './ball.js';
import { createPitcherFigure, toThree, WINDUP_S } from './pitcher.js';
import { StereoOutput } from './stereo.js';

export const MIN_VFOV = { batter: 20, centered: 34 };
const SKY = 0x9fb6c8;
const LIGHT_DIR = new THREE.Vector3(-0.3, 0.85, 0.42).normalize(); // sun behind home plate, high

const QUALITY = {
  low: { pr: 0.85, aa: false, shadows: false },
  medium: { pr: 1.5, aa: true, shadows: false },
  high: { pr: 2, aa: true, shadows: true },
};

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#3f7a3a' : '#468642';
    g.fillRect(0, i * 32, 64, 32);
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 40},${70 + Math.random() * 50},${20 + Math.random() * 30},0.25)`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 1, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 10);
  t.anisotropy = 8;
  return t;
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4f7fb0');
  grd.addColorStop(0.55, '#9fbfd8');
  grd.addColorStop(1, '#c6d6e2');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Flat shape on the ground from physics-coordinate [x, y] points.
function groundShape(points, color, height = 0.01, opts = {}) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ShapeGeometry(s, 24);
  geo.rotateX(-Math.PI / 2); // shape x→X, shape y→ -Z  (physics y → -Z)
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, ...opts }));
  m.position.y = height;
  m.receiveShadow = true;
  return m;
}

function strip(a, b, width, color, h = 0.02) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * width / 2, ny = (dx / len) * width / 2;
  return groundShape([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], color, h);
}

function buildField(scene, { shadows }) {
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshLambertMaterial({ map: grassTexture() }));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = shadows;
  scene.add(grass);
  const dirt = 0x9a6b45;
  // infield skin: sector from home plate
  const skin = [[0, -8]];
  for (let a = -48; a <= 48; a += 3) { const r = 155 - Math.abs(a) * 0.2; skin.push([Math.sin(a * Math.PI / 180) * r, Math.cos(a * Math.PI / 180) * r]); }
  scene.add(groundShape(skin, dirt, 0.005));
  // infield grass: square with bases 90 ft apart, slightly inset
  const s2 = 90 / Math.SQRT2;
  scene.add(groundShape([[0, 13], [s2 - 6, s2 - 0.5], [0, 2 * s2 - 12], [-(s2 - 6), s2 - 0.5]], 0x438140, 0.01));
  // home plate circle
  const circle = (cx, cy, r, color, h) => { const pts = []; for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return groundShape(pts, color, h); };
  scene.add(circle(0, 0.7, 13, dirt, 0.015));
  // foul lines
  scene.add(strip([0.7, 0.7], [240, 240], 0.25, 0xf2f2f2, 0.022));
  scene.add(strip([-0.7, 0.7], [-240, 240], 0.25, 0xf2f2f2, 0.022));
  // batter's boxes (4 × 6 ft, 6 in from the plate), 3 in chalk
  for (const side of [-1, 1]) {
    const x0 = side * (PLATE_HALF_WIDTH + 0.5), x1 = side * (PLATE_HALF_WIDTH + 4.5), y0 = 0.708 - 3, y1 = 0.708 + 3;
    const w = 0.25;
    scene.add(strip([x0, y0], [x0, y1], w, 0xf2f2f2, 0.025));
    scene.add(strip([x1, y0], [x1, y1], w, 0xf2f2f2, 0.025));
    scene.add(strip([x0, y0], [x1, y0], w, 0xf2f2f2, 0.025));
    scene.add(strip([x0, y1], [x1, y1], w, 0xf2f2f2, 0.025));
  }
  // home plate
  const hw = PLATE_HALF_WIDTH;
  scene.add(groundShape([[-hw, PLATE_FRONT_Y], [-hw, 8.5 * IN], [0, 0], [hw, 8.5 * IN], [hw, PLATE_FRONT_Y]], 0xf7f7f2, 0.03));
  // mound: 18 ft circle, 10 in high
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, MOUND_HEIGHT, 40, 1), new THREE.MeshLambertMaterial({ color: dirt }));
  mound.position.set(0, MOUND_HEIGHT / 2, -59);
  mound.receiveShadow = shadows;
  scene.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0xf7f7f2 }));
  rubber.position.set(0, MOUND_HEIGHT + 0.02, -(RUBBER_Y + 0.25));
  scene.add(rubber);
  // outfield wall and the dark batter's-eye backdrop
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(400, 400, 12, 64, 1, true, Math.PI * 0.75, Math.PI * 0.5), new THREE.MeshLambertMaterial({ color: 0x1f4a2e, side: THREE.BackSide }));
  wall.position.set(0, 6, 0);
  scene.add(wall);
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(470, 470, 44, 64, 1, true, Math.PI * 0.72, Math.PI * 0.56), new THREE.MeshLambertMaterial({ color: 0x3a4350, side: THREE.BackSide }));
  stands.position.set(0, 22, 0);
  scene.add(stands);
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(90, 48), new THREE.MeshLambertMaterial({ color: 0x0e1d14 }));
  eye.position.set(0, 24, -405);
  scene.add(eye);
}

export class PitchScene {
  constructor(container, settings) {
    this.settings = settings;
    this.container = container;
    const qName = settings.prefs.quality === 'auto' ? 'medium' : settings.prefs.quality;
    this.q = { ...QUALITY[qName] || QUALITY.medium };
    this.autoQuality = settings.prefs.quality === 'auto';
    const renderer = new THREE.WebGLRenderer({ antialias: this.q.aa, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pr));
    renderer.shadowMap.enabled = this.q.shadows;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'stage';
    container.prepend(renderer.domElement);
    this.renderer = renderer;
    this.output = new StereoOutput(renderer);
    this.output.setMode(settings.prefs.stereo, settings.prefs.eyeSepCm / 30.48);

    const scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(SKY, 150, 900);
    this.scene = scene;
    scene.add(new THREE.HemisphereLight(0xdfe9f3, 0x3d5a2a, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(LIGHT_DIR).multiplyScalar(120);
    sun.target.position.set(0, 0, -30);
    if (this.q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 50, far: 260 });
    }
    scene.add(sun, sun.target);
    buildField(scene, { shadows: this.q.shadows });

    this.figure = createPitcherFigure({ shadows: this.q.shadows });
    scene.add(this.figure.group);
    this.ball = createBall({ quality: qName });
    this.ball.setFog(SKY, 150, 900);
    scene.add(this.ball.mesh);
    // blob shadow under the ball (consistent with the sun direction)
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_RADIUS * 1.1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    // overlays (review / assist)
    this.overlays = new THREE.Group();
    scene.add(this.overlays);
    this.zoneGroup = new THREE.Group();
    scene.add(this.zoneGroup);
    this.zoneGroup.visible = false;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 2000);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    scene.add(this.rig);
    this.view = settings.prefs.view === 'centered' ? 'centered' : 'batter';
    this.orbit = { az: 0.9, el: 0.25, r: 55, target: new THREE.Vector3(0, 4.5, -28) };
    this.clock = new FrameClock();
    this.pitch = null;
    this.releaseAt = Infinity; // performance.now() time of release
    this.occlusionFt = Infinity;
    this.cue = 0;
    this.ballHidden = false;
    this.timeScale = 1;
    this.sway = settings.prefs.headSway && !settings.prefs.reduceMotion;
    this.fovInfo = { trueV: 0, usedV: 0, scale: 1 };
    this.onFrame = null;
    this._lowFrames = 0;
    this._v = new THREE.Vector3();
    this._pitcherHand = 'R';
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    renderer.setAnimationLoop((ts) => this.#loop(ts));
  }

  // ---- configuration --------------------------------------------------
  setZone(zone) {
    this.zoneGroup.clear();
    const w = 2 * PLATE_HALF_WIDTH, h = zone.top - zone.bottom, d = PLATE_FRONT_Y;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: 0x46c2ff, transparent: true, opacity: 0.16, depthWrite: false }));
    box.position.set(0, zone.bottom + h / 2, -d / 2);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x9fe1ff }));
    edges.position.copy(box.position);
    this.zoneGroup.add(box, edges);
    this.zone = zone;
  }

  showZone(v) { this.zoneGroup.visible = v; }

  setPitcher(pitcher) {
    this.pitcherInfo = pitcher;
    this.figure.setPitcher(pitcher);
    this._pitcherHand = pitcher.hand;
    this.updateCamera();
  }

  // Prepares a pitch. releaseAt: performance.now() time of release (Infinity = not scheduled).
  setPitch(pitch, { releaseAt = Infinity, occlusionFt = Infinity, cue = 0 } = {}) {
    this.pitch = pitch;
    this.releaseAt = releaseAt;
    this.occlusionFt = occlusionFt;
    this.cue = cue;
    this.reviewT = null;
    if (pitch) {
      this.figure.setRelease(pitch.p0);
      this.ball.setSpin(new THREE.Vector3(pitch.spin[0], pitch.spin[2], -pitch.spin[1]), pitch.seam, pitch.p0[0] * 7);
      this.ball.setCue(cue);
      this._spinRate = Math.hypot(...pitch.spin);
    }
  }

  // Review mode: show the pitch at a fixed flight time t (s), no clock.
  setReviewTime(t) { this.reviewT = t; }

  setTimeScale(s) { this.timeScale = s; }

  setView(view) { this.view = view; this.updateCamera(); }

  // ---- overlays -------------------------------------------------------
  clearOverlays() {
    for (const c of [...this.overlays.children]) { c.geometry?.dispose(); c.material?.dispose(); this.overlays.remove(c); }
  }

  addTrajectory(pitch, color = 0xffd34d, { dashed = false, toT = Infinity } = {}) {
    const pts = [];
    const end = Math.min(toT, pitch.plate.t + 0.05);
    for (let t = 0; t <= end; t += 0.005) { const s = stateAt(pitch.traj, t); pts.push(new THREE.Vector3(s.x, s.z, -s.y)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4 }) : new THREE.LineBasicMaterial({ color });
    const line = new THREE.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    this.overlays.add(line);
    return line;
  }

  addMarker(physPos, color = 0xff5d5d, radius = 0.25) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.7, radius, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false }));
    toThree(physPos, ring.position);
    ring.renderOrder = 10;
    this.overlays.add(ring);
    return ring;
  }

  // A square "window" at distance y that the tunnelled pitches pass through.
  addTunnelWindow(physCenter, sizeFt = 0.5, color = 0x3ddc84) {
    const geo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(sizeFt, sizeFt));
    const sq = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
    toThree(physCenter, sq.position);
    this.overlays.add(sq);
    return sq;
  }

  // Ghost ball at a fixed position (e.g. plate crossing in review).
  addGhost(physPos, color = 0xffffff, opacity = 0.5) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 16, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    toThree(physPos, m.position);
    this.overlays.add(m);
    return m;
  }

  // ---- camera ---------------------------------------------------------
  eyePosition() {
    const p = this.settings.profile;
    let bats = p.bats;
    if (bats === 'S') bats = this._pitcherHand === 'R' ? 'L' : 'R';
    const side = bats === 'L' ? 1 : -1;
    return [side * 2.3, 0.9, (p.heightIn / 12) * 0.82];
  }

  updateCamera() {
    const cam = this.camera;
    const w = this.container.clientWidth || innerWidth, hh = this.container.clientHeight || innerHeight;
    cam.aspect = w / hh;
    const cal = this.settings.calibration;
    const trueV = screenFov(w, hh, cal).vDeg;
    const scale = this.settings.prefs.fovScale || 1;
    let eye, target, fov;
    const rel = this.pitcherInfo?.release || [-2, 54.2, 6];
    switch (this.view) {
      case 'centered':
        eye = [0, -6, 4.3]; target = [0, 40, 3.3];
        fov = Math.max(MIN_VFOV.centered, trueV * scale);
        break;
      case 'catcher':
        eye = [0, -4, 3.1]; target = [0, 30, 4]; fov = 40; break;
      case 'side':
        eye = [48, 28, 5]; target = [0, 28, 4.2]; fov = 42; break;
      case 'overhead':
        eye = [0.01, 28, 62]; target = [0, 28, 0]; fov = 55; break;
      case 'orbit': {
        const o = this.orbit;
        const t = o.target;
        cam.fov = 45;
        cam.position.set(t.x + o.r * Math.cos(o.el) * Math.sin(o.az), t.y + o.r * Math.sin(o.el), t.z + o.r * Math.cos(o.el) * Math.cos(o.az));
        this.rig.position.set(0, 0, 0);
        cam.up.set(0, 1, 0);
        cam.lookAt(t);
        cam.updateProjectionMatrix();
        this.fovInfo = { trueV, usedV: 45, scale: trueV / 45 };
        return;
      }
      default: { // batter's eye
        eye = this.eyePosition();
        // Look between the release point and the middle of the flight, slightly low,
        // so release and most of the flight stay in view.
        target = [rel[0] * 0.6, rel[1] * 0.7, rel[2] * 0.72];
        fov = Math.max(MIN_VFOV.batter, trueV * scale);
      }
    }
    cam.fov = fov;
    this.rig.position.set(0, 0, 0);
    cam.position.copy(toThree(eye));
    cam.up.set(0, 1, 0);
    cam.lookAt(toThree(target));
    cam.updateProjectionMatrix();
    this.baseCamPos = cam.position.clone();
    this.fovInfo = { trueV, usedV: fov, scale: trueV / fov };
  }

  orbitBy(dx, dy) {
    this.orbit.az -= dx * 0.008;
    this.orbit.el = Math.max(-0.1, Math.min(1.45, this.orbit.el + dy * 0.008));
    if (this.view === 'orbit') this.updateCamera();
  }

  zoomBy(f) { this.orbit.r = Math.max(8, Math.min(140, this.orbit.r * f)); if (this.view === 'orbit') this.updateCamera(); }

  resize() {
    const w = this.container.clientWidth || innerWidth, hh = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, hh, false);
    this.updateCamera();
  }

  setPixelRatio(pr) { this.renderer.setPixelRatio(pr); this.resize(); }

  // ---- frame ----------------------------------------------------------
  // Flight time (s) of what will be on screen at the next display refresh.
  flightTime(nowMs) {
    if (this.reviewT !== null && this.reviewT !== undefined) return this.reviewT;
    return ((nowMs + this.clock.presentLead() - this.releaseAt) / 1000) * this.timeScale;
  }

  #loop(ts) {
    const now = performance.now();
    this.clock.tick(ts || now);
    this.onFrame?.(now);
    this.renderFrame(now);
    if (this.autoQuality) this.#adaptQuality();
  }

  renderFrame(now) {
    const t = this.flightTime(now);
    const p = this.pitch;
    let hand = null;
    if (p) hand = this.figure.pose(Math.max(-WINDUP_S, Math.min(1.2, t)));
    else this.figure.pose(-WINDUP_S);
    let visible = false;
    if (p) {
      const v = this._v;
      if (t < 0) {
        if (hand) { toThree(hand, v); visible = true; }
        this.ball.setRotation(0, 0);
      } else if (t <= p.traj.dt * (p.traj.n - 1)) {
        const s = stateAt(p.traj, t);
        v.set(s.x, s.z, -s.y);
        visible = p.p0[1] - s.y <= this.occlusionFt;
        // Exposure blur: rotation during roughly one frame (or the slow-motion equivalent).
        const exposure = Math.min(this.clock.frameMs, 20) / 1000 * (this.reviewT !== null && this.reviewT !== undefined ? 0.25 : this.timeScale);
        this.ball.setRotation(this._spinRate * t, this._spinRate * exposure);
      }
      if (visible) {
        this.ball.mesh.position.copy(v);
        // blob shadow: project along the sun direction onto the ground/mound
        const groundY = moundHeightAt(-v.z) * (Math.abs(v.x) < 9 && -v.z > 50 ? 1 : 0);
        const hgt = Math.max(0, v.y - groundY);
        this.shadow.position.set(v.x - (LIGHT_DIR.x / LIGHT_DIR.y) * hgt, groundY + 0.035, v.z - (LIGHT_DIR.z / LIGHT_DIR.y) * hgt);
        this.shadow.material.opacity = Math.max(0.08, 0.4 - hgt * 0.04);
      }
    }
    this.ball.mesh.visible = visible && !this.ballHidden;
    this.shadow.visible = this.ball.mesh.visible;
    this.lastVisible = this.ball.mesh.visible;
    this.lastT = t;
    if (this.sway && this.baseCamPos && (this.view === 'batter' || this.view === 'centered')) {
      const s = now / 1000;
      this.camera.position.set(this.baseCamPos.x + Math.sin(s * 1.7) * 0.03, this.baseCamPos.y + Math.sin(s * 1.1) * 0.015, this.baseCamPos.z);
    }
    this.output.render(this.scene, this.camera);
  }

  #adaptQuality() {
    const fm = this.clock.frameMs;
    if (fm > 21) this._lowFrames++; else this._lowFrames = Math.max(0, this._lowFrames - 1);
    if (this._lowFrames > 90) {
      this._lowFrames = 0;
      const pr = this.renderer.getPixelRatio();
      if (pr > 0.6) this.setPixelRatio(Math.max(0.6, pr * 0.8));
    }
  }

  // ---- WebXR --------------------------------------------------------------
  async enterXR(onSelect) {
    const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(session);
    this.rig.position.copy(toThree(this.eyePosition()));
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    // Controllers: trigger = "select" (primary answer), grip = "squeeze" (secondary answer).
    session.addEventListener('select', (e) => onSelect?.('primary', performance.now(), e));
    session.addEventListener('squeeze', (e) => onSelect?.('secondary', performance.now(), e));
    session.addEventListener('end', () => { this.renderer.xr.enabled = false; this.updateCamera(); });
    return session;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.resize);
    this.ball.dispose();
    this.output.dispose();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export { crossingAt };
