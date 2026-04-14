/**
 * globe.js  —  Dot-mask World Globe + Animated Connection Arcs
 *             + Locale buttons (GB/IN/US) that pin-point lat/lon.
 */

import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// ── Scene constants ────────────────────────────────────────────────
const SPHERE_RADIUS   = 30;
const LATITUDE_COUNT  = 80;
const DOT_DENSITY     = 0.8;
const DOT_SIZE        = 0.2;

const CAMERA_FOV  = 20;
const CAMERA_NEAR = 100;
const CAMERA_FAR  = 500;
const CAMERA_Z    = 220;

const LAND_COLOR  = 0x111111;
const OCEAN_COLOR = 0xc8c8c8;

const AUTO_ROTATE_SPEED = 0.004;    // rad/frame, Y-axis only

// ── Arc config ─────────────────────────────────────────────────────
const ARC_SEGMENTS = 120;
const ARC_SNAKE    = 40;
const ARC_SPEED    = 0.55;
const ARC_LIFT     = 0.30;
const ARC_BASE     = 1.08;
const ARC_COLOR    = 0x3b82f6;

const ARC_CONNECTIONS = [
  [ 22.7196,  75.8577,  51.5074,  -0.1278],  // Indore → London
  [ 22.7196,  75.8577,  40.7128, -74.0060],  // Indore → New York
  [ 22.7196,  75.8577,  35.6762, 139.6503],  // Indore → Tokyo
  [ 22.7196,  75.8577,   1.3521, 103.8198],  // Indore → Singapore
  [ 51.5074,  -0.1278,  40.7128, -74.0060],  // London → New York
  [-33.8688, 151.2093,  35.6762, 139.6503],  // Sydney → Tokyo
  [ 25.2048,  55.2708,  51.5074,  -0.1278],  // Dubai → London
];

// ── Locale destinations ────────────────────────────────────────────
const LOCALES = {
  gb: { lat:  51.5074, lon:  -0.1278 },   // London
  in: { lat:  22.7196, lon:  75.8577 },   // Indore
  us: { lat:  40.7128, lon: -74.0060 },   // New York
};

// Convert longitude  →  globeGroup.rotation.y
// (at Y=0, camera at +Z sees lon=-90 face-on; formula brings `lon` to front)
function lonToRotY(lon) { return  (lon + 90) * Math.PI / 180; }

// Convert latitude   →  globeGroup.rotation.x
// (tilt globe so the given latitude sits at the equatorial centre)
function latToRotX(lat) { return -(lat)      * Math.PI / 180; }

// ── Shortest-arc Y delta ───────────────────────────────────────────
function shortestY(from, to) {
  let d = ((to - from) % (2 * Math.PI));
  if (d >  Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ── Utilities ──────────────────────────────────────────────────────
const spherePointToUV = (dotCenter, sphereCenter) => {
  const v = new THREE.Vector3();
  v.subVectors(sphereCenter, dotCenter).normalize();
  return new THREE.Vector2(
    1 - (0.5 + Math.atan2(v.z, v.x) / (2 * Math.PI)),
    0.5 + Math.asin(v.y) / Math.PI
  );
};

const sampleImage = (imageData, uv) => {
  const pt =
    4 * Math.floor(uv.x * imageData.width) +
    Math.floor(uv.y * imageData.height) * (4 * imageData.width);
  return imageData.data.slice(pt, pt + 4);
};

// ── GeoJSON / land-mask ────────────────────────────────────────────
const GEOJSON_URLS = [
  "/map.geojson",
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson",
];

async function buildLandMaskImageData() {
  let data = null;
  for (const url of GEOJSON_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      data = json.features ? json : null;
      if (data) break;
    } catch { continue; }
  }
  if (!data) throw new Error("All GeoJSON sources failed");

  const W = 2048, H = 1024;
  const oc = document.createElement("canvas");
  oc.width = W; oc.height = H;
  const ctx = oc.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,1)";

  const drawRing = ring => {
    ctx.beginPath();
    let first = true;
    for (const [lon, lat] of ring) {
      const x = ((lon + 180) / 360) * W;
      const y = ((90  - lat) / 180) * H;
      first ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      first = false;
    }
    ctx.closePath();
    ctx.fill("evenodd");
  };

  for (const { geometry: g } of data.features) {
    if      (g.type === "Polygon")      g.coordinates.forEach(drawRing);
    else if (g.type === "MultiPolygon") g.coordinates.forEach(p => p.forEach(drawRing));
  }
  return ctx.getImageData(0, 0, W, H);
}

