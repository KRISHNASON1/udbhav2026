/**
 * cube.js — Three.js FBX Metallic Cube
 * Identity Card: auto-rotation + smooth drag-to-rotate via GSAP quickTo
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { gsap } from 'gsap';

export function initCubeViewer() {
  const canvas = document.getElementById('cubeCanvas');
  const wrap   = canvas?.parentElement;
  if (!canvas || !wrap) return;

  // ── Renderer ────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled   = true;
  renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  // ── Scene & Camera ──────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 4.5);

  // ── Lighting ────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xfff4e0, 3.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2);
  fill.position.set(-4, 2, -2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 2.0);
  rim.position.set(0, -3, -4);
  scene.add(rim);

  // ── Resize ──────────────────────────────────────────────────────
  function resize() {
    const w = wrap.clientWidth  || 200;
    const h = wrap.clientHeight || 200;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(wrap);

  // ── Rotation state ──────────────────────────────────────────────
  const rot      = { x: 0.3, y: 0, z: 0.1 };
  let   cubeMesh = null;
  let   dragging = false;
  let   autoSpin = true;

  // GSAP quickTo — silky interpolation on drag
  const lerpX = gsap.quickTo(rot, 'x', { duration: 0.55, ease: 'power3.out' });
  const lerpY = gsap.quickTo(rot, 'y', { duration: 0.55, ease: 'power3.out' });

  // ── Load FBX ────────────────────────────────────────────────────
  new FBXLoader().load('/metal-check.fbx', (fbx) => {
    const box    = new THREE.Box3().setFromObject(fbx);
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale  = 1.6 / maxDim;
    fbx.scale.setScalar(scale);

    const centre = box.getCenter(new THREE.Vector3());
    fbx.position.sub(centre.multiplyScalar(scale));

    fbx.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow    = true;
      child.receiveShadow = true;
      child.material = new THREE.MeshStandardMaterial({
        color:           0xc8c8c8,
        metalness:       0.95,
        roughness:       0.10,
        envMapIntensity: 1.5,
      });
    });

    cubeMesh = fbx;
    scene.add(fbx);
  });

  // ── Drag interaction ────────────────────────────────────────────
  let px = 0, py = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    autoSpin = false;
    px = e.clientX;
    py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lerpY(rot.y + (e.clientX - px) * 0.055);
    lerpX(rot.x + (e.clientY - py) * 0.040);
    px = e.clientX;
    py = e.clientY;
  });

  canvas.addEventListener('pointerup', () => {
    dragging = false;
    setTimeout(() => { autoSpin = true; }, 1200);
  });

  // ── Render loop ─────────────────────────────────────────────────
  let prev = 0;
  (function loop(t) {
    requestAnimationFrame(loop);
    const dt = (t - prev) * 0.001;
    prev = t;
    if (cubeMesh) {
      if (autoSpin && !dragging) {
        rot.y += dt * 1.4;   // fast Y spin
        rot.x += dt * 0.55;  // medium X tilt
        rot.z += dt * 0.35;  // slow Z roll
      }
      cubeMesh.rotation.x = rot.x;
      cubeMesh.rotation.y = rot.y;
      cubeMesh.rotation.z = rot.z;
    }
    renderer.render(scene, camera);
  })(0);
}
