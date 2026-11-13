import * as THREE from "../three.module.js";
import { sections } from "./sections.js";
import { createTerrain, createAtmosphere, placeSections } from "./terrain.js";
import { createLandmarks, disposeModelCache } from "./models.js";
import { createSpace, environment, createOrbit } from "./space.js";
import { PlanetControls } from "./controls.js";
import { SectionPortal } from "./portal.js";
const $ = (id) => document.getElementById(id),
  canvas = $("universe"),
  tooltip = $("tooltip");
const media = matchMedia("(prefers-reduced-motion: reduce)");
const low =
  matchMedia("(pointer:coarse)").matches || navigator.hardwareConcurrency <= 4;
const abort = new AbortController();
let renderer,
  scene,
  camera,
  world,
  controls,
  portal,
  markers,
  space,
  terrain,
  env,
  raf,
  hovered = null,
  pointer = null,
  ready = false,
  disposed = false,
  last = 0,
  elapsed = 0,
  keyboardSection = null,
  resizeTimer,
  nextPick = 0;
const ray = new THREE.Raycaster(),
  ndc = new THREE.Vector2(),
  temp = new THREE.Vector3(),
  pickables = [],
  hitboxes = [];
function fallback(message) {
  ready = false;
  cancelAnimationFrame(raf);
  $("loading").classList.add("done");
  $("fallback").hidden = false;
  $("world").inert = true;
  if (message) $("fallback-message").textContent = message;
}
function makeLinks() {
  for (const section of sections) {
    const a = document.createElement("a");
    a.href = section.href;
    a.textContent = section.title;
    $("fallback-links").append(a);
    const k = a.cloneNode(true);
    k.dataset.section = section.id;
    k.addEventListener("focus", () => {
      keyboardSection = section.id;
      if (!ready || portal.active) return;
      const lm = markers.landmarks.find((l) => l.section.id === section.id);
      controls.velocity.set(0, 0);
      controls.paused = true;
      world.quaternion.setFromUnitVectors(
        lm.root.position
          .clone()
          .addScaledVector(lm.section.groundNormal, 0.42)
          .normalize(),
        new THREE.Vector3(0, 0, 1),
      );
      setHovered(lm.root);
      updateTooltip();
    });
    k.addEventListener("blur", () => {
      keyboardSection = null;
      setHovered(null);
    });
    k.addEventListener("click", (e) => {
      if (!ready) return;
      e.preventDefault();
      const lm = markers.landmarks.find((l) => l.section.id === section.id);
      if (section.id === "bar") {
        location.href = section.href;
        return;
      }
      portal.open(lm.root);
    });
    $("accessible-places").append(k);
  }
}
function project(root) {
  world.updateMatrixWorld(true);
  temp.set(0, 0.42, 0);
  root.localToWorld(temp);
  temp.project(camera);
  return {
    x: (temp.x * 0.5 + 0.5) * innerWidth,
    y: (-0.5 * temp.y + 0.5) * innerHeight,
  };
}
function setHovered(root) {
  if (hovered === root) return;
  hovered = root;
  canvas.classList.toggle("over-object", !!root);
  if (!root) {
    tooltip.hidden = true;
    return;
  }
  const s = root.userData.section;
  tooltip.querySelector("strong").textContent = s.title;
  tooltip.hidden = false;
}
function updateTooltip() {
  if (!hovered) return;
  const p = project(hovered),
    rect = tooltip.getBoundingClientRect();
  let x = p.x - rect.width / 2,
    y = p.y - rect.height - 35;
  x = THREE.MathUtils.clamp(x, 12, Math.max(12, innerWidth - rect.width - 12));
  if (y < 80) y = p.y + 36;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${Math.min(innerHeight - rect.height - 12, y)}px`;
}
function pick(point) {
  if (!ready || portal?.active) return null;
  ndc.set((point.x / innerWidth) * 2 - 1, (-point.y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  world.updateMatrixWorld(true);
  const hit = ray.intersectObjects([...pickables, ...hitboxes], false)[0];
  return hit?.object.userData.landmark || null;
}
function resize() {
  if (!renderer || !camera) return;
  const w = innerWidth,
    h = innerHeight,
    aspect = w / h;
  camera.aspect = aspect;
  camera.fov = THREE.MathUtils.radToDeg(
    2 *
      Math.atan(
        Math.tan(THREE.MathUtils.degToRad(20)) * Math.max(1, 0.98 / aspect),
      ),
  );
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  space?.resize(h);
  if (ready && !portal?.active) controls.update(0);
  updateTooltip();
}
function save() {
  if (!controls) return;
  try {
    sessionStorage.setItem(
      "kinosredaPlanetState",
      JSON.stringify(portal?.active ? portal.saved : controls.snapshot()),
    );
  } catch {}
}
function animate(now) {
  if (disposed || !ready) return;
  raf = requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000 || 0, 0.05);
  last = now;
  if (!portal?.active) elapsed += dt;
  controls.update(dt);
  if (
    pointer &&
    !controls.pointers.size &&
    !portal.active &&
    !keyboardSection &&
    now > nextPick
  ) {
    setHovered(pick(pointer));
    nextPick = now + 50;
  }
  markers.update(
    elapsed,
    portal.active ? portal.selected : hovered,
    media.matches,
  );
  if (!media.matches && !portal.active) {
    space.update(elapsed);
    terrain.clouds.rotation.y = elapsed * 0.0015;
  }
  updateTooltip();
  renderer.render(scene, camera);
}
function cleanup() {
  if (disposed) return;
  disposed = true;
  ready = false;
  cancelAnimationFrame(raf);
  clearTimeout(resizeTimer);
  abort.abort();
  controls?.dispose();
  portal?.dispose();
  const gs = new Set(),
    ms = new Set(),
    ts = new Set();
  scene?.traverse((o) => {
    if (o.geometry) gs.add(o.geometry);
    if (o.material)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        ms.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) ts.add(v);
      }
  });
  gs.forEach((g) => g.dispose());
  ms.forEach((m) => m.dispose());
  ts.forEach((t) => t.dispose());
  disposeModelCache();
  env?.dispose();
  renderer?.dispose();
}
async function init() {
  makeLinks();
  $("retry-world").addEventListener("click", () => location.reload());
  // An accidental link inside a service must return to its existing parent world.
  try {
    if (parent !== window && parent.KinosredaPlanet) {
      parent.KinosredaPlanet.close();
      document.body.innerHTML = "";
      return;
    }
  } catch {}
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.35 : 1.65));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.shadowMap.enabled = !low;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#050b13");
    camera = new THREE.PerspectiveCamera(
      40,
      innerWidth / innerHeight,
      0.05,
      160,
    );
    camera.position.z = 12.7;
    env = environment(renderer);
    scene.environment = env.texture;
    scene.add(new THREE.HemisphereLight("#c0deec", "#1c2525", 0.9));
    const sun = new THREE.DirectionalLight("#ffdfb2", 2.8);
    sun.position.set(-6, 9, 11);
    sun.castShadow = !low;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -5,
      right: 5,
      top: 5,
      bottom: -5,
      near: 1,
      far: 30,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.018;
    scene.add(sun);
    const rim = new THREE.DirectionalLight("#71afdc", 1.6);
    rim.position.set(5, 1, -7);
    scene.add(rim);
    const fill = new THREE.DirectionalLight("#9bbdc8", 0.45);
    fill.position.set(6, -3, 8);
    scene.add(fill);
    world = new THREE.Group();
    scene.add(world);
    markers = createLandmarks(sections);
    const positions = placeSections(
      markers.landmarks.map((l) => ({ ...l.section, footprint: l.footprint })),
    );
    markers.place(positions);
    await new Promise((r) => requestAnimationFrame(r));
    terrain = await createTerrain(positions, low);
    world.add(terrain.world);
    terrain.world.children
      .filter(
        (o) =>
          o.isMesh && !o.isInstancedMesh && o.material.transparent !== true,
      )
      .forEach((m) => pickables.push(m));
    world.add(markers.group);
    world.add(createAtmosphere());
    for (const lm of markers.landmarks) {
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.29, 10, 8),
        new THREE.MeshBasicMaterial(),
      );
      hit.position.y = 0.3;
      hit.visible = false;
      hit.userData.landmark = lm.root;
      lm.root.add(hit);
      hitboxes.push(hit);
    }
    space = createSpace(low);
    scene.add(space.group);
    scene.add(createOrbit());
    controls = new PlanetControls(canvas, world, camera, {
      reduced: media.matches,
      onHover: (p) => {
        pointer = p;
        if (!p) setHovered(null);
      },
      onSelect: (p) => {
        const lm = pick(p);
        if (lm) {
          setHovered(null);
          pointer = null;
          if (lm.userData.section.id === "bar") {
            location.href = lm.userData.section.href;
            return;
          }
          portal.open(lm);
        }
      },
    });
    world.rotation.set(0.08, -0.16, -0.08);
    controls.targetDistance = 12.7;
    controls.distance = media.matches ? 12.7 : 15;
    try {
      const saved = JSON.parse(sessionStorage.getItem("kinosredaPlanetState"));
      if (saved) controls.restore(saved);
    } catch {}
    portal = new SectionPortal({
      camera,
      controls,
      project,
      reduced: media.matches,
      onState: (active) => {
        if (active) {
          pointer = null;
          setHovered(null);
          save();
        }
      },
    });
    // Small public controller for progressive integration and browser regression tests.
    window.KinosredaPlanet = {
      sections,
      close: () => portal.close(),
      getState: () => ({
        ready,
        state: portal.state,
        ...controls.snapshot(),
        landmarks: markers.landmarks.map((l) => ({
          id: l.section.id,
          ...project(l.root),
          front:
            l.root
              .getWorldPosition(new THREE.Vector3())
              .normalize()
              .dot(camera.position.clone().normalize()) > 0,
        })),
      }),
    };
    const options = { signal: abort.signal };
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          e.key === "Escape" &&
          portal.state === "opening" &&
          !portal.dialog.open
        ) {
          e.preventDefault();
          portal.close();
        }
      },
      options,
    );
    media.addEventListener(
      "change",
      () => {
        if (media.matches) {
          controls.paused = true;
          controls.velocity.set(0, 0);
        }
        portal.reduced = media.matches;
      },
      options,
    );
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 60);
      },
      options,
    );
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          save();
        } else if (ready) {
          last = performance.now();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(animate);
        }
      },
      options,
    );
    window.addEventListener(
      "pagehide",
      (e) => {
        save();
        cancelAnimationFrame(raf);
        if (!e.persisted) cleanup();
      },
      options,
    );
    window.addEventListener(
      "pageshow",
      (e) => {
        if (e.persisted && ready) {
          last = performance.now();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(animate);
        }
      },
      options,
    );
    canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        save();
        portal.dispose();
        fallback(
          "Связь с 3D-сценой прервалась. Перезагрузите планету или откройте любой раздел ниже.",
        );
      },
      options,
    );
    canvas.addEventListener(
      "webglcontextrestored",
      () => location.reload(),
      options,
    );
    resize();
    controls.update(0);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    ready = true;

    $("loading").classList.add("done");
    $("loading").setAttribute("aria-hidden", "true");
    last = performance.now();
    raf = requestAnimationFrame(animate);
  } catch (error) {
    console.error("Planet initialization:", error);
    fallback(
      "Не удалось запустить 3D-планету в этом браузере. Разделы планеты доступны ниже.",
    );
    cleanup();
  }
}
init();
