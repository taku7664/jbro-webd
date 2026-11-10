// run.mjs — 사양 하나를 실제 파일 묶음(PNG + JSON)으로 만든다. 캡처 함수는 밖에서 받는다(서버가 브라우저를 재사용하도록).

import { mkdirSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng, createImage } from "./png.mjs";
import { packSheet, blit } from "./pack.mjs";
import { buildSheetData } from "./formats.mjs";
import { expandFrames, scaleSuffix } from "./spec.mjs";

/**
 * @param {object} o
 * @param {(job) => Promise<object>} o.capture   capture.mjs의 capture
 * @param {string} o.url                          렌더할 문서 주소
 * @param {object} o.spec                         정규화된 사양
 * @param {{width,height}} o.viewport
 * @param {object} o.source                       { id, name, version }
 * @param {string[]} [o.warnings]                 사양 정규화 경고
 * @returns {Promise<{ files: { name, bytes: Buffer, kind: "png"|"json", scale, size? }[], previews: object[], warnings: string[] }>}
 */
export async function buildExport({ capture, url, spec, viewport, source, warnings: specWarnings = [] }) {
  const all = expandFrames(spec);   // 상태 목록(기본 + 켠 상태). 애니메이션 프레임은 상태마다 페이지에서 길이를 재서 정한다
  const warnings = new Set(specWarnings);
  const files = [], previews = [];
  const animate = spec.animation?.enabled ? spec.animation : null;
  const frameMs = animate ? Math.round(1000 / animate.fps) : 100;
  let states = all;   // 기본과 같아서 뺀 상태는 첫 배율에서 정하고 다른 배율에도 똑같이 적용한다
  for (const scale of spec.scales) {
    const shots = [];
    for (const st of states) {
      let shot;
      try { shot = await capture({ url, spec, scale, viewport, state: st.tokens.length ? st.tokens : null, animate }); }
      catch (e) {
        if (st.state === "normal" || !e.status || e.status >= 500) throw e;   // 기본 상태 실패·브라우저 문제는 전체 실패
        warnings.add(`"${st.label}" 상태는 찍지 못해 뺐습니다: ${e.message}`);
        continue;
      }
      shot.warnings.forEach((w) => warnings.add(w));
      if (st.state !== "normal" && shots[0] && sameFrames(shot.frames, shots[0].shot.frames)) {
        warnings.add(`"${st.label}" 상태는 기본과 모습이 같아 뺐습니다.`);
        continue;
      }
      shots.push({ ...st, shot });
    }
    if (states === all) states = shots.map(({ shot, ...st }) => st);
    alignStates(shots);
    const normal = shots[0].shot;
    for (const s of shots.slice(1)) {
      if (s.shot.image.width !== normal.image.width || s.shot.image.height !== normal.image.height) {
        warnings.add(`"${s.label}" 상태는 크기가 기본과 다릅니다(${s.shot.image.width}×${s.shot.image.height}, 기본 ${normal.image.width}×${normal.image.height}). 엔진에서 상태를 바꿀 때 크기가 튈 수 있습니다.`);
      }
    }
    // 상태 × 프레임을 한 줄로 편다. 이름: 이름[_상태][_프레임번호]
    const many = shots.length > 1;
    const cellsOf = (s) => {
      const animated = s.shot.frames.length > 1;
      const stem = many ? `${spec.name}_${s.state}` : spec.name;
      return s.shot.frames.map((fr, j) => ({
        filename: animated ? `${stem}_${j}` : stem, state: s.state, label: s.label, image: fr.image,
        duration: animated ? frameMs : 100, time: fr.time,
      }));
    };
    const target = { ...spec.target, label: normal.label };
    const base = { id: source.id, name: source.name, version: source.version, target, scale };
    const frameData = (c, cell) => ({
      filename: c.filename, cell, duration: c.duration, state: c.state, label: c.label,
      sourceSize: { w: c.image.width, h: c.image.height },
      spriteSourceSize: { x: 0, y: 0, w: c.image.width, h: c.image.height },
    });
    const animInfo = (list) => {
      const per = list.filter((s) => s.shot.frames.length > 1).map((s) => ({ key: s.state, frames: s.shot.frames.length, length: Math.round(s.shot.anim?.length || 0), names: s.shot.anim?.names || [] }));
      return per.length ? { fps: animate.fps, frameDuration: frameMs, states: per } : null;
    };
    // 미리보기(편집기): 상태마다 프레임 그림 목록
    const previewStates = (list) => list.map((s) => ({ key: s.state, label: s.label, fps: animate?.fps ?? null, images: s.shot.frames.map((fr) => fr.image) }));
    const write = (list, stem) => {
      const cells = list.flatMap(cellsOf);
      const packed = cells.length === 1
        ? { image: cells[0].image, cells: [{ x: 0, y: 0, w: cells[0].image.width, h: cells[0].image.height }] }
        : packSheet(cells.map((c) => ({ image: c.image })), spec.output.sheet);
      const png = `${stem}${scaleSuffix(scale)}.png`;
      const data = buildSheetData({
        frames: cells.map((c, i) => frameData(c, packed.cells[i])), image: png,
        size: { w: packed.image.width, h: packed.image.height }, scale, spec, insets: list[0].shot.insets,
        source: { ...base, box: list[0].shot.box }, warnings: [...warnings], animation: animInfo(list),
      });
      files.push({ name: png, kind: "png", scale, size: { w: packed.image.width, h: packed.image.height }, bytes: encodePng(packed.image) });
      files.push({ name: png.replace(/\.png$/, ".json"), kind: "json", scale, bytes: Buffer.from(JSON.stringify(data, null, 2) + "\n") });
      previews.push({ scale, png, insets: list[0].shot.insets, size: { w: packed.image.width, h: packed.image.height }, box: list[0].shot.box, cssBox: list[0].shot.cssBox, frames: previewStates(list) });
    };
    const total = shots.reduce((n, s) => n + s.shot.frames.length, 0);
    if (spec.output.layout === "sheet" || shots.length === 1) write(shots, total > 1 ? `${spec.name}-sheet` : spec.name);
    else for (const s of shots) write([s], s.shot.frames.length > 1 ? `${spec.name}_${s.state}-sheet` : `${spec.name}_${s.state}`);
  }
  return { files, previews, warnings: [...warnings] };
}

