// export-panel.mjs — 편집기의 "내보내기" 탭. 설계: docs/EXPORT-DESIGN.md 6-2절.
//
// 흐름: 설정을 바꾸면 → 사양을 export.json에 저장(0.5초 뒤) + 서버가 실제로 렌더한 결과 미리보기(0.6초 뒤)
//       → [내보내기]로 폴더에 PNG·JSON을 쓴다. 저장하지 않은 CSS 변경도 화면 그대로 내보낸다.
// 미리보기 위에는 대상 범위와 9·3-slice 인셋 안내선을 그리고, 안내선을 끌어 인셋을 바꿀 수 있다.

const SLICE_LABEL = { none: "한 장", nine: "9-slice", "three-h": "3-slice 가로", "three-v": "3-slice 세로" };

export function initExport(ctx) {
  const { pane, overlay } = ctx;
  let spec = null, defaultDir = "", lastExport = null, active = false;
  let previewTimer = null, saveTimer = null, previewSeq = 0, busy = false;
  let preview = null;          // 마지막 미리보기 응답
  let estimateNote = "";
  let drag = null;

  // ---------- 서버 ----------
  async function load() {
    const r = await ctx.api("/export-spec");
    if (!r.ok) { pane.replaceChildren(el("p", { class: "note", text: `내보내기 설정을 불러오지 못했습니다 (${r.status}).` })); return; }
    const d = await r.json();
    spec = d.spec; defaultDir = d.defaultDir; lastExport = d.lastExport;
    // 미리보기 문서가 이미 있을 때만 대상 경로를 확인한다(아직이면 frameLoaded에서)
    if (ctx.frameDoc() && spec.target.kind === "element" && !ctx.resolve(spec.target.path)) spec.target = { kind: "root" };
    render();
    if (active) schedulePreview(0);
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ctx.api("/export-spec", { method: "POST", body: JSON.stringify({ spec }) }).catch(() => {}), 500);
  }
  function schedulePreview(delay = 600) {
    clearTimeout(previewTimer);
    if (!active || !spec) return;
    previewTimer = setTimeout(runPreview, delay);
    pane.querySelector(".xp-result")?.classList.add("stale");
  }
  async function runPreview() {
    const seq = ++previewSeq;
    let html; try { html = ctx.currentHtml(); } catch (e) { showError(e.message); return; }
    setStatus("미리보기 렌더 중…");
    const r = await ctx.api("/export", { method: "POST", body: JSON.stringify({ spec, html, write: false }) }).catch((e) => ({ ok: false, json: async () => ({ error: e.message }) }));
    const d = await r.json().catch(() => ({}));
    if (seq !== previewSeq) return;           // 그새 설정이 또 바뀜
    if (!r.ok) { preview = null; showError(d.error || `미리보기 실패 (${r.status})`); renderResult(); return; }
    preview = d; setStatus(""); renderResult();
  }
  async function doExport() {
    if (busy) return;
    let html; try { html = ctx.currentHtml(); } catch (e) { showError(e.message); return; }
    busy = true; renderFooter();
    clearTimeout(saveTimer);
    const r = await ctx.api("/export", { method: "POST", body: JSON.stringify({ spec, html, write: true }) }).catch((e) => ({ ok: false, json: async () => ({ error: e.message }) }));
    const d = await r.json().catch(() => ({}));
    busy = false;
    if (!r.ok) { showError(d.error || `내보내기 실패 (${r.status})`); renderFooter(); return; }
    lastExport = d.lastExport; preview = { ...d, preview: true };
    renderResult(); renderFooter(true);
  }

  // ---------- 그리기 ----------
  function render() {
    if (!spec) return;
    pane.replaceChildren(
      el("p", { class: "hint xp-intro", text: "조각을 게임에서 쓸 PNG와 좌표 JSON(Aseprite 호환 + Unity·Godot 값)으로 내보냅니다. 설정을 바꾸면 아래 '결과'에 실제로 렌더한 이미지가 나옵니다." }),
      section("대상", [
        row("찍을 것", seg("target", [["root", "조각 전체"], ["element", "고른 요소"]], spec.target.kind, (v) => {
          if (v === "element") {
            const sel = ctx.selected();
            if (!sel) { setStatus("하이라키에서 요소를 먼저 고르세요."); render(); return; }
            spec.target = { kind: "element", path: ctx.pathOf(sel), label: ctx.label(sel) };
          } else spec.target = { kind: "root" };
          changed();
        }), targetNote()),
        row("배경", seg("background", [["transparent", "투명"], ["keep", "원래 배경 포함"]], spec.background, (v) => { spec.background = v; changed(); })),
        row("범위", seg("bounds", [["ink", "그려진 픽셀"], ["box", "상자 그대로"]], spec.bounds, (v) => { spec.bounds = v; changed(); }),
          el("span", { class: "xp-sub", text: spec.bounds === "ink" ? "그림자·광채까지 넣고 빈 여백은 잘라 냅니다." : "요소 상자(조각 전체면 저장 크기)대로 자릅니다." })),
      ]),
      section("종류", [
        row("자르기", seg("slice", Object.entries(SLICE_LABEL), spec.slice.mode, (v) => { spec.slice.mode = v; if (v !== "none" && !anyInset()) estimate(false); changed(); })),
        ...(spec.slice.mode === "none" ? [] : sliceRows()),
      ]),
      section("출력", [
        row("이름", input("name", spec.name, (v) => { spec.name = v; changed({ preview: false }); }, { spellcheck: "false" })),
        row("배율", el("div", { class: "xp-checks" }, ...[1, 2, 3, 4].map((s) => check(`${s}x`, spec.scales.includes(s), (on) => {
          const next = new Set(spec.scales); on ? next.add(s) : next.delete(s);
          if (!next.size) { setStatus("배율은 하나 이상 골라야 합니다."); render(); return; }
          spec.scales = [...next].sort((a, b) => a - b); changed();
        })))),
        row("폴더", el("div", { class: "xp-dir" },
          input("dir", spec.output.dir, (v) => { spec.output.dir = v; changed({ preview: false }); }, { placeholder: defaultDir, spellcheck: "false", "aria-describedby": "xp-dir-note" }),
          spec.output.dir ? el("button", { type: "button", class: "xp-link", text: "기본 폴더로", onclick: () => { spec.output.dir = ""; changed({ preview: false }); render(); } }) : null),
          el("span", { class: "xp-sub", id: "xp-dir-note", text: spec.output.dir ? "이 조각만 이 폴더에 씁니다." : `비워 두면 기본 폴더: ${defaultDir}` })),
      ]),
      el("section", { class: "xp-result-wrap" }, el("h3", { class: "sect", text: "결과" }), el("div", { class: "xp-result" })),
      el("div", { class: "xp-status", role: "status", "aria-live": "polite" }),
      el("footer", { class: "xp-foot" }),
    );
    renderResult(); renderFooter();
  }

  function sliceRows() {
    const m = spec.slice.mode;
    const sides = [["l", "L", m !== "three-v"], ["t", "T", m !== "three-h"], ["r", "R", m !== "three-v"], ["b", "B", m !== "three-h"]];
    return [
      row("인셋", el("div", { class: "xp-insets" },
        ...sides.map(([k, lab, on]) => el("label", { class: on ? "" : "off" }, el("span", { text: lab }),
          num(`inset-${k}`, on ? spec.slice.insets[k] : 0, (v) => { spec.slice.insets[k] = v; estimateNote = ""; changed(); }, { disabled: !on, "aria-label": `인셋 ${lab}` }))),
        el("button", { type: "button", class: "ui-control xp-btn", text: "CSS에서 추정", onclick: () => estimate(true) })),
        el("span", { class: "xp-sub", text: estimateNote || "미리보기의 점선을 끌어도 바뀝니다. 모서리처럼 늘어나면 안 되는 폭(CSS px)입니다." })),
      row("가운데", seg("fill", [["stretch", "늘림"], ["tile", "반복"]], spec.slice.fill, (v) => { spec.slice.fill = v; changed(); })),
      row("크기", seg("size", [["compact", "최소"], ["original", "원래"]], spec.slice.size, (v) => { spec.slice.size = v; changed(); }),
        el("span", { class: "xp-sub", text: spec.slice.size === "compact" ? "인셋 + 가운데 4px 크기로 다시 렌더해 이미지를 작게 만듭니다." : "화면에 보이는 크기 그대로 찍습니다." })),
      row("내용", check("틀만 찍기 (글자·아이콘 빼기)", spec.slice.frameOnly, (on) => { spec.slice.frameOnly = on; changed(); })),
    ];
  }

  function targetNote() {
    if (spec.target.kind === "root") return el("span", { class: "xp-sub", text: "body 전체를 찍습니다." });
    const elx = ctx.resolve(spec.target.path);
    return el("span", { class: "xp-sub" }, el("code", { text: spec.target.label || "(요소)" }),
      elx ? " · 하이라키에서 다른 요소를 고르면 대상이 따라 바뀝니다." : " · 이 요소를 찾지 못했습니다. 다시 고르세요.");
  }

  function renderResult() {
    const box = pane.querySelector(".xp-result"); if (!box) return;
    box.classList.remove("stale");
    box.replaceChildren();
    if (!preview) { box.append(el("p", { class: "note", text: active ? "렌더를 기다리는 중입니다." : "" })); return; }
    for (const p of preview.previews) {
      const w = p.size.w / p.scale, h = p.size.h / p.scale;
      // 작은 스프라이트는 정수배로 키워 픽셀이 보이게 한다(실제 파일 크기는 그대로)
      const zoom = Math.max(1, Math.min(8, Math.floor(160 / Math.max(w, h, 1))));
      const img = el("img", { src: p.url, alt: `${p.png} 결과`, width: String(w * zoom), height: String(h * zoom), class: zoom > 1 ? "pixelated" : null });
      const fig = el("figure", { class: "xp-fig" },
        el("div", { class: "xp-img ui-checkerboard" }, img),
        el("figcaption", {}, el("strong", { text: p.png }), ` ${p.size.w}×${p.size.h}px`,
          p.insets ? ` · L${p.insets.l} T${p.insets.t} R${p.insets.r} B${p.insets.b}` : "",
          zoom > 1 ? el("span", { class: "xp-zoom", text: ` · 화면에서 ×${zoom} 확대` }) : null));
      box.append(fig);
      if (p.insets) box.append(stretchDemo(p, w, h));
    }
    if (preview.warnings?.length) box.append(el("ul", { class: "xp-warn" }, ...preview.warnings.map((t) => el("li", { text: t }))));
  }

  /** border-image로 실제 9·3-slice처럼 늘려 본다. 모서리를 끌어 크기를 바꿀 수 있다. */
  function stretchDemo(p, w, h) {
    const { l, t, r, b } = p.insets, s = p.scale;
    const demo = el("div", { class: "xp-stretch", title: "오른쪽 아래 모서리를 끌어 늘려 보세요" });
    const fill = spec.slice.fill === "tile" ? "round" : "stretch";
    demo.style.borderStyle = "solid";
    demo.style.borderWidth = `${t / s}px ${r / s}px ${b / s}px ${l / s}px`;
    demo.style.borderImage = `url("${p.url}") ${t} ${r} ${b} ${l} fill / ${t / s}px ${r / s}px ${b / s}px ${l / s}px ${fill}`;
    const m = spec.slice.mode;
    demo.style.width = `${Math.round(m === "three-v" ? w : Math.max(w * 2.5, w + 120))}px`;
    demo.style.height = `${Math.round(m === "three-h" ? h : Math.max(h * 1.8, h + 60))}px`;
    demo.style.resize = m === "three-h" ? "horizontal" : m === "three-v" ? "vertical" : "both";
    return el("div", { class: "xp-stretch-wrap" }, el("p", { class: "xp-sub", text: "늘려 보기: 모서리를 끌면 엔진에서 늘어나는 모습과 같습니다. 모서리가 일그러지면 인셋을 키우세요." }),
      el("div", { class: "xp-stretch-stage ui-checkerboard" }, demo));
  }

  function renderFooter(justDone = false) {
    const foot = pane.querySelector(".xp-foot"); if (!foot) return;
    const n = spec.scales.length;
    const dir = spec.output.dir || defaultDir;
    foot.replaceChildren(...[
      ctx.isDirty() ? el("p", { class: "xp-dirty", text: "저장하지 않은 CSS 변경도 화면 그대로 내보냅니다." }) : null,
      el("p", { class: "xp-summary" }, `PNG ${n}장 + JSON ${n}개 (${spec.scales.map((x) => `${x}x`).join("·")}) → `, el("code", { text: dir })),
      el("div", { class: "xp-actions" },
        el("button", { type: "button", class: "primary ui-primary xp-go", text: busy ? "내보내는 중…" : "내보내기", disabled: busy || null, onclick: doExport }),
        lastExport ? el("span", { class: `xp-last${justDone ? " done" : ""}`, text: `${justDone ? "완료" : "마지막"} ${String(lastExport.at).slice(5, 16).replace("T", " ")} · ${lastExport.files.length}개 파일` }) : null,
        lastExport ? el("button", { type: "button", class: "xp-link", text: "폴더 열기", onclick: async () => {
          const r = await ctx.api("/reveal", { method: "POST", body: "{}" }); if (!r.ok) setStatus((await r.json().catch(() => ({}))).error || "폴더를 열지 못했습니다.");
        } }) : null)].filter(Boolean));
  }

  function setStatus(text) { const s = pane.querySelector(".xp-status"); if (s) { s.textContent = text; s.classList.remove("err"); } }
  function showError(text) { const s = pane.querySelector(".xp-status"); if (s) { s.textContent = text; s.classList.add("err"); } }

  function changed({ preview: pv = true } = {}) {
    persist();
    // 입력 중인 칸의 포커스를 지키며 다시 그린다
    const focusKey = document.activeElement?.dataset?.xp;
    const caret = document.activeElement?.selectionStart;
    render();
    if (focusKey) { const f = pane.querySelector(`[data-xp="${focusKey}"]`); if (f) { f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch {} } }
    if (pv) schedulePreview();
    needDraw = true;
  }

  // ---------- 인셋 추정 ----------
  const anyInset = () => Object.values(spec.slice.insets).some((v) => v > 0);
  function estimate(announce) {
    const target = spec.target.kind === "element" ? ctx.resolve(spec.target.path) : ctx.frameDoc()?.body;
    if (!target) { estimateNote = "대상을 찾지 못해 추정하지 못했습니다."; if (announce) changed(); return; }
    const r = estimateInsets(target, ctx.frameWin());
    spec.slice.insets = r.insets;
    estimateNote = r.reason;
    if (announce) changed();
  }

  // ---------- 미리보기 위 안내선 ----------
  let needDraw = true, lastKey = "";
  function targetRect() {
    if (!spec) return null;
    if (spec.target.kind === "root") {
      const d = ctx.frameDoc(); if (!d) return null;
      return { left: 0, top: 0, width: d.documentElement.clientWidth, height: d.documentElement.clientHeight };
    }
    const t = ctx.resolve(spec.target.path); if (!t) return null;
    return t.getBoundingClientRect();
  }
  function draw() {
    if (active && spec) {
      const r = targetRect();
      const m = spec.slice.mode, ins = spec.slice.insets;
      const key = r ? [r.left, r.top, r.width, r.height, m, ins.l, ins.t, ins.r, ins.b].map((v) => typeof v === "number" ? Math.round(v * 10) : v).join(",") : "none";
      if (key !== lastKey || needDraw) {
        lastKey = key; needDraw = false;
        overlay.replaceChildren();
        if (r) {
          overlay.append(box("xg-target", r.left, r.top, r.width, r.height));
          const tag = box("xg-tag", r.left, Math.max(0, r.top - 20), 0, 0);
          tag.textContent = `${spec.target.kind === "root" ? "조각 전체" : spec.target.label} · ${SLICE_LABEL[m]}`;
          overlay.append(tag);
          if (m !== "none") {
            const lines = [];
            if (m !== "three-v") lines.push(["l", "v", r.left + ins.l], ["r", "v", r.left + r.width - ins.r]);
            if (m !== "three-h") lines.push(["t", "h", r.top + ins.t], ["b", "h", r.top + r.height - ins.b]);
            for (const [side, dir, pos] of lines) {
              const g = dir === "v" ? box("xg-line v", pos - 4, r.top, 9, r.height) : box("xg-line h", r.left, pos - 4, r.width, 9);
              g.dataset.side = side; g.title = `${side.toUpperCase()} 인셋 ${ins[side]}px — 끌어서 바꾸기`;
              g.addEventListener("pointerdown", (e) => startDrag(e, side, r));
              overlay.append(g);
            }
          }
        }
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  function startDrag(e, side, r) {
    e.preventDefault();
    // 끄는 동안 안내선을 다시 그리므로(요소가 바뀜) 이동·놓기는 window에서 받는다
    const g = window;
    const ob = overlay.getBoundingClientRect();
    document.body.classList.add("xp-dragging", side === "l" || side === "r" ? "xp-drag-x" : "xp-drag-y");
    drag = { side };
    const move = (ev) => {
      const x = ev.clientX - ob.left, y = ev.clientY - ob.top;
      const v = side === "l" ? x - r.left : side === "r" ? r.left + r.width - x : side === "t" ? y - r.top : r.top + r.height - y;
      const max = side === "l" || side === "r" ? r.width : r.height;
      spec.slice.insets[side] = Math.max(0, Math.min(Math.round(max), Math.round(v)));
      estimateNote = ""; needDraw = true;
      const field = pane.querySelector(`[data-xp="inset-${side}"]`); if (field) field.value = spec.slice.insets[side];
    };
    const up = () => {
      g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
      document.body.classList.remove("xp-dragging", "xp-drag-x", "xp-drag-y");
      drag = null; changed();
    };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
  }
  function box(cls, x, y, w, h) {
    const d = document.createElement("div"); d.className = cls;
    d.style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px`;
    return d;
  }

  // ---------- 작은 UI 부품(인스펙터와 같은 이름-값 두 열) ----------
  function section(title, rows) { return el("section", { class: "xp-sec" }, el("h3", { class: "sect", text: title }), el("div", { class: "xp-rows" }, ...rows)); }
  function row(name, control, sub) { return el("div", { class: "xp-row" }, el("span", { class: "xp-name", text: name }), el("div", { class: "xp-val" }, control, sub ?? null)); }
  const ARIA = { target: "찍을 것", background: "배경", bounds: "범위", slice: "자르기", fill: "가운데", size: "크기" };
  function seg(key, options, value, on) {
    return el("div", { class: "xp-seg", role: "radiogroup", "aria-label": ARIA[key] ?? key },
      ...options.map(([v, t]) => el("button", { type: "button", role: "radio", "aria-checked": String(v === value), "data-xp": `${key}-${v}`, text: t,
        onclick: () => { if (v !== value) on(v); } })));
  }
  function input(key, value, on, attrs = {}) {
    const i = el("input", { type: "text", class: "xp-input", "data-xp": key, autocomplete: "off", ...attrs });
    i.value = value ?? "";
    i.addEventListener("change", () => on(i.value.trim()));
    i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); i.blur(); } });
    return i;
  }
  function num(key, value, on, attrs = {}) {
    const i = el("input", { type: "number", class: "xp-num", "data-xp": key, min: "0", step: "1", inputmode: "numeric", ...attrs });
    i.value = String(value);
    i.addEventListener("change", () => on(Math.max(0, Math.round(Number(i.value) || 0))));
    return i;
  }
  function check(text, on, cb) {
    const c = el("input", { type: "checkbox", "data-xp": `chk-${text}` }); c.checked = on;
    c.addEventListener("change", () => cb(c.checked));
    return el("label", { class: "xp-check" }, c, el("span", { text }));
  }

  // ---------- 편집기에서 부르는 것 ----------
  load();
  return {
    show() { active = true; needDraw = true; overlay.hidden = false; if (spec) { render(); schedulePreview(0); } },
    hide() { active = false; overlay.hidden = true; clearTimeout(previewTimer); },
    /** 하이라키·미리보기에서 요소를 고름 */
    selectionChanged(sel) {
      if (!spec || !active || spec.target.kind !== "element" || !sel) return;
      const path = ctx.pathOf(sel);
      if (path.join(".") === spec.target.path.join(".")) return;
      spec.target = { kind: "element", path, label: ctx.label(sel) };
      if (spec.slice.mode !== "none") estimate(false);
      changed();
    },
    stylesChanged() { needDraw = true; if (active) { schedulePreview(900); renderFooter(); } },
    frameLoaded() {
      needDraw = true;
      if (spec?.target.kind === "element" && !ctx.resolve(spec.target.path)) {
        const lost = spec.target.label;
        spec.target = { kind: "root" }; render();
        setStatus(`저장된 대상(${lost})을 찾지 못해 조각 전체로 바꿨습니다.`);
      } else if (spec && active) render();
    },
  };
}

/**
 * CSS에서 9-slice 인셋을 추정한다: 테두리 두께, 네 모서리 radius, clip-path: polygon()의 모서리 깎임.
 * 브라우저 안에서 계산된 값으로 하므로 var()·calc()가 풀린 상태다. 반환 값은 CSS px 정수(올림).
 */
export function estimateInsets(target, win) {
  const cs = win.getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
  const len = (s, base) => { s = String(s).trim(); if (s.endsWith("%")) return (parseFloat(s) / 100) * base; return parseFloat(s) || 0; };
  const radius = (corner) => {
    const v = cs.getPropertyValue(`border-${corner}-radius`).trim().split(/\s+/);
    return { h: len(v[0] ?? "0", W), v: len(v[1] ?? v[0] ?? "0", H) };
  };
  const tl = radius("top-left"), tr = radius("top-right"), br = radius("bottom-right"), bl = radius("bottom-left");
  const bw = { l: n("border-left-width"), t: n("border-top-width"), r: n("border-right-width"), b: n("border-bottom-width") };
  const out = {
    l: Math.max(bw.l, tl.h, bl.h), r: Math.max(bw.r, tr.h, br.h),
    t: Math.max(bw.t, tl.v, tr.v), b: Math.max(bw.b, bl.v, br.v),
  };
  const reasons = [];
  if (Math.max(tl.h, tr.h, br.h, bl.h, tl.v, tr.v, br.v, bl.v) > 0) reasons.push(`radius ${Math.round(Math.max(tl.h, tr.h, br.h, bl.h))}`);
  if (Math.max(bw.l, bw.t, bw.r, bw.b) > 0) reasons.push(`border ${Math.round(Math.max(bw.l, bw.t, bw.r, bw.b))}`);
  const clip = cs.getPropertyValue("clip-path").trim();
  const poly = /^polygon\((.*)\)$/s.exec(clip);
  if (poly) {
    const pts = splitTop(poly[1]).map((p) => splitSpace(p.replace(/^(nonzero|evenodd)\s*,?/, "").trim())).filter((p) => p.length === 2)
      .map(([x, y]) => ({ x: evalLen(x, W), y: evalLen(y, H) }));
    const near = 1.5; let c = 0;
    for (const p of pts) {
      if (p.y <= near || p.y >= H - near) { if (p.x > near && p.x < W / 2) { out.l = Math.max(out.l, p.x); c = Math.max(c, p.x); } if (p.x < W - near && p.x > W / 2) { out.r = Math.max(out.r, W - p.x); c = Math.max(c, W - p.x); } }
      if (p.x <= near || p.x >= W - near) { if (p.y > near && p.y < H / 2) { out.t = Math.max(out.t, p.y); c = Math.max(c, p.y); } if (p.y < H - near && p.y > H / 2) { out.b = Math.max(out.b, H - p.y); c = Math.max(c, H - p.y); } }
    }
    if (c) reasons.push(`clip-path 깎임 ${Math.round(c)}`);
  }
  const insets = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.min(Math.ceil(v), Math.floor((k === "l" || k === "r" ? W : H) / 2))]));
  const reason = reasons.length ? `추정 근거: ${reasons.join(" · ")}` : "테두리·radius·clip-path가 없어 추정할 것이 없습니다. 모양을 보고 직접 정하세요.";
  return { insets, reason };
}
function splitTop(s) { const out = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { out.push(cur); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur); return out; }
function splitSpace(s) { const out = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ""; } else cur += ch; } if (cur) out.push(cur); return out; }
/** "12px", "50%", "calc(100% - 12px)" 정도를 푼다 */
export function evalLen(s, base) {
  s = s.trim();
  const calc = /^calc\((.*)\)$/s.exec(s);
  if (calc) {
    let total = 0, sign = 1;
    for (const tok of calc[1].split(/\s+/)) {
      if (tok === "+") sign = 1; else if (tok === "-") sign = -1;
      else { total += sign * evalLen(tok, base); sign = 1; }
    }
    return total;
  }
  if (s.endsWith("%")) return (parseFloat(s) / 100) * base;
  return parseFloat(s) || 0;
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
