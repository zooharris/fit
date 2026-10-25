/* ==========================================================================
   Illustrations, drawn in the logo's language (pictogram rider, grey bike,
   orange joints) on the same geometry as the logo, so the brand and every
   picture in the app are one design. Pure SVG, theme-aware via CSS variables.
   ========================================================================== */
const ART = (() => {
  const b = BRAND.bike, j = BRAND.j;
  const pts = {
    rearAxle: b.rear, frontAxle: b.front, bb: b.bb, spindle: b.spindle,
    tyreTop: { x: b.rear.x, y: b.rear.y - b.r - 6 }, tyreBack: { x: b.rear.x - b.r - 6, y: b.rear.y },
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
      <text x="300" y="62" text-anchor="middle" style="fill:var(--ink-2);font:600 16px var(--font)">bike · chainring on the far side</text>
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

/** The guide drawn over the live camera: where the bike should sit in the frame. */
function framingGuideSVG() {
  return `<svg class="guide" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="none" stroke="rgba(255,255,255,.32)" stroke-width="4" stroke-dasharray="14 12">
      <circle cx="578" cy="681" r="151"/><circle cx="1023" cy="681" r="151"/>
      <line x1="300" y1="832" x2="1300" y2="832"/>
      <line x1="230" y1="712" x2="1370" y2="712" stroke="rgba(255,106,26,.5)"/>
    </g>
    <circle cx="760" cy="712" r="12" fill="none" stroke="rgba(255,138,76,.9)" stroke-width="4"/>
    <text x="1370" y="700" text-anchor="end" fill="rgba(255,138,76,.95)" style="font:600 24px system-ui">bottom bracket about here</text>
    <text x="800" y="60" text-anchor="middle" fill="rgba(255,255,255,.55)" style="font:600 24px system-ui">whole rider and both wheels in the frame</text>
  </svg>`;
}
