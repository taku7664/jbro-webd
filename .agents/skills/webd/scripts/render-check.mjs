#!/usr/bin/env node
// render-check.mjs — 실제 렌더에서만 보이는 문제를 검사한다. 의존성 없음, Node 22+ (내장 WebSocket).
//
// 설치된 Chrome·Edge·Chromium을 헤드리스로 띄워 Chrome DevTools Protocol로 조작한다.
// 브라우저를 새로 받지 않는다. 못 찾으면 내부 브라우저의 scripts/browser/page-checks.mjs로 검사한다.
//
// 검사 항목
//   contrast         글자 바로 뒤에 깔린 색 기준의 실제 대비 (겹친 도형, 반투명 배경, multiply 포함)
//   bg-uncertain     글자 뒤에 이미지·그라디언트가 있어 대비를 계산하지 못함 → 눈으로 확인
//   small-text       렌더된 글자 크기 12px 미만 (SVG는 축소된 실제 크기)
//   hangul-fallback  지정한 첫 폰트에 한글이 없어 다른 폰트로 대체됨
//   h-scroll         가로 스크롤 발생
//   focus-indicator  Tab으로 이동했을 때 outline·box-shadow 표시가 없음
//   shell-overflow   화면 높이 앱 틀인데 문서가 스크롤됨 (패널 밖으로 새는 absolute 요소)
//   tap-target       버튼·독립 링크·입력이 44×44px(768px 미만) 또는 24×24px(그 이상, WCAG 2.5.8)보다 작음
//
// 사용법:
//   node render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--height 800] [--out <폴더>] [--json]
// --out을 주면 너비·모드별 전체 페이지(<폭>-<모드>.png), 첫 화면(-first.png), 앱 틀이면 패널을 펼친 전체 내용(-expanded.png)을 저장한다.
// --height는 화면 높이(기본: 768 미만 812, 이상 900). 첫 화면 기준을 1280×800처럼 맞출 때 쓴다.
// 종료 코드: 0 = high·medium 없음 · 2 = 있음 · 1 = 사용 오류·브라우저 실행 실패

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// ---------- 브라우저 찾기·실행 ----------

import { pageChecks, firstScreenMetrics, focusState } from "./browser/page-checks.mjs";

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

export async function launch(exe) {
  if (typeof exe !== "string" || !exe || exe.includes("\0")) throw new TypeError("브라우저 실행 파일 경로가 필요합니다.");
  const profile = mkdtempSync(join(tmpdir(), "webd-render-"));
  const proc = spawn(exe, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
    "--mute-audio", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stopped = new Promise((resolve) => proc.once("close", resolve));
  const running = () => proc.pid && proc.exitCode === null && proc.signalCode === null;
  let wsUrl;
  let cleanup;
  const close = () => cleanup ??= (async () => {
    if (running() && wsUrl) {
      // 브라우저가 자식 프로세스와 프로필을 닫을 시간을 준다.
      let ws;
      try {
        ws = new WebSocket(wsUrl);
        ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, method: "Browser.close" })), { once: true });
        const unreachable = new Promise((resolve) => ws.addEventListener("error", resolve, { once: true }));
        await Promise.race([stopped, unreachable, delay(2000, undefined, { ref: false })]);
      } catch {
        // 정상 종료 요청을 보낼 수 없으면 아래에서 실행한 프로세스만 종료한다.
      } finally { ws?.close(); }
    }
    if (running()) proc.kill();
    const exited = await Promise.race([stopped.then(() => true), delay(10000, false, { ref: false })]);
    if (!exited) throw new Error(`검증 브라우저 종료를 확인하지 못했습니다: ${profile}`);
    try { await rm(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 150 }); }
    catch (cause) { throw new Error(`검증용 브라우저 폴더를 정리하지 못했습니다: ${profile}`, { cause }); }
  })();

  try {
    wsUrl = await new Promise((ok, fail) => {
      let buf = "";
      const t = setTimeout(() => fail(new Error("브라우저가 15초 안에 열리지 않음")), 15000);
      const onData = (d) => {
        buf += d;
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (m) {
          clearTimeout(t);
          proc.stderr.off("data", onData);
          proc.stderr.resume();
          ok(m[1]);
        }
      };
      proc.stderr.on("data", onData);
      proc.once("close", (c) => { clearTimeout(t); fail(new Error(`브라우저가 종료됨 (코드 ${c})`)); });
      proc.once("error", (error) => { clearTimeout(t); fail(error); });
    });
    return { port: new URL(wsUrl).port, close };
  } catch (error) {
    await close();
    throw error;
  }
}

// ---------- 아주 작은 CDP 클라이언트 ----------

/**
 * 새 창을 연다(탭이 아니라 창: 같은 창의 뒤쪽 탭은 화면에 안 보여 requestAnimationFrame이 멈춤).
 * 반환: 그 창의 웹소켓 주소(connect의 wsUrl로)
 */