// ── Dot globe ─────────────────────────────────────────────────────
function buildDotGlobe(imageData, target) {
  const landGeo = [], oceanGeo = [];
  const v = new THREE.Vector3();

  for (let lat = 0; lat < LATITUDE_COUNT; lat++) {
    const r  = Math.cos((-90 + (180 / LATITUDE_COUNT) * lat) * (Math.PI / 180)) * SPHERE_RADIUS;
    const dc = Math.ceil(r * Math.PI * 2 * 2 * DOT_DENSITY);

    for (let dot = 0; dot < dc; dot++) {
      const geo   = new THREE.CircleGeometry(DOT_SIZE, 5);
      const phi   = (Math.PI / LATITUDE_COUNT) * lat;
      const theta = ((2 * Math.PI) / dc) * dot;
      v.setFromSphericalCoords(SPHERE_RADIUS, phi, theta);
      geo.lookAt(v); geo.translate(v.x, v.y, v.z); geo.computeBoundingSphere();

      const uv  = spherePointToUV(geo.boundingSphere.center, new THREE.Vector3());
      const pix = sampleImage(imageData, uv);
      pix[3] ? landGeo.push(geo) : oceanGeo.push(geo);
    }
  }

  const merge = BufferGeometryUtils.mergeGeometries;
  if (oceanGeo.length) target.add(new THREE.Mesh(merge(oceanGeo),
    new THREE.MeshBasicMaterial({ color: OCEAN_COLOR, side: THREE.DoubleSide, transparent: true, opacity: 0.18 })));
  if (landGeo.length)  target.add(new THREE.Mesh(merge(landGeo),
    new THREE.MeshBasicMaterial({ color: LAND_COLOR,  side: THREE.DoubleSide })));
}

// ── Arcs ──────────────────────────────────────────────────────────
function slerp(v1, v2, t) {
  const omega = v1.angleTo(v2), so = Math.sin(omega);
  if (so < 0.001) return v1.clone().lerp(v2, t).normalize();
  return v1.clone().multiplyScalar(Math.sin((1-t)*omega)/so)
           .add(v2.clone().multiplyScalar(Math.sin(t*omega)/so));
}

function latLonToVec(lat, lon) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta));
}

function arcPoints(la1, lo1, la2, lo2) {
  const v1 = latLonToVec(la1, lo1), v2 = latLonToVec(la2, lo2), pts = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS;
    pts.push(slerp(v1, v2, t).normalize().multiplyScalar(
      SPHERE_RADIUS * (ARC_BASE + ARC_LIFT * Math.sin(Math.PI * t))));
  }
  return pts;
}

