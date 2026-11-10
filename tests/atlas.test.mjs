// 묶음 시트(아틀라스): MaxRects 배치, 가장 작은 판 찾기, 묶음 정의 검증, 실제 브라우저로 여러 컴포넌트 묶기
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { decodePng, createImage } from "../skills/webd-library/scripts/export/png.mjs";
import { maxRects, packBest, nextPow2 } from "../skills/webd-library/scripts/export/pack.mjs";
import { normalizeAtlas, packAtlas, listAtlases, writeAtlas, readAtlas } from "../skills/webd-library/scripts/export/atlas.mjs";
import { save } from "../skills/webd-library/scripts/library.mjs";
import { startLibrary } from "../skills/webd-library/scripts/editor-server.mjs";
import { findBrowser } from "../skills/webd/scripts/render-check.mjs";

const work = mkdtempSync(join(tmpdir(), "webd-atlas-test-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("MaxRects: 겹치지 않고 판 안에 놓으며, 넘치면 다음 판으로", () => {
  const sizes = [[100, 50], [30, 30], [60, 120], [20, 10], [200, 20], [64, 64], [10, 90], [50, 50], [128, 16]].map(([w, h]) => ({ w, h }));
  const pages = maxRects(sizes, { maxW: 256, maxH: 256 });
  assert.equal(pages.length, 1);
  const r = pages[0].items.map((it) => ({ ...it, ...sizes[it.i] }));
  assert.equal(r.length, sizes.length);
  for (const a of r) assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 256 && a.y + a.h <= 256, "판 안");
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) assert.ok(!overlaps(r[i], r[j]), `겹침: ${i}·${j}`);
  assert.equal(pages[0].w, Math.max(...r.map((a) => a.x + a.w)), "판 크기는 실제 쓴 범위");
  const two = maxRects([{ w: 200, h: 200 }, { w: 200, h: 200 }, { w: 40, h: 40 }], { maxW: 256, maxH: 256 });
  assert.equal(two.length, 2);
  assert.equal(two.flatMap((p) => p.items).length, 3, "모든 칸이 어느 판에든 놓임");
  assert.throws(() => maxRects([{ w: 300, h: 10 }], { maxW: 256, maxH: 256 }), /최대 크기/);
});

test("packBest: 한 판에 들어가는 가장 작은 판을 고르고, pot면 2의 거듭제곱 변만", () => {
  const sizes = Array.from({ length: 16 }, () => ({ w: 30, h: 30 }));   // 넓이 14400 → 120×120 정도면 됨
  const [pg] = packBest(sizes, { max: 2048 });
  assert.ok(pg.w <= 128 && pg.h <= 128, `작은 판이어야 함: ${pg.w}×${pg.h}`);
  assert.equal(nextPow2(97), 128); assert.equal(nextPow2(128), 128);
  const big = Array.from({ length: 5 }, () => ({ w: 200, h: 200 }));
  assert.equal(packBest(big, { max: 256 }).length, 5, "최대에도 안 들어가면 최대 크기로 여러 판");
});

test("묶음 정의: 없는 컴포넌트를 빼고 값을 범위 안으로", () => {
  const { atlas, warnings } = normalizeAtlas({ name: "대화 UI", members: ["a", "a", "b", "../x", ".hidden"], maxSize: 3000, padding: 99, extrude: -1, scales: [2, 9, 1], pot: 1, trim: false }, { exists: (id) => id === "a" });
  assert.equal(atlas.name, "대화-UI");
  assert.deepEqual(atlas.members, ["a"]);
  assert.equal(atlas.maxSize, 2048, "허용 목록 밖이면 기본");
  assert.equal(atlas.padding, 16); assert.equal(atlas.extrude, 0);
  assert.deepEqual(atlas.scales, [1, 2]);
  assert.equal(atlas.pot, true); assert.equal(atlas.trim, false);
  assert.ok(warnings.some((w) => /없는 컴포넌트/.test(w)));
  const lib = mkdtempSync(join(work, "lib-"));
  writeAtlas(lib, atlas);
  assert.deepEqual(readAtlas(lib, "대화-UI").members, ["a"]);
  assert.deepEqual(listAtlases(lib).map((a) => a.name), ["대화-UI"]);
});

test("packAtlas: 투명 여백을 다듬고 원래 칸 안 자리를 남기며, 9-slice 칸은 다듬지 않는다", () => {
  const dot = createImage(20, 10); dot.data.set([255, 0, 0, 255], (4 * 20 + 6) * 4);   // (6,4)에 점 하나
  const frame = createImage(12, 12); frame.data.set([0, 0, 255, 255], (0 * 12 + 0) * 4);
  const cells = [
    { filename: "dot", image: dot, member: "a", state: "normal", duration: 100 },
    { filename: "frame", image: frame, member: "b", state: "normal", duration: 100, noTrim: true },
  ];
  const [pg] = packAtlas(cells, { maxSize: 256, padding: 2, extrude: 0, pot: false, trim: true });
  const d = pg.cells.find((c) => c.filename === "dot"), f = pg.cells.find((c) => c.filename === "frame");
  assert.deepEqual([d.frame.w, d.frame.h], [1, 1], "점 하나만 남김");
  assert.deepEqual(d.spriteSourceSize, { x: 6, y: 4, w: 1, h: 1 });
  assert.deepEqual(d.sourceSize, { w: 20, h: 10 });
  assert.deepEqual([f.frame.w, f.frame.h], [12, 12], "9-slice는 그대로");
  const i = (d.frame.y * pg.image.width + d.frame.x) * 4;
  assert.deepEqual([...pg.image.data.subarray(i, i + 4)], [255, 0, 0, 255], "판의 그 자리에 실제로 그려짐");
});

