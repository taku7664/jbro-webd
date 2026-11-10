// atlas.mjs — 묶음 시트(아틀라스). 라이브러리 컴포넌트 여러 개를 각자의 내보내기 설정(export.json) 그대로 찍어,
// MaxRects로 빈틈을 채워 한 장(넘치면 여러 장)에 모은다. 설계: docs/EXPORT-DESIGN.md "묶음 시트".
//
// 묶음 정의: <라이브러리>/.atlases/<이름>.json
//   { version, name, members: [id…], maxSize, pot, padding, extrude, trim, scales, data, dir }
// 출력: <내보내기 루트>/atlases/<이름>/<이름>[-2…][@2x].png + 같은 이름 .json
//   JSON은 Aseprite 호환(frames·meta.frameTags)이고, 컴포넌트별 정보(상태·9-slice 인셋·엔진 값·애니메이션)는 meta.webd.members에.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { encodePng, createImage } from "./png.mjs";
import { packBest, blit, extrude, nextPow2, alphaBounds, crop } from "./pack.mjs";
import { captureStates, stateCells } from "./run.mjs";
import { normalizeSpec, defaultSpec, expandFrames, scaleSuffix, safeName, SCALES, defaultExportRoot } from "./spec.mjs";
import { APP, FORMAT_VERSION, engineValues, centerRect } from "./formats.mjs";

export const MAX_SIZES = [512, 1024, 2048, 4096];
const DATA = ["aseprite-hash", "aseprite-array"];

export function atlasDir(lib) { return join(lib, ".atlases"); }
const atlasPath = (lib, name) => join(atlasDir(lib), `${name}.json`);

export function defaultAtlas(name = "atlas") {
  return { version: 1, name: safeName(name), members: [], maxSize: 2048, pot: false, padding: 2, extrude: 0, trim: true, scales: [1, 2], data: "aseprite-hash", dir: "" };
}

/** 묶음 정의 검증. 모르는 값은 기본으로 돌리고 경고를 남긴다. */
export function normalizeAtlas(input, { exists = () => true } = {}) {
  const s = input && typeof input === "object" ? input : {};
  const d = defaultAtlas(s.name);
  const warnings = [];
  const out = { ...d };
  if (s.name != null && out.name !== String(s.name)) warnings.push(`묶음 이름을 "${out.name}"으로 고쳤습니다.`);
  const ids = Array.isArray(s.members) ? [...new Set(s.members.map(String))] : [];
  out.members = ids.filter((id) => {
    const ok = !/[\\/]/.test(id) && !id.startsWith(".") && exists(id);
    if (!ok) warnings.push(`없는 컴포넌트를 뺐습니다: ${id}`);
    return ok;
  }).slice(0, 200);
  out.maxSize = MAX_SIZES.includes(Number(s.maxSize)) ? Number(s.maxSize) : d.maxSize;
  out.pot = Boolean(s.pot);
  out.padding = clampInt(s.padding, 0, 16, d.padding);
  out.extrude = clampInt(s.extrude, 0, 4, d.extrude);
  out.trim = s.trim == null ? d.trim : Boolean(s.trim);
  if (Array.isArray(s.scales)) {
    const sc = [...new Set(s.scales.map(Number).filter((n) => SCALES.includes(n)))].sort((a, b) => a - b);
    out.scales = sc.length ? sc : d.scales;
  }
  out.data = DATA.includes(s.data) ? s.data : d.data;
  out.dir = typeof s.dir === "string" ? s.dir.trim() : "";
  if (s.lastExport && typeof s.lastExport === "object") out.lastExport = s.lastExport;
  return { atlas: out, warnings };
}

function clampInt(v, lo, hi, dflt) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }

export function listAtlases(lib) {
  const dir = atlasDir(lib);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().flatMap((f) => {
    try { return [normalizeAtlas(JSON.parse(readFileSync(join(dir, f), "utf8"))).atlas]; } catch { return []; }
  });
}
export function readAtlas(lib, name) {
  const p = atlasPath(lib, safeName(name));
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}
export function writeAtlas(lib, atlas) {
  mkdirSync(atlasDir(lib), { recursive: true });
  writeFileSync(atlasPath(lib, atlas.name), JSON.stringify(atlas, null, 2) + "\n");
}
export function removeAtlas(lib, name) { rmSync(atlasPath(lib, safeName(name)), { force: true }); }
export function atlasOutputDir(atlas, lib, env = process.env) {
  return atlas.dir ? resolve(atlas.dir) : join(defaultExportRoot(lib, env), "atlases", atlas.name);
}

