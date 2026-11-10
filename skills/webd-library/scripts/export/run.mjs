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
  const frames = expandFrames(spec);
  const warnings = new Set(specWarnings);
  const files = [], previews = [];
  for (const scale of spec.scales) {
    const shots = [];
    for (const f of frames) {
      const shot = await capture({ url, spec, scale, viewport });
      shot.warnings.forEach((w) => warnings.add(w));
      shots.push({ ...f, shot });
    }
    const target = { ...spec.target, label: shots[0].shot.label };
    const base = { id: source.id, name: source.name, version: source.version, target, scale };
    const frameData = (f, cell) => ({
      filename: f.filename, cell, duration: f.duration,
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
      previews.push({ scale, png, insets, size: { w: packed.image.width, h: packed.image.height }, box: shots[0].shot.box, cssBox: shots[0].shot.cssBox });
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
        previews.push({ scale, png, insets: s.shot.insets, size: { w: s.shot.image.width, h: s.shot.image.height }, box: s.shot.box, cssBox: s.shot.cssBox });
      }
    }
  }
  return { files, previews, warnings: [...warnings] };
}

/**
 * 폴더에 쓴다. 같은 이름의 이전 파일은 .previous/로 옮긴다(직전 한 벌만 보관).
 * 이번에 쓰지 않는 다른 파일은 건드리지 않는다.
 */
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
