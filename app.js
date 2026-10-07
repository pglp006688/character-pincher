(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const wrap = document.getElementById("canvasWrap");
  const hint = document.getElementById("hint");
  const list = document.getElementById("characterList");
  const title = document.getElementById("characterTitle");

  const state = {
    tool: "free", clay: true, strength: 38, radius: 105, zoom: 1,
    img: null, base: null, working: null, drawing: false, last: null,
    undo: [], redo: [], dpr: Math.min(devicePixelRatio || 1, 2)
  };

  const tools = {
    free: ["自由捏"], big: ["放大"], small: ["缩小"],
    stretch: ["拉长"], wide: ["压扁"], twist: ["旋一旋"]
  };

  function makeCanvasSize(img) {
    const max = 900;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.style.width = Math.round(canvas.width * state.zoom) + "px";
    canvas.style.height = Math.round(canvas.height * state.zoom) + "px";
  }

  function drawImage(data = state.working) {
    if (!data) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(data, 0, 0);
  }

  function snapshot() {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function loadCharacter(item, index) {
    const img = new Image();
    img.onload = () => {
      state.img = img;
      makeCanvasSize(img);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      state.base = snapshot();
      state.working = state.base;
      state.undo = [];
      state.redo = [];
      title.textContent = item.name;
      hint.classList.remove("hide");
      document.querySelectorAll(".char-card").forEach((el, i) => el.classList.toggle("active", i === index));
      setTimeout(() => hint.classList.add("hide"), 3200);
    };
    img.src = item.src;
  }

  function renderCharacters() {
    list.innerHTML = "";
    (window.CHARACTERS || []).forEach((item, i) => {
      const card = document.createElement("button");
      card.className = "char-card";
      card.innerHTML = `<img alt=""><div></div>`;
      card.querySelector("img").src = item.src;
      card.querySelector("div").textContent = item.name;
      card.onclick = () => loadCharacter(item, i);
      list.appendChild(card);
    });
    if (window.CHARACTERS?.length) loadCharacter(window.CHARACTERS[0], 0);
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * canvas.width / r.width,
      y: (e.clientY - r.top) * canvas.height / r.height
    };
  }

  function deform(p, q) {
    const src = state.working;
    const w = canvas.width, h = canvas.height;
    const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
    const radius = state.radius * (w / Math.max(w, h));
    const power = state.strength / 100;
    const dx = q.x - p.x, dy = q.y - p.y;

    const minX = Math.max(0, Math.floor(p.x - radius));
    const maxX = Math.min(w - 1, Math.ceil(p.x + radius));
    const minY = Math.max(0, Math.floor(p.y - radius));
    const maxY = Math.min(h - 1, Math.ceil(p.y + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const ox = x - p.x, oy = y - p.y;
        const d = Math.sqrt(ox*ox + oy*oy);
        if (d > radius) continue;
        const t = 1 - d / radius;
        const falloff = t*t*(3-2*t);
        let sx = x, sy = y;
        const amount = power * falloff;

        if (state.tool === "small") { sx += dx * amount; sy += dy * amount; }
        else if (state.tool === "stretch") { sy -= dy * amount * 1.4; sx -= dx * amount * .15; }
        else if (state.tool === "wide") { sx -= dx * amount * .15; sy -= dy * amount * 1.4; }
        else if (state.tool === "twist") {
          const a = (amount * 0.45) * (dy >= 0 ? 1 : -1);
          sx = p.x + ox*Math.cos(a) - oy*Math.sin(a);
          sy = p.y + ox*Math.sin(a) + oy*Math.cos(a);
        } else { sx -= dx * amount; sy -= dy * amount; }

        // 橡皮泥模式：提高中心到边缘的平滑度，避免硬边。
        if (state.clay) {
          const clay = 0.72 + 0.28 * falloff;
          sx = x + (sx - x) * clay;
          sy = y + (sy - y) * clay;
        }

        sx = Math.max(0, Math.min(w - 1, Math.round(sx)));
        sy = Math.max(0, Math.min(h - 1, Math.round(sy)));
        const si = (sy*w + sx)*4, di = (y*w+x)*4;
        out.data[di] = src.data[si];
        out.data[di+1] = src.data[si+1];
        out.data[di+2] = src.data[si+2];
        out.data[di+3] = src.data[si+3];
      }
    }
    return out;
  }

  function begin(e) {
    if (!state.working) return;
    state.drawing = true;
    state.last = pointerPos(e);
    state.undo.push(snapshot());
    state.redo = [];
    wrap.classList.add("dragging");
    canvas.setPointerCapture?.(e.pointerId);
    hint.classList.add("hide");
  }

  function move(e) {
    if (!state.drawing) return;
    const p = pointerPos(e);
    if (Math.hypot(p.x-state.last.x, p.y-state.last.y) < 1) return;
    state.working = deform(state.last, p);
    drawImage();
    state.last = p;
  }

  function end() {
    if (!state.drawing) return;
    state.drawing = false;
    wrap.classList.remove("dragging");
  }

  canvas.addEventListener("pointerdown", begin);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  function reset() {
    if (!state.base) return;
    state.undo.push(snapshot()); state.redo = [];
    state.working = state.base;
    drawImage();
  }
  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    state.working = state.undo.pop();
    drawImage();
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    state.working = state.redo.pop();
    drawImage();
  }

  document.getElementById("resetBtn").onclick = reset;
  document.getElementById("undoBtn").onclick = undo;
  document.getElementById("redoBtn").onclick = redo;
  document.getElementById("exportBtn").onclick = () => {
    const a = document.createElement("a");
    a.download = (title.textContent || "人物捏捏乐") + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  document.querySelectorAll(".tool").forEach(btn => btn.onclick = () => {
    document.querySelectorAll(".tool").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    state.tool = btn.dataset.tool;
    document.getElementById("toolLabel").textContent = tools[state.tool][0];
  });

  document.getElementById("clayMode").onchange = e => state.clay = e.target.checked;
  document.getElementById("strength").oninput = e => {
    state.strength = +e.target.value;
    document.getElementById("strengthValue").textContent = state.strength;
  };
  document.getElementById("radius").oninput = e => {
    state.radius = +e.target.value;
    document.getElementById("radiusValue").textContent = state.radius;
  };

  function zoom(delta) {
    state.zoom = Math.max(.65, Math.min(1.35, state.zoom + delta));
    canvas.style.width = Math.round(canvas.width * state.zoom) + "px";
    canvas.style.height = Math.round(canvas.height * state.zoom) + "px";
    document.getElementById("zoomValue").textContent = Math.round(state.zoom*100) + "%";
  }
  document.getElementById("zoomIn").onclick = () => zoom(.1);
  document.getElementById("zoomOut").onclick = () => zoom(-.1);

  document.addEventListener("keydown", e => {
    if (e.key.toLowerCase() === "r" && !/input|textarea/i.test(e.target.tagName)) reset();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
  });

  renderCharacters();
})();
