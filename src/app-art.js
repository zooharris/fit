/* ==========================================================================
   Illustrations, drawn in the logo's language (pictogram rider, grey bike,
   orange joints) on the same geometry as the logo, so the brand and every
   picture in the app are one design. Pure SVG, theme-aware via CSS variables.
   ========================================================================== */
const ART = (() => {
  const b = BRAND.bike, j = BRAND.j;
  const pts = {
    rearAxle: b.rear, frontAxle: b.front, bb: b.bb, spindle: { x: b.bb.x + 56, y: b.bb.y },
    tyreTop: { x: b.rear.x, y: b.rear.y - b.r - 6 }, tyreBack: { x: b.rear.x - b.r - 6, y: b.rear.y },
    saddleNose: b.saddleNose, barTop: b.barTop,
  };
  return { b, j, pts, groundY: b.rear.y + b.r + 8 };
})();

function angleArc(c, p1, p2, r) {
  const a1 = Math.atan2(p1.y - c.y, p1.x - c.x), a2 = Math.atan2(p2.y - c.y, p2.x - c.x);
  let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const q1 = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }, q2 = { x: c.x + r * Math.cos(a1 + d), y: c.y + r * Math.sin(a1 + d) };
  return `M${q1.x.toFixed(1)} ${q1.y.toFixed(1)} A${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${q2.x.toFixed(1)} ${q2.y.toFixed(1)}`;
}

/**
 * riderSVG(opts) — side view in the brand style.
 * opts: { rider: true, angles: false (arcs + degree labels), highlight: tap key, extra: svg string, view: [x,y,w,h], label }
 */
function riderSVG(opts) {
  const o = Object.assign({ rider: true, angles: false }, opts || {});
  const { j, pts } = ART;
  const view = o.view || [250, 0, 680, 680];
  let body = `<line x1="${view[0] + 10}" y1="${ART.groundY}" x2="${view[0] + view[2] - 10}" y2="${ART.groundY}" stroke="var(--line-2)" stroke-width="6" stroke-linecap="round"/>`;
  body += bikeLines('var(--logo-bike)');
  if (o.rider) body += riderSilhouette('var(--ink)') + jointOverlay('var(--bg-2)', false, 'var(--ink)');
  if (o.angles) {
    const lab = (x, y, t) => `<g><rect x="${x - 8}" y="${y - 34}" width="${t.length * 21 + 16}" height="46" rx="10" fill="var(--bg-2)" stroke="var(--line-2)" stroke-width="2"/><text x="${x}" y="${y}" style="fill:var(--ink);font:700 34px var(--font)">${t}</text></g>`;
    const k = Math.round(TF.angleAt(j.hip, j.knee, j.ankle)), h = Math.round(TF.angleAt(j.shoulder, j.hip, j.knee)), e = Math.round(TF.angleAt(j.shoulder, j.elbow, j.wrist));
    body += `<g fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"><path d="${angleArc(j.knee, j.hip, j.ankle, 52)}"/><path d="${angleArc(j.hip, j.shoulder, j.knee, 62)}"/><path d="${angleArc(j.elbow, j.shoulder, j.wrist, 44)}"/></g>`
      + lab(j.knee.x + 40, j.knee.y + 14, `${k}°`) + lab(j.hip.x - 130, j.hip.y + 14, `${h}°`) + lab(j.elbow.x - 20, j.elbow.y + 76, `${e}°`);
  }
  if (o.highlight && pts[o.highlight]) {
    const p = pts[o.highlight];
    body += `<circle cx="${p.x}" cy="${p.y}" r="34" fill="none" stroke="var(--accent)" stroke-width="8"/><circle cx="${p.x}" cy="${p.y}" r="11" fill="var(--accent)"/>`;
  }
  if (o.extra) body += o.extra;
  return `<svg viewBox="${view.join(' ')}" xmlns="http://www.w3.org/2000/svg" class="art" role="img" aria-label="${esc(o.label || 'Rider on a bike, side view')}">${body}</svg>`;
}