function buildArcs(target) {
  const arcs = ARC_CONNECTIONS.map(([la1,lo1,la2,lo2], i) => {
    const geo  = new THREE.BufferGeometry().setFromPoints(arcPoints(la1,lo1,la2,lo2));
    const mat  = new THREE.LineBasicMaterial({ color: ARC_COLOR, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(geo, mat);
    geo.setDrawRange(0, 0);
    target.add(line);
    return { geo, t: -(i * Math.floor((ARC_SEGMENTS + ARC_SNAKE) / ARC_CONNECTIONS.length)) };
  });

  return () => {
    for (const arc of arcs) {
      arc.t += ARC_SPEED;
      const total = ARC_SEGMENTS + ARC_SNAKE;
      if (arc.t > total) arc.t = -ARC_SNAKE;
      const head = Math.floor(arc.t);
      arc.geo.setDrawRange(Math.max(0, head - ARC_SNAKE), Math.max(0, Math.min(ARC_SEGMENTS+1, head) - Math.max(0, head-ARC_SNAKE)));
    }
  };
}

// ── Main export ───────────────────────────────────────────────────
export async function initGlobe3D() {
  const canvas = document.getElementById("globeCanvas");
  const wrap   = canvas?.parentElement;
  if (!canvas || !wrap) return;

  const SIZE = Math.max(wrap.offsetWidth || 0, wrap.clientWidth || 0, 480);
  canvas.width = SIZE; canvas.height = SIZE;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(SIZE, SIZE, false);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 0, CAMERA_Z);

  const controls = new OrbitControls(camera, canvas);
  controls.enablePan  = false;
  controls.enableZoom = false;
  controls.autoRotate = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.update();

  const scene      = new THREE.Scene();
  const globeGroup = new THREE.Group();
  scene.add(globeGroup);

  // ── Start facing India (default active button) ─────────────────
  globeGroup.rotation.y = lonToRotY(LOCALES.in.lon);
  globeGroup.rotation.x = 0;

  // ── Animation state machine ────────────────────────────────────
  // IDLE → auto-spinning | SEEK → lerping to target | HOLD → paused | RETURN → x→0 then IDLE
  const S = { IDLE: 0, SEEK: 1, HOLD: 2, RETURN: 3 };
  let state = S.IDLE;
  let tgtY  = globeGroup.rotation.y;
  let tgtX  = 0;
  let holdTimer = null;

  function goTo(key) {
    const loc = LOCALES[key];
    if (!loc) return;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }

    // Compute targets
    tgtY = globeGroup.rotation.y + shortestY(globeGroup.rotation.y, lonToRotY(loc.lon));
    tgtX = latToRotX(loc.lat);
    state = S.SEEK;
  }

  canvas._globeGoTo = goTo;

  // ── Arcs ──────────────────────────────────────────────────────
  const updateArcs = buildArcs(globeGroup);
  canvas.style.opacity = "1";

  // ── Dots (async) ───────────────────────────────────────────────
  buildLandMaskImageData()
    .then(img => buildDotGlobe(img, globeGroup))
    .catch(e  => console.warn("[Globe] Land mask failed:", e.message));

  // ── Animate ────────────────────────────────────────────────────
  const LERP_SEEK   = 0.06;
  const LERP_RETURN = 0.05;
  const HOLD_MS     = 2000;

  let raf;
  const animate = () => {
    raf = requestAnimationFrame(animate);

    switch (state) {
      case S.IDLE:
        // Auto-spin horizontally; keep x level
        globeGroup.rotation.y += AUTO_ROTATE_SPEED;
        break;

      case S.SEEK: {
        // Animate BOTH axes toward target simultaneously
        const dy = tgtY - globeGroup.rotation.y;
        const dx = tgtX - globeGroup.rotation.x;
        globeGroup.rotation.y += dy * LERP_SEEK;
        globeGroup.rotation.x += dx * LERP_SEEK;

        if (Math.abs(dy) < 0.003 && Math.abs(dx) < 0.003) {
          globeGroup.rotation.y = tgtY;
          globeGroup.rotation.x = tgtX;
          state = S.HOLD;
          holdTimer = setTimeout(() => {
            holdTimer = null;
            state = S.RETURN;
          }, HOLD_MS);
        }
        break;
      }

      case S.HOLD:
        // Stationary — globe sits pinned on the country
        break;

      case S.RETURN: {
        // Smoothly tilt X back to 0, then resume spinning
        const dx = 0 - globeGroup.rotation.x;
        globeGroup.rotation.x += dx * LERP_RETURN;
        globeGroup.rotation.y += AUTO_ROTATE_SPEED * 0.5;   // gentle resume

        if (Math.abs(dx) < 0.002) {
          globeGroup.rotation.x = 0;
          state = S.IDLE;
        }
        break;
      }
    }

    updateArcs();
    controls.update();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(animate);

  // ── Locale button wiring ───────────────────────────────────────
  const btns = document.querySelectorAll('.locale-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('locale-btn--active'));
      btn.classList.add('locale-btn--active');
      goTo(btn.dataset.locale);
    });
  });

  // ── Resize ────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const s = Math.max(wrap.clientWidth || 0, 480);
    renderer.setSize(s, s, false);
  });
  ro.observe(wrap);

  // ── Cleanup ───────────────────────────────────────────────────
  canvas._globeDestroy = () => {
    cancelAnimationFrame(raf);
    if (holdTimer) clearTimeout(holdTimer);
    ro.disconnect();
    renderer.dispose();
  };
}
