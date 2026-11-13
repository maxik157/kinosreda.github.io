const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const puppeteer = require("puppeteer-core");
const root = path.resolve(__dirname, "..");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome =
  process.env.CHROME_BIN ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((p) => fs.existsSync(p));
// This source is a browser ES module in a CommonJS repository. Importing the
// configuration via a data URL keeps the project/module system unchanged.
const readSections = async () =>
  (
    await import(
      "data:text/javascript;base64," +
        Buffer.from(
          fs.readFileSync(path.join(root, "planet/sections.js"), "utf8"),
        ).toString("base64")
    )
  ).sections;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};
async function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      const data = fs.readFileSync(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
test("catalogue keeps the requested destinations and excludes removed planet pages", async () => {
  const sections = await readSections();
  assert.equal(new Set(sections.map((s) => s.id)).size, sections.length);
  assert.equal(
    new Set(sections.map((s) => s.model)).size,
    sections.length,
    "each section has its own model",
  );
  for (const s of sections) {
    const url = new URL(s.href, "http://localhost/");
    assert.equal(url.origin, "http://localhost");
    assert.ok(fs.existsSync(path.join(root, url.pathname)), s.href);
    assert.ok(!url.pathname.endsWith("planet.html"));
  }
  assert.equal(sections.length, 21);
  assert.deepEqual(
    sections.find((section) => section.id === "bar"),
    {
      id: "bar",
      title: "Бар",
      href: "beer-room.html",
      model: "bar",
      description: "Живое пространство для встреч и напитков",
      color: "#f2b75f",
      isolated: false,
      entryHref: "beer-room.html",
    },
  );
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "beer-room.html"), "utf8"),
    /fillText\('КИНОСРЕДА'/,
    "bar sign should not use the site wordmark",
  );
  const removed = new Set([
    "planning-event",
    "movie-picker",
    "stalker",
    "water",
    "ai",
    "login",
    "beer-add",
    "map",
    "model-viewer",
  ]);
  assert.ok(sections.every((section) => !removed.has(section.id)));
  // The existing published documents remain available outside planet navigation.
  for (const file of [
    "planning-event.html",
    "water.html",
    "ai.html",
    "login.html",
    "beer-modal.html",
    "map.html",
    "three2/GiantDad_viewer_manual_v3.html",
  ])
    assert.ok(fs.existsSync(path.join(root, file)));
});
test(
  "real browser: planet navigation and resilience",
  { skip: !chrome, timeout: 180000 },
  async (t) => {
    const { server, base } = await serve();
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"],
      defaultViewport: { width: 1440, height: 1000 },
    });
    t.after(async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    });
    const page = await browser.newPage();
    const errors = [];
    const shaderErrors = [];
    page.on("pageerror", (e) => {
      if (/\/planet\//.test(e.stack || "")) errors.push(e.message);
    });
    page.on("console", (m) => {
      if (
        m.type() === "error" &&
        /THREE.WebGLProgram|Shader Error|VALIDATE_STATUS/.test(m.text())
      )
        shaderErrors.push(m.text());
    });
    // Prevent smoke checks from contacting production services or writing user data.
    await page.setRequestInterception(true);
    page.on("request", (r) =>
      new URL(r.url()).origin === base ||
      r.url().startsWith("data:") ||
      r.url().startsWith("blob:")
        ? r.continue()
        : r.abort(),
    );
    const state = () => page.evaluate(() => KinosredaPlanet.getState());
    const waitState = (s) =>
      page.waitForFunction(
        (s) => KinosredaPlanet.getState().state === s,
        { timeout: 12000 },
        s,
      );
    await page.goto(base + "/planet.html");
    await page.waitForFunction(() => window.KinosredaPlanet?.getState().ready, {
      timeout: 60000,
    });
    await page.focus("#universe");
    await page.keyboard.press("Space");
    await delay(1100);
    await t.test(
      "mouse rotation, inertia and bounded smooth zoom",
      async () => {
        const before = await state();
        await page.mouse.move(950, 550);
        await page.mouse.down();
        await page.mouse.move(1130, 610, { steps: 10 });
        await page.mouse.up();
        const released = await state();
        assert.notDeepEqual(before.quaternion, released.quaternion);
        assert.ok(Math.hypot(...released.velocity) > 0);
        await delay(250);
        const coast = await state();
        assert.notDeepEqual(coast.quaternion, released.quaternion);
        assert.ok(
          Math.hypot(...coast.velocity) < Math.hypot(...released.velocity),
        );
        await page.mouse.wheel({ deltaY: -500 });
        await delay(600);
        assert.ok((await state()).distance < coast.distance);
        for (let i = 0; i < 30; i++) await page.keyboard.press("+");
        await delay(750);
        assert.ok((await state()).distance >= 5);
        for (let i = 0; i < 40; i++) await page.keyboard.press("-");
        await delay(750);
        assert.ok((await state()).distance <= 19);
        await page.keyboard.press("+");
        await delay(1000);
      },
    );
    await t.test(
      "normal scene shows the shared menu without a logo and centres the selected landmark",
      async () => {
        assert.equal(await page.$(".masthead"), null);
        assert.equal(await page.$("#planet-wordmark"), null);
        await page.click(".ks-drawer-trigger");
        assert.equal(
          await page.$eval("#ksDrawer", (e) => e.classList.contains("is-open")),
          true,
        );
        const groups = await page.$$eval(".ks-drawer-section", (elements) =>
          elements.map((e) => ({
            title: e.querySelector(".ks-drawer-section-title").textContent,
            routes: [...e.querySelectorAll("[data-route]")].map(
              (a) => a.dataset.route,
            ),
          })),
        );
        assert.ok(
          groups
            .find((g) => g.title === "Пространство")
            .routes.includes("planet"),
        );
        assert.ok(
          groups
            .find((g) => g.title === "Пространство")
            .routes.includes("svc_beer_room"),
        );
        assert.ok(
          !groups
            .find((g) => g.title === "Киносреда")
            .routes.includes("planet"),
        );
        assert.ok(
          !groups
            .find((g) => g.title === "Киносреда")
            .routes.includes("svc_beer_room"),
        );
        await page.keyboard.press("Escape");
        assert.equal(await page.$eval("#world", (e) => e.inert), false);
        assert.equal(
          await page.$(
            ".intro,.view-tools,.world-footer,.world-caption,.portal-bar",
          ),
          null,
        );
        await page.$eval('[data-section="calendar"]', (e) => e.focus());
        await page.focus("#universe");
        const p = (await state()).landmarks.find((l) => l.id === "calendar");
        assert.ok(Math.abs(p.x - 720) < 0.001);
        assert.ok(Math.abs(p.y - 500) < 0.001);
        await page.mouse.move(p.x, p.y);
        await delay(120);
        assert.deepEqual(
          await page.$eval("#tooltip", (e) => ({
            title: e.textContent.trim(),
            visible: !e.hidden && getComputedStyle(e).clipPath === "none",
            children: e.children.length,
          })),
          {
            title: "Календарь",
            visible: true,
            children: 1,
          },
        );
        assert.ok(
          await page.$eval(
            "#tooltip",
            (e) => e.getBoundingClientRect().width < 260,
          ),
        );
      },
    );
    await t.test(
      "models stand on dry fitted planes without raised circular terrain pads at both detail levels",
      async () => {
        const result = await page.evaluate(async () => {
          const THREE = await import("/three.module.js");
          const { sections } = await import("/planet/sections.js");
          const { createLandmarks } = await import("/planet/models.js");
          const {
            placeSections,
            createLandGeometry,
            surfaceRadius,
            SEA_RADIUS,
            MAX_GROUND_CHANGE,
          } = await import("/planet/terrain.js");
          const models = createLandmarks(sections);
          const sites = placeSections(
              models.landmarks.map((l) => ({
                ...l.section,
                footprint: l.footprint,
              })),
            ),
            errors = [];
          models.place(sites);
          const up = new THREE.Vector3(0, 1, 0),
            east = new THREE.Vector3(),
            north = new THREE.Vector3(),
            point = new THREE.Vector3();
          let maxChange = 0;
          for (const low of [false, true]) {
            const geometry = createLandGeometry(sites, low),
              material = new THREE.MeshBasicMaterial(),
              mesh = new THREE.Mesh(geometry, material),
              ray = new THREE.Raycaster();
            mesh.updateMatrixWorld(true);
            for (const site of sites) {
              east.crossVectors(up, site.groundNormal).normalize();
              north.crossVectors(site.groundNormal, east).normalize();
              for (const radius of [0, site.footprint * 0.5, site.footprint]) {
                for (let k = 0; k < 24; k++) {
                  const angle = (k * Math.PI) / 12;
                  point
                    .copy(site.position)
                    .addScaledVector(east, Math.cos(angle) * radius)
                    .addScaledVector(north, Math.sin(angle) * radius);
                  const direction = point.clone().normalize();
                  const expected =
                    site.planeOffset / direction.dot(site.groundNormal);
                  if (
                    Math.abs(surfaceRadius(direction, sites) - expected) > 1e-8
                  )
                    errors.push(`${site.id}: non-flat support plane`);
                  if (
                    surfaceRadius(direction) < SEA_RADIUS + 0.03 ||
                    point.length() < SEA_RADIUS + 0.03
                  )
                    errors.push(`${site.id}: wet footprint`);
                  ray.set(
                    point.clone().addScaledVector(site.groundNormal, 1),
                    site.groundNormal.clone().negate(),
                  );
                  ray.far = 2;
                  const hit = ray.intersectObject(mesh)[0];
                  if (
                    !hit ||
                    Math.abs(
                      hit.point.dot(site.groundNormal) - site.planeOffset,
                    ) > 1e-5
                  )
                    errors.push(`${site.id}: mesh intersects model (${low})`);
                }
              }
              // Dense sampling of the entire transition catches the old tall
              // circular mounds, including discontinuities between blend zones.
              for (
                let radius = 0;
                radius < site.landingRadius + 0.6;
                radius += 0.025
              ) {
                for (let k = 0; k < 36; k++) {
                  const a = (k * Math.PI) / 18;
                  const direction = site.position
                    .clone()
                    .addScaledVector(east, Math.cos(a) * radius)
                    .addScaledVector(north, Math.sin(a) * radius)
                    .normalize();
                  const original = surfaceRadius(direction),
                    adjusted = surfaceRadius(direction, sites);
                  maxChange = Math.max(
                    maxChange,
                    Math.abs(adjusted - original),
                  );
                  if (
                    original <= SEA_RADIUS + 0.01 &&
                    Math.abs(original - adjusted) > 1e-9
                  )
                    errors.push(`${site.id}: changed coastline`);
                }
              }
              if (site.error > MAX_GROUND_CHANGE || site.slope > 0.38)
                errors.push(`${site.id}: unsuitable terrain`);
              const landmark = models.landmarks[site.index];
              const actualUp = up
                .clone()
                .applyQuaternion(landmark.root.quaternion);
              if (actualUp.distanceTo(site.groundNormal) > 1e-8)
                errors.push(`${site.id}: model not aligned with ground`);
            }
            geometry.dispose();
            material.dispose();
          }
          for (let i = 0; i < sites.length; i++)
            for (let j = 0; j < i; j++) {
              const a = sites[i],
                b = sites[j];
              if (
                a.normal.angleTo(b.normal) <
                Math.atan(a.landingRadius / a.height) +
                  Math.atan(b.landingRadius / b.height)
              )
                errors.push(`${a.id}/${b.id}: overlapping footprints`);
            }
          models.group.traverse((o) => o.geometry?.dispose());
          return { errors: errors.slice(0, 20), maxChange };
        });
        assert.deepEqual(result.errors, []);
        assert.ok(
          result.maxChange < 0.105,
          `terrain deformation too large: ${result.maxChange}`,
        );
      },
    );
    await t.test(
      "hover, real iframe auth screen, cinematic close and saved orientation",
      async () => {
        await page.$eval('[data-section="calendar"]', (el) => el.focus());
        await page.focus("#universe");
        await delay(200);
        const before = await state();
        const point = before.landmarks.find((l) => l.id === "calendar");
        await page.mouse.move(point.x, point.y);
        await delay(120);
        assert.match(
          await page.$eval("#tooltip", (e) => (e.hidden ? "" : e.textContent)),
          /Календарь/,
        );
        await page.mouse.click(point.x, point.y);
        await waitState("open");
        await page.waitForFunction(() =>
          document.querySelector("#section-frame").classList.contains("ready"),
        );
        assert.match(
          await page.$eval("#section-frame", (e) => e.contentDocument.title),
          /Вход/,
        );
        const layout = await page.$eval("#portal", (el) => {
          const r = el.getBoundingClientRect(),
            f = el.querySelector("iframe").getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            fw: f.width,
            fh: f.height,
            border: getComputedStyle(el).borderWidth,
          };
        });
        assert.deepEqual(layout, {
          x: 0,
          y: 0,
          w: 1440,
          h: 1000,
          fw: 1440,
          fh: 1000,
          border: "0px",
        });
        const button = await page.$eval("#portal-close", (e) => {
          const button = e.getBoundingClientRect(),
            svg = e.querySelector("svg"),
            r = svg.getBoundingClientRect(),
            b = svg.querySelector("path").getBBox();
          return {
            x: button.x,
            y: button.y,
            w: button.width,
            h: button.height,
            sw: r.width,
            sh: r.height,
            centre: [
              r.x + r.width / 2 - button.x - button.width / 2,
              r.y + r.height / 2 - button.y - button.height / 2,
            ],
            pathCentre: [b.x + b.width / 2, b.y + b.height / 2],
          };
        });
        assert.deepEqual(button, {
          x: 10,
          y: 10,
          w: 30,
          h: 30,
          sw: 14,
          sh: 14,
          centre: [0, 0],
          pathCentre: [12, 12],
        });
        await page.click("#portal-close");
        await waitState("idle");
        const after = await state();
        assert.deepEqual(after.quaternion, before.quaternion);
        assert.ok(Math.abs(after.distance - before.distance) < 0.001);
        assert.equal(await page.$eval("#portal", (e) => e.open), false);
      },
    );
    await t.test(
      "cancel during camera travel and reject repeated clicks",
      async () => {
        await page.$eval('[data-section="gallery"]', (el) => {
          el.focus();
          el.click();
          el.click();
          el.click();
        });
        await delay(80);
        await page.keyboard.press("Escape");
        await waitState("idle");
        assert.equal(await page.$eval("#portal", (e) => e.open), false);
      },
    );
    // Reduced motion makes exhaustive routing checks fast, and also verifies that
    // all functionality survives the accessibility preference.
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" },
    ]);
    await t.test(
      "every physical landmark opens its configured real route",
      async () => {
        const catalogue = await readSections();
        for (const section of catalogue) {
          await page.$eval(`[data-section="${section.id}"]`, (el) =>
            el.focus(),
          );
          await page.focus("#universe");
          const s = await state();
          const p = s.landmarks.find((l) => l.id === section.id);
          await page.mouse.click(p.x, p.y);
          if (section.id === "bar") {
            await page.waitForFunction(() =>
              location.pathname.endsWith("/beer-room.html"),
            );
            assert.equal(page.url(), new URL(section.href, base).href);
            await page.goto(base + "/planet.html");
            await page.waitForFunction(
              () => KinosredaPlanet?.getState().ready,
              {
                timeout: 60000,
              },
            );
            continue;
          }
          try {
            await waitState("open");
          } catch (error) {
            throw new Error(
              `Landmark ${section.id} did not open at ${p.x},${p.y}; state: ${JSON.stringify(await state())}`,
              { cause: error },
            );
          }
          const actual = await page.$eval("#section-frame", (e) =>
            e.getAttribute("src"),
          );
          if (section.isolated) {
            assert.equal(actual, null);
            assert.equal(
              await page.$eval("#portal-special", (e) => e.hidden),
              false,
            );
            assert.match(
              await page.$eval("#portal-special a", (e) => e.href),
              new RegExp(section.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            );
          } else {
            assert.equal(
              actual,
              new URL(section.entryHref, base + "/planet.html").href,
              section.id,
            );
          }
          await page.click("#portal-close");
          await waitState("idle");
        }
      },
    );
    await t.test(
      "embedded planet links close the existing world instead of nesting",
      async () => {
        await page.$eval('[data-section="calendar"]', (el) => {
          el.focus();
          el.click();
        });
        await waitState("open");
        await page.waitForFunction(() =>
          document.querySelector("#section-frame").classList.contains("ready"),
        );
        const frame = page
          .frames()
          .find((f) => f.url().includes("/login.html"));
        await frame.evaluate(() => {
          const a = document.createElement("a");
          a.id = "planet-return-test";
          a.href = "planet.html";
          a.textContent = "Планета";
          document.body.prepend(a);
          a.click();
        });
        await waitState("idle");
        assert.equal(page.url(), base + "/planet.html");
      },
    );
    await t.test(
      "unavailable documents offer recovery and retry the original page",
      async () => {
        await page.$eval('[data-section="calendar"]', (el) => {
          el.focus();
          el.click();
        });
        await waitState("open");
        await page.waitForFunction(() =>
          document.querySelector("#section-frame").classList.contains("ready"),
        );
        await page.$eval(
          "#section-frame",
          (e) => (e.src = "/__planet_missing_page__.html"),
        );
        await page.waitForFunction(
          () => !document.querySelector("#portal-special").hidden,
        );
        assert.match(
          await page.$eval("#portal-special", (e) => e.textContent),
          /не ответило/,
        );
        await page.click("#portal-special button");
        await page.waitForFunction(() =>
          document.querySelector("#section-frame").classList.contains("ready"),
        );
        await page.click("#portal-close");
        await waitState("idle");
      },
    );
    await t.test(
      "phone, tablet and landscape resize without overflow",
      async () => {
        for (const [w, h] of [
          [390, 844],
          [768, 1024],
          [844, 390],
        ]) {
          await page.setViewport({ width: w, height: h });
          await delay(150);
          assert.equal(await page.evaluate(() => document.body.scrollWidth), w);
          assert.equal((await state()).ready, true);
        }
      },
    );
    await t.test(
      "touch rotation and pinch are separate from selection",
      async () => {
        await page.setViewport({
          width: 390,
          height: 844,
          isMobile: true,
          hasTouch: true,
        });
        await page.waitForFunction(
          () => window.KinosredaPlanet?.getState().ready,
        );
        await delay(300);
        const cdp = await page.createCDPSession();
        const before = await state();
        const touch = (type, points) =>
          cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints: points.map(([x, y, id]) => ({
              x,
              y,
              id,
              radiusX: 2,
              radiusY: 2,
            })),
          });
        await touch("touchStart", [[170, 450, 0]]);
        await touch("touchMove", [[220, 480, 0]]);
        await touch("touchEnd", []);
        await delay(100);
        assert.notDeepEqual((await state()).quaternion, before.quaternion);
        assert.equal((await state()).state, "idle");
        const distance = (await state()).targetDistance;
        await touch("touchStart", [
          [140, 450, 0],
          [240, 450, 1],
        ]);
        await touch("touchMove", [
          [100, 450, 0],
          [280, 450, 1],
        ]);
        await touch("touchEnd", []);
        await delay(100);
        assert.ok((await state()).targetDistance < distance);
        assert.equal((await state()).state, "idle");
        await cdp.detach();
      },
    );
    await t.test("context loss offers all real routes", async () => {
      await page.evaluate(() => {
        const c = document.querySelector("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        gl.getExtension("WEBGL_lose_context").loseContext();
      });
      await page.waitForFunction(
        () => !document.querySelector("#fallback").hidden,
      );
      assert.equal(await page.$eval("#fallback", (e) => e.hidden), false);
      assert.equal(
        await page.$$eval("#fallback-links a", (a) => a.length),
        (await readSections()).length,
      );
    });
    assert.deepEqual(errors, [], "no errors in planet modules");
    assert.deepEqual(shaderErrors, [], "no WebGL shader errors");
  },
);

test(
  "WebGL unavailable: graceful fallback still lists every real section",
  { skip: !chrome, timeout: 30000 },
  async (t) => {
    const { server, base } = await serve();
    const browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--no-sandbox", "--disable-webgl"],
      defaultViewport: { width: 1280, height: 800 },
    });
    t.after(async () => {
      await browser.close();
      await new Promise((r) => server.close(r));
    });
    const page = await browser.newPage();
    await page.goto(base + "/planet.html");
    await page.waitForFunction(
      () => !document.querySelector("#fallback").hidden,
    );
    assert.equal(
      await page.$$eval("#fallback-links a", (links) => links.length),
      (await readSections()).length,
    );
    assert.match(
      await page.$eval("#fallback-message", (e) => e.textContent),
      /Не удалось запустить/,
    );
  },
);
