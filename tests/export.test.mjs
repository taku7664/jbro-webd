import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { encodePng, decodePng, createImage } from "../skills/webd-library/scripts/export/png.mjs";
import { alphaBounds, crop, packSheet, extrude } from "../skills/webd-library/scripts/export/pack.mjs";
import { normalizeSpec, defaultSpec, expandFrames, insetsPx, outputDir, defaultExportRoot, safeName, scaleSuffix } from "../skills/webd-library/scripts/export/spec.mjs";
import { buildSheetData, engineValues, centerRect } from "../skills/webd-library/scripts/export/formats.mjs";
import { writeExport } from "../skills/webd-library/scripts/export/run.mjs";
import { save } from "../skills/webd-library/scripts/library.mjs";
import { startLibrary, startEditor } from "../skills/webd-library/scripts/editor-server.mjs";
import { findBrowser } from "../skills/webd/scripts/render-check.mjs";

const work = mkdtempSync(join(tmpdir(), "webd-export-test-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));

function px(img, x, y) { const i = (y * img.width + x) * 4; return [...img.data.subarray(i, i + 4)]; }
function fill(img, x, y, w, h, rgba) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.data.set(rgba, (j * img.width + i) * 4); }

// ---------- PNG ----------

test("PNG: RGBA를 쓰고 다시 읽으면 픽셀이 같다(반투명 포함)", () => {
  const img = createImage(7, 5);
  fill(img, 0, 0, 7, 5, [10, 20, 30, 0]);
  fill(img, 1, 1, 3, 2, [255, 0, 128, 255]);
  fill(img, 4, 3, 2, 2, [1, 2, 3, 77]);
  const back = decodePng(encodePng(img));
  assert.equal(back.width, 7); assert.equal(back.height, 5);
  assert.deepEqual([...back.data], [...img.data]);
});

test("PNG: PNG가 아니면 오류", () => {
  assert.throws(() => decodePng(Buffer.from("hello world!")), /PNG 파일이 아닙니다/);
});

// ---------- 다듬기·배치 ----------

test("alphaBounds·crop: 투명 여백을 잘라 낸다, 다 투명하면 null", () => {
  const img = createImage(10, 8);
  assert.equal(alphaBounds(img), null);
  fill(img, 3, 2, 4, 3, [0, 0, 0, 255]);
  const b = alphaBounds(img);
  assert.deepEqual(b, { x: 3, y: 2, w: 4, h: 3 });
  const c = crop(img, b);
  assert.equal(c.width, 4); assert.deepEqual(px(c, 0, 0), [0, 0, 0, 255]);
});

test("packSheet: 격자 배치·간격·칸 좌표, horizontal은 한 줄", () => {
  const f = (w, h) => ({ image: Object.assign(createImage(w, h), {}) });
  const frames = [f(10, 6), f(8, 6), f(10, 4), f(4, 4), f(10, 6)];
  const p = packSheet(frames, { type: "rows", columns: "auto", padding: 2 });
  assert.equal(p.grid.columns, 3); assert.equal(p.grid.rows, 2);
  assert.equal(p.image.width, 3 * 10 + 2 * 2); assert.equal(p.image.height, 2 * 6 + 2);
  assert.deepEqual(p.cells[1], { x: 12, y: 0, w: 8, h: 6 });
  assert.deepEqual(p.cells[3], { x: 0, y: 8, w: 4, h: 4 });
  const h = packSheet(frames, { type: "horizontal" });
  assert.equal(h.grid.rows, 1); assert.equal(h.image.width, 50);
});

test("extrude: 가장자리 색을 바깥으로 늘린다", () => {
  const img = createImage(2, 1); fill(img, 0, 0, 1, 1, [255, 0, 0, 255]); fill(img, 1, 0, 1, 1, [0, 0, 255, 255]);
  const e = extrude(img, 2);
  assert.equal(e.width, 6); assert.equal(e.height, 5);
  assert.deepEqual(px(e, 0, 0), [255, 0, 0, 255]); assert.deepEqual(px(e, 5, 4), [0, 0, 255, 255]);
});

// ---------- 사양 ----------

test("사양: 기본값, 잘못된 값 거름, 3-slice는 반대 축 인셋 0", () => {
  const d = defaultSpec("20261110-잿빛-등대-슬롯-버튼");
  assert.equal(d.name, "잿빛-등대-슬롯-버튼", "날짜 앞머리 제거, 한글 유지");
  const { spec, warnings } = normalizeSpec({
    name: "a/b:c", scales: [2, 9, 1, 2], background: "weird",
    slice: { mode: "three-h", insets: { l: 12.4, t: 30, r: -5, b: 8 }, fill: "tile" },
  }, "x");
  assert.equal(spec.name, "a-b-c"); assert.ok(warnings.some((w) => /파일 이름/.test(w)));
  assert.deepEqual(spec.scales, [1, 2]);
  assert.equal(spec.background, "transparent");
  assert.deepEqual(spec.slice.insets, { l: 12, t: 0, r: 0, b: 0 });
  assert.equal(spec.slice.fill, "tile");
  assert.throws(() => normalizeSpec({ scales: [7] }, "x"), /배율/);
  assert.throws(() => normalizeSpec({ output: { dir: "relative/dir" } }, "x"), /전체 경로/);
  assert.throws(() => normalizeSpec({ target: { kind: "element", path: [1, -1] } }, "x"), /경로/);
  assert.ok(normalizeSpec({ slice: { mode: "nine" } }, "x").warnings.some((w) => /인셋이 모두 0/.test(w)));
});

test("사양: 상태는 기본 + 켠 상태로 펼치고, 모양이 틀린 항목·옛 형식은 버린다. 애니메이션 설정 검증", () => {
  const hover = { key: "hover", label: "호버", tokens: [{ kind: "pseudo", name: "hover", owners: [".btn"] }] };
  const off = { key: "disabled", label: "비활성", include: false, tokens: [{ kind: "pseudo", name: "disabled", owners: [".btn"] }] };
  const { spec, warnings } = normalizeSpec({ name: "btn", states: [{ name: "normal" }, hover, off,
    { key: "bad key!", tokens: [] }, { key: "x", tokens: [{ kind: "eval", name: "x", owners: ["a"] }] }, { key: "y", tokens: [{ kind: "class", name: "y", owners: [] }] }],
    animation: { fps: 30, maxFrames: 999 } }, "x");
  assert.deepEqual(spec.states.map((s) => s.key), ["hover", "disabled"]);
  const frames = expandFrames(spec);
  assert.deepEqual(frames.map((f) => [f.state, f.filename]), [["normal", "btn_normal"], ["hover", "btn_hover"]]);
  assert.equal(warnings.length, 0);
  assert.deepEqual(spec.animation, { enabled: true, fps: 30, maxFrames: 240 });
  assert.deepEqual(normalizeSpec({ animation: { fps: 7 } }, "x").spec.animation.fps, 24, "고를 수 없는 fps는 기본값");
  assert.equal(normalizeSpec({ animation: false }, "x").spec.animation.enabled, false);
  assert.equal(normalizeSpec({ animation: null }, "x").spec.animation.enabled, true, "옛 export.json(null)은 기본값");
  assert.equal(expandFrames(normalizeSpec({ name: "btn" }, "x").spec)[0].filename, "btn", "상태가 없으면 이름에 꼬리 없음");
});

test("시트 JSON: 상태마다 frameTags와 meta.webd.states", () => {
  const { spec } = normalizeSpec({ name: "b" }, "x");
  const fr = (state, label, x) => ({ filename: `b_${state}`, state, label, cell: { x, y: 0, w: 4, h: 4 }, duration: 100, sourceSize: { w: 4, h: 4 }, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 } });
  const d = buildSheetData({ frames: [fr("normal", "기본", 0), fr("hover", "호버", 6)], image: "b-sheet.png", size: { w: 10, h: 4 }, scale: 1, spec, insets: null, source: {} });
  assert.deepEqual(d.meta.frameTags, [{ name: "normal", from: 0, to: 0, direction: "forward" }, { name: "hover", from: 1, to: 1, direction: "forward" }]);
  assert.deepEqual(d.meta.webd.states, [{ key: "normal", label: "기본", from: 0, to: 0 }, { key: "hover", label: "호버", from: 1, to: 1 }]);
  assert.deepEqual(Object.keys(d.frames), ["b_normal", "b_hover"]);
});

