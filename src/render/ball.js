// Baseball: procedural seam texture + a shader that spins the surface about the
// true spin axis at the true rate and averages several rotations per frame
// (exposure blur), so fast spin looks the way the eye sees it: stripes on a
// four-seamer, a "dot" on a gyro-heavy slider. Optional cue assist paints the
// axis pole and an equator stripe.
import * as THREE from 'three';
import { BALL_RADIUS } from '../engine/units.js';

// Seam curve on the unit sphere ("tennis-ball curve"): exact for a + b = 1.
const SEAM_A = 0.68, SEAM_B = 0.32, SEAM_C = 2 * Math.sqrt(SEAM_A * SEAM_B);
export function seamPoint(t) {
  return [SEAM_A * Math.cos(t) + SEAM_B * Math.cos(3 * t), SEAM_A * Math.sin(t) - SEAM_B * Math.sin(3 * t), SEAM_C * Math.sin(2 * t)];
}

let seamCanvas = null;

// Equirectangular texture (u = longitude, v = latitude). For each texel we find
// the nearest point on the seam curve, then draw the groove and V-shaped stitches.
export function seamTextureCanvas(W = 512, H = 256) {
  if (seamCanvas) return seamCanvas;
  const N = 720;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const p = seamPoint((i / N) * 2 * Math.PI); pts.set(p, i * 3); }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const STITCHES = 108 / 2; // 108 double stitches around the ball, V pairs
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI;
      const px = cl * Math.cos(lon), py = cl * Math.sin(lon), pz = sl;
      // nearest seam sample (dot product max)
      // coarse search every 8th sample, then refine around the best one
      let best = -2, bi = 0;
      for (let i = 0; i < N; i += 8) {
        const d = px * pts[i * 3] + py * pts[i * 3 + 1] + pz * pts[i * 3 + 2];
        if (d > best) { best = d; bi = i; }
      }
      const c0 = bi;
      for (let k = -8; k <= 8; k++) {
        const i = (c0 + k + N) % N;
        const d = px * pts[i * 3] + py * pts[i * 3 + 1] + pz * pts[i * 3 + 2];
        if (d > best) { best = d; bi = i; }
      }
      const dist = Math.acos(Math.min(1, best)); // radians on the unit sphere
      // signed side via tangent × point
      const i2 = (bi + 1) % N;
      const tx = pts[i2 * 3] - pts[bi * 3], ty = pts[i2 * 3 + 1] - pts[bi * 3 + 1], tz = pts[i2 * 3 + 2] - pts[bi * 3 + 2];
      const sx = pts[bi * 3], sy = pts[bi * 3 + 1], sz = pts[bi * 3 + 2];
      const side = Math.sign((ty * sz - tz * sy) * px + (tz * sx - tx * sz) * py + (tx * sy - ty * sx) * pz);
      const along = ((bi / N) * STITCHES) % 1; // phase within a stitch pair
      let r = 236, gg = 232, b = 222; // leather
      // subtle leather variation
      const n = Math.sin(px * 40 + py * 31) * Math.sin(pz * 37 - px * 13);
      r += n * 4; gg += n * 4; b += n * 4;
      if (dist < 0.035) { r = 205; gg = 198; b = 186; } // groove
      const s = dist * side; // signed distance across the seam
      const a = Math.abs(s);
      if (a > 0.04 && a < 0.16) {
        // V stitch: the stitch line runs diagonally, mirrored on each side.
        const phase = along + (a - 0.04) * 1.6;
        if (Math.abs(phase - Math.round(phase)) < 0.16) { r = 196; gg = 36; b = 40; }
      }
      const o = (y * W + x) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  seamCanvas = cv;
  return cv;
}

