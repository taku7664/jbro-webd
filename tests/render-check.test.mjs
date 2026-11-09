// 실행: node --test tests/render-check.test.mjs
// Chrome·Edge·Chromium이 없으면 건너뜀 (WEBD_BROWSER로 지정 가능).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCheck, findBrowser } from "../skills/webd/scripts/render-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, "fixtures", n);
const cli = join(here, "..", "skills", "webd", "scripts", "render-check.mjs");
const skip = findBrowser() ? false : "Chrome·Edge·Chromium 없음";
const rules = (run) => new Set(run.findings.map((f) => f.rule));

test("나쁜 픽스처 375px: 렌더에서만 보이는 문제를 모두 잡는다", { skip, timeout: 120000 }, async () => {
  const { runs } = await renderCheck(fx("render-bad.html"), { widths: [375] });
  const found = rules(runs[0]);
  for (const r of ["contrast", "focus-indicator", "small-text", "hangul-fallback", "h-scroll", "tap-target"]) assert.ok(found.has(r), `안 걸림: ${r}`);
  const c = runs[0].findings.find((f) => f.rule === "contrast" && f.target === "p.over");
  assert.match(c.detail, /^1\.8\d/, "도형 위 글자 대비는 도형 색 기준으로 계산");
  const svg = runs[0].findings.find((f) => f.rule === "small-text");
  assert.match(svg.detail, /^6\.0px/, "SVG 글자는 축소된 실제 크기");
});

test("나쁜 픽스처 1440px: 가로 넘침은 없다", { skip, timeout: 120000 }, async () => {
  const { runs } = await renderCheck(fx("render-bad.html"), { widths: [1440] });
  assert.ok(!rules(runs[0]).has("h-scroll"));
});

test("좋은 픽스처: 두 폭 × 두 모드에서 high·medium 0건", { skip, timeout: 180000 }, async () => {
  const { runs } = await renderCheck(fx("render-good.html"), { widths: [375, 1440], schemes: ["light", "dark"] });
  assert.equal(runs.length, 4);
  for (const r of runs) assert.deepEqual(r.findings.filter((f) => f.severity !== "advisory").map((f) => `${f.rule}:${f.target}`), [], `${r.width} ${r.scheme}`);
});

test("CLI: 지적 있음 2, 없음 0, 없는 파일 1, 스크린샷 저장", { skip, timeout: 180000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "webd-shot-"));
  try {
    const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8", timeout: 120000 });
    assert.equal(run(fx("render-bad.html"), "--widths", "375").status, 2);
    assert.equal(run(fx("render-good.html"), "--widths", "375", "--out", out).status, 0);
    const shot = join(out, "375-light.png");
    assert.ok(existsSync(shot) && statSync(shot).size > 1000, "스크린샷 PNG");
    assert.equal(run(fx("없는파일.html")).status, 1);
    assert.equal(run(fx("render-good.html"), "--widths", "abc").status, 1);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