// ---------- 실제 브라우저 ----------

function req(port, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", ...headers } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, text, json }); });
    });
    r.on("error", reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

const PANEL = `<!doctype html><html><head><style>html,body{margin:0;background:#202020}
.panel{position:absolute;left:20px;top:20px;width:60px;height:40px;background:#3a6;border:4px solid #fff;border-radius:8px}</style></head>
<body><div class="panel"></div></body></html>`;
const CHIP = `<!doctype html><html><head><style>html,body{margin:0;background:#202020}
.chip{position:absolute;left:10px;top:10px;width:24px;height:24px;background:#888}.chip:hover{background:#e2c46a}</style></head>
<body><button class="chip" aria-label="칩"></button></body></html>`;

test("묶음 시트: 컴포넌트 여러 개를 각자 설정대로 찍어 한 장에 모은다(서버 경로)", { skip: findBrowser() ? false : "Chrome·Edge 없음" }, async () => {
  const lib = mkdtempSync(join(work, "srv-"));
  const put = (name, html, viewport) => { const p = join(work, `${name}-${Math.random()}.html`); writeFileSync(p, html); return save(lib, { file: p, name, category: "card", viewport }).meta.id; };
  const panel = put("패널", PANEL, "200x120"), chip = put("칩", CHIP, "100x60");
  // 패널은 9-slice, 칩은 상태(호버) 2개
  writeFileSync(join(lib, panel, "export.json"), JSON.stringify({ name: "panel", target: { kind: "element", path: [1, 0] }, bounds: "box", slice: { mode: "nine", insets: { l: 12, t: 12, r: 12, b: 12 }, size: "compact", frameOnly: true } }));
  writeFileSync(join(lib, chip, "export.json"), JSON.stringify({ name: "chip", target: { kind: "element", path: [1, 0] }, bounds: "box",
    states: [{ key: "hover", label: "호버", tokens: [{ kind: "pseudo", name: "hover", owners: [".chip"] }], include: true }] }));
  const prevEnv = process.env.WEBD_EXPORT; process.env.WEBD_EXPORT = join(work, "export-" + Math.random());
  const srv = await startLibrary({ lib, token: "a".repeat(32) });
  const T = { "x-webd-token": "a".repeat(32) };
  try {
    const s = await req(srv.port, "POST", "/atlas/ui", { headers: T, body: { atlas: { members: [panel, chip, "없음"], scales: [1], padding: 2 } } });
    assert.equal(s.status, 200, s.text);
    assert.deepEqual(s.json.atlas.members, [panel, chip]);
    assert.ok(existsSync(join(lib, ".atlases", "ui.json")), "정의는 라이브러리 .atlases/에");
    const bad = await req(srv.port, "POST", "/atlas/ui", { headers: { ...T, origin: "http://evil.example" }, body: { atlas: {} } });
    assert.equal(bad.status, 403, "다른 출처 거절");
    const noTok = await req(srv.port, "GET", "/atlas/");
    assert.equal(noTok.status, 403, "토큰 없으면 거절");

    const x = await req(srv.port, "POST", "/atlas/ui/export", { headers: T, body: { write: true } });
    assert.equal(x.status, 200, x.text);
    assert.deepEqual(x.json.files.map((f) => f.name).sort(), ["ui.json", "ui.png"]);
    const img = decodePng(readFileSync(join(x.json.dir, "ui.png")));
    const j = JSON.parse(readFileSync(join(x.json.dir, "ui.json"), "utf8"));
    assert.deepEqual(Object.keys(j.frames), ["panel", "chip_normal", "chip_hover"], "원래 순서(컴포넌트 → 상태)");
    assert.deepEqual(j.meta.frameTags.map((t) => t.name), ["panel", "chip/normal", "chip/hover"]);
    assert.deepEqual(j.meta.size, { w: img.width, h: img.height });
    const p = j.frames.panel;
    assert.deepEqual([p.frame.w, p.frame.h], [28, 28], "9-slice 최소 크기(12+12+4)로 찍고 다듬지 않음");
    assert.equal(j.meta.slices[0].name, "panel");
    assert.deepEqual(j.meta.slices[0].keys[0].center, { x: 12, y: 12, w: 4, h: 4 });
    const m = j.meta.webd.members;
    assert.deepEqual(m.map((x) => x.exportName), ["panel", "chip"]);
    assert.deepEqual(m[0].slice.insets, { l: 12, t: 12, r: 12, b: 12 });
    assert.deepEqual(m[1].states.map((s) => s.key), ["normal", "hover"]);
    // 칩 호버 칸은 금색
    const h = j.frames.chip_hover.frame, i = ((h.y + h.h / 2 | 0) * img.width + (h.x + h.w / 2 | 0)) * 4;
    assert.deepEqual([...img.data.subarray(i, i + 3)], [0xe2, 0xc4, 0x6a]);
    const list = await req(srv.port, "GET", "/atlas/", { headers: T });
    assert.ok(list.json.atlases[0].lastExport, "내보낸 기록 남김");
  } finally {
    await srv.close();
    if (prevEnv === undefined) delete process.env.WEBD_EXPORT; else process.env.WEBD_EXPORT = prevEnv;
  }
});
