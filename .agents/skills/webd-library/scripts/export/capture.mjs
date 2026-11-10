// capture.mjs — 조각을 헤드리스 Chrome·Edge로 렌더해 투명 PNG로 찍는다. 설계: docs/EXPORT-DESIGN.md 4·5절.
//
// 한 번 띄운 브라우저를 재사용하고, 요청은 차례로(큐) 처리한다. 찍는 순서:
//   화면 크기·배율 → (투명이면) 기본 배경 알파 0 → 문서 열기 → 폰트 대기·애니메이션 0초로 정지
//   → 대상 표시 + 고립 스타일 → (9·3-slice) 틀만 남기기·최소 크기로 다시 렌더 → 상자 재기 → 캡처 → (ink) 투명 여백 트림

import { decodePng } from "./png.mjs";
import { alphaBounds, crop } from "./pack.mjs";
import { findBrowser, launch, connect, newPage } from "../../../webd/scripts/render-check.mjs";
import { applyWebdState, rewriteStateSelectors } from "../../editor/states.mjs";
import { animInfo, seekAnimations, frameTimes } from "../../editor/anim.mjs";

export const BLEED = 64;          // ink 범위에서 상자 밖으로 더 찍는 폭(CSS px): 그림자·광채용
export const CENTER_MIN = 4;      // 최소 크기 9-slice의 가운데 폭(CSS px)

export class CaptureError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