test("사양: 배율 인셋·파일 꼬리·기본 폴더", () => {
  const { spec } = normalizeSpec({ slice: { mode: "nine", insets: { l: 10, t: 6, r: 10, b: 6 } } }, "x");
  assert.deepEqual(insetsPx(spec, 2), { l: 20, t: 12, r: 20, b: 12 });
  assert.equal(scaleSuffix(1), ""); assert.equal(scaleSuffix(2), "@2x");
  const lib = join(work, "root", "library"); mkdirSync(lib, { recursive: true });
  assert.ok(defaultExportRoot(lib, {}).endsWith(join("root", "export")));
  assert.equal(defaultExportRoot(lib, { WEBD_EXPORT: join(work, "elsewhere") }), join(work, "elsewhere"));
  assert.ok(outputDir(spec, lib, "x", {}).endsWith(join("root", "export", "x")));
  const custom = normalizeSpec({ output: { dir: join(work, "my") } }, "x").spec;
  assert.equal(outputDir(custom, lib, "x", {}), join(work, "my"));
  assert.equal(safeName("  "), "sprite");
});

// ---------- 데이터 형식 ----------

test("시트 JSON: Aseprite 호환 frames·slices.center, Unity L·B·R·T, Godot 마진, CSS border-image", () => {
  const { spec } = normalizeSpec({ name: "panel", slice: { mode: "nine", insets: { l: 12, t: 8, r: 10, b: 6 }, fill: "stretch" } }, "x");
  const ins = insetsPx(spec, 2);
  const data = buildSheetData({
    frames: [{ filename: "panel", cell: { x: 0, y: 0, w: 52, h: 36 }, sourceSize: { w: 52, h: 36 }, spriteSourceSize: { x: 0, y: 0, w: 52, h: 36 }, duration: 100 }],
    image: "panel@2x.png", size: { w: 52, h: 36 }, scale: 2, spec, insets: ins, source: { id: "x" },
  });
  assert.deepEqual(data.frames.panel.frame, { x: 0, y: 0, w: 52, h: 36 });
  assert.equal(data.frames.panel.trimmed, false);
  assert.equal(data.meta.image, "panel@2x.png"); assert.equal(data.meta.scale, "2");
  assert.deepEqual(data.meta.slices[0].keys[0].center, { x: 24, y: 16, w: 52 - 24 - 20, h: 36 - 16 - 12 });
  const e = data.meta.webd.engines;
  assert.deepEqual(e.unity.vector4, [24, 12, 20, 16], "L, B, R, T 순서");
  assert.equal(e.unity.drawMode, "Sliced");
  assert.equal(e.godot.patch_margin_top, 16);
  assert.match(e.css.borderImage, /^url\("panel@2x\.png"\) 16 20 12 24 fill \/ 8px 10px 6px 12px stretch$/);
  const arr = buildSheetData({ frames: [{ filename: "p", cell: { x: 0, y: 0, w: 1, h: 1 }, sourceSize: { w: 1, h: 1 }, spriteSourceSize: { x: 0, y: 0, w: 1, h: 1 }, duration: 100 }],
    image: "p.png", size: { w: 1, h: 1 }, scale: 1, spec: normalizeSpec({ output: { data: "aseprite-array" } }, "x").spec, insets: null, source: {} });
  assert.ok(Array.isArray(arr.frames)); assert.equal(arr.frames[0].filename, "p");
  assert.deepEqual(arr.meta.slices, []); assert.equal(arr.meta.webd.engines, null);
});

