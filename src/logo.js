/* ==========================================================================
   Tango Fitter brand (chosen design: rider silhouette with orange joint markers,
   a measured hip angle and a light grey bike; "Tango" in ink, "Fitter" in orange).
   Drawn on the app's own rider model so the joints sit where real joints do.

   Three forms, as with any detailed mark:
   - logoFullSVG:  rider, bike, measured angle. Welcome screen and report.
   - logoMarkSVG:  rider and joints only. Header and small places.
   - logoIconSVG:  the mark on a navy tile. Home-screen icon and favicon.
   ========================================================================== */
const BRAND = {
  orange: '#FF6A1A',
  navy: '#0A1220',
  // Joint positions (px) from the model rider with the near pedal at the 2 o'clock power position.
  j: {
    head: { x: 652, y: 70 }, shoulder: { x: 634.2, y: 130.1 }, elbow: { x: 713.1, y: 203.8 }, wrist: { x: 805.9, y: 232.8 },
    hip: { x: 475.3, y: 254.2 }, knee: { x: 629.2, y: 324.6 }, ankle: { x: 574.7, y: 477.1 }, heel: { x: 556, y: 494 }, toe: { x: 641, y: 511 },
  },
  bike: { rear: { x: 412.4, y: 514.8 }, front: { x: 772.4, y: 514.8 }, r: 122, bb: { x: 560, y: 540 }, spindle: { x: 612, y: 505 },
    seat: { x: 468, y: 302 }, saddle: { x: 478, y: 286 }, headTop: { x: 746, y: 262 }, headBot: { x: 762, y: 322 } },
};

/** Pictogram rider: even, rounded strokes, head set apart from the body. */
function riderSilhouette(ink) {
  const j = BRAND.j;
  const pl = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');
  return `<g fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${j.hip.x}" y1="${j.hip.y}" x2="${j.shoulder.x}" y2="${j.shoulder.y}" stroke-width="70"/>
    <polyline points="${pl([j.hip, j.knee, j.ankle])}" stroke-width="54"/>
    <polyline points="${pl([j.heel, j.toe])}" stroke-width="28"/>
    <polyline points="${pl([j.shoulder, j.elbow, j.wrist])}" stroke-width="34"/>
  </g><circle cx="${j.head.x}" cy="${j.head.y}" r="38" fill="${ink}"/>`;
}

/** Orange measurement overlay: bones and joint rings (and, for the full logo, the measured hip angle). */
function jointOverlay(ringFill, withAngle, ink) {
  const j = BRAND.j, o = BRAND.orange;
  const pts = [j.shoulder, j.hip, j.knee, j.ankle];
  const bones = `<polyline points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${o}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`
    + `<line x1="${j.shoulder.x}" y1="${j.shoulder.y}" x2="${j.elbow.x}" y2="${j.elbow.y}" stroke="${o}" stroke-width="6" stroke-linecap="round" opacity=".9"/>`;
  const rings = [j.shoulder, j.hip, j.knee, j.ankle].map((p) => `<circle cx="${p.x}" cy="${p.y}" r="17" fill="${ringFill}" stroke="${o}" stroke-width="8"/>`).join('')
    + `<circle cx="${j.elbow.x}" cy="${j.elbow.y}" r="12" fill="${ringFill}" stroke="${o}" stroke-width="6"/>`;
  let angle = '';
  if (withAngle) {
    const hp = j.hip, r = 92;
    const a1 = -Math.PI / 2; // straight up
    const a2 = Math.atan2(j.shoulder.y - hp.y, j.shoulder.x - hp.x);
    const p1 = { x: hp.x + r * Math.cos(a1), y: hp.y + r * Math.sin(a1) }, p2 = { x: hp.x + r * Math.cos(a2), y: hp.y + r * Math.sin(a2) };
    angle = `<g stroke="${ink}" stroke-width="5" stroke-dasharray="14 11" opacity=".55" fill="none">
        <line x1="${hp.x}" y1="${hp.y - 140}" x2="${hp.x}" y2="${hp.y + 70}"/><line x1="${hp.x - 150}" y1="${hp.y}" x2="${hp.x - 24}" y2="${hp.y}"/></g>
      <path d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A${r} ${r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" fill="none" stroke="${o}" stroke-width="8" stroke-linecap="round"/>
      <circle cx="${hp.x - 150}" cy="${hp.y}" r="11" fill="${ringFill}" stroke="${o}" stroke-width="6"/>`;
  }
  return angle + bones + rings;
}

