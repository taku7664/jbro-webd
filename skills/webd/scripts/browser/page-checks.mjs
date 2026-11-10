// ---------- 페이지 안에서 실행할 검사 ----------
// 문자열로 넘어가므로 바깥 변수를 참조하지 않는다.

export function pageChecks(opt) {
  const out = [];
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, below) => ({ r: top.r * top.a + below.r * (1 - top.a), g: top.g * top.a + below.g * (1 - top.a), b: top.b * top.a + below.b * (1 - top.a), a: 1 });
  const multiply = (top, below) => { const m = { r: top.r * below.r / 255, g: top.g * below.g / 255, b: top.b * below.b / 255, a: 1 }; return over({ ...m, a: top.a }, below); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    else if (typeof el.className === "string" && el.className.trim()) s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    return s;
  };
  const visible = (el) => { const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  // 아무 배경도 없는 지점의 바탕(캔버스): html 배경, 없으면 body 배경이 캔버스로 번지고(CSS 배경 전파),
  // 둘 다 없으면 color-scheme이 dark일 때 브라우저 기본 어두운 바탕, 아니면 흰색.
  const canvasColor = () => {
    for (const e of [document.documentElement, document.body]) {
      if (!e) continue;
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) return over(c, { r: 255, g: 255, b: 255, a: 1 });
    }
    return getComputedStyle(document.documentElement).colorScheme.includes("dark") && matchMedia("(prefers-color-scheme: dark)").matches
      ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  };
  const blendOf = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const b = getComputedStyle(e).mixBlendMode; if (b && b !== "normal") return b; } return "normal"; };

  // 1. 가로 넘침. 모바일 에뮬레이션에서는 브라우저가 내용 폭에 맞춰 축소해 innerWidth도 늘어나므로, 지정한 폭과 비교한다.
  const vw = (opt && opt.width) || innerWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  if (sw > vw + 1) {
    out.push({ rule: "h-scroll", severity: "high", target: "html", detail: `내용 폭 ${sw}px > 화면 ${vw}px` });
  }

  // 1-2. 화면 높이 틀(앱 셸)인데 문서가 세로로 스크롤됨: 스크롤 패널 밖으로 새는 absolute 요소가 흔한 원인
  //      (position: relative 조상이 없는 visually-hidden 라벨 등). 패널 안 내용이 문서 전체를 늘린다.
  const shell = document.body && [...document.body.children].find((e) => {
    const r = e.getBoundingClientRect();
    return r.top + scrollY <= 1 && Math.abs(r.height - innerHeight) <= 2 && e.querySelector("*") &&
      [...e.querySelectorAll("*")].some((c) => /(auto|scroll)/.test(getComputedStyle(c).overflowY));
  });
  const sh = document.documentElement.scrollHeight;
  if (shell && sh > innerHeight + 2) {
    const shellBottom = shell.getBoundingClientRect().bottom + scrollY;
    const leak = [...shell.querySelectorAll("*")].filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.position !== "absolute") return false;
      let cb = e.offsetParent;     // absolute의 기준 상자. 없거나 body면 스크롤 패널 밖 기준
      return (!cb || cb === document.body) && e.getBoundingClientRect().bottom + scrollY > shellBottom + 1;
    }).slice(0, 3).map(label);
    out.push({ rule: "shell-overflow", severity: "medium", target: label(shell),
      detail: `화면 높이 틀인데 문서가 ${sh - innerHeight}px 더 길어 페이지 전체가 스크롤됨${leak.length ? `. 새는 absolute 요소: ${leak.join(", ")} → 스크롤 패널에 position: relative` : ""}` });
  }

  // 2·3·4. 글자 단위 검사
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node, count = 0;
  const familyCache = new Map();
  while ((node = walker.nextNode()) && count < 600) {
    const text = node.textContent.trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "TITLE"].includes(el.tagName) || !visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    if (!rects.length) continue;
    count++;
    const cs = getComputedStyle(el);
    const key = label(el);

    // 렌더 글자 크기 (SVG는 화면 변환 비율 반영)
    let px = parseFloat(cs.fontSize);
    const svgText = el.closest("svg");
    if (svgText && el.getScreenCTM) { const m = el.getScreenCTM(); if (m) px = px * Math.hypot(m.a, m.b); }
    // 기준: HTML 글자 12px, SVG 라벨은 craft-floor.md와 같이 11px
    if (px < (svgText ? 10.95 : 11.95) && !seen.has("small:" + key)) {
      seen.add("small:" + key);
      out.push({ rule: "small-text", severity: "medium", target: key, detail: `${px.toFixed(1)}px "${text.slice(0, 24)}"` });
    }

    // 한글 대체: 여기서는 대상만 모으고, 실제로 그린 폰트는 Node 쪽에서 CDP로 확인한다(checkHangul).
    if (/[\uAC00-\uD7A3]/.test(text) && !familyCache.has(cs.fontFamily)) {
      familyCache.set(cs.fontFamily, { target: key, text: text.slice(0, 16), weight: cs.fontWeight, style: cs.fontStyle });
    }

    // 실제 대비: 줄마다 가운데 지점 아래에 깔린 것들을 겹쳐 계산
    // SVG 글자는 color가 아니라 fill로 칠해진다
    const fg0 = parseFloat(cs.opacity) < 1 ? null : parse(svgText ? cs.fill : cs.color);
    if (!fg0) continue;
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    for (const r of rects.slice(0, 4)) {
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight - 1) continue;           // 화면 밖 줄은 스크롤 후 다시 본다(아래에서 처리)
      const stack = document.elementsFromPoint(x, y);
      // 스크롤 패널에 잘려 실제로는 안 보이는 줄: 그 지점에 이 글자의 요소도, html·body가 아닌 조상도 없다
      // 그 지점 맨 위가 이 글자의 요소(또는 그 안·그 조상)여야 실제로 보이는 글자. 고정 막대나 다른 패널이 덮었거나
      // 스크롤 패널에 잘렸으면 맨 위가 다른 요소다
      const top = stack[0];
      const drawn = !!top && (top === el || el.contains(top) || (top.contains(el) && top !== document.documentElement && top !== document.body));
      if (!drawn) continue;
      let uncertain = false;
      const layers = [];
      for (const e of stack) {
        const s = getComputedStyle(e);
        if (s.backgroundImage && s.backgroundImage !== "none" && !(e === document.body || e === document.documentElement)) { uncertain = true; }
        const bg = parse(s.backgroundColor);
        if (bg && bg.a > 0) layers.push({ c: bg, blend: s.mixBlendMode });
      }
      let bg = canvasColor();
      for (const l of layers.reverse()) bg = l.blend === "multiply" ? multiply(l.c, bg) : over(l.c, bg);
      const fg = blendOf(el) === "multiply" ? multiply(fg0, bg) : over(fg0, bg);
      const cr = ratio(fg, bg);
      const k = `contrast:${key}:${hex(fg)}:${hex(bg)}`;
      if (uncertain) {
        if (!seen.has("unc:" + key)) { seen.add("unc:" + key); out.push({ rule: "bg-uncertain", severity: "advisory", target: key, detail: `글자 뒤에 이미지·그라디언트가 있음 "${text.slice(0, 16)}"` }); }
      } else if (cr < need && !seen.has(k)) {
        seen.add(k);
        out.push({ rule: "contrast", severity: "high", target: key, detail: `${cr.toFixed(2)} < ${need} (글자 ${hex(fg)} / 뒤 ${hex(bg)}, ${px.toFixed(0)}px) "${text.slice(0, 20)}"` });
      }
    }
  }

  // 5. 클릭 대상 크기 (문장 안 링크는 제외)
  for (const el of document.querySelectorAll("button, input:not([type=hidden]), select, textarea, [role=button], a[href]")) {
    if (!visible(el)) continue;
    if (el.tagName === "A") {
      const parent = el.parentElement, ps = parent && getComputedStyle(parent);
      const inText = getComputedStyle(el).display === "inline" && parent && ["P", "LI", "DD", "TD", "SPAN", "FIGCAPTION", "BLOCKQUOTE"].includes(parent.tagName) && parent.textContent.trim().length > el.textContent.trim().length + 8;
      if (inText || (ps && ps.display === "inline")) continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // 좁은 화면(터치)은 44px, 넓은 화면(정밀 포인터)은 WCAG 2.5.8 최소 24px
    const minTap = vw < 768 ? 44 : 24;
    // 체크박스·라디오는 연결된 <label>을 눌러도 바뀌므로, 라벨 상자가 기준을 넘으면 통과
    const viaLabel = el.labels && [...el.labels].some((l) => { const lr = l.getBoundingClientRect(); return lr.width >= minTap && lr.height >= minTap; });
    if ((r.width < minTap || r.height < minTap) && !viaLabel) {
      const k = "tap:" + label(el);
      if (!seen.has(k)) { seen.add(k); out.push({ rule: "tap-target", severity: "advisory", target: label(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}px "${(el.textContent || el.value || "").trim().slice(0, 16)}"` }); }
    }
  }
  return { findings: out, textNodes: count, height: document.documentElement.scrollHeight, hangul: [...familyCache].map(([stack, v]) => ({ stack, ...v })) };
}

export function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow && cs.boxShadow !== "none";
  let tag = el.tagName.toLowerCase();
  if (el.id) tag += "#" + el.id; else if (typeof el.className === "string" && el.className.trim()) tag += "." + el.className.trim().split(/\s+/)[0];
  return { tag, text: (el.textContent || el.value || "").trim().slice(0, 20), visible: outline || shadow, sig: tag + "|" + (el.textContent || "").trim().slice(0, 40) };
}

// 첫 화면의 시각 소음 수치 (visual-quality.md 4·5절). 판정이 아니라 비평의 근거로 보고만 한다.
//   boxes: 버튼·입력이 아닌데 네 변 모두 테두리가 보이는 상자
//   filledButtons: 바탕색이 칠해진 버튼(주 행동 후보). 화면에 하나가 기본
//   fontSizes: 보이는 글자의 서로 다른 크기 수
export function firstScreenMetrics() {
  const parse = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const inView = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width >= 16 && r.height >= 16;
  const shown = (el) => { const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  const control = (el) => el.matches("button, input, select, textarea, [role=button], summary, a");
  let boxes = 0, filled = 0; const sizes = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect(); if (!inView(r)) continue;
    const cs = getComputedStyle(el);
    const sides = ["Top", "Right", "Bottom", "Left"].filter((k) => parseFloat(cs["border" + k + "Width"]) > 0 && cs["border" + k + "Style"] !== "none" && (parse(cs["border" + k + "Color"]) || { a: 0 }).a > 0.1);
    if (sides.length === 4 && !control(el)) boxes++;
    if (el.matches("button, [role=button], a.btn, input[type=submit]")) {
      // 채움 버튼: 주변 바탕과 확실히 다른 면(대비 2 이상)이 칠해진 버튼. 다크 모드의 살짝 밝은 보조 버튼은 세지 않는다
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0.5) {
        let around = null;
        for (let p = el.parentElement; p && !around; p = p.parentElement) { const c = parse(getComputedStyle(p).backgroundColor); if (c && c.a > 0.5) around = c; }
        around = around || { r: 255, g: 255, b: 255 };
        const L = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const [a, b] = [L(bg), L(around)].sort((x, y) => y - x);
        if ((a + 0.05) / (b + 0.05) >= 2) filled++;
      }
    }
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) {
      let fs = parseFloat(cs.fontSize);
      if (el.closest("svg") && el.getScreenCTM) { const m = el.getScreenCTM(); if (m) fs *= Math.hypot(m.a, m.b); }   // SVG는 실제 렌더 크기
      sizes.add(Math.round(fs * 2) / 2); break;
    }
  }
  return { boxes, filledButtons: filled, fontSizes: sizes.size, sizes: [...sizes].sort((a, b) => a - b) };
}

// 브라우저에서 현재 스크롤 위치와 화면 조건을 기록한다.
export function inspectPage() {
  return {
    viewport: { width: innerWidth, height: innerHeight, scrollY, scheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" },
    ...pageChecks(),
    metrics: firstScreenMetrics(),
    focus: focusState(),
  };
}
