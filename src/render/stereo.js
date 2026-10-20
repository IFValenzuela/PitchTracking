// Stereo output modes. Physics and timing are untouched; only the final image
// differs. off | anaglyph (red-cyan, Dubois matrices) | sbs (side by side).
import * as THREE from 'three';

// Dubois least-squares red-cyan matrices (column-major for GLSL mat3).
const LEFT = new THREE.Matrix3().fromArray([0.4561, -0.0400822, -0.0152161, 0.500484, -0.0378246, -0.0205971, 0.176381, -0.0157589, -0.00546856]);
const RIGHT = new THREE.Matrix3().fromArray([-0.0434706, 0.378476, -0.0721527, -0.0879388, 0.73364, -0.112961, -0.00155529, -0.0184503, 1.2264]);

export class StereoOutput {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = 'off';
    this.focusFt = 40;
    this.stereo = new THREE.StereoCamera();
    this.size = new THREE.Vector2();
    this.rtL = null;
    this.rtR = null;
    this.quad = null;
  }

  setMode(mode, eyeSepFt = 0.207) {
    this.mode = mode;
    this.stereo.eyeSep = eyeSepFt;
    if (mode === 'anaglyph' && !this.quad) this.#initAnaglyph();
  }

  #initAnaglyph() {
    const params = { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter };
    this.rtL = new THREE.WebGLRenderTarget(2, 2, params);
    this.rtR = new THREE.WebGLRenderTarget(2, 2, params);
    const mat = new THREE.ShaderMaterial({
      uniforms: { mapL: { value: this.rtL.texture }, mapR: { value: this.rtR.texture }, cL: { value: LEFT }, cR: { value: RIGHT } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D mapL; uniform sampler2D mapR; uniform mat3 cL; uniform mat3 cR; varying vec2 vUv;
        void main(){ vec3 l = texture2D(mapL, vUv).rgb; vec3 r = texture2D(mapR, vUv).rgb;
        gl_FragColor = vec4(clamp(cL * l + cR * r, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  render(scene, camera) {
    const r = this.renderer;
    if (this.mode === 'off' || r.xr.isPresenting) { r.render(scene, camera); return; }
    camera.updateMatrixWorld();
    // Zero-parallax plane mid-flight: the pitcher sits slightly behind the screen,
    // the ball comes out toward the viewer as it approaches.
    camera.focus = this.focusFt;
    r.getDrawingBufferSize(this.size);
    if (this.mode === 'sbs') {
      const aspect = camera.aspect;
      camera.aspect = aspect / 2;
      camera.updateProjectionMatrix();
      this.stereo.update(camera);
      r.getSize(this.size);
      const w = this.size.x / 2, h = this.size.y;
      r.setScissorTest(true);
      r.setScissor(0, 0, w, h); r.setViewport(0, 0, w, h);
      r.render(scene, this.stereo.cameraL);
      r.setScissor(w, 0, w, h); r.setViewport(w, 0, w, h);
      r.render(scene, this.stereo.cameraR);
      r.setScissorTest(false);
      r.setViewport(0, 0, this.size.x, this.size.y);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      return;
    }
    // anaglyph
    if (this.rtL.width !== this.size.x || this.rtL.height !== this.size.y) {
      this.rtL.setSize(this.size.x, this.size.y);
      this.rtR.setSize(this.size.x, this.size.y);
    }
    this.stereo.update(camera);
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.rtL); r.clear(); r.render(scene, this.stereo.cameraL);
    r.setRenderTarget(this.rtR); r.clear(); r.render(scene, this.stereo.cameraR);
    r.setRenderTarget(prev);
    r.render(this.quadScene, this.quadCam);
  }

  dispose() {
    this.rtL?.dispose(); this.rtR?.dispose();
    this.quad?.geometry.dispose(); this.quad?.material.dispose();
  }
}

// WebXR immersive-vr support check.
export async function xrSupported() {
  try { return !!(await navigator.xr?.isSessionSupported('immersive-vr')); } catch { return false; }
}