test("엔진 값: 반복(tile)과 3-slice 축", () => {
  const { spec } = normalizeSpec({ slice: { mode: "three-h", insets: { l: 4, r: 4 }, fill: "tile" } }, "x");
  const v = engineValues(spec, insetsPx(spec, 1), "a.png", 1);
  assert.equal(v.unity.drawMode, "Tiled");
  assert.equal(v.godot.axis_stretch_horizontal, "tile");
  assert.equal(v.godot.axis_stretch_vertical, "stretch");
  assert.deepEqual(centerRect({ w: 10, h: 10 }, { l: 6, t: 0, r: 6, b: 0 }).w, 0);
});

test("writeExport: 같은 이름은 .previous로 옮기고 다른 파일은 그대로", () => {
  const dir = join(work, "out");
  writeExport(dir, [{ name: "a.png", bytes: Buffer.from("1") }]);
  writeFileSync(join(dir, "keep.txt"), "k");
  writeExport(dir, [{ name: "a.png", bytes: Buffer.from("2") }]);
  assert.equal(readFileSync(join(dir, "a.png"), "utf8"), "2");
  assert.equal(readFileSync(join(dir, ".previous", "a.png"), "utf8"), "1");
  assert.ok(existsSync(join(dir, "keep.txt")));
});

// ---------- 서버 ----------