const vertexShader = /* glsl */`
  varying vec3 vObjN;
  varying vec3 vWorldN;
  varying float vFogDepth;
  void main() {
    vObjN = normalize(position);
    vWorldN = normalize(mat3(modelMatrix) * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */`
  #define PI 3.14159265359
  uniform sampler2D map;
  uniform vec3 axis;        // unit spin axis (world == object orientation)
  uniform mat3 seamFrame;   // maps spin-frame directions to seam-texture directions
  uniform float angle;      // current spin angle (rad)
  uniform float blurAngle;  // rotation during one exposure (rad)
  uniform float cue;        // 0..1 cue-assist strength
  uniform vec3 lightDir;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  uniform float samples;
  varying vec3 vObjN;
  varying vec3 vWorldN;
  varying float vFogDepth;

  vec3 rotateAbout(vec3 v, vec3 k, float a) {
    float c = cos(a), s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  vec3 sampleSurface(vec3 d) {
    vec3 q = seamFrame * d;
    vec2 uv = vec2(atan(q.y, q.x) / (2.0 * PI) + 0.5, asin(clamp(q.z, -1.0, 1.0)) / PI + 0.5);
    return texture2D(map, uv).rgb;
  }
  void main() {
    vec3 n = normalize(vObjN);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      if (float(i) >= samples) break;
      float a = angle - blurAngle * (float(i) / max(1.0, samples - 1.0));
      col += sampleSurface(rotateAbout(n, axis, -a));
    }
    col /= samples;
    // Cue assist: red dot at the axis poles, light stripe on the spin equator.
    float c = dot(n, axis);
    float dotMask = smoothstep(0.90, 0.93, abs(c));
    float stripe = 1.0 - smoothstep(0.05, 0.09, abs(c));
    col = mix(col, vec3(0.9, 0.08, 0.08), dotMask * cue);
    col = mix(col, vec3(0.15, 0.55, 1.0), stripe * cue * 0.85);
    float diff = max(dot(normalize(vWorldN), lightDir), 0.0);
    col *= 0.45 + 0.65 * diff;
    float f = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
    #include <colorspace_fragment>
  }
`;

const SEAM_AXIS = { 4: new THREE.Vector3(0, 0, 1), 2: new THREE.Vector3(1, 0, 0) };

export function createBall({ quality = 'medium' } = {}) {
  const tex = new THREE.CanvasTexture(seamTextureCanvas(quality === 'low' ? 256 : 512, quality === 'low' ? 128 : 256));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  const uniforms = {
    map: { value: tex },
    axis: { value: new THREE.Vector3(1, 0, 0) },
    seamFrame: { value: new THREE.Matrix3() },
    angle: { value: 0 },
    blurAngle: { value: 0 },
    cue: { value: 0 },
    lightDir: { value: new THREE.Vector3(-0.3, 0.8, 0.4).normalize() },
    fogColor: { value: new THREE.Color(0x9fb6c8) },
    fogNear: { value: 150 },
    fogFar: { value: 900 },
    samples: { value: quality === 'low' ? 6 : 14 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader });
  const seg = quality === 'low' ? 20 : 32;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, seg, Math.round(seg * 0.6)), mat);
  mesh.name = 'ball';
  mesh.frustumCulled = false;

  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  return {
    mesh,
    uniforms,
    // spinWorld: THREE.Vector3 spin vector (rad/s) in three.js world coordinates.
    setSpin(spinWorld, seamType = 4, roll = 0) {
      const ax = spinWorld.clone();
      if (ax.lengthSq() < 1e-9) ax.set(1, 0, 0);
      ax.normalize();
      uniforms.axis.value.copy(ax);
      // Orient the seam pattern so its chosen axis lines up with the spin axis.
      q.setFromUnitVectors(ax, SEAM_AXIS[seamType] || SEAM_AXIS[4]);
      const rollQ = new THREE.Quaternion().setFromAxisAngle(SEAM_AXIS[seamType] || SEAM_AXIS[4], roll);
      q.premultiply(rollQ);
      m4.makeRotationFromQuaternion(q);
      uniforms.seamFrame.value.setFromMatrix4(m4);
    },
    setRotation(angleRad, blurRad) { uniforms.angle.value = angleRad; uniforms.blurAngle.value = blurRad; },
    setCue(v) { uniforms.cue.value = v; },
    setFog(color, near, far) { uniforms.fogColor.value.set(color); uniforms.fogNear.value = near; uniforms.fogFar.value = far; },
    dispose() { tex.dispose(); mat.dispose(); mesh.geometry.dispose(); },
  };
}
