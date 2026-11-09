#!/usr/bin/env node
// render-check.mjs — 실제 렌더에서만 보이는 문제를 검사한다. 의존성 없음, Node 22+ (내장 WebSocket).
//
// 설치된 Chrome·Edge·Chromium을 헤드리스로 띄워 Chrome DevTools Protocol로 조작한다.
// 브라우저를 새로 받지 않는다. 못 찾으면 WEBD_BROWSER 환경 변수로 실행 파일을 지정한다.
//
// 검사 항목
//   contrast         글자 바로 뒤에 깔린 색 기준의 실제 대비 (겹친 도형, 반투명 배경, multiply 포함)
//   bg-uncertain     글자 뒤에 이미지·그라디언트가 있어 대비를 계산하지 못함 → 눈으로 확인
//   small-text       렌더된 글자 크기 12px 미만 (SVG는 축소된 실제 크기)
//   hangul-fallback  지정한 첫 폰트에 한글이 없어 다른 폰트로 대체됨
//   h-scroll         가로 스크롤 발생
//   focus-indicator  Tab으로 이동했을 때 outline·box-shadow 표시가 없음
//   tap-target       버튼·독립 링크·입력이 44×44px보다 작음
//
// 사용법:
//   node render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--out <폴더>] [--json]
// --out을 주면 너비·모드별 전체 페이지 스크린샷(PNG)을 저장한다.
// 종료 코드: 0 = high·medium 없음 · 2 = 있음 · 1 = 사용 오류·브라우저 실행 실패

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------- 브라우저 찾기·실행 ----------

const CANDIDATES = {
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};

export function findBrowser() {
  if (process.env.WEBD_BROWSER) return existsSync(process.env.WEBD_BROWSER) ? process.env.WEBD_BROWSER : null;
  return (CANDIDATES[process.platform] || CANDIDATES.linux).find((p) => p && existsSync(p)) || null;
}

async function launch(exe) {
  const profile = mkdtempSync(join(tmpdir(), "webd-render-"));
  const proc = spawn(exe, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
    "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, fail) => {
    let buf = "";
    const t = setTimeout(() => fail(new Error("브라우저가 15초 안에 열리지 않음")), 15000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(t); ok(m[1]); }
    });
    proc.on("exit", (c) => { clearTimeout(t); fail(new Error(`브라우저가 종료됨 (코드 ${c})`)); });
  });
  const port = new URL(wsUrl).port;
  const close = () => {
    try { proc.kill(); } catch {}
    // Windows는 프로세스가 끝난 뒤에도 잠깐 파일을 잡고 있어 몇 번 다시 시도한다.
    for (let i = 0; i < 5; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch {} }
  };
  return { port, close };
}

// ---------- 아주 작은 CDP 클라이언트 ----------

async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("CDP 연결 실패")); });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.ok(msg.params); }
    }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { pending.set(++id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method, timeout = 20000) => new Promise((ok, fail) => {
    const w = { method, ok: (p) => { clearTimeout(t); ok(p); } };
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); fail(new Error(`${method} 대기 시간 초과`)); }, timeout);
    waiters.push(w);
  });
  const evaluate = async (fn, arg) => {
    const r = await send("Runtime.evaluate", { expression: `(${fn.toString()})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, once, evaluate, close: () => ws.close() };
}

// ---------- 페이지 안에서 실행할 검사 ----------
// 문자열로 넘어가므로 바깥 변수를 참조하지 않는다.

function pageChecks(opt) {
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
  const blendOf = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const b = getComputedStyle(e).mixBlendMode; if (b && b !== "normal") return b; } return "normal"; };

  // 1. 가로 넘침. 모바일 에뮬레이션에서는 브라우저가 내용 폭에 맞춰 축소해 innerWidth도 늘어나므로, 지정한 폭과 비교한다.
  const vw = (opt && opt.width) || innerWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  if (sw > vw + 1) {
    out.push({ rule: "h-scroll", severity: "high", target: "html", detail: `내용 폭 ${sw}px > 화면 ${vw}px` });
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
    if (px < 11.95 && !seen.has("small:" + key)) {
      seen.add("small:" + key);
      out.push({ rule: "small-text", severity: "medium", target: key, detail: `${px.toFixed(1)}px "${text.slice(0, 24)}"` });
    }

    // 한글 대체: 여기서는 대상만 모으고, 실제로 그린 폰트는 Node 쪽에서 CDP로 확인한다(checkHangul).
    if (/[\uAC00-\uD7A3]/.test(text) && !familyCache.has(cs.fontFamily)) {
      familyCache.set(cs.fontFamily, { target: key, text: text.slice(0, 16), weight: cs.fontWeight, style: cs.fontStyle });
    }

    // 실제 대비: 줄마다 가운데 지점 아래에 깔린 것들을 겹쳐 계산
    const fg0 = parseFloat(cs.opacity) < 1 ? null : parse(cs.color);
    if (!fg0) continue;
    const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    for (const r of rects.slice(0, 4)) {
      const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight - 1) continue;           // 화면 밖 줄은 스크롤 후 다시 본다(아래에서 처리)
      const stack = document.elementsFromPoint(x, y);
      let uncertain = false;
      const layers = [];
      for (const e of stack) {
        const s = getComputedStyle(e);
        if (s.backgroundImage && s.backgroundImage !== "none" && !(e === document.body || e === document.documentElement)) { uncertain = true; }
        const bg = parse(s.backgroundColor);
        if (bg && bg.a > 0) layers.push({ c: bg, blend: s.mixBlendMode });
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
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
    if (r.width < 44 || r.height < 44) {
      const k = "tap:" + label(el);
      if (!seen.has(k)) { seen.add(k); out.push({ rule: "tap-target", severity: "advisory", target: label(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}px "${(el.textContent || el.value || "").trim().slice(0, 16)}"` }); }
    }
  }
  return { findings: out, textNodes: count, height: document.documentElement.scrollHeight, hangul: [...familyCache].map(([stack, v]) => ({ stack, ...v })) };
}

