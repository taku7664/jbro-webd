// formats.mjs — 시트 데이터 JSON. Aseprite 호환(frames·meta.frameTags·meta.slices)을 바탕으로,
// 엔진별 값(Unity·Godot)과 웹용 border-image를 meta.webd에 함께 넣는다. 엔진에 묶이지 않는 범용 시트가 목표.
// 형식 근거: https://www.aseprite.org/docs/cli/ (frameTags·slices의 bounds·center·pivot, json-hash·json-array)
//           https://docs.godotengine.org/en/stable/classes/class_ninepatchrect.html (patch_margin_*, axis_stretch)
//           https://docs.unity.com/en-us/engine/current/manual/unity2d/sprite/9-slice/9-slicing (Sliced·Tiled)

export const APP = "WebD sprite export";
export const FORMAT_VERSION = 1;

/**
 * @param {object} o
 * @param {{ filename, cell:{x,y,w,h}, sourceSize:{w,h}, spriteSourceSize:{x,y,w,h}, duration }[]} o.frames
 * @param {string} o.image       시트(또는 단일) PNG 파일 이름
 * @param {{w,h}} o.size         이미지 전체 크기
 * @param {number} o.scale
 * @param {object} o.spec        정규화된 사양
 * @param {{l,t,r,b}|null} o.insets  배율 픽셀 인셋(슬라이스 없으면 null)
 * @param {object} o.source      { id, name, version, target }
 * @param {string[]} [o.warnings]
 */
export function buildSheetData({ frames, image, size, scale, spec, insets, source, warnings = [] }) {
  const entry = (f) => ({
    frame: { ...f.cell }, rotated: false,
    trimmed: f.spriteSourceSize.x !== 0 || f.spriteSourceSize.y !== 0 || f.spriteSourceSize.w !== f.sourceSize.w || f.spriteSourceSize.h !== f.sourceSize.h,
    spriteSourceSize: { ...f.spriteSourceSize }, sourceSize: { ...f.sourceSize }, duration: f.duration,
  });
  const framesOut = spec.output.data === "aseprite-array"
    ? frames.map((f) => ({ filename: f.filename, ...entry(f) }))
    : Object.fromEntries(frames.map((f) => [f.filename, entry(f)]));
  const first = frames[0];
  // 상태마다 태그 하나(Aseprite frameTags). 엔진에서 태그 이름으로 상태별 이미지를 꺼낸다.
  const frameTags = [];
  if (frames.length > 1) frames.forEach((f, i) => {
    const last = frameTags[frameTags.length - 1];
    if (last && last.name === f.state) last.to = i;
    else frameTags.push({ name: f.state, from: i, to: i, direction: "forward" });
  });
  const slices = insets ? [{
    name: spec.name, color: "#0000ffff",
    keys: [{ frame: 0, bounds: { x: 0, y: 0, w: first.sourceSize.w, h: first.sourceSize.h }, center: centerRect(first.sourceSize, insets) }],
  }] : [];
  return {
    frames: framesOut,
    meta: {
      app: APP, version: String(FORMAT_VERSION), image, format: "RGBA8888", size: { w: size.w, h: size.h }, scale: String(scale),
      frameTags, layers: [], slices,
      webd: {
        source,
        states: frames.length > 1 ? frameTags.map((t) => ({ key: t.name, label: frames[t.from].label ?? t.name, from: t.from, to: t.to })) : null,
        slice: insets ? { mode: spec.slice.mode, fill: spec.slice.fill, insets: { ...insets }, insetsCss: { ...spec.slice.insets } } : null,
        engines: insets ? engineValues(spec, insets, image, scale) : null,
        background: spec.background, bounds: spec.bounds,
        warnings,
      },
    },
  };
}

export function centerRect(size, { l, t, r, b }) {
  return { x: l, y: t, w: Math.max(0, size.w - l - r), h: Math.max(0, size.h - t - b) };
}

export function engineValues(spec, ins, image, scale) {
  const tile = spec.slice.fill === "tile";
  const horiz = spec.slice.mode !== "three-v", vert = spec.slice.mode !== "three-h";
  const css = (v) => `${+(v / scale).toFixed(3)}px`;
  return {
    unity: {
      // Sprite Editor의 Border L·B·R·T, Sprite.border(Vector4)의 x·y·z·w 순서
      border: { L: ins.l, B: ins.b, R: ins.r, T: ins.t }, vector4: [ins.l, ins.b, ins.r, ins.t],
      drawMode: tile ? "Tiled" : "Sliced", meshType: "FullRect", pixelsPerUnitHint: 100 * scale,
    },
    godot: {
      patch_margin_left: ins.l, patch_margin_top: ins.t, patch_margin_right: ins.r, patch_margin_bottom: ins.b,
      axis_stretch_horizontal: horiz && tile ? "tile" : "stretch", axis_stretch_vertical: vert && tile ? "tile" : "stretch",
    },
    css: {
      borderImage: `url("${image}") ${ins.t} ${ins.r} ${ins.b} ${ins.l} fill / ${css(ins.t)} ${css(ins.r)} ${css(ins.b)} ${css(ins.l)} ${tile ? "round" : "stretch"}`,
    },
  };
}
