// 실행: node --test tests/measure-tools.test.mjs
// image-tokens(레퍼런스 이미지 색 측정)와 css-inventory(CSS 값 세기) 테스트.
// image-tokens는 Chrome·Edge·Chromium이 없으면 건너뜀.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";
import { imageTokens } from "../skills/webd/scripts/image-tokens.mjs";
import { measurePixels } from "../skills/webd/scripts/browser/image-measure.mjs";
import { inventory } from "../skills/webd/scripts/css-inventory.mjs";
import { findBrowser } from "../skills/webd/scripts/render-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "skills", "webd", "scripts");
const run = (file, ...a) => spawnSync(process.execPath, [join(scripts, file), ...a], { encoding: "utf8", timeout: 120000 });
const skip = findBrowser() ? false : "Chrome·Edge·Chromium 없음";

test("이미지 계산: 가까운 OKLab 버킷은 합치고 흰색과 검정의 대비는 21", () => {
  const data = Uint8ClampedArray.from([
    255, 255, 255, 255, 246, 246, 246, 255, 255, 255, 255, 255,
    0, 0, 0, 255, 255, 0, 0, 0,
  ]);
  const result = measurePixels({ data, width: 5, height: 1 }, 10, [
    { x: 0, y: 0, pixel: [255, 255, 255, 255] }, { x: 5, y: 0, pixel: null },
  ]);
  assert.deepEqual(result.colors.map(({ hex, area }) => [hex, area]), [["#fcfcfc", 0.75], ["#000000", 0.25]]);
  assert.equal(result.colors[0].oklch.h, null);
  assert.ok(result.colors[1].contrastToBg > 20);
  assert.equal(result.samples[1].error, "이미지 밖");
  const white = measurePixels({ data: data.slice(0, 4), width: 1, height: 1 }, 10, [{ x: 0, y: 1, pixel: [0, 0, 0, 255] }]);
  assert.equal(white.samples[0].contrastToBg, 21);
  assert.throws(() => measurePixels({ data: data.slice(-4), width: 1, height: 1 }), /불투명한 픽셀/);
});

test("이미지 계산: 가로 3픽셀 이상의 색만 포인트 후보로 삼는다", () => {
  const row = [[252, 252, 250], [36, 123, 181], [36, 123, 181], [36, 123, 181], [252, 252, 250], [220, 40, 40], [252, 252, 250]];
  const data = Uint8ClampedArray.from([...row, ...Array(7).fill([252, 252, 250])].flatMap((pixel) => [...pixel, 255]));
  const result = measurePixels({ data, width: row.length, height: 2 });
  assert.equal(result.roles.background, "#fcfcfa");
  assert.deepEqual(result.roles.accentCandidates.map(({ hex }) => hex), ["#247bb5"]);
});

// 의존성 없이 RGB PNG 만들기
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("image-tokens: 바탕·포인트를 재고, 한 픽셀 번짐은 포인트로 안 본다, crop·at", { skip, timeout: 120000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "webd-img-"));
  try {
    // 흰 바탕 120×80, 파란 블록 30×12, 세로 1픽셀 빨간·노란 번짐 줄(가로로 이어지지 않음), 오른쪽 10px 회색 띠(스크롤바 흉내)
    const file = join(dir, "ref.png");
    writeFileSync(file, png(120, 80, (x, y) => {
      if (x >= 110) return [120, 120, 120];
      if (x >= 10 && x < 40 && y >= 10 && y < 22) return [36, 123, 181];
      if (y >= 40 && y < 70 && (x === 60 || x === 64)) return x === 60 ? [220, 40, 40] : [230, 200, 20];
      return [252, 252, 250];
    }));
    const r = await imageTokens(file, { colors: 5, at: [[15, 15]], crop: [0, 0, 110, 80] });
    assert.equal(r.roles.background, "#fcfcfa");
    assert.ok(r.colors[0].area > 0.9);
    assert.equal(r.roles.accent, "#247bb5", "가로로 이어진 파란 면이 포인트");
    assert.ok(!r.roles.accentCandidates.some((a) => /^#(dc2828|e6c814)$/.test(a.hex)), "세로 1픽셀 번짐은 후보가 아님");
    assert.equal(r.samples[0].hex, "#247bb5");
    assert.ok(!r.colors.some((c) => c.hex === "#787878"), "crop 밖 회색 띠는 세지 않음");
    assert.equal(run("image-tokens.mjs", file, "--crop", "1,2").status, 1);
    assert.equal(run("image-tokens.mjs", join(dir, "없음.png")).status, 1);
    assert.equal(run("image-tokens.mjs", file, "--colors", "4").status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("css-inventory: 값을 세고, 토큰 밖 색·4px 격자 밖 간격·거의 같은 글자 크기를 짚는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "webd-css-"));
  try {
    const file = join(dir, "a.html");
    writeFileSync(file, `<style>
      :root { --ink: #222; --sp: 8px; }
      a { color: var(--ink); padding: 8px 12px; margin: 0; font-size: 15px; border-radius: 6px; }
      b { color: #ff0000; background: color-mix(in srgb, var(--ink) 30%, transparent); padding: 7px; font-size: 16px; width: calc(100% - 4px); }
      i { font-weight: 600; line-height: 1.6; transition: opacity .2s; box-shadow: 0 1px 2px rgb(0 0 0 / .2); }
    </style><p style="gap: 10px">x</p>`);
    const r = inventory([file]);
    assert.equal(r.customProperties.defined, 2);
    assert.deepEqual(r.colors.literalInRules.map(([c]) => c).sort(), ["#ff0000", "color-mix(in srgb,var(--ink) 30%,transparent)", "rgb(0 0 0/.2)"].sort());
    const sp = Object.fromEntries(r.spacing);
    assert.equal(sp["8px"], 1); assert.equal(sp["0"], 1); assert.equal(sp["10px"], 1);
    assert.ok(!("100" in sp) && !("100%" in sp), "calc(100% …)는 width라 간격이 아님");
    const off = r.nearDuplicates.find((d) => d.offGrid);
    assert.deepEqual(off.offGrid.sort(), ["10px(1)", "7px(1)"].sort());
    assert.ok(r.nearDuplicates.some((d) => d.category === "fontSize" && d.values.join() === "15px(1),16px(1)"));
    assert.deepEqual(r.weight, [["600", 1]]);
    assert.equal(run("css-inventory.mjs", file).status, 0);
    assert.equal(run("css-inventory.mjs", join(dir, "없음")).status, 1);
    assert.equal(run("css-inventory.mjs", file, "--bad").status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
