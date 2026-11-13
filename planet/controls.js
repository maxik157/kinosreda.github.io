import * as THREE from "../three.module.js";
export class PlanetControls {
  constructor(
    canvas,
    world,
    camera,
    { onHover, onSelect, onChange, reduced = false },
  ) {
    this.canvas = canvas;
    this.world = world;
    this.camera = camera;
    this.onHover = onHover;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.distance = 12.7;
    this.targetDistance = this.distance;
    this.minimum = 5;
    this.maximum = 19;
    this.velocity = new THREE.Vector2();
    this.paused = reduced;
    this.locked = false;
    this.pointers = new Map();
    this.abort = new AbortController();
    this.hadPinch = false;
    this.lastTouch = false;
    const options = { signal: this.abort.signal };
    canvas.addEventListener("pointerdown", (e) => this.down(e), options);
    canvas.addEventListener("pointermove", (e) => this.move(e), options);
    canvas.addEventListener("pointerup", (e) => this.up(e), options);
    canvas.addEventListener("pointercancel", (e) => this.cancel(e), options);
    canvas.addEventListener(
      "lostpointercapture",
      (e) => this.cancel(e),
      options,
    );
    canvas.addEventListener(
      "pointerleave",
      () => {
        if (!this.pointers.size) onHover(null);
      },
      options,
    );
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (!this.locked)
          this.zoom(
            Math.exp(
              Math.min(100, Math.max(-100, e.deltaY)) *
                (e.deltaMode === 1 ? 0.012 : 0.0018),
            ),
          );
      },
      { ...options, passive: false },
    );
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), options);
    canvas.addEventListener(
      "keydown",
      (e) => {
        if (this.locked) return;
        const d = {
          ArrowLeft: [-0.04, 0],
          ArrowRight: [0.04, 0],
          ArrowUp: [0, -0.04],
          ArrowDown: [0, 0.04],
        }[e.key];
        if (d) {
          e.preventDefault();
          this.rotate(...d);
          this.velocity.set(0, 0);
          onHover(null);
        }
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          this.zoom(0.88);
        }
        if (e.key === "-") {
          e.preventDefault();
          this.zoom(1.12);
        }
        if (e.key === " ") {
          e.preventDefault();
          this.paused = !this.paused;
          if (this.paused) this.velocity.set(0, 0);
          onChange?.();
        }
      },
      options,
    );
  }
  zoom(factor) {
    if (this.locked) return;
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * factor,
      this.minimum,
      this.maximum,
    );
    this.onHover(null);
  }
  down(e) {
    if (this.locked || e.button !== 0) return;
    this.lastTouch = e.pointerType === "touch";
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      moved: 0,
      time: e.timeStamp,
    });
    this.velocity.set(0, 0);
    if (this.pointers.size > 1) this.hadPinch = true;
    this.canvas.classList.add("dragging");
    this.onHover(null);
  }
  move(e) {
    if (this.locked) return;
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType !== "touch")
        this.onHover({ x: e.clientX, y: e.clientY });
      return;
    }
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y,
      dt = Math.max(8, e.timeStamp - p.time);
    const before = this.pointers.size === 2 ? this.pinchDistance() : 0;
    p.x = e.clientX;
    p.y = e.clientY;
    p.time = e.timeStamp;
    p.moved = Math.max(p.moved, Math.hypot(p.x - p.startX, p.y - p.startY));
    if (this.pointers.size === 2) {
      const after = this.pinchDistance();
      if (after > 0 && before > 0) this.zoom(before / after);
      this.velocity.set(0, 0);
    } else {
      const k = 4 / Math.min(innerWidth, innerHeight);
      this.rotate(dx * k, dy * k);
      this.velocity.set((dx * k) / (dt / 1000), (dy * k) / (dt / 1000));
      this.velocity.clampLength(0, 2.8);
    }
    this.onHover(null);
  }
  pinchDistance() {
    const [a, b] = this.pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) {
      this.canvas.classList.remove("dragging");
      if (!this.hadPinch && p.moved < 6 && !this.locked) {
        this.velocity.set(0, 0);
        this.onSelect({ x: e.clientX, y: e.clientY });
      }
      this.hadPinch = false;
    }
  }
  cancel(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) {
      this.canvas.classList.remove("dragging");
      this.hadPinch = false;
      this.velocity.set(0, 0);
    }
  }
  rotate(x, y) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(y, x, 0, "XYZ"),
    );
    this.world.quaternion.premultiply(q).normalize();
  }
  update(dt) {
    if (this.locked) return;
    this.distance = THREE.MathUtils.damp(
      this.distance,
      this.targetDistance,
      9,
      dt,
    );
    if (!this.pointers.size) {
      this.rotate(
        (this.velocity.x + (this.paused ? 0 : 0.023)) * dt,
        this.velocity.y * dt,
      );
      this.velocity.multiplyScalar(Math.exp(-3.1 * dt));
    }
    this.camera.position.set(0, 0, this.distance);
    this.camera.lookAt(0, 0, 0);
  }
  snapshot() {
    return {
      quaternion: this.world.quaternion.toArray(),
      distance: this.distance,
      targetDistance: this.targetDistance,
      velocity: this.velocity.toArray(),
      paused: this.paused,
    };
  }
  restore(s) {
    if (
      !s ||
      !Array.isArray(s.quaternion) ||
      s.quaternion.length !== 4 ||
      !s.quaternion.every(Number.isFinite)
    )
      return;
    this.world.quaternion.fromArray(s.quaternion).normalize();
    this.distance = THREE.MathUtils.clamp(
      Number(s.distance) || 12.7,
      this.minimum,
      this.maximum,
    );
    this.targetDistance = THREE.MathUtils.clamp(
      Number(s.targetDistance) || this.distance,
      this.minimum,
      this.maximum,
    );
    this.velocity.fromArray(
      Array.isArray(s.velocity) && s.velocity.every(Number.isFinite)
        ? s.velocity
        : [0, 0],
    );
    this.velocity.clampLength(0, 2.8);
    this.paused = !!s.paused;
  }
  suspend() {
    this.locked = true;
    for (const id of this.pointers.keys()) {
      try {
        this.canvas.releasePointerCapture(id);
      } catch {}
    }
    this.pointers.clear();
    this.canvas.classList.remove("dragging");
    this.hadPinch = false;
  }
  dispose() {
    this.abort.abort();
    this.pointers.clear();
  }
}