function bikeLines(stroke) {
  const b = BRAND.bike, j = BRAND.j;
  const L = (a, c) => `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/>`;
  return `<g fill="none" stroke="${stroke}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="${b.rear.x}" cy="${b.rear.y}" r="${b.r}"/><circle cx="${b.front.x}" cy="${b.front.y}" r="${b.r}"/>
    ${L(b.rear, b.bb)}${L(b.rear, b.seat)}${L(b.bb, b.seat)}${L(b.seat, b.headTop)}${L(b.bb, b.headBot)}${L(b.headTop, b.headBot)}${L(b.headBot, b.front)}
    ${L(b.seat, b.saddle)}<line x1="${b.saddle.x - 42}" y1="${b.saddle.y}" x2="${b.saddle.x + 36}" y2="${b.saddle.y + 2}" stroke-width="16"/>
    ${L(b.headTop, { x: j.wrist.x + 10, y: j.wrist.y + 4 })}
    <circle cx="${b.bb.x}" cy="${b.bb.y}" r="30" stroke-width="9"/>
    <line x1="${b.bb.x}" y1="${b.bb.y}" x2="${b.spindle.x}" y2="${b.spindle.y}" stroke-width="14"/>
  </g>`;
}

/** The full logo: rider, bike and measured hip angle. */
function logoFullSVG(width, opts) {
  const o = Object.assign({ ink: 'currentColor', bike: 'var(--logo-bike, #A9B6C9)', bg: 'var(--bg-2, #fff)', title: 'Tango Fitter' }, opts || {});
  return `<svg viewBox="252 10 652 652" width="${width}" height="${width}" role="img" aria-label="${o.title}" class="logo-full">
    ${bikeLines(o.bike)}${riderSilhouette(o.ink)}${jointOverlay(o.bg, true, o.ink)}</svg>`;
}

/** The mark: rider, joints and bike (no measuring guides), cropped square. */
function markInner(ink, ringFill, bike) { return bikeLines(bike) + riderSilhouette(ink) + jointOverlay(ringFill, false, ink); }
function logoMarkSVG(size, opts) {
  const o = Object.assign({ ink: 'currentColor', bike: 'var(--logo-bike, #8D9AB0)', bg: 'var(--bg, #0A1220)', title: 'Tango Fitter' }, opts || {});
  return `<svg viewBox="282 24 632 632" width="${size}" height="${size}" role="img" aria-label="${o.title}" class="mark">${markInner(o.ink, o.bg, o.bike)}</svg>`;
}

/** App icon: the mark on a navy rounded tile. */
function logoIconSVG(size, radius) {
  const r = radius == null ? 132 : radius;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="${size}" height="${size}">
    <rect width="600" height="600" rx="${r}" fill="${BRAND.navy}"/>
    <g transform="translate(300 306) scale(.8) translate(-598 -340)">${markInner('#E9EEF6', BRAND.navy, '#4A5C7C')}</g></svg>`;
}

/** Mark + wordmark: "Tango" in ink, "Fitter" in orange. */
function logoLockupHTML(height) {
  const h = height || 28;
  return `<span class="lockup" style="--h:${h}px">${logoMarkSVG(h)}<span class="wordmark"><b>Tango</b><span>Fitter</span></span></span>`;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { BRAND, logoFullSVG, logoMarkSVG, logoIconSVG, logoLockupHTML };