/** Diagrams for the setup steps. */
const SETUP_ART = {
  rig() {
    const { b } = ART;
    return riderSVG({ label: 'Bike on a trainer, level', extra:
      `<rect x="${b.rear.x - 78}" y="${ART.groundY - 46}" width="156" height="46" rx="10" fill="var(--line-2)"/>
       <rect x="${b.front.x - 54}" y="${ART.groundY - 30}" width="108" height="30" rx="8" fill="var(--line-2)"/>
       <line x1="${b.rear.x}" y1="${b.rear.y}" x2="${b.front.x}" y2="${b.front.y}" stroke="var(--teal)" stroke-width="6" stroke-dasharray="18 12"/>
       <text x="${(b.rear.x + b.front.x) / 2}" y="${b.rear.y - 18}" text-anchor="middle" style="fill:var(--teal);font:700 34px var(--font)">level</text>` });
  },
  camera() {
    return `<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" class="art" role="img" aria-label="Camera 2.5 to 3 metres from the bike, square to it">
      <text x="300" y="34" text-anchor="middle" style="fill:var(--ink-3);font:600 17px var(--font);letter-spacing:.08em">SEEN FROM ABOVE</text>
      <rect x="150" y="72" width="300" height="20" rx="10" fill="var(--logo-bike)"/>
      <circle cx="292" cy="82" r="20" fill="none" stroke="var(--logo-bike)" stroke-width="6"/>
      <text x="300" y="62" text-anchor="middle" style="fill:var(--ink-2);font:600 16px var(--font)">bike · either side to the camera</text>
      <line x1="292" y1="112" x2="292" y2="232" stroke="var(--accent)" stroke-width="4" stroke-dasharray="10 8"/>
      <text x="308" y="180" style="fill:var(--ink);font:700 22px var(--font)">2.5–3 m</text>
      <rect x="262" y="234" width="60" height="32" rx="8" fill="var(--accent)"/><circle cx="292" cy="250" r="8" fill="var(--bg-2)"/>
      <text x="300" y="292" text-anchor="middle" style="fill:var(--ink-2);font:600 16px var(--font)">camera, pointing straight at the bike</text>
    </svg>`;
  },
  height() {
    const y = ART.pts.tyreTop.y, v = [250, 0, 680, 680];
    return riderSVG({ label: 'Camera lens level with the top of the wheels', extra:
      `<line x1="${v[0] + 10}" y1="${y}" x2="${v[0] + v[2] - 10}" y2="${y}" stroke="var(--accent)" stroke-width="5" stroke-dasharray="18 12"/>
       <text x="${v[0] + v[2] - 16}" y="${y - 16}" text-anchor="end" style="fill:var(--accent);font:700 30px var(--font)">lens height · phone level</text>` });
  },
  clothes() { return riderSVG({ angles: true, label: 'Fitted clothing so every joint is clearly visible' }); },
};

/**
 * silhouetteSVG(W, H, flip) — the placement guide, in the video's own pixel coordinates (so it sits exactly on
 * the recorded frame): the brand bike with each wheel 20% of the frame width, the ground at 84% of the height,
 * centred, and the brand rider on it (drawn a little smaller about the bottom bracket so the head fits 16:9).
 * Dashed 35% white for the bike, brighter wheels (what the user lines up), a faint rider. flip mirrors it for a
 * bike facing left.
 */
