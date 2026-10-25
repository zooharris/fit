/* ==========================================================================
   Start-up
   ========================================================================== */
(async function boot() {
  if (!CAPS.storage) {
    document.body.innerHTML = `<div class="compat panel"><h1>Tango Fitter can't run in this browser</h1><p class="muted" style="margin-top:10px">It needs a browser that can store data on the device (IndexedDB). Use an up-to-date Safari or Chrome on iPhone, iPad, Mac or Windows. Private browsing modes can also block storage.</p></div>`;
    return;
  }
  await loadState();
  // Ask the browser to keep our storage (helps on Chrome; iOS keeps it for Home Screen apps).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* ignore */ }
  window.addEventListener('hashchange', render);
  // Desktop: drop a .tango file anywhere to open it.
  document.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { e.preventDefault(); openFileFlow(f); } });
  window.addEventListener('beforeunload', (e) => { if (S.session && S.session.capture) { e.preventDefault(); e.returnValue = ''; } });
  // Hooks for automated tests (no effect in normal use).
  window.__TANGO = { S, Settings, render, go, saveFile, createSampleFile, sessionAnalysis, sessionResults, buildZip, readTango };
  render();
})();
