// Frame-stats probe, served by `three-stats` at /probe.js. Dev only.
// attach(renderer) samples the renderer once per frame, keeps the latest sample on
// window.__threeStats and posts it to the collector twice a second.
const endpoint = new URL("./stats", import.meta.url).href;

export function attach(renderer) {
  const info = renderer.info;
  info.autoReset = false; // count every render call of a frame (shadows, passes), not only the last
  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let windowStart = last;
  let frameInfo = { calls: 0, triangles: 0, points: 0, lines: 0 };

  function tick(now) {
    const delta = now - last;
    last = now;
    frames += 1;
    worst = Math.max(worst, delta);
    const render = info.render;
    frameInfo = {
      calls: render.drawCalls ?? render.calls,
      triangles: Math.round(render.triangles),
      points: render.points ?? 0,
      lines: render.lines ?? 0,
    };
    info.reset();
    if (now - windowStart >= 500) {
      const elapsed = now - windowStart;
      const sample = {
        url: location.href,
        at: Date.now(),
        fps: Math.round((frames * 1000) / elapsed),
        frameMs: Number((elapsed / frames).toFixed(2)),
        worstFrameMs: Number(worst.toFixed(2)),
        ...frameInfo,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? null,
        backend: renderer.isWebGPURenderer ? (renderer.backend?.isWebGPUBackend ? "webgpu" : "webgl2 (WebGPURenderer)") : "webgl2",
        width: renderer.domElement?.width ?? null,
        height: renderer.domElement?.height ?? null,
        pixelRatio: renderer.getPixelRatio?.() ?? null,
      };
      window.__threeStats = sample;
      fetch(endpoint, { method: "POST", body: JSON.stringify(sample), keepalive: true }).catch(() => {});
      frames = 0;
      worst = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
