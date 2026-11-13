import test from 'node:test';
import assert from 'node:assert/strict';
import { analysePackagePixels, frontUV, surfaceRows } from '../beer-package-analysis.mjs';

function image(width, height, silhouette) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const range = silhouette(y);
    if (!range) continue;
    for (let x = range[0]; x <= range[1]; x++) data.set([x, y, 120, 255], (y * width + x) * 4);
  }
  return data;
}

test('follows the measured shoulders, neck and off-centre silhouette rather than a bottle template', () => {
  const pixels = image(100, 180, y => y < 10 || y > 170 ? null : y < 55 ? [47, 60] : y < 80 ? [35, 70] : [20, 79]);
  // A disconnected cutout speck must not widen the bottle.
  pixels.set([255, 255, 255, 255], 4 * (4 * 100 + 2));
  const p = analysePackagePixels(pixels, 100, 180);
  assert.deepEqual(p.bounds, { left: 20, right: 79, top: 10, bottom: 170 });
  assert.match(p.kind, /bottle/);
  assert.ok(p.rows[0].radius < p.rows.at(-1).radius * .3);
  assert.ok(p.rows[0].centerX > p.rows.at(-1).centerX);
  assert.ok(Math.abs(p.rows[0].y - p.modelHeight) < 1e-12);
  assert.equal(p.rows.at(-1).y, 0);
});

test('different profiles within the same kind keep their distinct shape and aspect', () => {
  const a = analysePackagePixels(image(100, 180, y => y < 15 || y > 160 ? null : [25, 74]), 100, 180);
  const b = analysePackagePixels(image(100, 180, y => y < 15 || y > 160 ? null : [30, 69]), 100, 180);
  assert.notEqual(a.signature, b.signature);
  assert.notEqual(a.modelWidth / a.modelHeight, b.modelWidth / b.modelHeight);
  assert.equal(a.modelWidth / a.modelHeight, 50 / 146);
});

test('front UVs reproject into the original photograph without mirror, flip or horizontal stretching', () => {
  const p = analysePackagePixels(image(100, 180, y => y < 10 || y > 170 ? null : [20, 79]), 100, 180);
  for (const row of p.rows) {
    const left = frontUV(p, row, -Math.PI / 2), right = frontUV(p, row, Math.PI / 2);
    assert.ok(left[0] < right[0]);
    for (const angle of [-1.2, -.5, 0, .5, 1.2]) {
      const uv = frontUV(p, row, angle);
      const photoX = uv[0] * p.width - .5;
      const expectedX = (row.sourceLeft + row.sourceRight) / 2 + Math.sin(angle) * (row.sourceRight - row.sourceLeft) / 2;
      assert.ok(Math.abs(photoX - expectedX) < 1e-6);
      assert.ok(Math.abs((1 - uv[1]) * p.height - .5 - row.sourceY) < 1e-6);
    }
  }
  assert.ok(frontUV(p, p.rows[0], 0)[1] > frontUV(p, p.rows.at(-1), 0)[1]);
});

test('swing-top wires become separate measured parts, not an inflated cylindrical neck', () => {
  const data = image(100, 180, y => y < 10 || y > 170 ? null : y < 80 ? [43, 56] : [20, 79]);
  // Wire is connected to the cap but separated from the neck by transparent air.
  for (let y = 14; y <= 65; y++) for (const x of [33, 34, 65, 66]) data.set([120, 120, 120, 255], (y * 100 + x) * 4);
  for (let x = 33; x <= 66; x++) data.set([120, 120, 120, 255], (14 * 100 + x) * 4);
  // A crossbar connects just one wire: the remaining gap must not cause the
  // whole clip width to be revolved into a ring around the neck.
  for (let y = 40; y <= 43; y++) for (let x = 33; x <= 56; x++) data.set([120, 120, 120, 255], (y * 100 + x) * 4);
  const p = analysePackagePixels(data, 100, 180);
  assert.ok(p.accessories.length > 50);
  for (const neck of p.rows.filter(r => r.sourceY > 30 && r.sourceY < 50)) {
    assert.ok(neck.sourceRight - neck.sourceLeft < 15);
  }
});

test('geometry simplification preserves the source contour within a quarter pixel', () => {
  const p = analysePackagePixels(image(100, 180, y => y < 10 || y > 170 ? null : [Math.round(25 + 6 * Math.sin(y / 35)), 79]), 100, 180);
  const reduced = surfaceRows(p);
  assert.ok(reduced.length < p.rows.length);
  for (const row of p.rows) {
    let i = reduced.findIndex(r => r.sourceY >= row.sourceY);
    if (i <= 0) continue;
    const a = reduced[i - 1], b = reduced[i], t = (row.sourceY - a.sourceY) / (b.sourceY - a.sourceY);
    for (const key of ['sourceLeft', 'sourceRight']) assert.ok(Math.abs(row[key] - a[key] * (1 - t) - b[key] * t) <= .250001);
  }
});

test('transparent defects inside can artwork never become wires or change the vessel outline', () => {
  const pixels = image(100, 180, y => y < 10 || y > 170 ? null : [20, 79]);
  for (let y = 25; y < 135; y++) for (let x = 43; x < 48; x++) pixels[(y * 100 + x) * 4 + 3] = 0;
  const p = analysePackagePixels(pixels, 100, 180);
  assert.equal(p.accessories.length, 0);
  for (const row of p.rows) assert.equal(row.sourceRight - row.sourceLeft, 59);
});
