// run.mjs — 사양 하나를 실제 파일 묶음(PNG + JSON)으로 만든다. 캡처 함수는 밖에서 받는다(서버가 브라우저를 재사용하도록).

import { mkdirSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { encodePng } from "./png.mjs";
import { packSheet } from "./pack.mjs";
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
  const all = expandFrames(spec);
  const warnings = new Set(specWarnings);
  const files = [], previews = [];
  let frames = all;   // 기본과 같아서 뺀 상태는 첫 배율에서 정하고 다른 배율에도 똑같이 적용한다
  for (const scale of spec.scales) {
    const shots = [];
    for (const f of frames) {
      let shot;
      try { shot = await capture({ url, spec, scale, viewport, state: f.tokens.length ? f.tokens : null }); }
      catch (e) {
        if (f.state === "normal" || !e.status || e.status >= 500) throw e;   // 기본 상태 실패·브라우저 문제는 전체 실패
        warnings.add(`"${f.label}" 상태는 찍지 못해 뺐습니다: ${e.message}`);
        continue;
      }
      shot.warnings.forEach((w) => warnings.add(w));
      if (f.state !== "normal" && shots[0] && sameImage(shot.image, shots[0].shot.image)) {
        warnings.add(`"${f.label}" 상태는 기본과 모습이 같아 뺐습니다.`);
        continue;
      }
      shots.push({ ...f, shot });
    }
    if (frames === all) frames = shots.map(({ shot, ...f }) => f);
    const normal = shots[0].shot;
    for (const s of shots.slice(1)) {
      if (s.shot.image.width !== normal.image.width || s.shot.image.height !== normal.image.height) {
        warnings.add(`"${s.label}" 상태는 크기가 기본과 다릅니다(${s.shot.image.width}×${s.shot.image.height}, 기본 ${normal.image.width}×${normal.image.height}). 엔진에서 상태를 바꿀 때 크기가 튈 수 있습니다.`);
      }
    }
    const frameList = shots.map((s) => ({ key: s.state, label: s.label, image: s.shot.image }));
    const target = { ...spec.target, label: shots[0].shot.label };
    const base = { id: source.id, name: source.name, version: source.version, target, scale };
    const frameData = (f, cell) => ({
      filename: f.filename, cell, duration: f.duration, state: f.state, label: f.label,
      sourceSize: { w: f.shot.image.width, h: f.shot.image.height },
      spriteSourceSize: { x: 0, y: 0, w: f.shot.image.width, h: f.shot.image.height },
    });
    const insets = shots[0].shot.insets;
    if (spec.output.layout === "sheet" || shots.length === 1) {
      const packed = shots.length === 1
        ? { image: shots[0].shot.image, cells: [{ x: 0, y: 0, w: shots[0].shot.image.width, h: shots[0].shot.image.height }] }
        : packSheet(shots.map((s) => ({ image: s.shot.image })), spec.output.sheet);
      const stem = `${spec.name}${shots.length > 1 ? "-sheet" : ""}${scaleSuffix(scale)}`;
      const png = `${stem}.png`;
      const data = buildSheetData({
        frames: shots.map((s, i) => frameData(s, packed.cells[i])), image: png,
        size: { w: packed.image.width, h: packed.image.height }, scale, spec, insets,
        source: { ...base, box: shots[0].shot.box }, warnings: [...warnings],
      });
      files.push({ name: png, kind: "png", scale, size: { w: packed.image.width, h: packed.image.height }, bytes: encodePng(packed.image) });
      files.push({ name: `${stem}.json`, kind: "json", scale, bytes: Buffer.from(JSON.stringify(data, null, 2) + "\n") });
      previews.push({ scale, png, insets, size: { w: packed.image.width, h: packed.image.height }, box: shots[0].shot.box, cssBox: shots[0].shot.cssBox, frames: frameList });
    } else {
      for (const s of shots) {
        const stem = `${s.filename}${scaleSuffix(scale)}`;
        const png = `${stem}.png`;
        const data = buildSheetData({
          frames: [frameData(s, { x: 0, y: 0, w: s.shot.image.width, h: s.shot.image.height })], image: png,
          size: { w: s.shot.image.width, h: s.shot.image.height }, scale, spec, insets: s.shot.insets,
          source: { ...base, box: s.shot.box }, warnings: [...warnings],
        });
        files.push({ name: png, kind: "png", scale, size: { w: s.shot.image.width, h: s.shot.image.height }, bytes: encodePng(s.shot.image) });
        files.push({ name: `${stem}.json`, kind: "json", scale, bytes: Buffer.from(JSON.stringify(data, null, 2) + "\n") });
        previews.push({ scale, png, insets: s.shot.insets, size: { w: s.shot.image.width, h: s.shot.image.height }, box: s.shot.box, cssBox: s.shot.cssBox, frames: frameList.filter((x) => x.key === s.state) });
      }
    }
  }
  return { files, previews, warnings: [...warnings] };
}

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
