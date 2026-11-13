import * as THREE from "../three.module.js";
import { random } from "./terrain.js";
export function createSpace(low) {
  const group = new THREE.Group(),
    rng = random(9001);
  const count = low ? 1700 : 3400,
    positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    sizes = new Float32Array(count),
    phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const y = rng() * 2 - 1,
      a = rng() * Math.PI * 2,
      r = 35 + rng() * 65;
    positions.set(
      [
        Math.sqrt(1 - y * y) * Math.cos(a) * r,
        y * r,
        Math.sqrt(1 - y * y) * Math.sin(a) * r,
      ],
      i * 3,
    );
    const c = new THREE.Color().setHSL(
      0.08 + rng() * 0.56,
      0.1 + rng() * 0.25,
      0.55 + rng() * 0.4,
    );
    colors.set([c.r, c.g, c.b], i * 3);
    sizes[i] = rng() < 0.025 ? 3 + rng() * 2 : 0.6 + rng() * 1.4;
    phases[i] = rng() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  g.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
  const stars = new THREE.Points(
    g,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: Math.min(devicePixelRatio, 1.5) },
      },
      vertexShader: `attribute float size;attribute float phase;varying vec3 vColor;varying float alpha;uniform float time;uniform float pixelRatio;void main(){vColor=color;alpha=.52+.3*sin(time*.4+phase);vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*pixelRatio*(55./-p.z),.7,7.);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 vColor;varying float alpha;void main(){float d=length(gl_PointCoord-.5);float light=exp(-d*d*22.);gl_FragColor=vec4(vColor,light*alpha);}`,
    }),
  );
  group.add(stars);
  // A sparse volume of blue/amber interstellar dust. Each point has its own depth.
  const dustCount = low ? 70 : 180,
    dustPosition = new Float32Array(dustCount * 3),
    dustColor = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const x = (rng() - 0.5) * 100;
    dustPosition.set(
      [x, (rng() - 0.5) * 15 + Math.sin(x * 0.04) * 13, -45 - rng() * 35],
      i * 3,
    );
    const c = new THREE.Color(i % 6 === 0 ? "#705747" : "#29475c");
    dustColor.set([c.r, c.g, c.b], i * 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dustPosition, 3));
  dg.setAttribute("color", new THREE.BufferAttribute(dustColor, 3));
  const dust = new THREE.Points(
    dg,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      uniforms: { viewportScale: { value: Math.min(innerHeight / 900, 1.4) } },
      vertexShader: `uniform float viewportScale;varying vec3 c;void main(){c=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=380.*viewportScale*(45./-p.z);gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 c;void main(){vec2 p=gl_PointCoord-.5;float a=exp(-dot(p,p)*18.)*.3;gl_FragColor=vec4(c,a);}`,
    }),
  );
  group.add(dust);
  return {
    group,
    resize(height) {
      dust.material.uniforms.viewportScale.value = Math.min(height / 900, 1.4);
    },
    update(time) {
      stars.material.uniforms.time.value = time;
      dust.rotation.z = Math.sin(time * 0.025) * 0.012;
      group.rotation.y = Math.sin(time * 0.012) * 0.008;
    },
  };
}
export function environment(renderer) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#172430";
  ctx.fillRect(0, 0, 512, 256);
  let grad = ctx.createRadialGradient(100, 80, 1, 100, 80, 110);
  grad.addColorStop(0, "#e9dab5");
  grad.addColorStop(0.2, "#65737c");
  grad.addColorStop(1, "#172430");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  grad = ctx.createRadialGradient(380, 100, 1, 380, 100, 85);
  grad.addColorStop(0, "#6aafc1");
  grad.addColorStop(1, "#172430");
  ctx.fillStyle = grad;
  ctx.fillRect(280, 0, 232, 256);
  const texture = new THREE.CanvasTexture(c);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(texture);
  texture.dispose();
  pmrem.dispose();
  return rt;
}
export function createOrbit() {
  const points = [];
  for (let i = 0; i <= 300; i++) {
    const a = (i / 300) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * 4.35, 0, Math.sin(a) * 4.35));
  }
  const orbit = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: "#8295a1",
      transparent: true,
      opacity: 0.1,
    }),
  );
  orbit.rotation.set(0.4, 0, -0.27);
  return orbit;
}