/**
 * 상태마다 그려진 범위가 달라도(포커스 테두리가 밖으로 나옴, 누름에서 안쪽이 줄어듦) 칸 크기를 같게 맞춘다.
 * 요소 상자 크기가 모든 상태에서 같을 때만: 상자를 같은 자리에 두고, 사방으로 가장 많이 넘친 만큼씩 투명하게 덧붙인다.
 * 9-slice 인셋에도 덧붙인 만큼을 더한다. 상자 크기부터 다르면(상태가 레이아웃을 바꿈) 그대로 두고 경고에 맡긴다.
 */
function alignStates(shots) {
  if (shots.length < 2) return;
  const b0 = shots[0].shot.box;
  if (!shots.every((s) => s.shot.box.w === b0.w && s.shot.box.h === b0.h)) return;
  const ext = (s) => { const { box: b, image: im } = s.shot; return { l: b.x, t: b.y, r: im.width - b.x - b.w, b: im.height - b.y - b.h }; };
  const E = shots.map(ext).reduce((m, e) => ({ l: Math.max(m.l, e.l), t: Math.max(m.t, e.t), r: Math.max(m.r, e.r), b: Math.max(m.b, e.b) }));
  const W = E.l + b0.w + E.r, H = E.t + b0.h + E.b;
  for (const s of shots) {
    const e = ext(s), dx = E.l - e.l, dy = E.t - e.t;
    if (!dx && !dy && s.shot.image.width === W && s.shot.image.height === H) continue;
    const pad = (im) => { const out = createImage(W, H); blit(out, im, dx, dy); return out; };
    s.shot.frames = s.shot.frames.map((fr) => ({ ...fr, image: pad(fr.image) }));
    s.shot.image = s.shot.frames[0].image;
    s.shot.box = { x: E.l, y: E.t, w: b0.w, h: b0.h };
    if (s.shot.insets) {
      const i = s.shot.insets;
      s.shot.insets = { l: i.l && i.l + dx, t: i.t && i.t + dy, r: i.r && i.r + (E.r - e.r), b: i.b && i.b + (E.b - e.b) };
    }
  }
}

/** 프레임 묶음이 크기·픽셀까지 모두 같은가 */
function sameFrames(a, b) { return a.length === b.length && a.every((x, i) => sameImage(x.image, b[i].image)); }

/**
 * 폴더에 쓴다. 같은 이름의 이전 파일은 .previous/로 옮긴다(직전 한 벌만 보관).
 * 이번에 쓰지 않는 다른 파일은 건드리지 않는다.
 */
/** 크기·픽셀이 모두 같은가 */
function sameImage(a, b) { return a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength), Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)) === 0; }

export function writeExport(dir, files) {
  mkdirSync(dir, { recursive: true });
  const prev = join(dir, ".previous");
  const replacing = files.filter((f) => existsSync(join(dir, f.name)));
  if (replacing.length) {
    rmSync(prev, { recursive: true, force: true });
    mkdirSync(prev, { recursive: true });
    for (const f of replacing) renameSync(join(dir, f.name), join(prev, f.name));
  }
  for (const f of files) writeFileSync(join(dir, f.name), f.bytes);
  return files.map((f) => join(dir, f.name));
}
