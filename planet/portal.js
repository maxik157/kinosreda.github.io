import * as THREE from "../three.module.js";
const $ = (id) => document.getElementById(id);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export class SectionPortal {
  constructor({ camera, controls, project, onState, onRestore, reduced }) {
    this.camera = camera;
    this.controls = controls;
    this.project = project;
    this.onState = onState;
    this.onRestore = onRestore;
    this.reduced = reduced;
    this.state = "idle";
    this.generation = 0;
    this.viewTarget = new THREE.Vector3();
    this.abort = new AbortController();
    this.boundDocs = new WeakSet();
    this.dialog = $("portal");
    this.frame = $("section-frame");
    this.status = $("portal-status");
    this.special = $("portal-special");
    $("portal-close").addEventListener("click", () => this.close(), {
      signal: this.abort.signal,
    });
    this.dialog.addEventListener(
      "cancel",
      (e) => {
        e.preventDefault();
        this.close();
      },
      { signal: this.abort.signal },
    );
    this.dialog.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          this.close();
        }
      },
      { signal: this.abort.signal },
    );
    this.frame.addEventListener("load", () => this.loaded(), {
      signal: this.abort.signal,
    });
    this.frame.addEventListener("error", () => this.loadFailed(), {
      signal: this.abort.signal,
    });
    window.addEventListener(
      "message",
      (e) => {
        if (
          e.origin !== location.origin ||
          e.source !== this.frame.contentWindow
        )
          return;
        if (
          [
            "shelf-modal-close",
            "shelf-modal-saved",
            "beer-shelf-close",
          ].includes(e.data?.type)
        )
          this.close();
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      "resize",
      () => {
        if (this.state === "open") this.dialog.style.clipPath = "none";
      },
      { signal: this.abort.signal },
    );
  }
  get active() {
    return this.state !== "idle";
  }
  duration(ms) {
    return this.reduced ? 0 : ms;
  }
  async travel(position, target, ms, token) {
    const start = performance.now(),
      from = this.camera.position.clone(),
      fromTarget = this.viewTarget.clone();
    return new Promise((resolve) => {
      const tick = (now) => {
        if (token !== this.generation) return resolve(false);
        const t = ms ? Math.min(1, (now - start) / ms) : 1;
        this.camera.position.lerpVectors(from, position, ease(t));
        this.viewTarget.lerpVectors(fromTarget, target, ease(t));
        this.camera.lookAt(this.viewTarget);
        if (t < 1) this.travelRaf = requestAnimationFrame(tick);
        else resolve(true);
      };
      tick(start);
    });
  }
  clipAt(point) {
    const r = this.dialog.getBoundingClientRect(),
      x = THREE.MathUtils.clamp(
        point.x - r.left,
        20,
        Math.max(20, r.width - 20),
      ),
      y = THREE.MathUtils.clamp(
        point.y - r.top,
        20,
        Math.max(20, r.height - 20),
      );
    return `inset(${Math.max(0, y - 18)}px ${Math.max(0, r.width - x - 22)}px ${Math.max(0, r.height - y - 18)}px ${Math.max(0, x - 22)}px round 20px)`;
  }
  async reveal(open, token) {
    this.animation?.cancel();
    const small = this.clipAt(
      open ? this.project(this.selected) : this.originScreen,
    );
    const animation = this.dialog.animate(
      open
        ? [
            { clipPath: small, opacity: 0.08 },
            { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
          ]
        : [
            {
              clipPath:
                getComputedStyle(this.dialog).clipPath === "none"
                  ? "inset(0px 0px 0px 0px round 0px)"
                  : getComputedStyle(this.dialog).clipPath,
              opacity: 1,
            },
            { clipPath: small, opacity: 0 },
          ],
      {
        duration: this.duration(open ? 650 : 550),
        easing: open ? "cubic-bezier(.16,1,.3,1)" : "cubic-bezier(.65,0,.35,1)",
        fill: "forwards",
      },
    );
    this.animation = animation;
    try {
      await animation.finished;
    } catch {
      return false;
    }
    return token === this.generation;
  }
  async open(landmark) {
    if (this.active) return;
    this.state = "opening";
    const token = ++this.generation;
    this.selected = landmark;
    this.previousFocus = document.activeElement;
    this.saved = this.controls.snapshot();
    this.originScreen = this.project(landmark);
    this.controls.suspend();
    this.onState(true);
    this.viewTarget.set(0, 0, 0);
    this.section = landmark.userData.section;
    this.setContent(this.section);
    const target = new THREE.Vector3();
    landmark.localToWorld(target.set(0, 0.3, 0));
    const normal = landmark.getWorldPosition(new THREE.Vector3()).normalize();
    const destination = target
      .clone()
      .addScaledVector(normal, 1.8)
      .add(new THREE.Vector3(0, 0.25, 0));
    const travel = this.travel(destination, target, this.duration(1050), token);
    await new Promise((resolve) => setTimeout(resolve, this.duration(430)));
    if (token !== this.generation) return;
    this.dialog.showModal();
    $("portal-close").focus({ preventScroll: true });
    const reveal = this.reveal(true, token);
    await Promise.all([travel, reveal]);
    if (token === this.generation) {
      this.state = "open";
      this.dialog.style.clipPath = "none";
      this.animation?.cancel();
    }
  }
  setContent(section) {
    clearTimeout(this.timeout);
    this.frame.classList.remove("ready");
    this.status.hidden = false;
    this.special.hidden = true;
    this.frame.hidden = false;
    this.dialog.setAttribute("aria-label", section.title);
    this.frame.title = section.title;
    this.awaitingAuth = false;

    if (section.isolated) {
      this.frame.hidden = true;
      this.frame.removeAttribute("src");
      this.status.hidden = true;
      this.special.replaceChildren();
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "ОТДЕЛЬНЫЙ ИГРОВОЙ МИР";
      const title = document.createElement("h2");
      title.textContent = section.title;
      const p = document.createElement("p");
      p.textContent =
        "Движку этой игры требуется отдельная вкладка с изоляцией памяти. Планета останется здесь — в том же положении и масштабе. Вернитесь в эту вкладку и закройте окно, чтобы продолжить путешествие.";
      const link = document.createElement("a");
      link.href = section.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Запустить игру ↗";
      this.special.append(eyebrow, title, p, link);
      this.special.hidden = false;
      return;
    }
    let entry = section.entryHref || section.href;
    const url = new URL(entry, location.href);
    if (
      url.origin !== location.origin ||
      /\/planet\.html$/.test(url.pathname)
    ) {
      this.loadFailed();
      return;
    }
    this.frame.src = url.href;
    this.timeout = setTimeout(() => this.loadFailed(), 20000);
  }
  loaded() {
    if (
      !this.active ||
      this.section?.isolated ||
      !this.frame.hasAttribute("src")
    )
      return;
    clearTimeout(this.timeout);
    try {
      const doc = this.frame.contentDocument;
      if (!doc || !doc.body) return this.loadFailed();
      // Never permit a same-origin link or auth redirect to recursively embed the planet.
      if (/\/planet\.html$/.test(this.frame.contentWindow.location.pathname)) {
        this.frame.removeAttribute("src");
        this.close();
        return;
      }
      if (
        doc.title === "Error response" ||
        doc.title === "404 Not Found" ||
        /^(Cannot GET|Not found)/.test(doc.body.textContent.trim())
      )
        return this.loadFailed();
      const frameUrl = new URL(this.frame.contentWindow.location.href);
      if (frameUrl.pathname.endsWith("/login.html")) this.awaitingAuth = true;
      else if (this.awaitingAuth) {
        this.awaitingAuth = false;
        if (
          localStorage.getItem("currentUser") &&
          frameUrl.href !==
            new URL(this.section.entryHref || this.section.href, location.href)
              .href
        ) {
          this.frame.src = this.section.entryHref || this.section.href;
          return;
        }
      }
      this.bindDocument(doc);
      this.frame.classList.add("ready");
      this.status.hidden = true;
      this.special.hidden = true;
    } catch {
      this.loadFailed();
    }
  }
  bindDocument(doc) {
    if (this.boundDocs.has(doc)) return;
    this.boundDocs.add(doc);
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        const modal = doc.querySelector(
          'dialog[open],[aria-modal="true"],.modal.active,.modal.open',
        );
        if (!modal) {
          e.preventDefault();
          this.close();
        }
      }
    });
    doc.addEventListener(
      "click",
      (e) => {
        const anchor = e.target.closest?.("a[href]");
        if (
          !anchor ||
          e.defaultPrevented ||
          e.button !== 0 ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        let url;
        try {
          url = new URL(anchor.href, doc.location.href);
        } catch {
          return;
        }
        if (
          url.origin === location.origin &&
          /\/planet\.html$/.test(url.pathname)
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.close();
        } else if (
          url.origin === location.origin &&
          ["_top", "_parent"].includes(anchor.target)
        ) {
          anchor.target = "_self";
        }
      },
      true,
    );
    // Existing services contain their own frames. Apply only the navigation guard;
    // leave their controls, permissions, scroll and scripts intact.
    const attach = (frame) => {
      try {
        if (frame.contentDocument) this.bindDocument(frame.contentDocument);
      } catch {}
    };
    doc.querySelectorAll("iframe").forEach(attach);
    doc.addEventListener(
      "load",
      (e) => {
        if (e.target.tagName === "IFRAME") attach(e.target);
      },
      true,
    );
  }
  loadFailed() {
    if (!this.active || this.state === "closing") return;
    clearTimeout(this.timeout);
    this.status.hidden = true;
    this.frame.hidden = true;
    this.special.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = "Пространство пока не ответило";
    const p = document.createElement("p");
    p.textContent =
      "Можно повторить загрузку или открыть исходную страницу в новой вкладке.";
    const retry = document.createElement("button");
    retry.textContent = "Попробовать снова";
    retry.onclick = () => this.setContent(this.section);
    const link = document.createElement("a");
    link.href = this.section?.href || "index.html";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Открыть страницу ↗";
    this.special.append(h, p, retry, link);
    this.special.hidden = false;
  }
  async close() {
    if (!this.active || this.state === "closing") return;
    this.state = "closing";
    const token = ++this.generation;
    clearTimeout(this.timeout);
    this.animation?.cancel();
    // Begin the camera return while the page contracts into the original landmark.
    const travel = this.travel(
      new THREE.Vector3(0, 0, this.saved.distance),
      new THREE.Vector3(),
      this.duration(950),
      token,
    );
    if (this.dialog.open) await this.reveal(false, token);
    if (token !== this.generation) return;
    this.dialog.close();
    this.animation?.cancel();
    this.frame.removeAttribute("src");
    this.frame.classList.remove("ready");
    await travel;
    if (token !== this.generation) return;
    this.controls.restore(this.saved);
    this.controls.locked = false;
    this.controls.update(0);
    this.viewTarget.set(0, 0, 0);
    this.state = "idle";
    this.onState(false);
    this.onRestore?.();
    if (this.previousFocus?.isConnected)
      this.previousFocus.focus({ preventScroll: true });
  }
  dispose() {
    ++this.generation;
    clearTimeout(this.timeout);
    cancelAnimationFrame(this.travelRaf);
    this.animation?.cancel();
    this.abort.abort();
    if (this.dialog.open) this.dialog.close();
    this.frame.removeAttribute("src");
  }
}