export async function newPage(port) {
  const { webSocketDebuggerUrl: browserWs } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(browserWs);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("CDP 연결 실패")); });
  try {
    const targetId = await new Promise((ok, fail) => {
      const t = setTimeout(() => fail(new Error("새 창을 열지 못함(시간 초과)")), 10000);
      ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id === 1) { clearTimeout(t); m.error ? fail(new Error(m.error.message)) : ok(m.result.targetId); } };
      ws.send(JSON.stringify({ id: 1, method: "Target.createTarget", params: { url: "about:blank", newWindow: true } }));
    });
    return `ws://127.0.0.1:${port}/devtools/page/${targetId}`;
  } finally { ws.close(); }
}

/** 탭 하나에 CDP로 붙는다. wsUrl을 주면 그 탭(newPage로 연 탭 등), 없으면 첫 탭 */
export async function connect(port, { wsUrl } = {}) {
  let url = wsUrl;
  if (!url) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    url = list.find((t) => t.type === "page").webSocketDebuggerUrl;
  }
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("CDP 연결 실패")); });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? fail(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) {
      for (const w of [...waiters]) if (w.method === msg.method) { waiters.splice(waiters.indexOf(w), 1); w.ok(msg.params); }
      for (const l of listeners) if (l.method === msg.method) l.fn(msg.params);
    }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { pending.set(++id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method, timeout = 20000) => new Promise((ok, fail) => {
    const w = { method, ok: (p) => { clearTimeout(t); ok(p); } };
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); fail(new Error(`${method} 대기 시간 초과`)); }, timeout);
    waiters.push(w);
  });
  const evaluate = async (fn, arg, ...helpers) => {
    const args = [JSON.stringify(arg ?? null), ...helpers.map((helper) => `(${helper.toString()})`)];
    const r = await send("Runtime.evaluate", { expression: `(${fn.toString()})(${args.join(", ")})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const on = (method, fn) => listeners.push({ method, fn });
  // 탭이나 브라우저가 죽어 연결이 끊기면 기다리던 요청을 모두 실패로 끝낸다(영원히 기다리지 않게)
  ws.onclose = () => { for (const { fail } of pending.values()) fail(new Error("CDP 연결이 끊김")); pending.clear(); };
  return { send, once, evaluate, on, close: () => ws.close() };
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

async function checkPage(cdp, url, width, scheme, outDir, fixedHeight = null) {
  const height = fixedHeight || (width < 768 ? 812 : 900);
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
  const metrics = await cdp.evaluate(firstScreenMetrics);

  // 키보드 포커스: Tab을 실제로 눌러 본다.
  const focusSeen = new Set();
  for (let i = 0; i < 15; i++) {
    for (const type of ["keyDown", "keyUp"]) await cdp.send("Input.dispatchKeyEvent", { type, key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
    const s = await cdp.evaluate(focusState);
    if (!s || focusSeen.has(s.sig)) break;
    focusSeen.add(s.sig);
    if (!s.visible) findings.push({ rule: "focus-indicator", severity: "high", target: s.tag, detail: `Tab 포커스에 outline·box-shadow가 없음 "${s.text}" (다른 방식으로 표시하면 직접 확인)` });
  }

  let shot = null, firstShot = null, expandedShot = null;
  if (outDir) {
    // 첫 화면(스크롤 없이 보이는 범위)만 따로: 저장·주 행동이 첫 화면에 있는지 보는 용도
    await cdp.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    const first = await cdp.send("Page.captureScreenshot", { format: "png" });
    firstShot = join(outDir, `${width}-${scheme}-first.png`);
    writeFileSync(firstShot, Buffer.from(first.data, "base64"));
    const metrics = await cdp.send("Page.getLayoutMetrics");
    const h = Math.min(Math.ceil(metrics.cssContentSize?.height || pageHeight), 16000);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: 1, mobile: width < 768 });
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    shot = join(outDir, `${width}-${scheme}.png`);
    writeFileSync(shot, Buffer.from(data, "base64"));
    // 앱 틀(화면 높이 틀 + 패널마다 따로 스크롤)은 전체 스크린샷이 첫 화면과 같아 아래 내용이 안 보인다.
    // 패널 스크롤을 풀어 모든 내용을 펼친 스크린샷을 따로 남긴다(배치는 실제와 다를 수 있음, 비평에서 내용 확인용).
    const isShell = await cdp.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2 &&
      [...document.querySelectorAll("body *")].some((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 40));
    if (isShell) {
      await cdp.evaluate(() => {
        const vh = innerHeight;
        for (const e of document.querySelectorAll("html, body, body *")) {
          const cs = getComputedStyle(e);
          if (/(auto|scroll|hidden)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 4) { e.style.setProperty("overflow", "visible", "important"); e.style.setProperty("max-height", "none", "important"); e.style.setProperty("height", "auto", "important"); }
          else if (Math.abs(e.getBoundingClientRect().height - vh) <= 2 && e.children.length) { e.style.setProperty("height", "auto", "important"); e.style.setProperty("min-height", vh + "px", "important"); }
        }
      });
      const m2 = await cdp.send("Page.getLayoutMetrics");
      const h2 = Math.min(Math.ceil(m2.cssContentSize?.height || h), 16000);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: h2, deviceScaleFactor: 1, mobile: width < 768 });
      const ex = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      expandedShot = join(outDir, `${width}-${scheme}-expanded.png`);
      writeFileSync(expandedShot, Buffer.from(ex.data, "base64"));
    }
  }
  return { width, scheme, height, findings, textNodes, metrics, screenshot: shot, firstScreen: firstShot, expanded: expandedShot };
}

export async function renderCheck(target, { widths = [375, 1440], schemes = ["light"], outDir = null, height = null } = {}) {
  const exe = findBrowser();
  if (!exe) throw Object.assign(new Error("Chrome·Edge·Chromium을 찾지 못함. 내부 브라우저에서 scripts/browser/page-checks.mjs를 쓰세요 (reference/verify.md)."), { code: 1 });
  const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(resolve(target)).href;
  if (!/^https?:/.test(target) && !existsSync(resolve(target)) && !/^file:/.test(target)) throw Object.assign(new Error(`파일이 없음: ${target}`), { code: 1 });
  if (outDir) mkdirSync(outDir, { recursive: true });
  const browser = await launch(exe);
  let cdp;
  try {
    cdp = await connect(browser.port);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    // 저장하지 않은 변경이 있는 편집기는 다시 불러올 때 "나가시겠습니까?"(beforeunload)를 띄운다.
    // 대화상자가 열리면 페이지가 멈추므로 수락하고, 떴다는 사실은 결과에 남긴다(나가기 경고가 있다는 증거).
    const dialogs = [];
    cdp.on("Page.javascriptDialogOpening", (p) => { dialogs.push(p.type); cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });
    const runs = [];
    for (const scheme of schemes) for (const w of widths) runs.push(await checkPage(cdp, url, w, scheme, outDir, height));
    return { url, browser: exe, runs, dialogs };
  } finally {
    cdp?.close();
    await browser.close();
  }
}

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { widths: [375, 1440], schemes: ["light"], out: null, json: false, target: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { o.help = true; }
    else if (a === "--json") o.json = true;
    else if (a === "--widths") o.widths = (argv[++i] || "").split(",").map(Number).filter((n) => n >= 200 && n <= 4000);
    else if (a === "--scheme") o.schemes = (argv[++i] || "").split(",").filter((s) => s === "light" || s === "dark");
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--height") { o.height = Number(argv[++i]); if (!(o.height >= 300 && o.height <= 3000)) throw new Error("--height는 300–3000"); }
    else if (a.startsWith("-")) throw new Error(`알 수 없는 옵션: ${a}`);
    else o.target = a;
  }
  if (o.help) return o;
  if (!o.target) throw new Error("사용법: node render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--height 800] [--out <폴더>] [--json]");
  if (!o.widths.length) throw new Error("--widths는 200–4000 사이 숫자를 쉼표로 구분합니다.");
  if (!o.schemes.length) throw new Error("--scheme은 light, dark 중에서 고릅니다.");
  return o;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); return 1; }
  if (o.help) {
    console.log("사용법: node render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--height 800] [--out <폴더>] [--json]");
    console.log("--out: <폭>-<모드>.png(전체), -first.png(첫 화면), -expanded.png(앱 틀일 때 패널 펼침)");
    console.log("종료 코드: 0 high·medium 없음, 2 있음, 1 사용 오류");
    return 0;
  }
  let result;
  try { result = await renderCheck(o.target, { widths: o.widths, schemes: o.schemes, outDir: o.out ? resolve(o.out) : null, height: o.height || null }); }
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
      if (r.metrics) console.log(`  첫 화면 수치: 테두리 상자(버튼·입력 제외) ${r.metrics.boxes} · 채움 버튼 ${r.metrics.filledButtons} · 글자 크기 ${r.metrics.fontSizes}종 (${r.metrics.sizes.join("/")}px)  ← visual-quality.md 4·5절 근거`);
    }
    if (result.dialogs.length) console.log(`\n대화상자 ${result.dialogs.length}번 자동 수락: ${[...new Set(result.dialogs)].join(", ")} (beforeunload면 나가기 경고가 동작한다는 뜻)`);
    console.log(`\n합계 high ${counts.high}, medium ${counts.medium}, advisory ${counts.advisory}`);
    console.log("보지 않는 것: 디자인 판단(위계, 시그니처, AI 티), 이미지 위 글자의 대비, 애니메이션 도중 상태. 스크린샷을 직접 보세요.");
  }
  return counts.high + counts.medium > 0 ? 2 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().then((c) => { process.exitCode = c; });