/** 브라우저 안에서 도는 준비 함수. 바깥 변수를 쓰지 않는다(상태 함수는 helpers로 받음: editor/states.mjs). */
async function preparePage(arg, applyState, rewriteCss, getAnimInfo) {
  const warnings = [];
  await document.fonts.ready;
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} }
  let target = document.body;
  if (arg.target.kind === "element") {
    let el = document.documentElement;
    for (const i of arg.target.path) { el = el && el.children[i]; }
    if (!el || el === document.documentElement) return { error: "대상 요소를 찾지 못했습니다. 편집기에서 대상을 다시 고르세요." };
    target = el;
  }
  // 상태: 가상 클래스 선택자를 바꿔 두고(:is(:hover,[data-webd-hover])), 전환 없이 바로 그 모습이 되게 건다
  if (arg.state?.length) {
    for (const st of document.querySelectorAll("style")) st.textContent = rewriteCss(st.textContent);
    const off = document.createElement("style"); off.id = "webd-state-style";
    off.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.append(off);
    applyState(document, arg.state, target);
    if (!target.isConnected) return { error: "상태를 걸었더니 대상 요소가 사라졌습니다." };
  }
  // 상태를 걸며 새로 시작한 애니메이션도 0초에 세워 둔다(프레임은 밖에서 시각을 옮겨 가며 찍는다)
  await new Promise((r) => requestAnimationFrame(r));
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = 0; } catch {} }
  const anim = getAnimInfo(document);
  target.setAttribute("data-webd-target", "");
  let css = "";
  if (arg.transparent) css += "html,body{background:transparent!important;background-color:transparent!important}";
  if (target !== document.body) {
    css += "body *:not([data-webd-target]):not([data-webd-target] *){visibility:hidden!important}[data-webd-target]{visibility:visible!important}";
  }
  if (arg.frameOnly) {
    // 글자·아이콘만 숨기고 틀을 그리는 장식은 남긴다. 틀이 대상 자신(배경·::before)이든 자식 요소(판·모서리 span)든 같다.
    //  - 내용: 글자(직접 텍스트, ::before/::after의 글자), 이미지·아이콘(img·svg·video·canvas·입력, content: url())
    //  - 장식: 내용이 없는 요소. 내용만 품은 요소(제목 줄, 구분선 있는 목록 등)는 상자째 숨기고,
    //    장식을 품은 요소는 남긴 채 그 안의 내용만 숨긴다.
    const MEDIA = new Set(["IMG", "SVG", "VIDEO", "CANVAS", "PICTURE", "IFRAME", "OBJECT", "EMBED", "INPUT", "TEXTAREA", "SELECT", "METER", "PROGRESS"]);
    const pseudoContent = (el) => ["::before", "::after"].some((p) => {
      const c = getComputedStyle(el, p).content;
      return c && c !== "none" && c !== "normal" && (/url\(/.test(c) || /\S/.test(c.replace(/^["']|["']$/g, "").replace(/\\["']/g, "")));
    });
    const own = (el) => MEDIA.has(el.tagName.toUpperCase()) || [...el.childNodes].some((n) => n.nodeType === 3 && /\S/.test(n.data)) || pseudoContent(el);
    // 반환: { content: 내용이 있음, decor: 내용 없는 장식 요소가 있음(자신 포함) }
    const walk = (el, isTarget) => {
      if (MEDIA.has(el.tagName.toUpperCase())) return { content: true, decor: false };
      const kids = [...el.children].map((k) => walk(k, false));
      const content = own(el) || kids.some((k) => k.content);
      const decor = !own(el) && !kids.some((k) => k.content) || kids.some((k) => k.decor);
      if (!isTarget && content && !decor) el.setAttribute("data-webd-content", "");
      return { content, decor };
    };
    walk(target, true);
    css += "[data-webd-target] [data-webd-content]{visibility:hidden!important}" +
      "[data-webd-target],[data-webd-target] *,[data-webd-target]::before,[data-webd-target]::after,[data-webd-target] *::before,[data-webd-target] *::after{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}";
  }
  const st = document.createElement("style"); st.id = "webd-export-style"; st.textContent = css;
  document.head.append(st);

  const rb = target.getBoundingClientRect();
  const before = target.offsetWidth != null ? { width: target.offsetWidth, height: target.offsetHeight } : rb;   // transform 없는 레이아웃 크기
  // 최소 크기로 줄이면 고정 여백을 가진 장식(::before·::after, 절대 위치 자식)이 폭·높이 0이 되어 사라질 수 있다. 줄이기 전후를 비교한다.
  const parts = () => {
    const out = [];
    const els = [target, ...target.querySelectorAll("*")].slice(0, 300);
    for (const el of els) for (const pseudo of [null, "::before", "::after"]) {
      if (pseudo && getComputedStyle(el, pseudo).content === "none") continue;
      if (!pseudo && el === target) continue;
      const cs = getComputedStyle(el, pseudo);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      out.push({ name: (el === target ? "대상" : el.tagName.toLowerCase() + (el.classList[0] ? "." + el.classList[0] : "")) + (pseudo ?? ""),
        w: parseFloat(cs.width) || 0, h: parseFloat(cs.height) || 0 });
    }
    return out;
  };
  const partsBefore = arg.resize ? parts() : [];
  if (arg.resize) {
    const want = { w: arg.resize.w ?? before.width, h: arg.resize.h ?? before.height };
    const set = (k, v) => target.style.setProperty(k, v, "important");
    set("box-sizing", "border-box");
    if (arg.resize.w != null) { set("width", want.w + "px"); set("min-width", "0"); set("max-width", "none"); set("flex", "none"); }
    if (arg.resize.h != null) { set("height", want.h + "px"); set("min-height", "0"); set("max-height", "none"); }
    // 레이아웃 크기로 확인한다(상태가 transform: scale()을 걸어도 줄이기는 된 것). offsetWidth가 없는 SVG 등은 화면 크기로.
    const r0 = target.getBoundingClientRect();
    const got = target.offsetWidth != null ? { width: target.offsetWidth, height: target.offsetHeight } : r0;
    if (Math.abs(got.width - want.w) > 0.5 || Math.abs(got.height - want.h) > 0.5) {
      for (const k of ["box-sizing", "width", "min-width", "max-width", "flex", "height", "min-height", "max-height"]) target.style.removeProperty(k);
      warnings.push(`최소 크기(${want.w}×${want.h})로 줄여지지 않아 원래 크기로 찍었습니다(최소 폭·높이 지정이나 레이아웃 제약). 인셋은 그대로 씁니다.`);
    } else {
      const after = parts();
      const lost = partsBefore.filter((p, i) => (p.w > 0.5 && p.h > 0.5) && after[i] && (after[i].w <= 0.5 || after[i].h <= 0.5)).map((p) => p.name);
      if (lost.length) warnings.push(`최소 크기에서 장식이 사라졌습니다: ${[...new Set(lost)].slice(0, 4).join(", ")}. 인셋을 키우거나 크기를 '원래'로 바꾸세요.`);
    }
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // 찍을 상자는 대상 자신의 transform을 뺀 레이아웃 상자(상태가 scale()로 줄여도 칸 크기는 같게, 줄어든 모습은 그 안에)
  const layoutRect = () => {
    const props = ["transform", "translate", "scale", "rotate"];
    const saved = props.map((p) => [p, target.style.getPropertyValue(p), target.style.getPropertyPriority(p)]);
    for (const p of props) target.style.setProperty(p, "none", "important");
    const rr = target.getBoundingClientRect();
    for (const [p, v, pr] of saved) v ? target.style.setProperty(p, v, pr) : target.style.removeProperty(p);
    return rr;
  };
  const r = target === document.body && arg.rootBox
    ? { x: 0, y: 0, width: arg.rootBox.w, height: arg.rootBox.h }
    : layoutRect();
  const doc = document.documentElement;
  return {
    rect: { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height },
    doc: { w: Math.max(doc.scrollWidth, innerWidth), h: Math.max(doc.scrollHeight, innerHeight) },
    anim,
    label: target.tagName.toLowerCase() + (target.id ? "#" + target.id : "") + (target.classList.length ? "." + [...target.classList].slice(0, 3).join(".") : ""),
    warnings,
  };
}

/** 브라우저 안: 애니메이션을 t(ms)로 옮기고 그려질 때까지 기다린다 */
async function seekPage(t, seek) {
  seek(document, t);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
}

/**
 * 브라우저 하나를 띄워 두고 탭 여러 개(기본 4)로 동시에 찍는다. 상태·컴포넌트마다 캡처를 동시에 맡기면
 * 비어 있는 탭이 차례로 받아 간다(한 캡처 안의 애니메이션 프레임은 같은 탭에서 차례로).
 * 환경변수 WEBD_CAPTURE_TABS로 탭 수(1–8)를 바꿀 수 있다.
 */
export function createCapturer({ browserPath, tabs = Number(process.env.WEBD_CAPTURE_TABS) || 4 } = {}) {
  const TABS = Math.min(8, Math.max(1, Math.floor(tabs)));
  let session = null;        // { browser, free: cdp[], all: cdp[] }
  let opening = null;
  const waiting = [];        // 탭을 기다리는 캡처
  let busy = 0;

  async function openTab(port, first) {
    const cdp = first ? await connect(port) : await connect(port, { wsUrl: await newPage(port) });
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    return cdp;
  }
  function open() {
    if (session) return Promise.resolve(session);
    return opening ??= (async () => {
      const exe = browserPath ?? findBrowser();
      if (!exe) throw new CaptureError("내보내기에 쓸 Chrome·Edge를 찾지 못했습니다. 설치하거나 환경변수 WEBD_BROWSER에 실행 파일 경로를 지정하세요.", 503);
      const browser = await launch(exe);
      try {
        const all = [];
        for (let i = 0; i < TABS; i++) all.push(await openTab(browser.port, i === 0));
        session = { browser, all, free: [...all] };
        return session;
      } catch (e) { await browser.close().catch(() => {}); throw e; }
    })().finally(() => { opening = null; });
  }

  async function reset() {
    const s = session; session = null;
    if (s) { for (const c of s.all) { try { c.close(); } catch {} } await s.browser.close().catch(() => {}); }
  }

  async function acquire() {
    const s = await open();
    if (s.free.length) return { s, cdp: s.free.pop() };
    await new Promise((r) => waiting.push(r));
    return acquire();
  }
  function release(s, cdp) {
    if (session === s) s.free.push(cdp);
    const next = waiting.shift(); if (next) next();
  }

  /**
   * @param {{ url: string, spec: object, scale: number, viewport: { width, height }, state?: object[] }} job  state: 걸 상태 조각(editor/states.mjs)
   * @returns {Promise<{ image, box: {x,y,w,h}, insets: {l,t,r,b}|null, cssBox: {w,h}, label, warnings: string[] }>}
   */
  async function captureOnce({ url, spec, scale, viewport, state = null, animate = null }, cdp) {
    const vw = Math.max(16, Math.round(viewport?.width || 1200)), vh = Math.max(16, Math.round(viewport?.height || 720));
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: scale, mobile: false });
    if (spec.background === "transparent") await cdp.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    else await cdp.send("Emulation.setDefaultBackgroundColorOverride", {});
    const loaded = cdp.once("Page.loadEventFired", 20000);
    const nav = await cdp.send("Page.navigate", { url });
    if (nav.errorText) throw new CaptureError(`조각을 열지 못했습니다: ${nav.errorText}`);
    await loaded;

    const slice = spec.slice.mode !== "none";
    const ins = spec.slice.insets;
    let resize = null;
    if (slice && spec.slice.size === "compact" && spec.slice.fill === "stretch") {
      resize = {
        w: spec.slice.mode === "three-v" ? null : ins.l + ins.r + CENTER_MIN,
        h: spec.slice.mode === "three-h" ? null : ins.t + ins.b + CENTER_MIN,
      };
    }
    const pre = [];
    if (slice && spec.slice.size === "compact" && spec.slice.fill === "tile") pre.push("가운데를 반복(tile)할 때는 반복 무늬를 지키려고 원래 크기로 찍었습니다.");
    if (slice && spec.target.kind === "root") pre.push("조각 전체(body)를 9·3-slice로 찍었습니다. 틀이 되는 요소를 계층에서 골라 대상으로 지정하면 더 정확합니다.");
    const prep = await cdp.evaluate(preparePage, {
      target: spec.target, transparent: spec.background === "transparent", frameOnly: slice && spec.slice.frameOnly,
      resize, rootBox: spec.target.kind === "root" && !resize ? { w: vw, h: vh } : null, state,
    }, applyWebdState, rewriteStateSelectors, animInfo);
    if (prep.error) throw new CaptureError(prep.error, 409);
    const box = prep.rect;
    if (box.w < 1 || box.h < 1) throw new CaptureError(`대상(${prep.label})의 크기가 0입니다. 화면에 보이는 요소를 고르세요.`, 409);

    const ink = spec.bounds === "ink";
    const pad = ink ? BLEED : 0;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad) };
    clip.width = Math.min(prep.doc.w + pad, box.x + box.w + pad) - clip.x;
    clip.height = Math.min(prep.doc.h + pad, box.y + box.h + pad) - clip.y;
    const warnings = [...pre, ...prep.warnings];
    // 프레임 시각: CSS 애니메이션이 돌고 있고 내보내기에서 켰으면 fps 간격으로, 아니면 0초 한 장
    let times = [0];
    if (animate?.enabled && prep.anim?.length > 0) {
      const ft = frameTimes(prep.anim.length, animate.fps, animate.maxFrames);
      times = ft.times;
      if (ft.clipped) warnings.push(`애니메이션이 길어 앞쪽 ${times.length}프레임만 찍었습니다(전체 ${ft.total}프레임, ${Math.round(prep.anim.length)}ms). fps를 낮추거나 최대 프레임을 늘리세요.`);
      if (prep.anim.mixed) warnings.push("주기가 다른 반복 애니메이션이 섞여 있어 마지막 프레임과 첫 프레임이 매끄럽게 이어지지 않을 수 있습니다(가장 긴 주기로 찍음).");
    }
    const raws = [];
    for (const time of times) {
      if (times.length > 1) await cdp.evaluate(seekPage, time, seekAnimations);
      // optimizeForSpeed: 브라우저 안 PNG 압축만 가볍게(무손실이라 픽셀은 같음)
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true, clip: { ...clip, scale: 1 }, captureBeyondViewport: true, fromSurface: true });
      raws.push(decodePng(Buffer.from(shot.data, "base64")));
    }
    let images = raws;
    const ratio = raws[0].width / clip.width;   // 실제 픽셀 배율(= scale이어야 함)
    // 이미지 좌표의 상자
    let bx = { x: Math.round((box.x - clip.x) * ratio), y: Math.round((box.y - clip.y) * ratio), w: Math.round(box.w * ratio), h: Math.round(box.h * ratio) };
    if (Math.abs(ratio - scale) > 0.01) warnings.push(`캡처 배율이 ${ratio.toFixed(2)}배로 나왔습니다(요청 ${scale}배).`);

    if (ink) {
      // 프레임마다 그려진 범위를 합쳐(합집합) 모든 프레임을 같은 크기로 자른다(엔진에서 프레임이 흔들리지 않게)
      let u = null;
      for (const im of raws) {
        const bb = alphaBounds(im); if (!bb) continue;
        if (!u) { u = { ...bb }; continue; }
        const x = Math.min(u.x, bb.x), y = Math.min(u.y, bb.y);
        u = { x, y, w: Math.max(u.x + u.w, bb.x + bb.w) - x, h: Math.max(u.y + u.h, bb.y + bb.h) - y };
      }
      if (!u) throw new CaptureError("찍은 결과가 모두 투명합니다. 대상이 보이는지, '틀만 찍기'가 필요한 내용을 숨기지 않았는지 확인하세요.", 409);
      images = raws.map((im) => crop(im, u));
      bx = { x: bx.x - u.x, y: bx.y - u.y, w: bx.w, h: bx.h };
    }
    const image = images[0];

    let insets = null;
    if (slice) {
      const k = (v) => Math.round(v * ratio);
      const m = spec.slice.mode;
      // 상자 기준 인셋에 상자 밖으로 넘친 만큼(그림자 등)을 더한다
      insets = {
        l: m === "three-v" ? 0 : Math.max(0, k(ins.l) + bx.x),
        t: m === "three-h" ? 0 : Math.max(0, k(ins.t) + bx.y),
        r: m === "three-v" ? 0 : Math.max(0, k(ins.r) + (image.width - bx.x - bx.w)),
        b: m === "three-h" ? 0 : Math.max(0, k(ins.b) + (image.height - bx.y - bx.h)),
      };
      if (insets.l + insets.r >= image.width && m !== "three-v") warnings.push(`좌우 인셋(${insets.l}+${insets.r}px)이 이미지 폭(${image.width}px) 이상이라 가운데가 없습니다.`);
      if (insets.t + insets.b >= image.height && m !== "three-h") warnings.push(`상하 인셋(${insets.t}+${insets.b}px)이 이미지 높이(${image.height}px) 이상이라 가운데가 없습니다.`);
    }
    return { image, frames: images.map((im, i) => ({ image: im, time: times[i] })), box: bx, insets, cssBox: { w: box.w, h: box.h }, label: prep.label, warnings, anim: prep.anim };
  }

  async function attempt(job) {
    const { s, cdp } = await acquire();
    busy++;
    try { return await captureOnce(job, cdp); }
    catch (e) {
      // 탭·브라우저가 죽었으면 브라우저째 다시 띄운다(다른 탭에서 돌던 캡처도 실패해 각자 한 번 다시 시도한다)
      if (!(e instanceof CaptureError) && session === s) await reset();
      throw e;
    } finally { busy--; release(s, cdp); }
  }

  async function capture(job) {
    try { return await attempt(job); }
    catch (e) {
      if (e instanceof CaptureError) throw e;
      try { return await attempt(job); }        // 한 번만 다시 시도
      catch (e2) { throw e2 instanceof CaptureError ? e2 : new CaptureError(`캡처 실패: ${e2.message}`); }
    }
  }

  async function close() {
    while (busy || opening) await new Promise((r) => setTimeout(r, 20));
    await reset();
  }

  return { capture, close, tabs: TABS };
}
