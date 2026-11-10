// spec.mjs — 내보내기 사양(export.json)의 기본값·검증·프레임 펼치기·경로. 순수 함수(경로 계산만 파일 시스템을 읽음).
// 설계: docs/EXPORT-DESIGN.md 3절.

import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const SLICE_MODES = ["none", "nine", "three-h", "three-v"];
export const SCALES = [1, 2, 3, 4];
const NAME_BAD = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** 파일 이름으로 쓸 수 있게 다듬는다. 한글은 남긴다. */
export function safeName(s) {
  const out = String(s ?? "").normalize("NFC").replace(NAME_BAD, "-").replace(/\s+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
  return out || "sprite";
}

/** 조각 id에서 기본 이름: 앞의 날짜(20261110-)를 뗀다. */
export function defaultName(id) { return safeName(String(id).replace(/^\d{8}-/, "")); }

export function defaultSpec(id) {
  return {
    version: 1,
    name: defaultName(id),
    target: { kind: "root" },
    background: "transparent",
    bounds: "ink",
    scales: [1],
    slice: { mode: "none", insets: { l: 0, t: 0, r: 0, b: 0 }, fill: "stretch", frameOnly: true, size: "compact" },
    states: [{ name: "normal" }],
    animation: null,
    output: { dir: "", layout: "sheet", sheet: { type: "rows", columns: "auto", padding: 2, extrude: 0 }, data: "aseprite-hash" },
  };
}

const int = (v, lo, hi, fb) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fb; };
const pick = (v, list, fb) => (list.includes(v) ? v : fb);

/** 들어온 값을 검증해 완전한 사양으로 만든다. 고칠 수 없는 값은 오류. 고쳐 쓴 값은 warnings에 남긴다. */
export function normalizeSpec(input, id) {
  const d = defaultSpec(id);
  const s = input && typeof input === "object" ? input : {};
  const warnings = [];
  const out = structuredClone(d);
  if (s.name != null) { out.name = safeName(s.name); if (out.name !== String(s.name)) warnings.push(`파일 이름을 "${out.name}"으로 고쳤습니다.`); }
  if (s.target?.kind === "element") {
    if (!Array.isArray(s.target.path) || !s.target.path.every((n) => Number.isInteger(n) && n >= 0)) throw specError("대상 요소 경로가 잘못됐습니다.");
    out.target = { kind: "element", path: s.target.path.slice(0, 64), label: String(s.target.label ?? "").slice(0, 120) };
  }
  out.background = pick(s.background, ["transparent", "keep"], d.background);
  out.bounds = pick(s.bounds, ["ink", "box"], d.bounds);
  if (Array.isArray(s.scales)) {
    const sc = [...new Set(s.scales.map(Number).filter((n) => SCALES.includes(n)))].sort((a, b) => a - b);
    if (!sc.length) throw specError(`배율은 ${SCALES.join("·")} 중 하나 이상이어야 합니다.`);
    out.scales = sc;
  }
  const sl = s.slice ?? {};
  out.slice.mode = pick(sl.mode, SLICE_MODES, d.slice.mode);
  const ins = sl.insets ?? {};
  for (const k of ["l", "t", "r", "b"]) out.slice.insets[k] = int(ins[k], 0, 4096, 0);
  if (out.slice.mode === "three-h") { out.slice.insets.t = 0; out.slice.insets.b = 0; }
  if (out.slice.mode === "three-v") { out.slice.insets.l = 0; out.slice.insets.r = 0; }
  out.slice.fill = pick(sl.fill, ["stretch", "tile"], d.slice.fill);
  out.slice.frameOnly = sl.frameOnly == null ? d.slice.frameOnly : Boolean(sl.frameOnly);
  out.slice.size = pick(sl.size, ["compact", "original"], d.slice.size);
  if (out.slice.mode !== "none") {
    const { l, t, r, b } = out.slice.insets;
    const need = out.slice.mode === "three-h" ? l + r : out.slice.mode === "three-v" ? t + b : l + r + t + b;
    if (!need) warnings.push("인셋이 모두 0이면 모서리가 고정되지 않습니다. 인셋을 정하거나 'CSS에서 추정'을 누르세요.");
  }
  // 2·3단계 항목: 1단계에서는 기본 상태 하나, 애니메이션 없음만 받는다.
  if (Array.isArray(s.states) && s.states.length > 1) warnings.push("상태별 내보내기는 아직 지원하지 않아 기본 상태만 내보냅니다.");
  if (s.animation) warnings.push("애니메이션 내보내기는 아직 지원하지 않아 한 프레임만 내보냅니다.");
  const o = s.output ?? {};
  out.output.dir = typeof o.dir === "string" ? o.dir.trim().slice(0, 1024) : "";
  if (out.output.dir && !isAbsolute(out.output.dir)) throw specError("내보낼 폴더는 전체 경로로 적어 주세요(예: F:\\AI\\WebD\\export\\버튼).");
  out.output.layout = pick(o.layout, ["sheet", "files"], d.output.layout);
  const sh = o.sheet ?? {};
  out.output.sheet.type = pick(sh.type, ["rows", "horizontal", "vertical"], d.output.sheet.type);
  out.output.sheet.columns = sh.columns === "auto" || sh.columns == null ? "auto" : int(sh.columns, 1, 256, "auto");
  out.output.sheet.padding = int(sh.padding, 0, 64, d.output.sheet.padding);
  out.output.sheet.extrude = int(sh.extrude, 0, 16, 0);
  out.output.data = pick(o.data, ["aseprite-hash", "aseprite-array"], d.output.data);
  return { spec: out, warnings };
}

function specError(msg) { const e = new Error(msg); e.status = 400; return e; }

/** 내보낼 프레임 목록(배율 하나 기준). 1단계: 상태 하나 × 프레임 하나 */
export function expandFrames(spec) {
  const states = spec.states?.length ? spec.states.slice(0, 1) : [{ name: "normal" }];
  return states.map((st, i) => ({ index: i, state: st.name, time: 0, duration: 100, filename: frameName(spec, st.name, states.length) }));
}
function frameName(spec, state, count) { return count > 1 ? `${spec.name}_${state}` : spec.name; }

/** 배율에 붙는 파일 이름 꼬리: 1배는 없음, 2배는 @2x */
export const scaleSuffix = (scale) => (scale === 1 ? "" : `@${scale}x`);

/** 라이브러리의 실제 경로(연결을 푼 경로) 상위의 export 폴더. WEBD_EXPORT가 있으면 그것 */
export function defaultExportRoot(lib, env = process.env) {
  if (env.WEBD_EXPORT) return resolve(env.WEBD_EXPORT);
  let real = resolve(lib);
  try { real = realpathSync.native(real); } catch { /* 아직 없는 폴더 */ }
  return join(dirname(real), "export");
}

export function outputDir(spec, lib, id, env = process.env) {
  return spec.output.dir ? resolve(spec.output.dir) : join(defaultExportRoot(lib, env), id);
}

/** 9-slice 인셋을 배율 픽셀로. 모드에 맞지 않는 축은 0 */
export function insetsPx(spec, scale) {
  const { mode, insets } = spec.slice;
  if (mode === "none") return null;
  const k = (v) => Math.round(v * scale);
  return {
    l: mode === "three-v" ? 0 : k(insets.l), r: mode === "three-v" ? 0 : k(insets.r),
    t: mode === "three-h" ? 0 : k(insets.t), b: mode === "three-h" ? 0 : k(insets.b),
  };
}