function req(port, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", ...headers } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, text, json, headers: res.headers }); });
    });
    r.on("error", reject);
    if (body !== undefined) r.write(typeof body === "string" ? body : JSON.stringify(body));
    r.end();
  });
}

const PANEL = `<!doctype html><html><head><style>
html,body{margin:0;background:#202020}
.panel{position:absolute;left:20px;top:20px;width:120px;height:60px;background:#3a6;border:4px solid #fff;border-radius:10px;
       box-shadow:0 0 0 6px rgba(255,0,0,.5);font:16px sans-serif;color:#000}
</style></head><body><div class="panel">라벨</div></body></html>`;

function makeLib() {
  const lib = join(mkdtempSync(join(work, "srv-")), "library");
  mkdirSync(lib, { recursive: true });
  const src = join(work, `panel-${Date.now()}-${Math.random()}.html`);
  writeFileSync(src, PANEL);
  const { meta } = save(lib, { file: src, name: "패널", category: "card", viewport: "200x120" });
  return { lib, id: meta.id };
}

test("라이브러리 서버: 목록을 내주고, ?t로 연 뒤에는 쿠키로 편집기·API를 연다", async () => {
  const { lib, id } = makeLib();
  const srv = await startLibrary({ lib, token: "k".repeat(32) });
  try {
    const p = srv.port;
    assert.equal((await req(p, "GET", "/lib/")).status, 403, "토큰 없음");
    const g = await req(p, "GET", `/lib/?t=${"k".repeat(32)}`);
    assert.equal(g.status, 200);
    assert.match(g.text, new RegExp(`/edit/`), "카드가 편집기로 이어짐");
    assert.doesNotMatch(g.text, /id="serve-note"/, "서버 목록에는 파일 안내가 없음");
    const cookie = g.headers["set-cookie"][0].split(";")[0];
    assert.match(g.headers["set-cookie"][0], /HttpOnly; SameSite=Strict/);
    assert.equal((await req(p, "GET", `/edit/${encodeURIComponent(id)}`, { headers: { cookie } })).status, 200);
    const a = await req(p, "GET", `/api/${encodeURIComponent(id)}`, { headers: { cookie } });
    assert.equal(a.status, 200); assert.equal(a.json.library, true);
    assert.equal((await req(p, "GET", `/api/${encodeURIComponent(id)}`, { headers: { cookie: "webd_1=" + "k".repeat(32) } })).status, 403, "다른 포트 이름의 쿠키는 무시");
    assert.equal((await req(p, "GET", `/edit/nope`, { headers: { cookie } })).status, 404);
    assert.equal((await req(p, "GET", "/", { headers: { cookie } })).headers.location, "/lib/");
    const s = await req(p, "GET", `/api/${encodeURIComponent(id)}/export-spec`, { headers: { cookie } });
    assert.equal(s.status, 200); assert.equal(s.json.saved, false);
    assert.ok(s.json.defaultDir.endsWith(join("export", id)), s.json.defaultDir);
    const put = await req(p, "POST", `/api/${encodeURIComponent(id)}/export-spec`, { headers: { cookie }, body: { spec: { slice: { mode: "nine", insets: { l: 14, t: 14, r: 14, b: 14 } } } } });
    assert.equal(put.status, 200);
    assert.equal(JSON.parse(readFileSync(join(lib, id, "export.json"), "utf8")).slice.mode, "nine");
    assert.equal((await req(p, "POST", `/api/${encodeURIComponent(id)}/export-spec`, { headers: { cookie, origin: "http://evil.example" }, body: { spec: {} } })).status, 403);
  } finally { await srv.close(); }
});

test("항목 하나 서버(startEditor)는 목록을 내주지 않는다", async () => {
  const { lib, id } = makeLib();
  const ed = await startEditor({ lib, id, token: "e".repeat(32) });
  try {
    assert.equal((await req(ed.port, "GET", `/lib/?t=${"e".repeat(32)}`)).status, 404);
    assert.equal((await req(ed.port, "GET", `/api/${encodeURIComponent(id)}`, { headers: { "x-webd-token": "e".repeat(32) } })).json.library, false);
  } finally { await ed.close(); }
});

