import * as THREE from "../three.module.js";
const cache = new Map();
function geometry(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
function roundedBox() {
  return geometry("rounded", () => {
    const s = new THREE.Shape();
    s.moveTo(-0.44, -0.5);
    s.lineTo(0.44, -0.5);
    s.quadraticCurveTo(0.5, -0.5, 0.5, -0.44);
    s.lineTo(0.5, 0.44);
    s.quadraticCurveTo(0.5, 0.5, 0.44, 0.5);
    s.lineTo(-0.44, 0.5);
    s.quadraticCurveTo(-0.5, 0.5, -0.5, 0.44);
    s.lineTo(-0.5, -0.44);
    s.quadraticCurveTo(-0.5, -0.5, -0.44, -0.5);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.88,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.025,
      bevelThickness: 0.06,
      curveSegments: 3,
    });
    g.translate(0, 0, -0.44);
    return g;
  });
}
const mat = (color, metalness = 0, roughness = 0.65, emissive) =>
  new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    ...(emissive ? { emissive: color, emissiveIntensity: emissive } : {}),
  });
const palette = {
  ivory: mat("#e1d5b8", 0.08),
  stone: mat("#7c8a87", 0.08),
  dark: mat("#17212b", 0.55, 0.35),
  black: mat("#090f16", 0.25, 0.32),
  gold: mat("#d6ae68", 0.72, 0.29),
  wood: mat("#78503c", 0.05),
  white: mat("#eee9d9", 0.08, 0.4),
  green: mat("#527e69"),
  red: mat("#b56858"),
  blue: mat("#669cba", 0.4, 0.3),
  glass: mat("#81c8cd", 0.5, 0.17),
  light: mat("#efd4a0", 0.2, 0.24, 1.2),
};
// Bake detailed assemblies by material: a landmark is a few draws, not a draw per detail.
function bake(group) {
  group.updateMatrixWorld(true);
  const batches = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const g = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrixWorld);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []);
    batches.get(mesh.material).push(g);
  });
  const result = new THREE.Group();
  for (const [material, geometries] of batches) {
    const merged = new THREE.BufferGeometry();
    for (const key of ["position", "normal", "uv"]) {
      const arrays = geometries.map((g) => g.getAttribute(key));
      if (arrays.some((a) => !a)) continue;
      const array = new Float32Array(
        arrays.reduce((n, a) => n + a.array.length, 0),
      );
      let at = 0;
      for (const a of arrays) {
        array.set(a.array, at);
        at += a.array.length;
      }
      merged.setAttribute(
        key,
        new THREE.BufferAttribute(array, arrays[0].itemSize),
      );
    }
    const m = new THREE.Mesh(merged, material);
    m.castShadow = true;
    m.receiveShadow = true;
    result.add(m);
    geometries.forEach((g) => g.dispose());
  }
  return result;
}
function assembly(type, color) {
  const g = new THREE.Group(),
    accent = mat(color, 0.22, 0.4);
  const M = { ...palette, accent };
  const mesh = (
    geo,
    m,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const o = new THREE.Mesh(geo, M[m] || m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.rotation.set(rx, ry, rz);
    g.add(o);
    return o;
  };
  const box = (m, x, y, z, w, h, d, ry = 0, rz = 0) =>
    mesh(roundedBox(), m, x, y, z, w, h, d, 0, ry, rz);
  const cyl = (m, x, y, z, r, h, rt = r, rx = 0, rz = 0, segments = 24) =>
    mesh(
      geometry(
        `c${r},${h},${rt},${segments}`,
        () => new THREE.CylinderGeometry(rt, r, h, segments),
      ),
      m,
      x,
      y,
      z,
      1,
      1,
      1,
      rx,
      0,
      rz,
    );
  const ball = (m, x, y, z, r, sx = 1, sy = 1, sz = 1) =>
    mesh(
      geometry("sphere", () => new THREE.SphereGeometry(1, 16, 12)),
      m,
      x,
      y,
      z,
      r * sx,
      r * sy,
      r * sz,
    );
  const torus = (m, x, y, z, r, t, rx = 0, ry = 0) =>
    mesh(
      geometry(`t${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 32)),
      m,
      x,
      y,
      z,
      1,
      1,
      1,
      rx,
      ry,
    );
  const roof = (x, y, z, w, h, d, m = "accent") => {
    const o = cyl(m, x, y, z, w / Math.SQRT2, h, 0, 0, 0, 4);
    o.rotation.y = Math.PI / 4;
    o.scale.z = d / w;
    return o;
  };
  const windowRow = (x, y, z, count, w = 0.045) => {
    for (let i = 0; i < count; i++)
      box("light", x + i * 0.09, y, z, w, 0.07, 0.012);
  };
  const legs = (w, d, h = 0.14) => {
    for (const x of [-w, w])
      for (const z of [-d, d]) cyl("gold", x, h / 2, z, 0.012, h);
  };
  const bottle = (x, y, z, m = "green", scale = 1) => {
    cyl(m, x, y + 0.11 * scale, z, 0.043 * scale, 0.22 * scale);
    cyl(m, x, y + 0.255 * scale, z, 0.022 * scale, 0.07 * scale);
    ball(m, x, y + 0.22 * scale, z, 0.044 * scale, 1, 0.6, 1);
    cyl("gold", x, y + 0.3 * scale, z, 0.023 * scale, 0.018 * scale);
    cyl("ivory", x, y + 0.13 * scale, z, 0.044 * scale, 0.07 * scale);
  };
  const screen = (x, y, z, w = 0.4, h = 0.26) => {
    box("dark", x, y, z, w + 0.05, h + 0.05, 0.045);
    box("glass", x, y, z + 0.026, w, h, 0.012);
    box("light", x, y - h * 0.28, z + 0.034, w * 0.65, 0.008, 0.008);
  };
  switch (type) {
    case "calendar":
      legs(0.17, 0.08);
      box("ivory", 0, 0.29, 0, 0.46, 0.36, 0.16);
      box("accent", 0, 0.46, 0, 0.47, 0.08, 0.17);
      box("white", 0, 0.3, 0.091, 0.4, 0.24, 0.012);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 4; j++)
          box(
            i === 1 && j === 2 ? "red" : "gold",
            -0.137 + j * 0.09,
            0.36 - i * 0.075,
            0.106,
            0.038,
            0.026,
            0.01,
          );
      for (const x of [-0.14, 0.14])
        torus("gold", x, 0.5, 0, 0.035, 0.009, 0, Math.PI / 2);
      break;
    case "projector":
      legs(0.14, 0.09);
      box("accent", 0, 0.24, 0, 0.38, 0.24, 0.23);
      cyl("dark", 0.22, 0.24, 0, 0.075, 0.14, 0.075, 0, Math.PI / 2);
      cyl("glass", 0.3, 0.24, 0, 0.06, 0.014, 0.06, 0, Math.PI / 2);
      for (const x of [-0.12, 0.12]) {
        cyl("gold", x, 0.44, 0, 0.115, 0.035, 0.115, Math.PI / 2);
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5;
          ball(
            "black",
            x + Math.cos(a) * 0.065,
            0.44 + Math.sin(a) * 0.065,
            0.022,
            0.027,
            1,
            1,
            0.4,
          );
        }
      }
      break;
    case "trophy":
      box("dark", 0, 0.065, 0, 0.27, 0.1, 0.25);
      box("gold", 0, 0.13, 0, 0.19, 0.035, 0.19);
      cyl("gold", 0, 0.21, 0, 0.035, 0.14);
      cyl("gold", 0, 0.37, 0, 0.07, 0.21, 0.15);
      cyl("black", 0, 0.48, 0, 0.123, 0.008);
      for (const x of [-0.16, 0.16]) torus("gold", x, 0.37, 0, 0.075, 0.018);
      box("accent", 0, 0.07, 0.134, 0.1, 0.04, 0.01);
      break;
    case "shelf":
      for (const x of [-0.23, 0.23]) box("wood", x, 0.27, 0, 0.035, 0.52, 0.2);
      for (const y of [0.045, 0.27, 0.51]) {
        box("wood", 0, y, 0, 0.51, 0.035, 0.23);
        box("gold", 0, y, 0.122, 0.5, 0.013, 0.012);
      }
      for (let i = 0; i < 4; i++) {
        bottle(-0.16 + i * 0.107, 0.06, 0, "green", 0.65);
        bottle(-0.16 + i * 0.107, 0.29, 0, i % 2 ? "accent" : "red", 0.6);
      }
      break;
    case "brewery":
      box("stone", 0, 0.07, 0, 0.51, 0.08, 0.35);
      for (const x of [-0.14, 0.14]) {
        cyl("gold", x, 0.27, 0, 0.11, 0.31);
        ball("gold", x, 0.42, 0, 0.11, 1, 0.6, 1);
        cyl("dark", x, 0.51, 0, 0.025, 0.1);
        torus("ivory", x, 0.27, 0, 0.112, 0.008, Math.PI / 2);
        box("dark", x, 0.24, 0.112, 0.05, 0.04, 0.015);
      }
      box("gold", 0, 0.4, 0, 0.3, 0.025, 0.025);
      break;
    case "bar":
      // A tiny illuminated cocktail bar: counter, back shelf, bottles and
      // stools make the destination read as architecture rather than a token.
      box("wood", 0, 0.17, 0, 0.52, 0.22, 0.25);
      box("gold", 0, 0.31, 0, 0.55, 0.035, 0.27);
      box("dark", 0, 0.47, 0.07, 0.44, 0.26, 0.07);
      box("glass", 0, 0.47, 0.112, 0.35, 0.16, 0.012);
      box("wood", 0, 0.68, 0.08, 0.46, 0.035, 0.16);
      for (const x of [-0.2, -0.07, 0.07, 0.2])
        bottle(x, 0.7, 0.08, x === 0.07 ? "red" : "green", 0.5);
      for (const x of [-0.2, 0.2]) {
        cyl("gold", x, 0.055, -0.23, 0.085, 0.03);
        cyl("dark", x, 0.17, -0.23, 0.018, 0.2);
        box("gold", x, 0.13, -0.23, 0.14, 0.018, 0.06);
        box("wood", x, 0.29, -0.23, 0.18, 0.045, 0.17);
        box("wood", x, 0.4, -0.27, 0.15, 0.16, 0.035);
      }
      box("accent", 0, 0.93, 0.07, 0.34, 0.09, 0.025);
      box("light", 0, 0.93, 0.087, 0.25, 0.025, 0.008);
      break;
    case "roulette":
      cyl("wood", 0, 0.1, 0, 0.245, 0.12);
      cyl("gold", 0, 0.17, 0, 0.25, 0.03);
      cyl("green", 0, 0.19, 0, 0.218, 0.015);
      torus("gold", 0, 0.205, 0, 0.17, 0.015, Math.PI / 2);
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 9;
        box(
          i % 2 ? "black" : "red",
          Math.sin(a) * 0.19,
          0.209,
          Math.cos(a) * 0.19,
          0.042,
          0.018,
          0.05,
          a,
        );
      }
      cyl("gold", 0, 0.24, 0, 0.026, 0.12);
      ball("white", 0.12, 0.235, 0.05, 0.02);
      break;
    case "camp":
      roof(0, 0.24, 0, 0.46, 0.4, 0.4);
      box("dark", 0, 0.16, 0.165, 0.16, 0.22, 0.014);
      box("ivory", 0, 0.045, 0.02, 0.48, 0.035, 0.42);
      for (const x of [-0.26, 0.26]) {
        cyl("wood", x, 0.12, 0.2, 0.01, 0.24);
        box("white", x, 0.24, 0.2, 0.035, 0.02, 0.02);
      }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        ball(
          "stone",
          0.28 + Math.cos(a) * 0.052,
          0.06,
          -0.16 + Math.sin(a) * 0.052,
          0.027,
        );
      }
      ball("light", 0.28, 0.095, -0.16, 0.036, 1, 1.6, 1);
      break;
    case "compass":
      cyl("wood", 0, 0.12, 0, 0.19, 0.2, 0.16);
      cyl("gold", 0, 0.24, 0, 0.23, 0.05);
      cyl("ivory", 0, 0.27, 0, 0.205, 0.014);
      torus("gold", 0, 0.28, 0, 0.21, 0.012, Math.PI / 2);
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        box(
          "dark",
          Math.sin(a) * 0.175,
          0.284,
          Math.cos(a) * 0.175,
          0.008,
          0.008,
          0.022,
          a,
        );
      }
      box("red", 0, 0.3, 0.065, 0.035, 0.02, 0.15, 0, 0.08);
      box("blue", 0, 0.3, -0.065, 0.035, 0.02, 0.15);
      ball("gold", 0, 0.32, 0, 0.024);
      break;
    case "antenna":
      box("stone", 0, 0.09, 0, 0.3, 0.14, 0.28);
      cyl("dark", 0, 0.27, 0, 0.025, 0.28);
      const dish = cyl("ivory", 0, 0.46, 0, 0.23, 0.08, 0.15, 0, 0.5);
      dish.rotation.z = -0.45;
      torus("gold", 0, 0.49, 0, 0.225, 0.012, Math.PI / 2);
      cyl("gold", 0.09, 0.56, 0, 0.009, 0.25, 0.009, 0, -0.5);
      ball("light", 0.15, 0.68, 0, 0.025);
      for (const x of [-0.1, 0.1])
        box("accent", x, 0.12, 0.15, 0.035, 0.06, 0.025);
      break;
    case "meeting":
      box("wood", 0, 0.24, 0, 0.42, 0.04, 0.3);
      legs(0.16, 0.1, 0.22);
      screen(0, 0.4, -0.11, 0.26, 0.17);
      for (const x of [-0.25, 0.25]) {
        box("accent", x, 0.17, 0.03, 0.12, 0.04, 0.12);
        box("accent", x, 0.25, -0.035, 0.12, 0.16, 0.03);
        cyl("gold", x, 0.09, 0.03, 0.016, 0.14);
      }
      break;
    case "easel":
      for (const x of [-0.16, 0.16])
        box("wood", x, 0.27, 0, 0.025, 0.53, 0.03, 0, x * 0.4);
      box("wood", 0, 0.24, -0.13, 0.028, 0.49, 0.03);
      box("gold", 0, 0.17, 0.055, 0.44, 0.026, 0.065);
      box("wood", 0, 0.4, 0, 0.44, 0.32, 0.035);
      box("ivory", 0, 0.4, 0.025, 0.39, 0.27, 0.014);
      ball("accent", -0.06, 0.43, 0.04, 0.07, 1, 0.7, 0.1);
      ball("green", 0.06, 0.36, 0.04, 0.07, 1.2, 0.65, 0.1);
      ball("gold", 0.1, 0.47, 0.04, 0.035, 1, 1, 0.1);
      break;
    case "camera":
      box("dark", 0, 0.22, 0, 0.45, 0.27, 0.22);
      box("accent", 0, 0.3, 0, 0.46, 0.08, 0.23);
      box("black", -0.035, 0.4, 0, 0.18, 0.09, 0.14);
      cyl("dark", 0, 0.2, 0.17, 0.125, 0.17, 0.125, Math.PI / 2);
      torus("gold", 0, 0.2, 0.265, 0.11, 0.012);
      cyl("glass", 0, 0.2, 0.263, 0.09, 0.012, 0.09, Math.PI / 2);
      cyl("gold", 0.15, 0.37, 0.015, 0.034, 0.025);
      box("white", -0.15, 0.28, 0.125, 0.055, 0.04, 0.01);
      for (let i = 0; i < 4; i++)
        box("stone", -0.15 + i * 0.015, 0.18, 0.123, 0.004, 0.08, 0.008);
      break;
    case "turntable":
      legs(0.19, 0.13, 0.08);
      box("wood", 0, 0.13, 0, 0.49, 0.12, 0.37);
      box("dark", 0, 0.2, 0, 0.47, 0.025, 0.35);
      cyl("black", -0.06, 0.225, 0, 0.155, 0.025);
      for (const r of [0.07, 0.1, 0.13])
        torus("stone", -0.06, 0.24, 0, r, 0.0015, Math.PI / 2);
      cyl("accent", -0.06, 0.242, 0, 0.052, 0.008);
      cyl("gold", -0.06, 0.255, 0, 0.009, 0.024);
      cyl("gold", 0.16, 0.25, -0.1, 0.025, 0.08);
      box("gold", 0.12, 0.28, 0.025, 0.012, 0.012, 0.23, 0.4);
      box("white", 0.077, 0.275, 0.123, 0.035, 0.02, 0.025);
      break;
    case "cinema":
      box("ivory", 0, 0.23, 0, 0.49, 0.4, 0.36);
      box("dark", 0, 0.27, 0.19, 0.4, 0.22, 0.018);
      box("red", 0, 0.14, 0.207, 0.4, 0.03, 0.03);
      for (const x of [-0.17, 0.17])
        box("red", x, 0.26, 0.207, 0.045, 0.2, 0.03);
      box("gold", 0, 0.47, 0.05, 0.56, 0.075, 0.43);
      for (let i = 0; i < 7; i++)
        ball("light", -0.225 + i * 0.075, 0.47, 0.275, 0.012);
      box("dark", 0, 0.54, 0.02, 0.36, 0.07, 0.07);
      for (let i = 0; i < 5; i++)
        box("light", -0.14 + i * 0.07, 0.54, 0.063, 0.026, 0.025, 0.01);
      break;
    case "clapper":
      box("dark", 0, 0.23, 0, 0.47, 0.3, 0.11);
      box("ivory", 0, 0.23, 0.063, 0.36, 0.007, 0.01);
      for (let i = 0; i < 3; i++)
        box("stone", -0.065, 0.18 - i * 0.045, 0.064, 0.22, 0.007, 0.01);
      box("dark", 0, 0.43, 0, 0.5, 0.09, 0.12, 0, 0.13);
      for (let i = 0; i < 5; i++)
        box(
          "white",
          -0.2 + i * 0.1,
          0.43 + i * 0.013,
          0.067,
          0.04,
          0.075,
          0.012,
          0,
          -0.35,
        );
      ball("gold", -0.23, 0.39, 0.07, 0.02);
      break;
    case "arcade":
      box("accent", 0, 0.26, 0, 0.28, 0.5, 0.27);
      box("dark", 0, 0.25, 0.146, 0.24, 0.43, 0.018);
      screen(0, 0.34, 0.16, 0.2, 0.17);
      box("accent", 0, 0.51, 0.025, 0.3, 0.08, 0.3);
      box("light", 0, 0.51, 0.181, 0.22, 0.025, 0.01);
      box("dark", 0, 0.2, 0.19, 0.29, 0.04, 0.17);
      cyl("gold", -0.065, 0.25, 0.2, 0.009, 0.08);
      ball("red", -0.065, 0.29, 0.2, 0.023);
      for (let i = 0; i < 2; i++)
        ball("light", 0.04 + i * 0.06, 0.235, 0.2, 0.017, 1, 0.4, 1);
      box("gold", 0, 0.1, 0.163, 0.065, 0.015, 0.01);
      break;
    case "castle":
      box("stone", 0, 0.18, 0, 0.4, 0.26, 0.29);
      for (const x of [-0.19, 0.19])
        for (const z of [-0.12, 0.12]) {
          cyl("ivory", x, 0.25, z, 0.075, 0.43);
          roof(x, 0.52, z, 0.18, 0.19, 0.18);
          box("dark", x, 0.32, z + 0.069, 0.025, 0.07, 0.012);
        }
      box("wood", 0, 0.13, 0.155, 0.1, 0.17, 0.02);
      roof(0, 0.42, 0, 0.33, 0.18, 0.3);
      cyl("gold", 0, 0.58, 0, 0.007, 0.2);
      box("accent", 0.055, 0.63, 0, 0.1, 0.06, 0.012);
      break;
    case "bunker":
      ball("stone", 0, 0.12, -0.015, 0.28, 1, 0.65, 0.82);
      box("stone", 0, 0.14, 0.15, 0.32, 0.24, 0.14);
      box("dark", 0, 0.11, 0.231, 0.12, 0.19, 0.014);
      box("gold", 0, 0.25, 0.235, 0.21, 0.025, 0.025);
      for (const x of [-0.2, 0.2]) {
        cyl("dark", x, 0.24, -0.09, 0.022, 0.2);
        cyl("dark", x + 0.025, 0.33, -0.09, 0.022, 0.08, 0.022, 0, Math.PI / 2);
      }
      torus("gold", 0.11, 0.17, 0.24, 0.025, 0.006);
      break;
    case "basket":
      box("wood", 0, 0.16, 0, 0.37, 0.25, 0.3);
      for (let i = 0; i < 7; i++) {
        box("gold", -0.16 + i * 0.053, 0.16, 0.16, 0.013, 0.23, 0.012);
        box("gold", -0.16 + i * 0.053, 0.16, -0.16, 0.013, 0.23, 0.012);
      }
      torus("wood", 0, 0.32, 0, 0.18, 0.015);
      ball("red", -0.075, 0.3, 0.02, 0.06);
      ball("green", 0.065, 0.3, 0.07, 0.055);
      box("ivory", 0.075, 0.38, -0.05, 0.055, 0.24, 0.055, 0, -0.25);
      break;
    case "bistro":
      box("ivory", 0, 0.23, 0, 0.41, 0.39, 0.3);
      box("dark", 0, 0.19, 0.157, 0.3, 0.24, 0.015);
      box("wood", 0, 0.19, 0.17, 0.018, 0.24, 0.012);
      box("accent", 0, 0.42, 0.12, 0.49, 0.055, 0.36);
      for (let i = 0; i < 6; i++)
        box(
          i % 2 ? "white" : "red",
          -0.2 + i * 0.08,
          0.45,
          0.19,
          0.079,
          0.025,
          0.23,
        );
      box("gold", 0, 0.5, -0.005, 0.25, 0.07, 0.03);
      for (const x of [-0.17, 0.17]) cyl("gold", x, 0.18, 0.28, 0.01, 0.32);
      break;
    case "book":
      legs(0.13, 0.08, 0.16);
      box("wood", 0, 0.19, 0, 0.35, 0.04, 0.25);
      box("accent", -0.1, 0.29, 0, 0.2, 0.07, 0.31, 0, -0.14);
      box("accent", 0.1, 0.29, 0, 0.2, 0.07, 0.31, 0, 0.14);
      box("ivory", -0.1, 0.325, 0, 0.18, 0.04, 0.28, 0, -0.14);
      box("ivory", 0.1, 0.325, 0, 0.18, 0.04, 0.28, 0, 0.14);
      for (let i = 0; i < 5; i++) {
        box("wood", -0.1, 0.35, -0.09 + i * 0.043, 0.13, 0.003, 0.006);
        box("wood", 0.1, 0.35, -0.09 + i * 0.043, 0.13, 0.003, 0.006);
      }
      break;
    case "fountain":
      cyl("stone", 0, 0.07, 0, 0.25, 0.1);
      cyl("glass", 0, 0.13, 0, 0.22, 0.02);
      torus("ivory", 0, 0.14, 0, 0.24, 0.025, Math.PI / 2);
      cyl("gold", 0, 0.26, 0, 0.03, 0.29);
      cyl("ivory", 0, 0.37, 0, 0.13, 0.035);
      cyl("glass", 0, 0.39, 0, 0.11, 0.01);
      ball("glass", 0, 0.49, 0, 0.048, 1, 1.7, 1);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257;
        ball(
          "glass",
          Math.sin(a) * 0.13,
          0.26,
          Math.cos(a) * 0.13,
          0.012,
          1,
          4,
          1,
        );
      }
      break;
    case "bathhouse":
      box("ivory", 0, 0.23, 0, 0.38, 0.38, 0.33);
      roof(0, 0.5, 0, 0.48, 0.22, 0.42);
      box("wood", 0, 0.16, 0.18, 0.1, 0.24, 0.02);
      box("accent", 0.12, 0.29, 0.18, 0.075, 0.075, 0.02);
      cyl("gold", -0.15, 0.51, -0.1, 0.026, 0.23);
      for (let i = 0; i < 3; i++)
        ball(
          "white",
          -0.15 - i * 0.012,
          0.67 + i * 0.04,
          -0.1,
          0.025 + i * 0.005,
          1,
          0.6,
          1,
        );
      break;
    case "observatory":
      cyl("ivory", 0, 0.19, 0, 0.21, 0.33);
      ball("accent", 0, 0.37, 0, 0.22, 1, 0.75, 1);
      box("dark", 0, 0.43, 0.14, 0.06, 0.19, 0.06);
      cyl("gold", 0, 0.42, 0.24, 0.04, 0.23, 0.05, Math.PI / 2);
      cyl("glass", 0, 0.42, 0.365, 0.04, 0.01, 0.04, Math.PI / 2);
      torus("gold", 0, 0.34, 0, 0.22, 0.01, Math.PI / 2);
      box("wood", 0, 0.13, 0.21, 0.07, 0.16, 0.02);
      break;
    case "robot":
      cyl("dark", 0, 0.14, 0, 0.06, 0.23);
      box("accent", 0, 0.27, 0, 0.25, 0.22, 0.17);
      box("ivory", 0, 0.48, 0, 0.3, 0.23, 0.23);
      box("dark", 0, 0.49, 0.127, 0.25, 0.12, 0.016);
      for (const x of [-0.07, 0.07])
        ball("glass", x, 0.5, 0.143, 0.03, 1, 0.7, 0.4);
      box("gold", 0, 0.43, 0.132, 0.07, 0.012, 0.012);
      for (const x of [-0.17, 0.17]) {
        ball("gold", x, 0.28, 0, 0.035);
        box("stone", x, 0.22, 0, 0.045, 0.14, 0.06);
      }
      cyl("gold", 0, 0.65, 0, 0.009, 0.1);
      ball("light", 0, 0.71, 0, 0.025);
      break;
    case "astronaut":
      box("ivory", 0, 0.25, 0, 0.23, 0.25, 0.17);
      ball("white", 0, 0.48, 0, 0.155, 1, 1, 0.9);
      ball("gold", 0, 0.48, 0.08, 0.126, 1, 0.75, 0.65);
      box("dark", 0, 0.28, 0.097, 0.1, 0.065, 0.02);
      box("accent", 0, 0.27, -0.125, 0.22, 0.23, 0.1);
      for (const x of [-0.08, 0.08]) {
        box("white", x, 0.085, 0.02, 0.09, 0.17, 0.12);
        box("white", x * 2, 0.28, 0, 0.08, 0.24, 0.09, 0, x * 4);
      }
      break;
    case "gate":
      for (const x of [-0.18, 0.18]) {
        box("stone", x, 0.25, 0, 0.1, 0.46, 0.13);
        box("gold", x, 0.49, 0, 0.13, 0.04, 0.17);
      }
      box("ivory", 0, 0.53, 0, 0.48, 0.09, 0.16);
      box("gold", 0, 0.54, 0.09, 0.16, 0.025, 0.01);
      box("wood", 0.045, 0.24, 0, 0.25, 0.42, 0.04, -0.5);
      ball("gold", -0.02, 0.24, 0.07, 0.014);
      box("ivory", 0, 0.03, 0.06, 0.48, 0.04, 0.35);
      break;
    case "bottle":
      bottle(0, 0.025, 0, "green", 1.55);
      cyl("wood", 0, 0.055, 0, 0.19, 0.07);
      box("ivory", 0.145, 0.22, 0.05, 0.14, 0.19, 0.03, -0.3);
      box("gold", 0.145, 0.24, 0.07, 0.07, 0.009, 0.01, -0.3);
      box("gold", 0.145, 0.24, 0.07, 0.009, 0.07, 0.01, -0.3);
      break;
    case "sculpture":
      box("stone", 0, 0.1, 0, 0.27, 0.17, 0.24);
      cyl("gold", 0, 0.21, 0, 0.09, 0.06);
      ball("ivory", 0, 0.4, 0, 0.13, 1, 1.2, 1);
      box("accent", 0, 0.29, 0, 0.24, 0.1, 0.16);
      torus("gold", 0, 0.42, 0, 0.2, 0.009, 0, 0.5);
      torus("gold", 0, 0.42, 0, 0.2, 0.009, Math.PI / 2);
      break;
    default:
      throw new Error(`Unknown landmark: ${type}`);
  }
  return bake(g);
}
export function createLandmarks(sections) {
  const group = new THREE.Group(),
    up = new THREE.Vector3(0, 1, 0),
    landmarks = [];
  for (const [index, p] of sections.entries()) {
    const root = new THREE.Group();
    const model = assembly(p.model, p.color);
    // Bake the base pivot into the model: hover scales and idle yaw now keep
    // every foot on its tangent plane instead of swinging into the terrain.
    const bounds = new THREE.Box3().setFromObject(model);
    model.children.forEach((mesh) =>
      mesh.geometry.translate(0, -bounds.min.y, 0),
    );
    model.position.y = 0.005;
    const footprint =
      Math.hypot(
        Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
        Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
      ) * 1.13;
    if (footprint > 0.5)
      throw new Error(
        `Landmark footprint exceeds its prepared ground: ${p.id}`,
      );
    root.add(model);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(footprint + 0.012, footprint + 0.028, 48),
      new THREE.MeshBasicMaterial({
        color: p.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.008;
    root.add(halo);
    root.userData.section = p;
    root.traverse((o) => {
      o.userData.landmark = root;
    });
    group.add(root);
    landmarks.push({
      root,
      model,
      halo,
      section: { ...p, index },
      hover: 0,
      footprint,
    });
  }
  return {
    group,
    landmarks,
    place(positions) {
      for (const [index, p] of positions.entries()) {
        const l = landmarks[index];
        l.section = p;
        l.root.userData.section = p;
        l.root.position.copy(p.position);
        l.root.quaternion.setFromUnitVectors(up, p.groundNormal);
        l.root.rotateY(p.index * 1.71);
      }
    },
    update(time, active, reduced) {
      for (const l of landmarks) {
        const target = l.root === active ? 1 : 0;
        l.hover += (target - l.hover) * 0.13;
        l.model.scale.setScalar(1 + l.hover * 0.13);
        l.halo.material.opacity = l.hover * 0.6;
        if (!reduced) {
          l.model.rotation.y =
            Math.sin(time * 0.55 + l.section.index * 1.7) * 0.025;
        } else l.model.rotation.set(0, 0, 0);
      }
    },
  };
}
export function disposeModelCache() {
  cache.forEach((g) => g.dispose());
  cache.clear();
  Object.values(palette).forEach((m) => m.dispose());
}
