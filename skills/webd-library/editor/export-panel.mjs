// export-panel.mjs — 편집기의 "내보내기" 탭. 설계: docs/EXPORT-DESIGN.md 6-2절.
//
// 흐름: 설정을 바꾸면 → 사양을 export.json에 저장(0.5초 뒤) + 서버가 실제로 렌더한 결과 미리보기(0.6초 뒤)
//       → [내보내기]로 폴더에 PNG·JSON을 쓴다. 저장하지 않은 CSS 변경도 화면 그대로 내보낸다.
// 미리보기 위에는 대상 범위와 9·3-slice 인셋 안내선을 그리고, 안내선을 끌어 인셋을 바꿀 수 있다.

import { icon } from "./icons.mjs";

const SLICE_LABEL ={ none: "한 장", nine: "9-slice", "three-h": "3-slice 가로", "three-v": "3-slice 세로" };
const FPS_CHOICES = [8, 12, 24, 30, 60];

export function initExport(ctx) {
  const { pane, overlay } = ctx;
  let spec = null, defaultDir = "", lastExport = null, active = false;
  let committed = null;        // 되돌리기 기록에 마지막으로 넣은 설정(바뀌면 이 값을 기록에 넣는다)
  const clone = (v) => JSON.parse(JSON.stringify(v));
  let previewTimer = null, saveTimer = null, previewSeq = 0, busy = false;
  let preview = null;          // 마지막 미리보기 응답
  let estimateNote = "";
  let drag = null;
  let detected = null;         // 편집기가 CSS에서 찾은 상태(타임라인과 같은 목록)

  /** 찾은 상태를 사양에 맞춘다. 켜고 끈 값은 키로 이어받고, 새로 찾은 상태는 켜 둔다. 바뀌었으면 true */
  function mergeStates(list) {
    const old = new Map((spec.states || []).map((s) => [s.key, s]));
    const next = list.map((s) => ({ key: s.key, label: s.label, tokens: s.tokens, include: old.get(s.key)?.include ?? true, ...(s.combo ? { combo: true } : {}) }));
    if (JSON.stringify(next) === JSON.stringify(spec.states || [])) return false;
    spec.states = next;
    return true;
  }
  const frameCount = () => 1 + (spec.states || []).filter((s) => s.include !== false).length;

  // ---------- 서버 ----------
  async function load() {
    const r = await ctx.api("/export-spec");
    if (!r.ok) { pane.replaceChildren(el("p", { class: "note", text: `내보내기 설정을 불러오지 못했습니다 (${r.status}).` })); return; }
    const d = await r.json();
    spec = d.spec; defaultDir = d.defaultDir; lastExport = d.lastExport;
    if (oneScale()) persist();
    // 미리보기 문서가 이미 있을 때만 대상 경로를 확인한다(아직이면 frameLoaded에서)
    if (ctx.frameDoc() && spec.target.kind === "element" && !ctx.resolve(spec.target.path)) spec.target = { kind: "root" };
    if (detected) mergeStates(detected);
    committed = clone(spec);
    render();
    if (active) schedulePreview(0);
  }
  /** 배율은 하나만 고른다. 예전 설정에 여러 개가 남아 있으면 가장 작은 것 하나로 줄인다(줄였으면 true). */
  function oneScale() {
    if (!Array.isArray(spec.scales) || spec.scales.length <= 1) return false;
    spec.scales = [Math.min(...spec.scales)];
    return true;
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
    setBusy(true);
  }
  /** 결과 머리의 렌더 중 표시(글 대신 도는 아이콘) */
  function setBusy(on) { pane.querySelector(".xp-result-wrap .xp-busy")?.classList.toggle("is-on", on); }
  async function runPreview() {
    const seq = ++previewSeq;
    let html; try { html = ctx.currentHtml(); } catch (e) { showError(e.message); setBusy(false); return; }
    setBusy(true);
    const r = await ctx.api("/export", { method: "POST", body: JSON.stringify({ spec, html, write: false }) }).catch((e) => ({ ok: false, json: async () => ({ error: e.message }) }));
    const d = await r.json().catch(() => ({}));
    if (seq !== previewSeq) return;           // 그새 설정이 또 바뀜
    setBusy(false);
    if (!r.ok) { preview = null; showError(d.error || `미리보기 실패 (${r.status})`); renderResult(); return; }
    preview = d; setStatus(""); renderResult(); renderFooter();
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
  // 규칙: 선택지는 아이콘 + 짧은 이름, 설명은 전부 툴팁(data-tip). 화면에는 안내 문장을 두지 않는다.
  function render() {
    if (!spec) return;
    // 순서: 종류(자르기·애니메이션) → 대상(무엇을·어떤 상태로) → 출력
    pane.replaceChildren(
      section("종류", "sec-kind", [
        row("자르기", seg("slice", [
          ["none", "한 장", "slice-none", "한 장\n그대로 한 장으로 찍습니다."],
          ["nine", "9-slice", "slice-nine", "9-slice\n네 모서리를 고정하고 변과 가운데만 늘립니다."],
          ["three-h", "가로 3", "slice-three-h", "3-slice 가로\n양 끝을 고정하고 가로로만 늘립니다."],
          ["three-v", "세로 3", "slice-three-v", "3-slice 세로\n위아래 끝을 고정하고 세로로만 늘립니다."],
        ], spec.slice.mode, (v) => { spec.slice.mode = v; if (v !== "none" && !anyInset()) estimate(false); changed(); }, "stack"),
          "자르기\n엔진에서 크기를 바꿀 때 어디를 늘릴지 정합니다."),
        animRow(),
        ...(spec.slice.mode === "none" ? [] : sliceRows()),
      ]),
      section("캡처", "sec-target", [
        row("대상", el("div", { class: "xp-val-stack" }, seg("target", [
          ["root", "전체", "target-root", "컴포넌트 전체\n저장된 컴포넌트를 통째로 찍습니다."],
          ["element", "고른 요소", "target-element", "고른 요소\n계층에서 고른 요소만 찍습니다. 다른 요소를 고르면 대상도 따라 바뀝니다.\n9·3-slice는 틀을 그리는 요소를 고르는 것이 정확합니다."],
        ], spec.target.kind, (v) => {
          if (v === "element") {
            const sel = ctx.selected();
            if (!sel) { setStatus("계층에서 요소를 먼저 고르세요."); render(); return; }
            spec.target = { kind: "element", path: ctx.pathOf(sel), label: ctx.label(sel) };
          } else spec.target = { kind: "root" };
          changed();
        }), targetNote()), "대상\n무엇을 내보낼지 정합니다."),
        row("배경", seg("background", [
          ["transparent", "투명", "bg-transparent", "투명\n배경 없이 알파로 찍습니다."],
          ["keep", "원래 배경", "bg-keep", "원래 배경\n컴포넌트의 배경색까지 찍습니다."],
        ], spec.background, (v) => { spec.background = v; changed(); }), "배경"),
        row("범위", seg("bounds", [
          ["ink", "그려진 픽셀", "bounds-ink", "그려진 픽셀\n그림자·광채까지 넣고 빈 여백은 잘라 냅니다."],
          ["box", "상자 그대로", "bounds-box", "상자 그대로\n요소 상자 크기대로 찍습니다(전체면 저장 크기)."],
        ], spec.bounds, (v) => { spec.bounds = v; changed(); }), "범위"),
        stateRow(),
      ]),
      section("출력", "sec-output", [
        row("이름", field("file", input("name", spec.name, (v) => { spec.name = v; changed({ preview: false }); }, { spellcheck: "false", "aria-label": "파일 이름" })),
          "파일 이름\n배율·상태·프레임이 뒤에 붙습니다.\n예: 이름_hover_3@2x.png"),
        ...(frameCount() > 1 ? [row("형태", seg("layout", [
          ["sheet", "시트 한 장", "layout-sheet", "시트 한 장\n모든 칸을 PNG 하나에 모으고 JSON frameTags에 상태 이름을 적습니다."],
          ["files", "상태마다 파일", "layout-files", "상태마다 파일\n이름_상태.png로 따로 씁니다."],
        ], spec.output.layout, (v) => { spec.output.layout = v; changed({ preview: false }); }), "형태")] : []),
        row("배율", seg("scale", [1, 2, 3, 4].map((s) => [String(s), `${s}x`, `scale-${s}`,
          `${s}x\n${s === 1 ? "CSS 크기 그대로(1px = 1픽셀) 찍습니다." : `CSS 1px을 ${s}×${s}픽셀로 다시 렌더해 찍습니다. 파일 이름에 @${s}x가 붙습니다.`}`]),
        String(spec.scales[0]), (v) => { spec.scales = [Number(v)]; changed(); }, "stack"),
          "배율\n게임에서 쓸 해상도 하나를 고릅니다. 확대가 아니라 다시 렌더하므로 선과 글자가 선명합니다."),
        row("폴더", field("folder", input("dir", spec.output.dir, (v) => { spec.output.dir = v; changed({ preview: false }); }, { placeholder: "기본 폴더", spellcheck: "false", "aria-label": "내보낼 폴더" }),
          spec.output.dir ? iconBtn("reset", "기본 폴더로", `기본 폴더로\n${defaultDir}`, () => { spec.output.dir = ""; changed({ preview: false }); render(); }) : null),
          `폴더\n비워 두면 기본 폴더에 씁니다.\n${defaultDir}\n이 컴포넌트만 다른 곳에 쓰려면 전체 경로를 적으세요.`),
      ]),
      el("section", { class: "xp-sec xp-result-wrap" }, sectHead("결과", "sec-result", el("span", { class: "xp-busy" }, icon("spinner", "spin"))), el("div", { class: "xp-result" })),
      el("div", { class: "xp-status", role: "status", "aria-live": "polite" }),
      el("footer", { class: "xp-foot" }),
    );
    renderResult(); renderFooter();
  }

  function sliceRows() {
    const m = spec.slice.mode;
    const sides = [["l", "왼쪽", m !== "three-v"], ["t", "위", m !== "three-h"], ["r", "오른쪽", m !== "three-v"], ["b", "아래", m !== "three-h"]];
    return [
      row("인셋", el("div", { class: "xp-insets" },
        ...sides.map(([k, lab, on]) => el("label", { class: "xp-inset" + (on ? "" : " off"), "data-tip": on ? `${lab} 인셋` : `${lab} 인셋\n이 자르기에서는 쓰지 않습니다.` }, icon(`side-${k}`),
          num(`inset-${k}`, on ? spec.slice.insets[k] : 0, (v) => { spec.slice.insets[k] = v; estimateNote = ""; changed(); }, { disabled: !on, "aria-label": `${lab} 인셋` }))),
        iconBtn("wand", "인셋 추정", `인셋 추정\nCSS의 테두리·radius·clip-path 모서리 깎임으로 인셋을 정합니다.${estimateNote ? `\n${estimateNote}` : ""}`, () => estimate(true))),
        `인셋\n모서리처럼 늘어나면 안 되는 폭(CSS px)입니다.\n미리보기의 안내선을 끌어도 바뀝니다.${estimateNote ? `\n${estimateNote}` : ""}`),
      row("가운데", seg("fill", [
        ["stretch", "늘림", "fill-stretch", "늘림\n가운데를 늘립니다."],
        ["tile", "반복", "fill-tile", "반복\n가운데 무늬를 반복합니다(tile)."],
      ], spec.slice.fill, (v) => { spec.slice.fill = v; changed(); }), "가운데"),
      row("크기", seg("size", [
        ["compact", "최소", "size-compact", "최소\n인셋 + 가운데 4px 크기로 다시 렌더해 작게 찍습니다."],
        ["original", "원래", "size-original", "원래\n화면에 보이는 크기 그대로 찍습니다."],
      ], spec.slice.size, (v) => { spec.slice.size = v; changed(); }), "크기"),
      row("내용", toggle("frame-only", "틀만", spec.slice.frameOnly, (on) => { spec.slice.frameOnly = on; changed(); },
        "틀만 찍기\n글자·아이콘을 숨기고 틀만 찍습니다. 글자 없는 장식 요소는 남깁니다.\n엔진에서 글자를 따로 그릴 때 켭니다."), "내용"),
    ];
  }

  /** 애니메이션: 켜기 + fps를 한 줄에. 지금 미리보기의 길이·프레임 수는 값이 있을 때만 짧게. */
  function animRow() {
    const an = spec.animation || { enabled: true, fps: 24, maxFrames: 120 };
    const now = ctx.animNow?.() || { length: 0 };
    const n = now.length ? Math.min(an.maxFrames, Math.max(1, Math.round(now.length / (1000 / an.fps)))) : 0;
    const on = an.enabled !== false;
    const nowTip = now.length ? `지금 상태: ${now.names.slice(0, 2).join(", ")} · ${+(now.length / 1000).toFixed(2)}초 → ${n}프레임` : "지금 상태에는 CSS 애니메이션(@keyframes)이 없습니다.";
    const fps = seg("fps", FPS_CHOICES.map((v) => [String(v), String(v), null, `${v} fps\n초당 ${v}프레임으로 찍습니다.`]), String(an.fps), (v) => { spec.animation = { ...an, fps: Number(v) }; changed(); ctx.onAnimationChange?.(); }, "tight");
    if (!on) fps.classList.add("is-off");
    return row("애니메이션", el("div", { class: "xp-anim" },
      toggle("film", "프레임", on, (v) => { spec.animation = { ...an, enabled: v }; changed(); ctx.onAnimationChange?.(); },
        `프레임으로 찍기\nCSS 애니메이션을 fps 간격 프레임으로 찍습니다.\n${nowTip}`),
      fps, now.length ? el("span", { class: "xp-chip", "data-tip": nowTip, text: `${n}칸` }) : null),
      `애니메이션\n길이는 상태마다 자동입니다(주기가 다르면 최소공배수). 애니메이션이 없는 상태는 한 장입니다.\n프레임은 미리보기 위 타임라인에서 볼 수 있습니다.\n${nowTip}`);
  }

  /** 상태: CSS에서 찾은 상태 칩(기본은 늘 포함). 상태를 보는 것은 타임라인 상태 줄에서. */
  function stateRow() {
    const list = spec.states || [];
    const tip = "상태\nCSS에서 찾은 상태(:hover, [aria-pressed] 등)를 상태마다 다시 렌더합니다.\n기본과 똑같아 보이는 상태는 내보낼 때 뺍니다.\n미리보기 위 타임라인에서 상태를 골라 볼 수 있습니다.";
    const base = el("button", { type: "button", class: "xp-tog is-fixed", "aria-pressed": "true", disabled: "", "data-tip": list.length ? "기본\n기본 상태는 늘 첫 칸입니다." : "기본\nCSS에 상태 규칙이 없어 기본 한 장만 찍습니다." }, icon("state-base"), el("span", { text: "기본" }));
    if (!detected) return row("상태", el("div", { class: "xp-toggles" }, base, el("span", { class: "xp-busy is-on", "data-tip": "상태를 찾는 중입니다." }, icon("spinner", "spin"))), tip);
    return row("상태", el("div", { class: "xp-toggles" }, base,
      ...list.map((s) => toggle(null, s.label, s.include !== false, (on) => { s.include = on; changed(); },
        `${s.label}\n${s.tokens.map((x) => x.kind === "pseudo" ? `:${x.name}` : x.kind === "attr" ? `[${x.name}="${x.value}"]` : `.${x.name}`).join(" + ")} → ${s.key}`))), tip);
  }

  function targetNote() {
    if (spec.target.kind === "root") return null;
    const elx = ctx.resolve(spec.target.path);
    return el("code", { class: "xp-target" + (elx ? "" : " is-lost"), "data-tip": elx ? "내보낼 요소" : "내보낼 요소\n저장된 요소를 찾지 못했습니다. 계층에서 다시 고르세요.", text: elx ? (spec.target.label || "(요소)") : `${spec.target.label || "요소"} — 찾지 못함` });
  }

  let players = [];
  /** 결과 칸의 프레임을 fps대로 돌린다(새로 그리면 이전 것은 멈춤) */
  function playFrames(img, urls, fps) {
    let i = 0;
    const id = setInterval(() => { if (!img.isConnected) { clearInterval(id); return; } i = (i + 1) % urls.length; img.src = urls[i]; }, 1000 / fps);
    players.push(id);
  }
  function renderResult() {
    players.forEach(clearInterval); players = [];
    const box = pane.querySelector(".xp-result"); if (!box) return;
    box.classList.remove("stale");
    box.replaceChildren();
    if (!preview) { box.append(el("div", { class: "xp-img xp-empty ui-checkerboard", "aria-hidden": "true" })); return; }
    for (const p of preview.previews) {
      const animated = p.frames?.some((f) => f.urls?.length > 1);
      const frames = p.frames?.length > 1 || animated ? p.frames : null;
      // 상태가 여럿이거나 애니메이션이면 상태마다 한 칸씩(누르면 타임라인도 그 상태로), 아니면 한 장
      const main = frames ? { ...frames[0], url: frames[0].urls?.[0] ?? frames[0].url } : { url: p.url, size: p.size };
      const w = main.size.w / p.scale, h = main.size.h / p.scale;
      // 작은 스프라이트는 정수배로 키워 픽셀이 보이게 한다(실제 파일 크기는 그대로)
      const zoom = Math.max(1, Math.min(8, Math.floor((frames ? 96 : 160) / Math.max(w, h, 1))));
      const pic = (f) => {
        const urls = f.urls || [f.url];
        const img = el("img", { src: urls[0], alt: `${f.label ?? p.png} 결과`, width: String(f.size.w / p.scale * zoom), height: String(f.size.h / p.scale * zoom), class: zoom > 1 ? "pixelated" : null });
        if (urls.length > 1) playFrames(img, urls, f.fps || 24);   // 내보낸 프레임을 그대로 돌려 본다
        return img;
      };
      const caption = el("figcaption", {}, el("strong", { text: p.png }), ` ${p.size.w}×${p.size.h}px`,
        frames ? ` · ${frames.reduce((n, f) => n + (f.urls?.length || 1), 0)}칸` : "",
        p.insets ? ` · L${p.insets.l} T${p.insets.t} R${p.insets.r} B${p.insets.b}` : "",
        zoom > 1 ? el("span", { class: "xp-zoom", "data-tip": `화면에서 ×${zoom} 확대\n작은 스프라이트라 픽셀이 보이게 키워 보여 줍니다. 파일 크기는 그대로입니다.` }, icon("zoom"), `×${zoom}`) : null);
      if (frames) {
        box.append(el("figure", { class: "xp-fig" },
          el("div", { class: "xp-frames" }, ...frames.map((f) => el("button", { type: "button", class: "xp-frame", "data-tip": `${f.label}\n누르면 타임라인에서 이 상태를 봅니다.`, onclick: () => ctx.showState?.(f.key) },
            el("span", { class: "xp-img ui-checkerboard" }, pic(f)), el("span", { class: "xp-frame-name", text: f.urls?.length > 1 ? `${f.label} · ${f.urls.length}프레임` : f.label })))),
          caption));
      } else {
        box.append(el("figure", { class: "xp-fig" }, el("div", { class: "xp-img ui-checkerboard" }, pic({ ...main, label: p.png })), caption));
      }
      if (p.insets) box.append(stretchDemo({ ...p, url: main.url }, w, h));
    }
    if (preview.warnings?.length) box.append(el("ul", { class: "xp-warn" }, ...preview.warnings.map((t) => el("li", { text: t }))));
  }

  /** border-image로 실제 9·3-slice처럼 늘려 본다. 모서리를 끌어 크기를 바꿀 수 있다. */
  function stretchDemo(p, w, h) {
    const { l, t, r, b } = p.insets, s = p.scale;
    const demo = el("div", { class: "xp-stretch" });
    const fill = spec.slice.fill === "tile" ? "round" : "stretch";
    demo.style.borderStyle = "solid";
    demo.style.borderWidth = `${t / s}px ${r / s}px ${b / s}px ${l / s}px`;
    demo.style.borderImage = `url("${p.url}") ${t} ${r} ${b} ${l} fill / ${t / s}px ${r / s}px ${b / s}px ${l / s}px ${fill}`;
    const m = spec.slice.mode;
    demo.style.width = `${Math.round(m === "three-v" ? w : Math.max(w * 2.5, w + 120))}px`;
    demo.style.height = `${Math.round(m === "three-h" ? h : Math.max(h * 1.8, h + 60))}px`;
    demo.style.resize = m === "three-h" ? "horizontal" : m === "three-v" ? "vertical" : "both";
    return el("div", { class: "xp-stretch-wrap" },
      el("span", { class: "xp-label", "data-tip": "늘려 보기\n오른쪽 아래 모서리를 끌어 늘려 보세요. 엔진에서 늘어나는 모습과 같습니다.\n모서리가 일그러지면 인셋을 키우세요." }, icon("stretch"), "늘려 보기"),
      el("div", { class: "xp-stretch-stage ui-checkerboard" }, demo));
  }

  function renderFooter(justDone = false) {
    const foot = pane.querySelector(".xp-foot"); if (!foot) return;
    // 결과가 있으면 실제 칸 수(기본과 같아서 뺀 상태 제외), 없으면 켠 상태 수
    const got = preview?.previews;   // 미리보기는 배율 하나: 시트면 1개(frames 여럿), 상태마다 파일이면 상태 수만큼
    const cellsIn = (p) => (p.frames || []).reduce((n, f) => n + (f.urls?.length || 1), 0) || 1;
    const n = spec.scales.length, k = got?.length ? (got.length > 1 ? got.reduce((s, p) => s + cellsIn(p), 0) : cellsIn(got[0])) : frameCount();
    const files = got?.length ? n * got.length : (frameCount() > 1 && spec.output.layout === "files" ? n * frameCount() : n);
    const dir = spec.output.dir || defaultDir;
    const dirty = ctx.isDirty();
    const summary = `내보내기\n${k > 1 && spec.output.layout === "sheet" ? "시트 " : ""}PNG ${files}장 + JSON ${files}개 (${k > 1 ? `${k}칸 · ` : ""}${spec.scales.map((x) => `${x}x`).join("·")})\n→ ${dir}${dirty ? "\n저장하지 않은 CSS 변경도 화면 그대로 내보냅니다." : ""}`;
    const at = lastExport ? String(lastExport.at).slice(5, 16).replace("T", " ") : "";
    foot.replaceChildren(el("div", { class: "xp-actions" },
      el("button", { type: "button", class: "primary ui-primary xp-go", disabled: busy || null, "aria-busy": busy ? "true" : null, "data-tip": summary, onclick: doExport },
        icon(busy ? "spinner" : "download", busy ? "spin" : ""), el("span", { text: busy ? "내보내는 중" : "내보내기" }),
        dirty ? el("span", { class: "xp-dirty-dot", "aria-label": "저장하지 않은 변경 포함" }) : null),
      lastExport ? el("span", { class: `xp-last${justDone ? " done" : ""}`, "data-tip": `${justDone ? "방금 내보냄" : "마지막 내보내기"}\n${at} · ${lastExport.files.length}개 파일` },
        icon("check"), el("span", { text: `${at} · ${lastExport.files.length}개` })) : null,
      lastExport ? iconBtn("folder-open", "폴더 열기", `폴더 열기\n${dir}`, async () => {
        const r = await ctx.api("/reveal", { method: "POST", body: "{}" }); if (!r.ok) setStatus((await r.json().catch(() => ({}))).error || "폴더를 열지 못했습니다.");
      }) : null));
  }

  function setStatus(text) { const s = pane.querySelector(".xp-status"); if (s) { s.textContent = text; s.classList.remove("err"); } }
  function showError(text) { const s = pane.querySelector(".xp-status"); if (s) { s.textContent = text; s.classList.add("err"); } }

  function changed({ preview: pv = true } = {}) {
    // 바뀌기 전 설정을 편집기의 되돌리기 기록에 넣는다(CSS 변경과 같은 Ctrl+Z 순서)
    if (committed && JSON.stringify(spec) !== JSON.stringify(committed)) { ctx.record?.(committed); committed = clone(spec); }
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
    if (announce) { changed(); setStatus(`인셋 추정: ${r.reason}`); }
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
          tag.textContent = `${spec.target.kind === "root" ? "컴포넌트 전체" : spec.target.label} · ${SLICE_LABEL[m]}`;
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
      // 캔버스가 확대·축소돼 있으므로 화면 좌표를 미리보기 좌표로 되돌린다
      const sc = overlay.offsetWidth ? ob.width / overlay.offsetWidth : 1;
      const x = (ev.clientX - ob.left) / sc, y = (ev.clientY - ob.top) / sc;
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

  // ---------- 작은 UI 부품(이름-값 두 열, 설명은 툴팁) ----------
  function sectHead(title, ic, extra = null) { return el("h3", { class: "sect xp-head" }, icon(ic), el("span", { text: title }), extra); }
  function section(title, ic, rows) { return el("section", { class: "xp-sec" }, sectHead(title, ic), el("div", { class: "xp-rows" }, ...rows)); }
  /** 이름 - 값 한 줄. tip은 이름에 마우스를 올리면 뜨는 설명(첫 줄이 제목) */
  function row(name, control, tip = "") {
    return el("div", { class: "xp-row" },
      el("span", { class: "xp-name" + (tip ? " has-tip" : ""), "data-tip": tip || null, tabindex: tip ? "0" : null, text: name }), el("div", { class: "xp-val" }, control));
  }
  const ARIA = { target: "대상", background: "배경", bounds: "범위", slice: "자르기", fill: "가운데", size: "크기", layout: "형태", fps: "초당 프레임", scale: "배율" };
  /** 하나만 고르는 칸. options: [값, 이름, 아이콘, 툴팁]. variant: stack(아이콘 위·이름 아래), tight(숫자) */
  function seg(key, options, value, on, variant = "") {
    return el("div", { class: "xp-seg" + (variant ? ` is-${variant}` : ""), role: "radiogroup", "aria-label": ARIA[key] ?? key },
      ...options.map(([v, t, ic, tip]) => el("button", { type: "button", role: "radio", "aria-checked": String(v === value), "data-xp": `${key}-${v}`, "data-tip": tip || null,
        onclick: () => { if (v !== value) on(v); } }, ic ? icon(ic) : null, el("span", { class: "xp-seg-t", text: t }))));
  }
  /** 켜고 끄는 칩(체크박스 대신). 아이콘 + 이름 */
  function toggle(ic, text, on, cb, tip = "") {
    return el("button", { type: "button", class: "xp-tog", "aria-pressed": String(!!on), "data-xp": `tog-${text}`, "data-tip": tip || null, onclick: () => cb(!on) },
      ic ? icon(ic) : el("span", { class: "xp-tog-mark", "aria-hidden": "true" }), el("span", { text }));
  }
  /** 아이콘만 있는 버튼(이름은 aria-label, 설명은 툴팁) */
  function iconBtn(ic, label, tip, onclick) {
    return el("button", { type: "button", class: "xp-ibtn", "aria-label": label, "data-tip": tip, onclick }, icon(ic));
  }
  /** 입력칸 앞에 아이콘 */
  function field(ic, inputEl, after = null) {
    return el("div", { class: "xp-field" }, icon(ic), inputEl, after);
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

  // ---------- 편집기에서 부르는 것 ----------
  load();
  return {
    show() { active = true; needDraw = true; overlay.hidden = false; if (spec) { render(); schedulePreview(0); } },
    hide() { active = false; overlay.hidden = true; clearTimeout(previewTimer); },
    /** 계층·미리보기에서 요소를 고름 */
    selectionChanged(sel) {
      if (!spec || !active || spec.target.kind !== "element" || !sel) return;
      const path = ctx.pathOf(sel);
      if (path.join(".") === spec.target.path.join(".")) return;
      spec.target = { kind: "element", path, label: ctx.label(sel) };
      if (spec.slice.mode !== "none") estimate(false);
      changed();
    },
    /** 되돌리기·다시 실행: 지금 설정을 꺼내고, 기록의 설정으로 바꾼다 */
    snapshot() { return spec ? clone(spec) : null; },
    setSpec(next) {
      spec = clone(next); oneScale(); committed = clone(spec); estimateNote = "";
      persist(); render(); schedulePreview(0); needDraw = true;
    },
    stylesChanged() { needDraw = true; if (active) { schedulePreview(900); renderFooter(); } },
    frameLoaded() {
      needDraw = true;
      if (spec?.target.kind === "element" && !ctx.resolve(spec.target.path)) {
        const lost = spec.target.label;
        spec.target = { kind: "root" }; committed = clone(spec); render();
        setStatus(`저장된 대상(${lost})을 찾지 못해 컴포넌트 전체로 바꿨습니다.`);
      } else if (spec && active) render();
    },
    animation() { return spec?.animation || null; },
    // 메뉴 바(내보내기 메뉴)에서 부르는 것
    ready: () => Boolean(spec),
    exportNow() { if (spec) doExport(); },
    scale: () => spec?.scales?.[0] ?? 1,
    setScale(s) { if (!spec || spec.scales[0] === s) return; spec.scales = [s]; changed(); },
    hasExport: () => Boolean(lastExport),
    async reveal() { const r = await ctx.api("/reveal", { method: "POST", body: "{}" }); if (!r.ok) setStatus((await r.json().catch(() => ({}))).error || "폴더를 열지 못했습니다."); return r.ok; },
    /** 편집기가 지금 미리보기의 애니메이션을 다시 읽었다(애니메이션 줄의 안내 문구만 갱신) */
    animDetected() { if (active && spec) { const r = pane.querySelector(".xp-anim")?.closest(".xp-row"); if (r) r.replaceWith(animRow()); } },
    /** 타임라인의 fps 고르기(사용자가 바꾼 것이라 되돌리기 기록에 넣음) */
    setAnimationFps(fps) { if (!spec) return; spec.animation = { ...(spec.animation || { enabled: true, maxFrames: 120 }), fps }; changed(); },
    /** 편집기가 CSS에서 상태를 다시 찾았다(불러올 때·CSS를 고칠 때). 사용자가 바꾼 것이 아니라 되돌리기 기록에는 넣지 않는다. */
    statesDetected(list) {
      detected = list;
      if (!spec) return;
      if (mergeStates(list)) { committed = clone(spec); persist(); if (active) schedulePreview(); }
      if (active) render();
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