const BTN = `<!doctype html><html><head><style>
html,body{margin:0;background:#202020}
.btn{position:absolute;left:10px;top:10px;width:60px;height:30px;border:0;padding:0;background:#33aa66;transition:background 300ms}
.btn:not(:disabled):hover{background:#3366aa}
.btn[aria-pressed="true"]{background:#aa3366}
.btn[aria-pressed="true"]:hover{background:#ffaa00}
.btn:disabled{background:#666666}
.btn:focus-visible{cursor:pointer}
.btn.is-gone{display:none}
.btn:not(:disabled):active{transform:scale(.9)}
.btn.is-ring{outline:5px solid #ffffff;outline-offset:0}
</style></head><body><button class="btn" type="button" aria-pressed="false"></button></body></html>`;

test("내보내기: 상태별로 다시 렌더해 시트 한 장 + frameTags, 기본과 같은 상태·찍을 수 없는 상태는 뺀다", { skip: findBrowser() ? false : "Chrome·Edge 없음" }, async () => {
  const lib = join(mkdtempSync(join(work, "st-")), "library");
  mkdirSync(lib, { recursive: true });
  const src = join(work, `btn-${Date.now()}.html`); writeFileSync(src, BTN);
  const { meta } = save(lib, { file: src, name: "상태 버튼", category: "button", viewport: "100x60" });
  const srv = await startLibrary({ lib, token: "s".repeat(32) });
  const T = { "x-webd-token": "s".repeat(32) };
  const tok = (kind, name, owners, value) => ({ kind, name, owners, ...(value != null ? { value } : {}) });
  const hover = tok("pseudo", "hover", [".btn:not(:disabled)"]);
  const pressed = tok("attr", "aria-pressed", [".btn"], "true");
  const states = [
    { key: "hover", label: "호버", tokens: [hover] },
    { key: "focus-visible", label: "포커스", tokens: [tok("pseudo", "focus-visible", [".btn"])] },
    { key: "disabled", label: "비활성", tokens: [tok("pseudo", "disabled", [".btn"])] },
    { key: "pressed", label: "켜짐", tokens: [pressed] },
    { key: "pressed+hover", label: "켜짐 + 호버", tokens: [pressed, hover], combo: true },
    { key: "gone", label: ".is-gone", tokens: [tok("class", "is-gone", [".btn"])] },
    { key: "skip", label: "끔", include: false, tokens: [tok("class", "is-skip", [".btn"])] },
  ];
  try {
    const r = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "btn", target: { kind: "element", path: [1, 0] }, bounds: "box", scales: [1, 2], states }, write: true } });
    assert.equal(r.status, 200, r.text);
    const dir = r.json.dir;
    assert.deepEqual(readdirSync(dir).sort(), ["btn-sheet.json", "btn-sheet.png", "btn-sheet@2x.json", "btn-sheet@2x.png"]);
    const j = JSON.parse(readFileSync(join(dir, "btn-sheet.json"), "utf8"));
    assert.deepEqual(j.meta.frameTags.map((t) => t.name), ["normal", "hover", "disabled", "pressed", "pressed+hover"]);
    const sheet = decodePng(readFileSync(join(dir, "btn-sheet.png")));
    const color = (name) => { const f = j.frames[name].frame; assert.equal(f.w, 60); assert.equal(f.h, 30); return px(sheet, f.x + 30, f.y + 15).slice(0, 3); };
    assert.deepEqual(color("btn_normal"), [0x33, 0xaa, 0x66]);
    assert.deepEqual(color("btn_hover"), [0x33, 0x66, 0xaa], "전환(300ms) 없이 바로 호버 색");
    assert.deepEqual(color("btn_disabled"), [0x66, 0x66, 0x66], ":not(:disabled)도 비활성에서는 빠짐");
    assert.deepEqual(color("btn_pressed"), [0xaa, 0x33, 0x66]);
    assert.deepEqual(color("btn_pressed+hover"), [0xff, 0xaa, 0x00], "CSS에 있는 조합");
    assert.ok(j.meta.webd.warnings.some((w) => /"포커스" 상태는 기본과 모습이 같아/.test(w)));
    assert.ok(j.meta.webd.warnings.some((w) => /".is-gone" 상태는 찍지 못해/.test(w)));
    const j2 = JSON.parse(readFileSync(join(dir, "btn-sheet@2x.json"), "utf8"));
    assert.equal(j2.meta.frameTags.length, 5, "뺀 상태는 2배에서도 빠짐");
    // 미리보기: 상태별 프레임을 한 장씩 돌려준다
    const pv = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "btn", target: { kind: "element", path: [1, 0] }, bounds: "box", states: states.slice(0, 1) }, write: false } });
    assert.equal(pv.status, 200, pv.text);
    assert.deepEqual(pv.json.previews[0].frames.map((f) => f.key), ["normal", "hover"]);
    assert.match(pv.json.previews[0].frames[1].urls[0], /^data:image\/png;base64,/);
    // 그려진 범위가 상태마다 달라도(바깥 테두리) 칸 크기는 같게: 상자를 같은 자리에 두고 투명하게 덧붙임
    const ring = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "btn", target: { kind: "element", path: [1, 0] }, bounds: "ink", animation: false,
        states: [{ key: "ring", label: "테두리", tokens: [tok("class", "is-ring", [".btn"])] }] }, write: false } });
    assert.equal(ring.status, 200, ring.text);
    assert.deepEqual(ring.json.previews[0].frames.map((f) => [f.key, f.size.w, f.size.h]), [["normal", 70, 40], ["ring", 70, 40]]);
    assert.deepEqual(ring.json.previews[0].box, { x: 5, y: 5, w: 60, h: 30 });
    assert.ok(!ring.json.warnings.some((w) => /크기가 기본과 다릅니다/.test(w)), ring.json.warnings.join(" / "));
    const n0 = decodePng(Buffer.from(ring.json.previews[0].frames[0].urls[0].split(",")[1], "base64"));
    assert.equal(px(n0, 2, 2)[3], 0, "기본 칸의 덧붙인 가장자리는 투명");
    assert.deepEqual(px(n0, 35, 20).slice(0, 3), [0x33, 0xaa, 0x66], "기본 칸 안의 버튼은 같은 자리");
    // 9-slice 최소 크기: transform: scale()이 걸린 상태(누름)도 같은 크기로 줄인다
    const nine = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "btn", target: { kind: "element", path: [1, 0] }, bounds: "box", slice: { mode: "nine", insets: { l: 6, t: 6, r: 6, b: 6 } },
        states: [{ key: "active", label: "누름", tokens: [tok("pseudo", "active", [".btn:not(:disabled)"])] }] }, write: false } });
    assert.equal(nine.status, 200, nine.text);
    assert.ok(!nine.json.warnings.some((w) => /줄여지지 않아|크기가 기본과 다릅니다/.test(w)), nine.json.warnings.join(" / "));
    assert.deepEqual(nine.json.previews[0].frames.map((f) => [f.key, f.size.w]), [["normal", 16], ["active", 16]]);
  } finally { await srv.close(); }
});

