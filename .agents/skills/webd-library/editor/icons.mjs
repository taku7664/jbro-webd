// icons.mjs — 편집기 도구 아이콘. 24 격자, 선 1.75, currentColor(테마 색을 그대로 따름).
// 기성 아이콘에 없는 것(9-slice·3-slice·배율·인셋 변 등)은 여기서 직접 그린다.
// 사용: icon("slice-nine") → <span class="ic"><svg>…</svg></span>

const A = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const SOFT = 'fill="currentColor" fill-opacity=".28" stroke="none"';
const GUIDE = 'stroke-width="1.25" stroke-opacity=".6"';

/** 배율 아이콘: 같은 칸을 n×n 픽셀로 나눈 격자. 배율이 클수록 촘촘하다. */
function scaleGrid(n) {
  const x0 = 4, s = 16, step = s / n;
  let lines = "";
  for (let i = 1; i < n; i++) {
    const p = +(x0 + step * i).toFixed(2);
    lines += `<path d="M${p} ${x0}V${x0 + s}M${x0} ${p}H${x0 + s}" stroke-width="1.25" />`;
  }
  // 1배는 칸 하나(가운데 점 = 픽셀 하나)
  const one = n === 1 ? `<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>` : "";
  return `<rect x="${x0}" y="${x0}" width="${s}" height="${s}" rx="1.5"/>${lines}${one}`;
}

/** 인셋 변 아이콘: 사각형의 한 변만 굵게 */
function side(which) {
  const d = { l: "M5 5V19", t: "M5 5H19", r: "M19 5V19", b: "M5 19H19" }[which];
  return `<rect x="5" y="5" width="14" height="14" rx="1" stroke-opacity=".38"/><path d="${d}" stroke-width="3.25"/>`;
}