/** 컴포넌트 하나의 내보내기 설정(export.json, 없으면 기본). 묶음에서는 배율·출력만 묶음 설정을 따른다. */
export function memberSpec(lib, id) {
  const p = join(lib, id, "export.json");
  if (existsSync(p)) { try { return normalizeSpec(JSON.parse(readFileSync(p, "utf8")), id).spec; } catch {} }
  return defaultSpec(id);
}

/**
 * 묶음 시트를 만든다(파일로 쓰지는 않음 — writeExport로 씀).
 * @param {object} o
 * @param {(job) => Promise<object>} o.capture
 * @param {object} o.atlas                 정규화된 묶음 정의
 * @param {(id) => { url, spec, meta }} o.member   컴포넌트 렌더 주소·설정·메타
 * @param {number[]} [o.scales]            미리보기면 배율 하나만
 */
export async function buildAtlas({ capture, atlas, member, scales = atlas.scales }) {
  if (!atlas.members.length) { const e = new Error("묶음에 컴포넌트가 없습니다."); e.status = 400; throw e; }
  const warnings = new Set();
  const members = atlas.members.map((id) => ({ id, ...member(id) }));
  // 프레임 이름이 겹치면(같은 내보내기 이름) 뒤쪽에 id를 붙인다
  const seen = new Set();
  for (const m of members) { m.name = seen.has(m.spec.name) ? `${m.spec.name}~${m.id}` : m.spec.name; seen.add(m.spec.name); }
  const keptStates = new Map();   // 기본과 같아서 뺀 상태는 첫 배율에서 정하고 다른 배율에도 같게
  const files = [], previews = [];
  for (const scale of scales) {
    const cells = [], infos = [];
    for (const m of members) {
      const spec = { ...m.spec, scales: [scale] };
      const animate = spec.animation?.enabled ? spec.animation : null;
      const frameMs = animate ? Math.round(1000 / animate.fps) : 100;
      const w = new Set();
      const shots = await captureStates({ capture, url: m.url, spec, viewport: m.meta.viewport, scale, states: keptStates.get(m.id) ?? expandFrames(spec), animate, warnings: w });
      if (!keptStates.has(m.id)) keptStates.set(m.id, shots.map(({ shot, ...st }) => st));
      for (const x of w) warnings.add(`${m.meta.name}: ${x}`);
      const insets = shots[0].shot.insets;
      // 9·3-slice는 다듬지 않는다(인셋이 칸 가장자리 기준이라 잘라 내면 엔진의 늘림 자리가 어긋남)
      const mine = shots.flatMap((s) => stateCells(m.name, s, shots.length > 1, frameMs)).map((c) => ({ ...c, member: m.id, noTrim: Boolean(insets) }));
      const anim = shots.filter((s) => s.shot.frames.length > 1).map((s) => ({ key: s.state, frames: s.shot.frames.length, length: Math.round(s.shot.anim?.length || 0), names: s.shot.anim?.names || [] }));
      infos.push({
        id: m.id, name: m.meta.name, exportName: m.name, version: m.meta.versions, spec,
        states: shots.length > 1 ? shots.map((s) => ({ key: s.state, label: s.label })) : null,
        animation: anim.length ? { fps: animate.fps, frameDuration: frameMs, states: anim } : null,
        insets, box: shots[0].shot.box, target: { ...spec.target, label: shots[0].shot.label },
      });
      cells.push(...mine);
    }
    const pages = packAtlas(cells, atlas, scale);
    pages.forEach((pg, n) => {
      const stem = `${atlas.name}${pages.length > 1 ? `-${n + 1}` : ""}`;
      const png = `${stem}${scaleSuffix(scale)}.png`;
      const data = atlasData({ atlas, page: pg, pageIndex: n, pageCount: pages.length, png, scale, infos, warnings: [...warnings] });
      files.push({ name: png, kind: "png", scale, size: { w: pg.image.width, h: pg.image.height }, bytes: encodePng(pg.image) });
      files.push({ name: png.replace(/\.png$/, ".json"), kind: "json", scale, bytes: Buffer.from(JSON.stringify(data, null, 2) + "\n") });
      previews.push({ scale, png, page: n, size: { w: pg.image.width, h: pg.image.height }, frames: pg.cells.length, members: [...new Set(pg.cells.map((c) => c.member))] });
    });
  }
  return { files, previews, warnings: [...warnings] };
}

/**
 * 칸들을 판에 놓는다. 칸마다 돌출(extrude)을 두르고 오른쪽·아래로 간격(padding)을 둔 크기로 배치한 뒤,
 * 실제 쓴 범위로 판 크기를 줄인다(2의 거듭제곱이면 올림). 반환: [{ image, cells: [{ ...cell, frame:{x,y,w,h} }] }]
 */