const ANIM = `<!doctype html><html><head><style>
html,body{margin:0;background:#202020}
.dot{position:absolute;left:10px;top:10px;width:20px;height:20px;background:#ff0000;animation:blink .5s step-end infinite, grow .5s linear infinite}
@keyframes blink{0%{background:#ff0000}25%{background:#00ff00}50%{background:#0000ff}75%,100%{background:#ffffff}}
@keyframes grow{0%{box-shadow:0 0 0 0 #ff00ff}50%{box-shadow:0 0 0 6px #ff00ff}100%{box-shadow:0 0 0 0 #ff00ff}}
.dot:hover{animation:none;background:#888888}
.dot.is-spin{animation:blink .5s step-end infinite, grow .75s linear infinite}
</style></head><body><div class="dot"></div></body></html>`;

test("내보내기: CSS 애니메이션을 fps 간격 프레임으로 찍고, 프레임은 같은 크기(그림자 합집합), 상태마다 frameTags 범위", { skip: findBrowser() ? false : "Chrome·Edge 없음" }, async () => {
  const lib = join(mkdtempSync(join(work, "an-")), "library");
  mkdirSync(lib, { recursive: true });
  const src = join(work, `anim-${Date.now()}.html`); writeFileSync(src, ANIM);
  const { meta } = save(lib, { file: src, name: "깜빡이", category: "other", viewport: "200x100" });
  const srv = await startLibrary({ lib, token: "a".repeat(32) });
  const T = { "x-webd-token": "a".repeat(32) };
  const hover = { key: "hover", label: "호버", tokens: [{ kind: "pseudo", name: "hover", owners: [".dot"] }] };
  try {
    const r = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "dot", target: { kind: "element", path: [1, 0] }, bounds: "ink", animation: { fps: 8 }, states: [hover] }, write: true } });
    assert.equal(r.status, 200, r.text);
    const j = JSON.parse(readFileSync(join(r.json.dir, "dot-sheet.json"), "utf8"));
    assert.deepEqual(Object.keys(j.frames), ["dot_normal_0", "dot_normal_1", "dot_normal_2", "dot_normal_3", "dot_hover"]);
    assert.deepEqual(j.meta.frameTags, [{ name: "normal", from: 0, to: 3, direction: "forward" }, { name: "hover", from: 4, to: 4, direction: "forward" }]);
    assert.equal(j.frames.dot_normal_1.duration, 125);
    assert.deepEqual(j.meta.webd.animation, { fps: 8, frameDuration: 125, states: [{ key: "normal", frames: 4, length: 500, names: ["blink", "grow"] }] });
    const sheet = decodePng(readFileSync(join(r.json.dir, "dot-sheet.png")));
    const sizes = new Set(Object.values(j.frames).slice(0, 4).map((f) => `${f.frame.w}x${f.frame.h}`));
    assert.deepEqual([...sizes], ["32x32"], "그림자가 가장 큰 프레임(6px) 기준으로 모두 같은 크기");
    const mid = (name) => { const f = j.frames[name].frame; return px(sheet, f.x + f.w / 2, f.y + f.h / 2).slice(0, 3); };
    assert.deepEqual(["dot_normal_0", "dot_normal_1", "dot_normal_2", "dot_normal_3"].map(mid), [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]);
    assert.deepEqual(mid("dot_hover"), [0x88, 0x88, 0x88], "호버에서는 애니메이션이 꺼져 한 장");
    // 주기가 다른 반복(0.5초·0.75초)은 최소공배수(1.5초)로 찍어 끝과 처음이 이어지게
    const mix = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "dot", target: { kind: "element", path: [1, 0] }, animation: { fps: 8 }, states: [{ key: "spin", label: "회전", tokens: [{ kind: "class", name: "is-spin", owners: [".dot"] }] }] }, write: false } });
    assert.equal(mix.status, 200, mix.text);
    assert.deepEqual(mix.json.previews[0].frames.map((f) => [f.key, f.urls.length]), [["normal", 4], ["spin", 12]]);
    assert.ok(!mix.json.warnings.some((w) => /주기가 다른/.test(w)));
    // 끄면 한 장
    const off = await req(srv.port, "POST", `/api/${encodeURIComponent(meta.id)}/export`, { headers: T, body: {
      spec: { name: "dot", target: { kind: "element", path: [1, 0] }, animation: { enabled: false } }, write: false } });
    assert.equal(off.json.previews[0].frames[0].urls.length, 1);
  } finally { await srv.close(); }
});

