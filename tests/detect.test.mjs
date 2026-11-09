// 실행: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detect, RULES } from "../skills/webd/scripts/detect.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, "fixtures", n);
const cli = join(here, "..", "skills", "webd", "scripts", "detect.mjs");
const ids = (r) => new Set(r.findings.map((f) => f.rule));

test("sloppy.html에서 정적 규칙이 모두 걸린다", () => {
  const found = ids(detect([fx("sloppy.html")]));
  const expected = [
    "gradient-text", "side-stripe-border", "glassmorphism", "purple-accent", "overused-font",
    "uniform-soft-shadow", "glow-shadow", "radial-glow-bg", "bounce-easing", "eyebrow-label",
    "all-caps-labels", "numbered-markers", "buzzword-copy", "em-dash-overuse", "arrow-suffix",
    "dot-meta", "pure-black-white", "img-missing-alt", "zoom-disabled", "focus-removed", "no-reduced-motion",
    "hidden-entrance",
  ];
  for (const id of expected) assert.ok(found.has(id), `안 걸림: ${id}`);
});

test("clean.html은 아무것도 걸리지 않는다 (blockquote 테두리, 주석, 토큰 선언 줄, alt=\"\", focus-visible 대체 포함)", () => {
  const r = detect([fx("clean.html")]);
  assert.deepEqual(r.findings.map((f) => `${f.rule}:${f.line}`), []);
});

test("a11y-bad.html에서 접근성·반응형 규칙이 모두 걸린다", () => {
  const found = ids(detect([fx("a11y-bad.html")]));
  for (const id of ["placeholder-as-label", "div-button", "positive-tabindex", "skipped-heading", "generic-link-text",
    "tiny-text", "justified-text", "fixed-wide-width", "viewport-100vh", "autoplay-sound", "emoji-icon"]) {
    assert.ok(found.has(id), `안 걸림: ${id}`);
  }
});

test("a11y-good.html은 걸리지 않는다 (label 감싸기, aria-label, role=button, muted, dvh, max-width)", () => {
  const r = detect([fx("a11y-good.html")]);
  assert.deepEqual(r.findings.map((f) => `${f.rule}:${f.line}`), []);
});

test("--allow로 허용한 규칙은 빠진다", () => {
  const found = ids(detect([fx("sloppy.html")], { allow: ["glassmorphism", "gradient-text"] }));
  assert.ok(!found.has("glassmorphism"));
  assert.ok(!found.has("gradient-text"));
  assert.ok(found.has("purple-accent"));
});

test("줄 번호가 주석 제거 뒤에도 원본과 맞다", () => {
  const r = detect([fx("sloppy.html")]);
  const g = r.findings.find((f) => f.rule === "gradient-text");
  assert.equal(g.line, 9);
  const alt = r.findings.find((f) => f.rule === "img-missing-alt");
  assert.equal(alt.line, 29);
});

test("hidden-entrance: 숨긴 채 시작하는 keyframes만 잡고, 보이는 상태에서 움직이는 것은 통과", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "webd-detect-"));
  try {
    const file = (name, css) => { const p = join(dir, name); writeFileSync(p, `<style>${css}</style>`); return p; };
    const hit = (p) => detect([p]).findings.filter((f) => f.rule === "hidden-entrance").length;
    assert.equal(hit(file("a.html", "@keyframes print { from { clip-path: inset(0 0 100% 0); } }")), 1);
    assert.equal(hit(file("b.html", "@keyframes fade { 0% { opacity: 0; transform: translateY(8px) } 100% { opacity: 1 } }")), 1);
    assert.equal(hit(file("c.html", "@keyframes drop { from { transform: translateY(-24px); } }")), 0);
    assert.equal(hit(file("d.html", "@keyframes soft { from { opacity: 0.6; } }")), 0);
    assert.equal(hit(file("e.html", "@keyframes out { to { opacity: 0; } }")), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("규칙 id가 겹치지 않는다", () => {
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
});

test("CLI 종료 코드: 지적 있음 2, 깨끗함 0, 잘못된 경로 1, 모르는 규칙 1", () => {
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8" }).status;
  assert.equal(run(fx("sloppy.html")), 2);
  assert.equal(run(fx("clean.html")), 0);
  assert.equal(run(fx("없는파일.html")), 1);
  assert.equal(run(fx("clean.html"), "--allow", "no-such-rule"), 1);
  assert.equal(run("--list-rules"), 0);
});

test("--json 출력이 파싱된다", () => {
  const out = spawnSync(process.execPath, [cli, fx("sloppy.html"), "--json"], { encoding: "utf8" }).stdout;
  const j = JSON.parse(out);
  assert.equal(j.files, 1);
  assert.ok(j.counts.high > 0);
});