export function packAtlas(cellsIn, { maxSize, padding, extrude: ex, pot, trim = true }, scale = 1) {
  const max = maxSize;   // 최대 크기는 배율과 관계없이 텍스처 픽셀 기준
  // 다듬기(trim): 투명 여백을 잘라 넣고, 원래 칸 안 자리는 spriteSourceSize로 남긴다(기준점이 그대로 유지됨)
  const cells = cellsIn.map((c) => {
    const src = { w: c.image.width, h: c.image.height };
    const b = trim && !c.noTrim ? alphaBounds(c.image) ?? { x: 0, y: 0, w: 1, h: 1 } : { x: 0, y: 0, ...src };
    const image = b.w === src.w && b.h === src.h ? c.image : crop(c.image, b);
    return { ...c, image, sourceSize: src, spriteSourceSize: { x: b.x, y: b.y, w: b.w, h: b.h } };
  });
  const sizes = cells.map((c) => ({ w: c.image.width + ex * 2 + padding, h: c.image.height + ex * 2 + padding }));
  const pages = packBest(sizes, { max, pot, pad: padding });
  return pages.map((pg) => {
    let W = Math.max(1, pg.w - padding), H = Math.max(1, pg.h - padding);
    if (pot) { W = Math.min(max, nextPow2(W)); H = Math.min(max, nextPow2(H)); }
    const image = createImage(W, H);
    // 원래 순서(컴포넌트 → 상태 → 프레임)대로 적어야 frameTags 범위가 이어진다
    const placed = [...pg.items].sort((a, b) => a.i - b.i).map(({ i, x, y }) => {
      const c = cells[i];
      blit(image, extrude(c.image, ex), x, y);
      return { ...c, frame: { x: x + ex, y: y + ex, w: c.image.width, h: c.image.height } };
    });
    return { image, cells: placed };
  });
}

/** 판 하나의 JSON(Aseprite 호환 + meta.webd.members) */
function atlasData({ atlas, page, pageIndex, pageCount, png, scale, infos, warnings }) {
  const entry = (c) => ({
    frame: { ...c.frame }, rotated: false,
    trimmed: c.spriteSourceSize.w !== c.sourceSize.w || c.spriteSourceSize.h !== c.sourceSize.h,
    spriteSourceSize: { ...c.spriteSourceSize }, sourceSize: { ...c.sourceSize }, duration: c.duration,
  });
  const frames = atlas.data === "aseprite-array"
    ? page.cells.map((c) => ({ filename: c.filename, ...entry(c) }))
    : Object.fromEntries(page.cells.map((c) => [c.filename, entry(c)]));
  // 태그: 컴포넌트/상태마다 하나. 이름은 "내보내기이름/상태"
  const frameTags = [];
  page.cells.forEach((c, i) => {
    const info = infos.find((m) => m.id === c.member);
    const name = info.states ? `${info.exportName}/${c.state}` : info.exportName;
    const last = frameTags[frameTags.length - 1];
    if (last && last.name === name) last.to = i;
    else frameTags.push({ name, from: i, to: i, direction: "forward" });
  });
  const here = new Set(page.cells.map((c) => c.member));
  const members = infos.filter((m) => here.has(m.id)).map((m) => {
    const own = page.cells.filter((c) => c.member === m.id);
    const insets = m.insets;
    return {
      id: m.id, name: m.name, exportName: m.exportName, version: m.version, target: m.target,
      frames: own.map((c) => c.filename),
      states: m.states, animation: m.animation,
      box: m.box,   // 프레임 안에서 컴포넌트(대상) 상자 자리 — 다른 컴포넌트와 겹쳐 놓을 때 기준
      slice: insets ? { mode: m.spec.slice.mode, fill: m.spec.slice.fill, insets: { ...insets }, insetsCss: { ...m.spec.slice.insets } } : null,
      engines: insets ? engineValues(m.spec, insets, png, scale) : null,
    };
  });
  // 9·3-slice 컴포넌트는 Aseprite slices에도 적는다(그 컴포넌트의 이 판 첫 프레임 기준)
  const slices = members.filter((m) => m.slice).map((m) => {
    const at = page.cells.findIndex((c) => c.member === m.id), src = page.cells[at].sourceSize;
    return { name: m.exportName, color: "#0000ffff", keys: [{ frame: at, bounds: { x: 0, y: 0, w: src.w, h: src.h }, center: centerRect(src, m.slice.insets) }] };
  });
  return {
    frames,
    meta: {
      app: APP, version: String(FORMAT_VERSION), image: png, format: "RGBA8888", size: { w: page.image.width, h: page.image.height }, scale: String(scale),
      frameTags, layers: [], slices,
      webd: {
        atlas: { name: atlas.name, page: pageIndex + 1, pages: pageCount, maxSize: atlas.maxSize, pot: atlas.pot, padding: atlas.padding, extrude: atlas.extrude },
        members,
        warnings,
      },
    },
  };
}
