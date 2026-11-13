// Legacy diagnostic helper: the front photograph's inverse projection remains
// available to the standalone contour tests and viewer tooling.
export function frontUV(profile, row, angle) {
  const halfWidth=(row.sourceRight-row.sourceLeft)*.5;
  const sourceX=(row.sourceLeft+row.sourceRight)*.5+Math.sin(angle)*halfWidth;
  return [(sourceX+.5)/profile.width,1-(row.sourceY+.5)/profile.height];
}

// One coordinate system for the silhouette, surface and print: pixels start at
// top-left; models stand on Y=0 and their photographed front faces +Z.
export function analysePackagePixels(rgba, width, height) {
  const count = width * height;
  const labels = new Int32Array(count);
  const queue = new Int32Array(count);
  let label = 0, largest = 0, largestSize = 0;
  // Ignore soft cut-out shadows and disconnected specks outside the package.
  for (let i = 0; i < count; i++) {
    if (labels[i] || rgba[i * 4 + 3] < 72) continue;
    let head = 0, tail = 1;
    queue[0] = i; labels[i] = ++label;
    while (head < tail) {
      const p = queue[head++], x = p % width;
      for (const n of [x ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
        if (n < 0 || n >= count || labels[n] || rgba[n * 4 + 3] < 72) continue;
        labels[n] = label; queue[tail++] = n;
      }
    }
    if (tail > largestSize) { largestSize = tail; largest = label; }
  }
  if (largestSize < 32) throw new Error('Изображение не содержит контура упаковки');
  let left = width, right = -1, top = height, bottom = -1;
  const edges = Array.from({ length: height }, () => ({ left: width, right: -1, spans: [] }));
  for (let i = 0; i < count; i++) {
    if (labels[i] !== largest) continue;
    const x = i % width, y = Math.floor(i / width);
    edges[y].left = Math.min(edges[y].left, x); edges[y].right = Math.max(edges[y].right, x);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  // A swing-top wire is not the bottle's diameter. Split each scanline into
  // opaque intervals: the largest is the vessel, thinner outside intervals
  // become separate 3D metal parts instead of inflating the whole neck.
  let hasAccessories = false;
  const rawUpper = edges[Math.round(top + (bottom - top) * .12)];
  const rawBody = edges[Math.round(top + (bottom - top) * .55)];
  const bottleSilhouette = (rawUpper.right - rawUpper.left + 1) / (rawBody.right - rawBody.left + 1) < .76;
  for (let y = top; y <= bottom; y++) {
    // Holes in a cut-out label are not metal accessories. Only a bottle's
    // narrow neck can have thin separated wires, never a can's printed body.
    if (!bottleSilhouette || y > top + (bottom - top) * .32) continue;
    const spans = []; let start = -1;
    for (let x = left; x <= right + 1; x++) {
      const solid = x <= right && labels[y * width + x] === largest;
      if (solid && start < 0) start = x;
      if (!solid && start >= 0) { spans.push({ left: start, right: x - 1 }); start = -1; }
    }
    spans.sort((a, b) => (b.right - b.left) - (a.right - a.left));
    const coreWidth = spans[0]?.right - spans[0]?.left;
    if (spans.length > 1 && coreWidth > 6 && coreWidth < (right - left) * .72 && spans.slice(1).every(s => s.right - s.left < Math.max(7, coreWidth * .22))) {
      edges[y].left = spans[0].left; edges[y].right = spans[0].right;
      edges[y].spans = spans.slice(1).filter(s => s.right - s.left >= 1);
      if (edges[y].spans.length) hasAccessories = true;
    }
  }
  if (hasAccessories) {
    const wireRows = edges.flatMap((edge, y) => edge.spans.length ? [y] : []);
    const firstWire = Math.min(...wireRows), lastWire = Math.max(...wireRows);
    const original = edges.map(edge => ({ ...edge }));
    // Some crossbars join only one wire to the neck, leaving an air gap on
    // the other side. Those rows still have spans, but are not neck anchors.
    const anchors = wireRows.map(y => ({ y, ...original[y] })).filter(row => {
      const widths = wireRows.filter(y => Math.abs(y - row.y) <= 8)
        .map(y => original[y].right - original[y].left).sort((a, b) => a - b);
      return row.right - row.left <= widths[Math.floor(widths.length / 2)] * 1.08;
    });
    for (let y = Math.max(top, firstWire - 3); y <= Math.min(bottom, lastWire + 3); y++) {
      if (anchors.some(a => a.y === y)) continue;
      const before = anchors.filter(a => a.y < y).at(-1), after = anchors.find(a => a.y > y);
      const near = before && after ? [before, after] : [before || after];
      if (!near[0] || Math.min(...near.map(a => Math.abs(a.y - y))) > 12) continue;
      let expectedLeft, expectedRight;
      if (before && after) {
        const t = (y - before.y) / (after.y - before.y);
        expectedLeft = before.left * (1 - t) + after.left * t;
        expectedRight = before.right * (1 - t) + after.right * t;
      } else { expectedLeft = near[0].left; expectedRight = near[0].right; }
      const edge = edges[y];
      // At a clip's horizontal crossbar the air gaps close for a few pixels.
      // Interpolate the neck behind the crossbar from the adjacent air gaps.
      if (edge.right - edge.left > (expectedRight - expectedLeft) * 1.08) {
        const l = Math.ceil(expectedLeft), r = Math.floor(expectedRight);
        edge.spans.push({ left: edge.left, right: l - 1 }, { left: r + 1, right: edge.right });
        edge.left = l; edge.right = r;
      }
    }
  }

  const pixelHeight = bottom - top + 1, pixelWidth = right - left + 1;
  const edgeAt = y => {
    const a = Math.max(top, Math.min(bottom, Math.floor(y)));
    const b = Math.min(bottom, a + 1), f = y - a;
    const ea = edges[a].right >= 0 ? edges[a] : edges[top];
    const eb = edges[b].right >= 0 ? edges[b] : ea;
    return { left: ea.left * (1 - f) + eb.left * f, right: ea.right * (1 - f) + eb.right * f };
  };
  const upper = edgeAt(top + pixelHeight * .12), middle = edgeAt(top + pixelHeight * .55);
  const neckRatio = (upper.right - upper.left + 1) / (middle.right - middle.left + 1);
  const isBottle = neckRatio < .76;
  // Only the overall size is normalized for shelf spacing; aspect and every
  // radius come from the actual pixels, never from the packaging category.
  const modelHeight = Math.min(.83, .49 * pixelHeight / pixelWidth);
  const unitsPerPixel = modelHeight / pixelHeight;
  const segments = Math.min(192, Math.max(96, Math.round(pixelHeight / 3)));
  const rows = [];
  for (let i = 0; i <= segments; i++) {
    const sourceY = top + (bottom - top) * i / segments;
    const edge = edgeAt(sourceY);
    rows.push({
      y: modelHeight * (bottom - sourceY) / Math.max(1, bottom - top),
      radius: (edge.right - edge.left + 1) * .5 * unitsPerPixel,
      centerX: ((edge.left + edge.right) / 2 - (left + right) / 2) * unitsPerPixel,
      sourceY, sourceLeft: edge.left, sourceRight: edge.right
    });
  }
  return {
    width, height, bounds: { left, right, top, bottom }, rows, unitsPerPixel,
    accessories: hasAccessories ? edges.flatMap((edge, y) => edge.spans.map(span => ({ ...span, sourceY: y }))) : [],
    modelHeight, modelWidth: pixelWidth * unitsPerPixel, neckRatio,
    kind: isBottle ? (neckRatio < .46 ? 'long-neck-bottle' : 'bottle') : (pixelHeight / pixelWidth > 2.1 ? 'tall-can' : 'can'),
    hasTransparency: largestSize < count * .98,
    foregroundPixels: largestSize,
    // Distinct measured profiles remain distinct even within the same kind.
    signature: rows.map(r => Math.round(r.radius / unitsPerPixel * 10)).join(',')
  };
}

// Retain every meaningful contour change while removing collinear scanlines.
// The tolerance is in source pixels, so optimization cannot change the shape
// by more than a fraction of a pixel, regardless of the model's world scale.
export function surfaceRows(profile, tolerance = .25) {
  const rows = profile.rows, keep = new Set([0, rows.length - 1]);
  const split = (a, b) => {
    let worst = tolerance, at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = (rows[i].sourceY - rows[a].sourceY) / (rows[b].sourceY - rows[a].sourceY);
      const error = Math.max(...['sourceLeft', 'sourceRight'].map(k => Math.abs(rows[i][k] - rows[a][k] * (1 - t) - rows[b][k] * t)));
      if (error > worst) { worst = error; at = i; }
    }
    if (at >= 0) { keep.add(at); split(a, at); split(at, b); }
  };
  split(0, rows.length - 1);
  return [...keep].sort((a, b) => a - b).map(i => rows[i]);
}
