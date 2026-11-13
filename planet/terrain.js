import * as THREE from "../three.module.js";
export const RADIUS = 3.15;
export function random(seed = 412) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
const mix = (a, b, t) => a + (b - a) * t;
function hash(x, y, z) {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, y, z) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  x -= ix;
  y -= iy;
  z -= iz;
  const u = x * x * (3 - 2 * x),
    v = y * y * (3 - 2 * y),
    w = z * z * (3 - 2 * z);
  return mix(
    mix(
      mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), u),
      mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), u),
      v,
    ),
    mix(
      mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), u),
      mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), u),
      v,
    ),
    w,
  );
}
function fbm(x, y, z, octaves = 5) {
  let sum = 0,
    a = 0.55;
  for (let i = 0; i < octaves; i++) {
    sum += a * noise(x, y, z);
    x = x * 2.04 + 7.1;
    y = y * 2.04 + 3.4;
    z = z * 2.04 - 2.8;
    a *= 0.49;
  }
  return sum;
}
export function elevation(x, y, z) {
  const warp = noise(x * 2 + 12, y * 2 - 6, z * 2 + 2) - 0.5;
  const continent = fbm(x * 1.9 + 4 + warp * 0.4, y * 1.9 + 3, z * 1.9 - 1, 4);
  const ridge = 1 - Math.abs(noise(x * 11 + 5, y * 11, z * 11) * 2 - 1);
  return (
    (continent - 0.455) * 1.8 + Math.max(0, continent - 0.47) * ridge * 0.8
  );
}
export const SEA_RADIUS = RADIUS + 0.003;
// Only the model's own footprint is levelled. The support plane follows the
// local terrain slope; a wide, irregular feather preserves the hillside.
export const GROUND_MARGIN = 0.075;
export const SHOULDER_RADIUS = 0.48;
export const MAX_GROUND_CHANGE = 0.095;
function naturalRadius(n) {
  return RADIUS + Math.max(-0.09, elevation(n.x, n.y, n.z) * 0.72);
}
function siteDistance(n, site) {
  const dot = n.dot(site.normal);
  if (dot < 0.9) return Infinity;
  return (site.height * Math.sqrt(Math.max(0, 1 - dot * dot))) / dot;
}
function shoulderWidth(n) {
  return SHOULDER_RADIUS * (0.85 + 0.3 * noise(n.x * 13, n.y * 13, n.z * 13));
}
export function surfaceRadius(n, sites = []) {
  const base = naturalRadius(n);
  let correction = 0,
    weights = 1;
  for (const site of sites) {
    const distance = siteDistance(n, site);
    const shoulder = shoulderWidth(n);
    if (distance >= site.landingRadius + shoulder) continue;
    const plane = site.planeOffset / n.dot(site.groundNormal);
    if (distance <= site.landingRadius) return plane;
    const t = (distance - site.landingRadius) / shoulder;
    const w =
      (1 - t * t * t * (10 + t * (-15 + 6 * t))) *
      THREE.MathUtils.smoothstep(base, SEA_RADIUS + 0.01, SEA_RADIUS + 0.05);
    // Never turn a neighbouring ridge or coastline into a supporting mound.
    // Beyond the flat core the correction is bounded and fades to zero.
    const change = THREE.MathUtils.clamp(
      plane - base,
      -MAX_GROUND_CHANGE,
      MAX_GROUND_CHANGE,
    );
    const priority = w / Math.max(1e-12, 1 - w);
    correction += change * priority;
    weights += priority;
  }
  return base + correction / weights;
}
export function withinLanding(n, sites, clearance = 0.08) {
  return sites.some(
    (site) => siteDistance(n, site) < site.landingRadius + clearance,
  );
}
export function placeSections(sections) {
  const rng = random(713),
    up = new THREE.Vector3(0, 1, 0),
    candidates = [];
  const normal = new THREE.Vector3(),
    east = new THREE.Vector3(),
    north = new THREE.Vector3(),
    sample = new THREE.Vector3();
  for (let j = 0; j < 60000; j++) {
    const y = rng() * 1.82 - 0.91,
      a = rng() * Math.PI * 2;
    normal.set(
      Math.sqrt(1 - y * y) * Math.cos(a),
      y,
      Math.sqrt(1 - y * y) * Math.sin(a),
    );
    const center = naturalRadius(normal);
    if (center > SEA_RADIUS + 0.08)
      candidates.push({ normal: normal.clone(), center });
  }
  const fitted = new Map();
  function fitSites(radius) {
    if (fitted.has(radius)) return fitted.get(radius);
    const result = [];
    for (const candidate of candidates) {
      normal.copy(candidate.normal);
      east.crossVectors(up, normal).normalize();
      north.crossVectors(normal, east).normalize();
      const samples = [];
      let xx = 0,
        xz = 0,
        zz = 0,
        xh = 0,
        zh = 0,
        total = 0,
        valid = true;
      for (const ring of [0, 0.5, 1, 1.13]) {
        const count = ring ? 24 : 1;
        for (let k = 0; k < count; k++) {
          const angle = (k * Math.PI * 2) / count;
          sample
            .copy(normal)
            .multiplyScalar(candidate.center)
            .addScaledVector(east, Math.cos(angle) * radius * ring)
            .addScaledVector(north, Math.sin(angle) * radius * ring)
            .normalize();
          const height = naturalRadius(sample);
          if (height < SEA_RADIUS + 0.035) {
            valid = false;
            break;
          }
          const x = height * sample.dot(east),
            z = height * sample.dot(north),
            h = height * sample.dot(normal);
          samples.push({ x, z, h, n: sample.clone(), radius: height });
          xx += x * x;
          xz += x * z;
          zz += z * z;
          xh += x * (h - candidate.center);
          zh += z * (h - candidate.center);
          total += h;
        }
        if (!valid) break;
      }
      if (!valid) continue;
      const determinant = xx * zz - xz * xz;
      const sx = (xh * zz - zh * xz) / determinant,
        sz = (zh * xx - xh * xz) / determinant;
      const slope = Math.hypot(sx, sz);
      if (slope > 0.38) continue;
      const height = total / samples.length;
      const groundNormal = normal
        .clone()
        .addScaledVector(east, -sx)
        .addScaledVector(north, -sz)
        .normalize();
      const planeOffset = height * groundNormal.dot(normal);
      let error = 0;
      for (const p of samples) {
        const plane = planeOffset / p.n.dot(groundNormal);
        error = Math.max(error, Math.abs(plane - p.radius));
        if (plane < SEA_RADIUS + 0.04) valid = false;
      }
      if (!valid || error > MAX_GROUND_CHANGE) continue;
      // Validate in the actual support plane as well as radial coordinates:
      // tilted footprints can otherwise reach a small coastal inlet between rings.
      east.crossVectors(up, groundNormal).normalize();
      north.crossVectors(groundNormal, east).normalize();
      for (const ring of [
        0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.13,
      ]) {
        for (let k = 0; k < 48; k++) {
          const angle = (k * Math.PI) / 24;
          sample
            .copy(normal)
            .multiplyScalar(height)
            .addScaledVector(east, Math.cos(angle) * radius * ring)
            .addScaledVector(north, Math.sin(angle) * radius * ring)
            .normalize();
          const original = naturalRadius(sample);
          const plane = planeOffset / sample.dot(groundNormal);
          if (
            original < SEA_RADIUS + 0.04 ||
            plane < SEA_RADIUS + 0.04 ||
            Math.abs(plane - original) > MAX_GROUND_CHANGE
          ) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
      }
      if (!valid) continue;
      result.push({
        normal: normal.clone(),
        groundNormal,
        height,
        planeOffset,
        error,
        slope,
        landingRadius: radius,
      });
    }
    fitted.set(radius, result);
    return result;
  }
  const sites = [];
  const ordered = sections
    .map((section, index) => ({ section, index }))
    .sort(
      (a, b) => (b.section.footprint ?? 0.5) - (a.section.footprint ?? 0.5),
    );
  ordered.forEach(({ section, index }) => {
    // Round up to share candidate fits between similarly sized models.
    const footprint = section.footprint ?? 0.5;
    const radius = Math.ceil((footprint + GROUND_MARGIN) * 20) / 20;
    const options = fitSites(radius);
    let best = null,
      bestScore = -Infinity;
    for (const candidate of options) {
      let spacing = 2,
        overlaps = false;
      for (const site of sites) {
        const distance = candidate.normal.distanceTo(site.normal);
        spacing = Math.min(spacing, distance);
        const angle =
          Math.atan((radius + 0.015) / candidate.height) +
          Math.atan((site.landingRadius + 0.015) / site.height);
        if (distance < 2 * Math.sin(angle / 2)) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      const score =
        Math.min(spacing, 0.8) -
        candidate.error * 4 -
        candidate.slope * 0.08 +
        (index === 0 ? candidate.normal.z * 0.05 : 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best)
      throw new Error(
        `Not enough gently sloping dry ground: ${index}/${sections.length}; ${options.length} candidates`,
      );
    sites.push({
      ...section,
      ...best,
      index,
      position: best.normal.clone().multiplyScalar(best.height),
    });
  });
  return sites.sort((a, b) => a.index - b.index);
}
export function createLandGeometry(sites, low) {
  const geo = new THREE.SphereGeometry(
    RADIUS,
    low ? 256 : 320,
    low ? 160 : 192,
  );
  const positions = geo.attributes.position,
    n = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    n.fromBufferAttribute(positions, i).normalize();
    n.multiplyScalar(surfaceRadius(n, sites));
    positions.setXYZ(i, n.x, n.y, n.z);
  }
  geo.computeVertexNormals();
  return geo;
}
function canvasTexture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const im = ctx.createImageData(w, h);
  paint(im.data, w, h);
  ctx.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
export async function createTerrain(positions, low) {
  const world = new THREE.Group();
  const size = low ? 768 : 1536;
  // A single coherent spherical elevation field drives geometry, coasts and biomes.
  const map = canvasTexture(size, size / 2, (pixels, w, h) => {
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const v = (py / (h - 1)) * Math.PI,
          u = (px / w) * Math.PI * 2,
          st = Math.sin(v),
          x = -Math.cos(u) * st,
          y = Math.cos(v),
          z = Math.sin(u) * st;
        const e = elevation(x, y, z),
          detail = noise(x * 150, y * 150, z * 150),
          moist = noise(x * 4 - 8, y * 4 + 5, z * 4 + 1);
        const grain = noise(x * 52 + 3, y * 52, z * 52);
        let col;
        if (e < -0.025) col = [12, 34, 42];
        else if (e < 0.012)
          col = [131 + detail * 12, 133 + detail * 12, 102 + detail * 12];
        else {
          const arid =
            Math.max(0, Math.min(1, (0.42 - moist) * 6)) * (1 - Math.abs(y));
          const forest = [
            35 + moist * 22 + grain * 14,
            63 + moist * 35 + grain * 23,
            48 + grain * 19,
          ];
          const sand = [143 + detail * 25, 126 + detail * 22, 89 + detail * 17];
          col = forest.map((c, i) => mix(c, sand[i], arid));
          const rock = Math.max(0, Math.min(1, (e - 0.22) * 4.5));
          col = col.map((c, i) =>
            mix(
              c,
              [92 + detail * 38, 98 + detail * 36, 89 + detail * 34][i],
              rock,
            ),
          );
          const snow = Math.max(
            0,
            Math.min(
              1,
              Math.max(
                (Math.abs(y) - 0.88) * 12,
                (e - 0.79 + grain * 0.035) * 12,
              ),
            ),
          );
          col = col.map((c, i) =>
            mix(
              c,
              [201 + detail * 18, 211 + detail * 18, 210 + detail * 18][i],
              snow,
            ),
          );
        }
        const i = (py * w + px) * 4;
        pixels[i] = col[0];
        pixels[i + 1] = col[1];
        pixels[i + 2] = col[2];
        pixels[i + 3] = 255;
      }
  });
  map.colorSpace = THREE.SRGBColorSpace;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const bump = canvasTexture(
    low ? 512 : 1024,
    low ? 256 : 512,
    (pixels, w, h) => {
      for (let py = 0; py < h; py++)
        for (let px = 0; px < w; px++) {
          const v = (py / (h - 1)) * Math.PI,
            u = (px / w) * Math.PI * 2,
            x = -Math.cos(u) * Math.sin(v),
            y = Math.cos(v),
            z = Math.sin(u) * Math.sin(v);
          const hgt = fbm(x * 65, y * 65, z * 65, 3) * 255,
            i = (py * w + px) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = hgt;
          pixels[i + 3] = 255;
        }
    },
  );
  const geo = createLandGeometry(positions, low),
    n = new THREE.Vector3();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.055,
      roughness: 0.91,
      metalness: 0.02,
    }),
  );
  terrain.receiveShadow = true;
  world.add(terrain);
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(SEA_RADIUS, 128, 80),
    new THREE.MeshPhysicalMaterial({
      color: "#165b68",
      metalness: 0.28,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.25,
      bumpMap: bump,
      bumpScale: 0.012,
    }),
  );
  ocean.receiveShadow = true;
  world.add(ocean);
  const rng = random(226),
    dummy = new THREE.Object3D(),
    up = new THREE.Vector3(0, 1, 0),
    treePositions = [];
  for (let i = 0; i < (low ? 3200 : 7400); i++) {
    const y = rng() * 2 - 1,
      a = rng() * Math.PI * 2;
    n.set(
      Math.sqrt(1 - y * y) * Math.cos(a),
      y,
      Math.sqrt(1 - y * y) * Math.sin(a),
    );
    const e = elevation(n.x, n.y, n.z);
    if (e < 0.025 || e > 0.32 || Math.abs(y) > 0.79) continue;
    if (withinLanding(n, positions)) continue;
    if (noise(n.x * 6 + 20, n.y * 6, n.z * 6) < 0.39) continue;
    treePositions.push({
      n: n.clone(),
      size: 0.025 + rng() * 0.047,
      height: surfaceRadius(n, positions),
    });
  }
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.085, 0.12, 0.95, 5),
    new THREE.MeshStandardMaterial({ color: "#635846", roughness: 1 }),
    treePositions.length,
  );
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.62, 1.8, 7),
    new THREE.MeshStandardMaterial({ color: "#3f7459", roughness: 0.95 }),
    treePositions.length,
  );
  const color = new THREE.Color();
  treePositions.forEach((t, i) => {
    dummy.quaternion.setFromUnitVectors(up, t.n);
    dummy.scale.setScalar(t.size);
    dummy.position.copy(t.n).multiplyScalar(t.height + t.size * 0.45);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.addScaledVector(t.n, t.size * 0.85);
    dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
    trees.setColorAt(
      i,
      color.setHSL(
        0.36 + rng() * 0.06,
        0.2 + rng() * 0.18,
        0.16 + rng() * 0.12,
      ),
    );
  });
  trees.castShadow = true;
  trees.receiveShadow = true;
  world.add(trunks, trees);
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: "#8c9188", roughness: 0.96 }),
    low ? 160 : 400,
  );
  let count = 0;
  for (let i = 0; i < 3000 && count < rocks.instanceMatrix.count; i++) {
    const y = rng() * 2 - 1,
      a = rng() * Math.PI * 2;
    n.set(
      Math.sqrt(1 - y * y) * Math.cos(a),
      y,
      Math.sqrt(1 - y * y) * Math.sin(a),
    );
    const e = elevation(n.x, n.y, n.z);
    if (e < 0.1 || withinLanding(n, positions)) continue;
    dummy.position.copy(n).multiplyScalar(surfaceRadius(n, positions));
    dummy.quaternion.setFromUnitVectors(up, n);
    const s = 0.025 + rng() * 0.05;
    dummy.scale.set(s, s * (0.6 + rng()), s);
    dummy.updateMatrix();
    rocks.setMatrixAt(count++, dummy.matrix);
  }
  rocks.count = count;
  rocks.castShadow = true;
  world.add(rocks);
  const cloudsMap = canvasTexture(1024, 512, (pixels, w, h) => {
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const v = (py / (h - 1)) * Math.PI,
          u = (px / w) * Math.PI * 2,
          x = -Math.cos(u) * Math.sin(v),
          y = Math.cos(v),
          z = Math.sin(u) * Math.sin(v);
        const f = fbm(x * 5 + 18, y * 9, z * 5 - 3, 4),
          alpha = Math.max(0, f - 0.57) * 200;
        const i = (py * w + px) * 4;
        pixels[i] = 211;
        pixels[i + 1] = 225;
        pixels[i + 2] = 232;
        pixels[i + 3] = alpha;
      }
  });
  cloudsMap.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + 0.19, 96, 64),
    new THREE.MeshStandardMaterial({
      map: cloudsMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.38,
      roughness: 1,
    }),
  );
  world.add(clouds);
  return { world, clouds };
}
export function createAtmosphere() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + 0.24, 96, 64),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: { sun: { value: new THREE.Vector3(-0.6, 0.7, 1).normalize() } },
      vertexShader: `varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 n;varying vec3 eye;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),3.5);gl_FragColor=vec4(vec3(.15,.48,.72)*rim,rim*.38);}`,
    }),
  );
}
