// 실행: node --test tests/check-style.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, parseSpec, checkSpec } from "../skills/webd/scripts/check-style.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "skills", "webd", "scripts", "check-style.mjs");
const stylesDir = join(here, "..", "skills", "webd", "styles");
const F = "```";

test("WCAG 대비: 검정/흰색 21, 같은 색 1, 3자리 hex", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrast("#777777", "#777777"), 1);
  assert.equal(contrast("#fff", "#ffffff"), 1);
  // 알려진 값: #767676 / 흰색 ≈ 4.54
  assert.equal(Math.round(contrast("#767676", "#ffffff") * 100) / 100, 4.54);
});

const spec = (contrastBody) => `# X\n\n${F}\n역할 값\nbg   #FFFFFF  바탕\ntext #767676  본문\nlight #AAAAAA 연함\n${F}\n\n${F}contrast\n${contrastBody}\n${F}\n`;

test("색 표와 대비 표를 읽는다", () => {
  const { colors, pairs } = parseSpec(spec("text bg 4.5"));
  assert.deepEqual(colors, { bg: "#FFFFFF", text: "#767676", light: "#AAAAAA" });
  assert.deepEqual(pairs, [{ fg: "text", bg: "bg", min: 4.5 }]);
});

test("기준 미달과 정의 안 된 역할을 잡는다", () => {
  const r = checkSpec(spec("text bg 4.5\nlight bg 4.5\nghost bg 3"));
  assert.equal(r.pairs[0].ok, true);
  assert.equal(r.pairs[1].ok, false);
  assert.equal(r.pairs[2].ok, false);
  assert.match(r.pairs[2].error, /ghost/);
});

test("저장소의 스타일은 모두 contrast 블록이 있고 통과한다", () => {
  const res = spawnSync(process.execPath, [cli, stylesDir], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test("CLI: 미달 2, contrast 블록 없음 2, 인자 없음 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "webd-style-"));
  try {
    writeFileSync(join(dir, "bad.md"), spec("light bg 4.5"));
    writeFileSync(join(dir, "none.md"), `# Y\n\n${F}\nbg #FFFFFF\n${F}\n`);
    const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: "utf8" }).status;
    assert.equal(run(join(dir, "bad.md")), 2);
    assert.equal(run(join(dir, "none.md")), 2);
    assert.equal(run(), 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