function silhouetteGeometry(W, H, flip) {
  const b = BRAND.bike, S = TF.CONFIG.camera.silhouette;
  const k = (S.wheelFrac * W) / (2 * b.r);
  const ty = S.groundFrac * H - (b.rear.y + b.r) * k;
  const cx = (b.rear.x + b.front.x) / 2;
  const tx = S.centreXFrac * W - cx * k;
  // Map a brand point to video pixels.
  const map = (p) => { let x = tx + p.x * k; if (flip) x = W - x; return { x, y: ty + p.y * k }; };
  return { k, tx, ty, map, transform: flip ? `translate(${W} 0) scale(-1 1) translate(${tx} ${ty}) scale(${k})` : `translate(${tx} ${ty}) scale(${k})` };
}
function silhouetteSVG(W, H, flip, ghosts) {
  const g = silhouetteGeometry(W, H, flip), b = BRAND.bike, j = BRAND.j, rs = TF.CONFIG.camera.silhouetteRiderScale;
  const L = (a, c) => `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/>`;
  const sw = 2.5 / g.k; // ~2.5 px on the video whatever the scale
  const riderT = `translate(${b.bb.x} ${b.bb.y}) scale(${rs}) translate(${-b.bb.x} ${-b.bb.y})`;
  const pl = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');
  let ghostHTML = '';
  if (ghosts) {
    for (const [key, p] of Object.entries(ghosts)) {
      ghostHTML += `<circle cx="${p.x}" cy="${p.y}" r="${Math.max(10, W / 90)}" fill="none" stroke="#20D6B5" stroke-width="${Math.max(3, W / 400)}"/><circle cx="${p.x}" cy="${p.y}" r="${Math.max(3, W / 400)}" fill="#20D6B5"/>`;
      void key;
    }
  }
  return `<svg class="sil" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g transform="${g.transform}">
      <g fill="none" stroke="rgba(255,255,255,.35)" stroke-width="${sw * 1.6}" stroke-dasharray="${14 / g.k * 0.6} ${10 / g.k * 0.6}" stroke-linecap="round">
        ${L(b.rear, b.bb)}${L(b.rear, b.seat)}${L(b.bb, b.seat)}${L(b.seat, b.headTop)}${L(b.bb, b.headBot)}${L(b.headTop, b.headBot)}${L(b.headBot, b.front)}${L(b.seat, b.saddle)}${L(b.headTop, b.barTop)}
        <line x1="${b.saddle.x - 42}" y1="${b.saddle.y}" x2="${b.saddleNose.x}" y2="${b.saddleNose.y}"/>
      </g>
      <g fill="none" stroke="rgba(255,255,255,.75)" stroke-width="${sw * 2}" stroke-dasharray="${22 / g.k * 0.6} ${9 / g.k * 0.6}">
        <circle cx="${b.rear.x}" cy="${b.rear.y}" r="${b.r}"/><circle cx="${b.front.x}" cy="${b.front.y}" r="${b.r}"/>
      </g>
      <g fill="rgba(255,255,255,.6)"><circle cx="${b.rear.x}" cy="${b.rear.y}" r="${6 / g.k * 0.6}"/><circle cx="${b.front.x}" cy="${b.front.y}" r="${6 / g.k * 0.6}"/><circle cx="${b.bb.x}" cy="${b.bb.y}" r="${7 / g.k * 0.6}"/></g>
      <line x1="${b.rear.x - b.r - 40}" y1="${b.rear.y + b.r}" x2="${b.front.x + b.r + 40}" y2="${b.front.y + b.r}" stroke="rgba(255,255,255,.35)" stroke-width="${sw}"/>
      <g transform="${riderT}" fill="none" stroke="rgba(255,255,255,.16)" stroke-linecap="round" stroke-linejoin="round">
        <line x1="${j.hip.x}" y1="${j.hip.y}" x2="${j.shoulder.x}" y2="${j.shoulder.y}" stroke-width="70"/>
        <polyline points="${pl([j.hip, j.knee, j.ankle])}" stroke-width="54"/>
        <polyline points="${pl([j.heel, j.toe])}" stroke-width="28"/>
        <polyline points="${pl([j.shoulder, j.elbow, j.wrist])}" stroke-width="34"/>
        <circle cx="${j.head.x}" cy="${j.head.y}" r="38" fill="rgba(255,255,255,.16)" stroke="none"/>
      </g>
    </g>
    ${ghostHTML}
  </svg>`;
}