const P = {
  // 자르기
  "slice-none": `<rect x="4" y="4" width="16" height="16" rx="2"/>`,
  "slice-nine": `<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9 3.5V20.5M15 3.5V20.5M3.5 9H20.5M3.5 15H20.5" ${GUIDE}/><rect x="9" y="9" width="6" height="6" ${SOFT}/>`,
  "slice-three-h": `<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M8 7V17M16 7V17" ${GUIDE}/><rect x="8" y="7" width="8" height="10" ${SOFT}/>`,
  "slice-three-v": `<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M7 8H17M7 16H17" ${GUIDE}/><rect x="7" y="8" width="10" height="8" ${SOFT}/>`,
  // 배율
  "scale-1": scaleGrid(1), "scale-2": scaleGrid(2), "scale-3": scaleGrid(3), "scale-4": scaleGrid(4),
  // 애니메이션
  film: `<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7.5 4V20M16.5 4V20M3.5 8H7.5M3.5 12H7.5M3.5 16H7.5M16.5 8H20.5M16.5 12H20.5M16.5 16H20.5"/>`,
  // 인셋
  "side-l": side("l"), "side-t": side("t"), "side-r": side("r"), "side-b": side("b"),
  wand: `<path d="M4 20L15 9"/><path d="M13 7L17 11"/><path d="M18 3V6M16.5 4.5H19.5M20 12V14M19 13H21M10 3V5M9 4H11"/>`,
  // 가운데
  "fill-stretch": `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12H17M9.5 9.5L7 12L9.5 14.5M14.5 9.5L17 12L14.5 14.5"/>`,
  "fill-tile": `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5V19M15 5V19" stroke-opacity=".5"/><circle cx="6" cy="12" r="1.25" fill="currentColor"/><circle cx="12" cy="12" r="1.25" fill="currentColor"/><circle cx="18" cy="12" r="1.25" fill="currentColor"/>`,
  // 크기
  "size-compact": `<rect x="8.5" y="8.5" width="7" height="7" rx="1"/><path d="M3.5 3.5L7 7M20.5 3.5L17 7M3.5 20.5L7 17M20.5 20.5L17 17M7 4.5V7H4.5M17 4.5V7H19.5M7 19.5V17H4.5M17 19.5V17H19.5"/>`,
  "size-original": `<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7 9.5L8.5 8V16M15.5 9.5L17 8V16" stroke-width="1.5"/><circle cx="12" cy="10.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="14" r=".9" fill="currentColor" stroke="none"/>`,
  // 내용: 틀만(가운데 글자 자리가 비어 있음)
  "frame-only": `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7.5 10H16.5M7.5 14H13" stroke-dasharray="1.5 2.5" stroke-opacity=".55"/>`,
  // 대상
  "target-root": `<path d="M3.5 8V5.5A2 2 0 0 1 5.5 3.5H8M16 3.5H18.5A2 2 0 0 1 20.5 5.5V8M20.5 16V18.5A2 2 0 0 1 18.5 20.5H16M8 20.5H5.5A2 2 0 0 1 3.5 18.5V16"/><rect x="7.5" y="7.5" width="9" height="9" rx="1" ${SOFT}/>`,
  "target-element": `<rect x="3.5" y="3.5" width="12" height="12" rx="1.5" stroke-dasharray="3 2.5"/><path d="M12 12L20 15L16.5 16.5L15 20Z" fill="currentColor"/>`,
  // 배경
  "bg-transparent": `<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 4H12V12H4ZM12 12H20V20H12Z" ${SOFT}/>`,
  "bg-keep": `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".55"/>`,
  // 범위
  "bounds-ink": `<path d="M12 6L17.5 12L12 18L6.5 12Z" ${SOFT}/><path d="M12 6L17.5 12L12 18L6.5 12Z"/><path d="M5 8.5V5H8.5M15.5 5H19V8.5M19 15.5V19H15.5M8.5 19H5V15.5" stroke-width="1.5"/>`,
  "bounds-box": `<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 8.5L15.5 12L12 15.5L8.5 12Z" ${SOFT}/><path d="M12 8.5L15.5 12L12 15.5L8.5 12Z"/>`,
  // 형태
  "layout-sheet": `<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M12 3.5V20.5M3.5 12H20.5"/>`,
  "layout-files": `<rect x="8" y="3" width="12" height="14" rx="1.5"/><path d="M5 6.5V19A2 2 0 0 0 7 21H15.5" stroke-opacity=".7"/>`,
  // 상태
  "state-base": `<rect x="4" y="7" width="16" height="10" rx="2"/>`,
  // 출력
  file: `<path d="M14 3H7A2 2 0 0 0 5 5V19A2 2 0 0 0 7 21H17A2 2 0 0 0 19 19V8Z"/><path d="M14 3V8H19"/>`,
  folder: `<path d="M3.5 7A2 2 0 0 1 5.5 5H9.5L11.5 7.5H18.5A2 2 0 0 1 20.5 9.5V17A2 2 0 0 1 18.5 19H5.5A2 2 0 0 1 3.5 17Z"/>`,
  "folder-open": `<path d="M3.5 17V7A2 2 0 0 1 5.5 5H9.5L11.5 7.5H17A2 2 0 0 1 19 9.5V11"/><path d="M3.5 17L6.2 11.8A1.5 1.5 0 0 1 7.5 11H20A1 1 0 0 1 20.9 12.4L18.4 17.9A2 2 0 0 1 16.6 19H5.5A2 2 0 0 1 3.5 17Z"/>`,
  reset: `<path d="M4 12A8 8 0 1 0 6.3 6.3"/><path d="M4 4V8H8"/>`,
  download: `<path d="M12 4V15M7.5 10.5L12 15L16.5 10.5"/><path d="M4 16V18.5A1.5 1.5 0 0 0 5.5 20H18.5A1.5 1.5 0 0 0 20 18.5V16"/>`,
  check: `<path d="M5 12.5L10 17.5L19 7"/>`,
  // 구역 머리
  "sec-kind": `<path d="M6 4V20M18 4V20M4 6H20M4 18H20" stroke-opacity=".9"/>`,
  "sec-target": `<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5"/>`,
  "sec-output": `<path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5Z"/><path d="M4 7.5L12 12L20 7.5M12 12V21"/>`,
  "sec-result": `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.75"/><path d="M20.5 16L15.5 11L6 19.5"/>`,
  // 결과 칸
  stretch: `<path d="M14 4H20V10M10 20H4V14M20 4L13 11M4 20L11 13"/>`,
  zoom: `<circle cx="11" cy="11" r="6.5"/><path d="M16 16L20.5 20.5M8.5 11H13.5M11 8.5V13.5"/>`,
  spinner: `<path d="M12 3.5A8.5 8.5 0 1 1 3.5 12" />`,
  dot: `<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>`,
  warn: `<path d="M12 4L21 19.5H3Z"/><path d="M12 10V14M12 17V17.01"/>`,
  info: `<circle cx="12" cy="12" r="8.5"/><path d="M12 11V16.5M12 7.75V7.76"/>`,

  // ---------- 편집기 상단 ----------
  "arrow-left": `<path d="M19 12H5M11 6L5 12L11 18"/>`,
  viewport: `<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20H15M12 16.5V20"/>`,
  pick: `<path d="M5 4L11 19L13.2 12.8L19.5 10.6Z" fill="currentColor" fill-opacity=".18"/><path d="M5 4L11 19L13.2 12.8L19.5 10.6Z"/>`,
  spacing: `<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><rect x="8" y="8" width="8" height="8" rx="1" ${SOFT}/><path d="M12 3.5V8M12 16V20.5M3.5 12H8M16 12H20.5" stroke-width="1.25" stroke-opacity=".7"/>`,
  undo: `<path d="M9 14L4 9L9 4"/><path d="M4 9H14.5A5.5 5.5 0 0 1 14.5 20H11"/>`,
  redo: `<path d="M15 14L20 9L15 4"/><path d="M20 9H9.5A5.5 5.5 0 0 0 9.5 20H13"/>`,
  save: `<path d="M5 4H16L20 8V18.5A1.5 1.5 0 0 1 18.5 20H5.5A1.5 1.5 0 0 1 4 18.5V5.5A1.5 1.5 0 0 1 5.5 4Z"/><path d="M8 4V9H15V4M7.5 20V14H16.5V20"/>`,
  // ---------- 계층·타임라인 ----------
  plus: `<path d="M12 5V19M5 12H19"/>`,
  minus: `<path d="M5 12H19"/>`,
  "chevron-right": `<path d="M10 7L15 12L10 17"/>`,
  "chevron-down": `<path d="M7 10L12 15L17 10"/>`,
  play: `<path d="M8 5.5V18.5L18.5 12Z" fill="currentColor"/>`,
  pause: `<path d="M8 5.5V18.5M16 5.5V18.5" stroke-width="3"/>`,
  // ---------- 스타일 탭 ----------
  token: `<path d="M12 3.5C12 3.5 6 10 6 14A6 6 0 0 0 18 14C18 10 12 3.5 12 3.5Z"/><path d="M9.5 14.5A2.5 2.5 0 0 0 12 17" stroke-opacity=".6"/>`,
  rules: `<path d="M8 4H7A2 2 0 0 0 5 6V10L3.5 12L5 14V18A2 2 0 0 0 7 20H8M16 4H17A2 2 0 0 1 19 6V10L20.5 12L19 14V18A2 2 0 0 1 17 20H16"/><path d="M9.5 9H14.5M9.5 12H14.5M9.5 15H12.5" stroke-width="1.5"/>`,
  text: `<path d="M5 6V4.5H19V6M12 4.5V19.5M9 19.5H15"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5A4 4 0 0 1 16 7.5V10.5"/>`,
  // ---------- 목록 ----------
  search: `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/>`,
  tag: `<path d="M3.5 12.5V4.5A1 1 0 0 1 4.5 3.5H12.5L20.5 11.5L11.5 20.5Z"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10H20.5M8 3V7M16 3V7"/>`,
  sort: `<path d="M7 4V20M3.5 16.5L7 20L10.5 16.5M17 20V4M13.5 7.5L17 4L20.5 7.5"/>`,
  edit: `<path d="M4 20H8L19 9L15 5L4 16Z"/><path d="M13 7L17 11"/>`,
  code: `<path d="M8.5 7L3.5 12L8.5 17M15.5 7L20.5 12L15.5 17"/>`,
  hash: `<path d="M9.5 4L7.5 20M16.5 4L14.5 20M4.5 9H20M4 15H19.5"/>`,
  external: `<path d="M14 4H20V10M20 4L11 13"/><path d="M18 14V18.5A1.5 1.5 0 0 1 16.5 20H5.5A1.5 1.5 0 0 1 4 18.5V7.5A1.5 1.5 0 0 1 5.5 6H10"/>`,
  layers: `<path d="M12 3.5L21 8.5L12 13.5L3 8.5Z"/><path d="M3 12.5L12 17.5L21 12.5M3 16.5L12 21.5L21 16.5" stroke-opacity=".65"/>`,
  eye: `<path d="M2.5 12C4.5 7.5 8 5.5 12 5.5S19.5 7.5 21.5 12C19.5 16.5 16 18.5 12 18.5S4.5 16.5 2.5 12Z"/><circle cx="12" cy="12" r="3"/>`,
  clear: `<path d="M6 6L18 18M18 6L6 18"/>`,
  pot: `<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M12 3.5V20.5M3.5 12H20.5M7.75 3.5V12M3.5 7.75H12" stroke-opacity=".55" stroke-width="1.25"/>`,
  trim: `<path d="M6 3V18H21M3 6H18V21"/><rect x="9" y="9" width="6" height="6" ${SOFT}/>`,
  "bg-neutral": `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="3.5"/>`,
  "bg-original": `<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".55"/><circle cx="12" cy="12" r="3.5" fill="none"/>`,
  "folder-plus": `<path d="M3.5 7A2 2 0 0 1 5.5 5H9.5L11.5 7.5H18.5A2 2 0 0 1 20.5 9.5V17A2 2 0 0 1 18.5 19H5.5A2 2 0 0 1 3.5 17Z"/><path d="M12 10.5V15.5M9.5 13H14.5"/>`,
  "folder-move": `<path d="M3.5 7A2 2 0 0 1 5.5 5H9.5L11.5 7.5H18.5A2 2 0 0 1 20.5 9.5V17A2 2 0 0 1 18.5 19H5.5A2 2 0 0 1 3.5 17Z"/><path d="M8.5 13H15M12.5 10.5L15 13L12.5 15.5"/>`,
  trash: `<path d="M4 7H20M9.5 7V4.5H14.5V7M6 7L7 20H17L18 7"/><path d="M10 11V16.5M14 11V16.5" stroke-opacity=".7"/>`,
  inbox: `<path d="M3.5 13.5L6 5.5H18L20.5 13.5V18.5A1.5 1.5 0 0 1 19 20H5A1.5 1.5 0 0 1 3.5 18.5Z"/><path d="M3.5 13.5H8.5L10 15.5H14L15.5 13.5H20.5"/>`,
  library: `<rect x="3.5" y="4" width="4" height="16" rx="1"/><rect x="9.5" y="4" width="4" height="16" rx="1"/><path d="M15.5 5.2L19.3 4.2L22 18.8L18.2 19.8Z"/>`,
  select: `<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5L11 15.5L16.5 9" stroke-width="2"/>`,
  "eye-off": `<path d="M4 4L20 20"/><path d="M10.6 6.2A8.6 8.6 0 0 1 12 6C16 6 19.5 8 21.5 12C20.9 13.3 20.1 14.4 19.2 15.3M15.9 17.1C14.7 17.7 13.4 18 12 18C8 18 4.5 16 2.5 12C3.4 10.1 4.6 8.7 6.1 7.6"/><path d="M10 10A3 3 0 0 0 14 14"/>`,
  "panel-float": `<rect x="3.5" y="5.5" width="13" height="13" rx="1.5" stroke-opacity=".55"/><rect x="8" y="3" width="13" height="11" rx="1.5" fill="currentColor" fill-opacity=".18"/><path d="M8 6.5H21"/>`,
  "panel-dock": `<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M14.5 4V20"/><rect x="14.5" y="4" width="6" height="16" fill="currentColor" fill-opacity=".22" stroke="none"/>`,
  grip: `<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>`,
  terminal: `<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7 9.5L10 12L7 14.5M12.5 15H17"/>`,
};

export const ICON_NAMES = Object.keys(P);

/** SVG 문자열(목록 화면·테스트에서도 씀) */
export function iconSvg(name, size = 16) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" ${A}>${P[name] ?? ""}</svg>`;
}

/** 아이콘 요소. 접근성 이름은 버튼 쪽(aria-label·글자)이 맡고 아이콘은 숨긴다. */
export function icon(name, cls = "") {
  const s = document.createElement("span");
  s.className = "ic" + (cls ? " " + cls : "");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = iconSvg(name);
  return s;
}