function focusState() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
  const shadow = cs.boxShadow && cs.boxShadow !== "none";
  let tag = el.tagName.toLowerCase();
  if (el.id) tag += "#" + el.id; else if (typeof el.className === "string" && el.className.trim()) tag += "." + el.className.trim().split(/\s+/)[0];
  return { tag, text: (el.textContent || el.value || "").trim().slice(0, 20), visible: outline || shadow, sig: tag + "|" + (el.textContent || "").trim().slice(0, 40) };
}

// ---------- 한글을 실제로 그린 폰트 ----------
// 폰트 스택마다 한글만 든 숨은 견본을 만들고, 브라우저가 그 글자를 어떤 폰트로 그렸는지 CDP로 묻는다.
// 정상: 웹폰트(isCustomFont)로 그렸거나, 선언한 스택 안의 폰트로 그림.
// 지적: 스택에 한글 폰트가 없어 브라우저가 스택 밖 시스템 폰트로 대체함.

const GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|emoji|math)$/i;
const norm = (s) => s.trim().replace(/^['"]|['"]$/g, "").toLowerCase();

async function checkHangul(cdp, targets) {
  if (!targets.length) return [];
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  await cdp.evaluate((list) => {
    list.forEach((t, i) => {
      const s = document.createElement("span");
      s.setAttribute("data-webd-probe", String(i));
      s.textContent = "가나다라마바사아자차";
      Object.assign(s.style, { fontFamily: t.stack, fontWeight: t.weight, fontStyle: t.style, position: "absolute", left: "-9999px", top: "0", fontSize: "32px" });
      document.body.appendChild(s);
    });
    return document.fonts.ready.then(() => true);
  }, targets);
  const out = [];
  const { root } = await cdp.send("DOM.getDocument", { depth: 1 });
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const declared = t.stack.split(",").map(norm).filter((f) => f && !GENERIC.test(f));
    if (!declared.length) continue;                      // 일반 계열만 지정 → 브라우저 기본 한글 폰트가 의도
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-webd-probe="${i}"]` });
    if (!nodeId) continue;
    let fonts = [];
    try { ({ fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId })); } catch { continue; }
    if (!fonts.length) continue;
    const main = [...fonts].sort((a, b) => b.glyphCount - a.glyphCount)[0];
    const ok = fonts.some((f) => f.isCustomFont) || fonts.some((f) => declared.includes(norm(f.familyName)));
    if (!ok) {
      out.push({ rule: "hangul-fallback", severity: "medium", target: t.target,
        detail: `폰트 스택 "${t.stack}"에 한글 폰트가 없어 ${main.familyName}(으)로 대체됨 "${t.text}"` });
    }
  }
  await cdp.evaluate(() => document.querySelectorAll("[data-webd-probe]").forEach((e) => e.remove()));
  return out;
}

// ---------- 실행 ----------

async function checkPage(cdp, url, width, scheme, outDir) {
  const height = width < 768 ? 812 : 900;
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  const loaded = cdp.once("Page.loadEventFired", 30000);
  await cdp.send("Page.navigate", { url });
  await loaded;
  await cdp.evaluate(() => document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 400))));
  // 끝이 있는 애니메이션은 끝낸 상태로 본다. (애니메이션이 멈췄을 때의 위험은 정적 검출기의 hidden-entrance가 본다.)
  await cdp.evaluate(() => { for (const a of document.getAnimations()) { const t = a.effect && a.effect.getComputedTiming(); if (t && Number.isFinite(t.endTime)) a.finish(); } });

  // 화면 높이만큼 내려가며 검사해 아래쪽 글자도 본다.
  const findings = [];
  const keys = new Set();
  let y = 0, pageHeight = 0, textNodes = 0;
  const hangulTargets = new Map();
  for (let i = 0; i < 12; i++) {
    await cdp.evaluate((top) => window.scrollTo(0, top), y);
    const r = await cdp.evaluate(pageChecks, { width });
    pageHeight = r.height; textNodes = Math.max(textNodes, r.textNodes);
    for (const f of r.findings) { const k = f.rule + f.target + f.detail; if (!keys.has(k)) { keys.add(k); findings.push(f); } }
    for (const h of r.hangul || []) if (!hangulTargets.has(h.stack)) hangulTargets.set(h.stack, h);
    y += height - 80;
    if (y >= pageHeight - 10) break;
  }
  await cdp.evaluate(() => window.scrollTo(0, 0));
  findings.push(...(await checkHangul(cdp, [...hangulTargets.values()])));

  // 키보드 포커스: Tab을 실제로 눌러 본다.
  const focusSeen = new Set();
  for (let i = 0; i < 15; i++) {
    for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    const s = await cdp.evaluate(focusState);
    if (!s || focusSeen.has(s.sig)) break;
    focusSeen.add(s.sig);
    if (!s.visible) findings.push({ rule: "focus-indicator", severity: "high", target: s.tag, detail: `Tab 포커스에 outline·box-shadow가 없음 "${s.text}" (다른 방식으로 표시하면 직접 확인)` });
  }

  let shot = null;
  if (outDir) {
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const h = Math.min(Math.ceil(metrics.cssContentSize?.height || pageHeight), 16000);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: 1, mobile: width < 768 });
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    shot = join(outDir, `${width}-${scheme}.png`);
    writeFileSync(shot, Buffer.from(data, "base64"));
  }
  return { width, scheme, findings, textNodes, screenshot: shot };
}

export async function renderCheck(target, { widths = [375, 1440], schemes = ["light"], outDir = null } = {}) {
  const exe = findBrowser();
  if (!exe) throw Object.assign(new Error("Chrome·Edge·Chromium을 찾지 못함. WEBD_BROWSER에 실행 파일 경로를 지정하세요."), { code: 1 });
  const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href;
  if (!/^https?:/.test(target) && !existsSync(resolve(target)) && !/^file:/.test(target)) throw Object.assign(new Error(`파일이 없음: ${target}`), { code: 1 });
  if (outDir) mkdirSync(outDir, { recursive: true });
  const browser = await launch(exe);
  try {
    const cdp = await connect(browser.port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const runs = [];
    for (const scheme of schemes) for (const w of widths) runs.push(await checkPage(cdp, url, w, scheme, outDir));
    cdp.close();
    return { url, browser: exe, runs };
  } finally { browser.close(); }
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { widths: [375, 1440], schemes: ["light"], out: null, json: false, target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") o.json = true;
    else if (a === "--widths") o.widths = (argv[++i] || "").split(",").map(Number).filter((n) => n >= 200 && n <= 4000);
    else if (a === "--scheme") o.schemes = (argv[++i] || "").split(",").filter((s) => s === "light" || s === "dark");
    else if (a === "--out") o.out = argv[++i];
    else if (a.startsWith("-")) throw new Error(`알 수 없는 옵션: ${a}`);
    else o.target = a;
  }
  if (!o.target) throw new Error("사용법: node render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--out <폴더>] [--json]");
  if (!o.widths.length) throw new Error("--widths는 200–4000 사이 숫자를 쉼표로 구분합니다.");
  if (!o.schemes.length) throw new Error("--scheme은 light, dark 중에서 고릅니다.");
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 1; }
  let result;
  try { result = await renderCheck(o.target, { widths: o.widths, schemes: o.schemes, outDir: o.out ? resolve(o.out) : null }); }
  catch (e) { console.error(e.message); return e.code ?? 1; }
  const all = result.runs.flatMap((r) => r.findings);
  const counts = { high: 0, medium: 0, advisory: 0 };
  all.forEach((f) => counts[f.severity]++);
  if (o.json) { console.log(JSON.stringify({ ...result, counts }, null, 2)); }
  else {
    console.log(`webd render-check: ${result.url}`);
    for (const r of result.runs) {
      const c = { high: 0, medium: 0, advisory: 0 }; r.findings.forEach((f) => c[f.severity]++);
      console.log(`\n[${r.width}px · ${r.scheme}] 글자 ${r.textNodes}곳 검사 · high ${c.high}, medium ${c.medium}, advisory ${c.advisory}${r.screenshot ? ` · ${r.screenshot}` : ""}`);
      const order = { high: 0, medium: 1, advisory: 2 };
      for (const f of [...r.findings].sort((a, b) => order[a.severity] - order[b.severity])) console.log(`  [${f.severity}] ${f.rule}  ${f.target}  ${f.detail}`);
    }
    console.log(`\n합계 high ${counts.high}, medium ${counts.medium}, advisory ${counts.advisory}`);
    console.log("보지 않는 것: 디자인 판단(위계, 시그니처, AI 티), 이미지 위 글자의 대비, 애니메이션 도중 상태. 스크린샷을 직접 보세요.");
  }
  return counts.high + counts.medium > 0 ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().then((c) => { process.exitCode = c; });
