// 실행: node --test tests/render-check.test.mjs
// Chrome·Edge·Chromium이 없으면 건너뜀 (WEBD_BROWSER로 지정 가능).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderCheck, findBrowser } from "../skills/webd/scripts/render-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => join(here, "fixtures", n);
const cli = join(here, "..", "skills", "webd", "scripts", "render-check.mjs");
const skip = findBrowser() ? false : "Chrome·Edge·Chromium 없음";
const rules = (run) => new Set(run.findings.map((f) => f.rule));
const profileDirs = (dir) => readdirSync(dir).filter((name) => name.startsWith("webd-render-"));
const isolatedTemp = (dir) => ({ ...process.env, TMP: dir, TEMP: dir, TMPDIR: dir });

test("브라우저를 시작할 수 없어도 검증용 프로필을 정리한다", () => {
  const out = mkdtempSync(join(tmpdir(), "webd-startup-test-"));
  try {
    const script = `
      import assert from "node:assert/strict";
      import { launch } from ${JSON.stringify(pathToFileURL(cli).href)};
      await assert.rejects(launch(process.argv[1]), { code: "ENOENT" });
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, join(out, "missing-browser.exe")],
      { encoding: "utf8", env: isolatedTemp(out), timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(profileDirs(out), []);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

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
    const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8", env: isolatedTemp(out), timeout: 120000 });
    const bad = run(fx("render-bad.html"), "--widths", "375");
    assert.equal(bad.status, 2, bad.stderr);
    assert.deepEqual(profileDirs(out), []);
    const good = run(fx("render-good.html"), "--widths", "375", "--out", out);
    assert.equal(good.status, 0, good.stderr);
    assert.deepEqual(profileDirs(out), []);
    const shot = join(out, "375-light.png");
    assert.ok(existsSync(shot) && statSync(shot).size > 1000, "스크린샷 PNG");
    assert.equal(run(fx("없는파일.html")).status, 1);
    assert.equal(run(fx("render-good.html"), "--widths", "abc").status, 1);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("앱 틀 넘침: 패널 밖으로 새는 absolute 라벨을 잡는다", { skip, timeout: 120000 }, async () => {
  const { runs } = await renderCheck(fx("render-shell-bad.html"), { widths: [1280], schemes: ["light", "dark"] });
  for (const r of runs) {
    const f = r.findings.find((x) => x.rule === "shell-overflow");
    assert.ok(f, `shell-overflow 안 걸림 (${r.scheme})`);
    assert.match(f.detail, /label\.visually-hidden/);
    // body 밖으로 밀려난 글자의 바탕은 흰색이 아니라 body 배경이 번진 캔버스
    assert.ok(!r.findings.some((x) => x.rule === "contrast"), `캔버스 색 오판 (${r.scheme})`);
  }
});

test("앱 틀 좋은 예: 넘침 없음, 다크 대비는 body 배경 기준, 넓은 화면 32px 버튼 통과, 나가기 경고 감지", { skip, timeout: 180000 }, async () => {
  const { runs, dialogs } = await renderCheck(fx("render-shell-good.html"), { widths: [375, 1280], schemes: ["light", "dark"] });
  for (const r of runs) {
    assert.deepEqual(r.findings.filter((f) => f.severity !== "advisory").map((f) => `${f.rule}:${f.target}:${f.detail}`), [], `${r.width} ${r.scheme}`);
    if (r.width >= 768) assert.ok(!r.findings.some((f) => f.rule === "tap-target"), "넓은 화면은 24px 기준");
    assert.ok(!r.findings.some((f) => f.rule === "tap-target" && /checkbox|input(?!#)/.test(f.target) && !/btn/.test(f.target)), "라벨이 44px인 체크박스는 통과");
  }
  assert.ok(dialogs.includes("beforeunload"), "beforeunload 대화상자를 수락하고 기록");
  const m = runs.find((r) => r.width === 1280 && r.scheme === "light").metrics;
  assert.ok(m && typeof m.boxes === "number" && m.fontSizes >= 1, "첫 화면 수치");
  assert.equal(m.filledButtons, 0, "채움 버튼 없음(테두리 버튼만)");
});

test("--height와 첫 화면 스크린샷", { skip, timeout: 120000 }, () => {
  const out = mkdtempSync(join(tmpdir(), "webd-first-"));
  try {
    const r = spawnSync(process.execPath, [cli, fx("render-shell-good.html"), "--widths", "1280", "--height", "800", "--out", out, "--json"], { encoding: "utf8", timeout: 120000 });
    assert.equal(r.status, 0);
    const j = JSON.parse(r.stdout);
    assert.equal(j.runs[0].height, 800);
    assert.ok(existsSync(join(out, "1280-light-first.png")) && statSync(join(out, "1280-light-first.png")).size > 1000);
    assert.equal(spawnSync(process.execPath, [cli, fx("render-shell-good.html"), "--height", "10"], { encoding: "utf8" }).status, 1);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