test("내보내기: 실제 브라우저로 투명 PNG·9-slice JSON을 만든다", { skip: findBrowser() ? false : "Chrome·Edge 없음" }, async () => {
  const { lib, id } = makeLib();
  const srv = await startLibrary({ lib, token: "x".repeat(32) });
  const T = { "x-webd-token": "x".repeat(32) };
  const path = `/api/${encodeURIComponent(id)}/export`;
  try {
    // 한 장, 고른 요소(.panel = html > body > div → [1, 0]), 그려진 픽셀(그림자 6px 포함)
    const one = await req(srv.port, "POST", path, { headers: T, body: { spec: { name: "panel", target: { kind: "element", path: [1, 0] }, scales: [1, 2] }, write: true } });
    assert.equal(one.status, 200, one.text);
    const dir = one.json.dir;
    assert.deepEqual(readdirSync(dir).sort(), ["panel.json", "panel.png", "panel@2x.json", "panel@2x.png"]);
    const img = decodePng(readFileSync(join(dir, "panel.png")));
    assert.equal(img.width, 128 + 12); assert.equal(img.height, 68 + 12, "상자 128×68 + 그림자 6px씩");
    assert.equal(px(img, 0, 0)[3], 0, "모서리 바깥(둥근 그림자 밖)은 투명");
    assert.deepEqual(px(img, 70, 40).slice(0, 3), [0x33, 0xaa, 0x66], "가운데는 패널 색");
    assert.equal(decodePng(readFileSync(join(dir, "panel@2x.png"))).width, 280, "2배는 다시 렌더");
    const j = JSON.parse(readFileSync(join(dir, "panel.json"), "utf8"));
    assert.equal(j.meta.image, "panel.png"); assert.equal(j.meta.webd.source.target.label, "div.panel");
    assert.deepEqual(j.meta.webd.source.box, { x: 6, y: 6, w: 128, h: 68 });

    // 9-slice 최소 크기 + 틀만 찍기: 인셋 14 → 상자 14+14+4 = 32
    const nine = await req(srv.port, "POST", path, { headers: T, body: {
      spec: { name: "panel", target: { kind: "element", path: [1, 0] }, scales: [1], bounds: "box",
        slice: { mode: "nine", insets: { l: 14, t: 14, r: 14, b: 14 }, size: "compact", frameOnly: true } }, write: true } });
    assert.equal(nine.status, 200, nine.text);
    const n = decodePng(readFileSync(join(dir, "panel.png")));
    assert.equal(n.width, 32); assert.equal(n.height, 32);
    assert.ok(existsSync(join(dir, ".previous", "panel.png")), "이전 결과 보관");
    const nj = JSON.parse(readFileSync(join(dir, "panel.json"), "utf8"));
    assert.deepEqual(nj.meta.slices[0].keys[0].center, { x: 14, y: 14, w: 4, h: 4 });
    assert.deepEqual(nj.meta.webd.engines.unity.vector4, [14, 14, 14, 14]);
    const saved = JSON.parse(readFileSync(join(lib, id, "export.json"), "utf8"));
    assert.equal(saved.lastExport.files.length, 2);

    // 틀만 찍기: 틀이 자식 요소(판 span)여도 남고, 글자·글자만 품은 상자(제목 칸, 구분선 목록)는 숨김.
    // 장식을 품은 요소(.k 안의 .dot)는 상자째 남기고 글자만 투명하게.
    const FRAME = `<!doctype html><html><head><style>html,body{margin:0;background:#202020}
.d{position:absolute;left:20px;top:20px;width:100px;height:60px}
.f{position:absolute;inset:0;background:#3a6}
.t{position:absolute;left:10px;top:8px;width:30px;height:12px;margin:0;background:#f00;font:10px sans-serif}
.l{position:absolute;left:50px;top:30px;width:40px;height:20px;margin:0;padding:0;list-style:none;border-top:4px solid #00f}
.k{position:absolute;left:10px;top:38px;width:30px;height:16px;background:#ff0;color:#000;font:12px sans-serif}
.dot{position:absolute;left:0;top:0;width:6px;height:16px;background:#fff}
</style></head><body><div class="d"><span class="f"></span><h2 class="t">제목</h2><ul class="l"><li>항목</li></ul><b class="k">글자<i class="dot"></i></b></div></body></html>`;
    const fo = await req(srv.port, "POST", path, { headers: T, body: { html: FRAME, write: false, spec: { name: "frame", target: { kind: "element", path: [1, 0] }, bounds: "box",
      slice: { mode: "nine", insets: { l: 10, t: 10, r: 10, b: 10 }, size: "original", frameOnly: true } } } });
    assert.equal(fo.status, 200, fo.text);
    const fi = decodePng(Buffer.from(fo.json.previews[0].url.split(",")[1], "base64"));
    assert.equal(fi.width, 100);
    assert.deepEqual(px(fi, 3, 3).slice(0, 3), [0x33, 0xaa, 0x66], "자식 요소로 그린 판은 남음");
    assert.deepEqual(px(fi, 25, 14).slice(0, 3), [0x33, 0xaa, 0x66], "글자만 품은 제목 칸은 상자째 숨김");
    assert.deepEqual(px(fi, 70, 31).slice(0, 3), [0x33, 0xaa, 0x66], "글자만 품은 목록의 구분선도 숨김");
    assert.deepEqual(px(fi, 3 + 10, 46).slice(0, 3), [255, 255, 255], "장식(.dot)은 남음");
    const kRow = Array.from({ length: 22 }, (_, i) => px(fi, 17 + i, 46).slice(0, 3).join());
    assert.ok(kRow.every((c) => c === "255,255,0"), "장식을 품은 상자는 남고 글자는 투명: " + [...new Set(kRow)]);

    // 미리보기는 파일을 쓰지 않고 data URL만
    const before = readFileSync(join(dir, "panel.png"));
    const pv = await req(srv.port, "POST", path, { headers: T, body: { spec: { name: "panel" }, write: false, html: PANEL.replace("#3a6", "#36a") } });
    assert.equal(pv.status, 200, pv.text);
    assert.match(pv.json.previews[0].url, /^data:image\/png;base64,/);
    assert.ok(readFileSync(join(dir, "panel.png")).equals(before), "미리보기는 파일을 안 건드림");

    // 없는 요소는 409
    const bad = await req(srv.port, "POST", path, { headers: T, body: { spec: { target: { kind: "element", path: [1, 9] } }, write: false } });
    assert.equal(bad.status, 409);
  } finally { await srv.close(); }
});
