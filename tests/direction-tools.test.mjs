// 실행: node --test tests/direction-tools.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate, toHex, hexToOklch, oklchToRgb, fitGamut, contrast } from "../skills/webd/scripts/palette.mjs";
import { deal, FAMILIES, BANNED, MODE_RULES, STRUCTURE_DISCIPLINES } from "../skills/webd/scripts/dealer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const scripts = join(here, "..", "skills", "webd", "scripts");
const run = (file, ...a) => spawnSync(process.execPath, [join(scripts, file), ...a], { encoding: "utf8" });

// ---------- palette ----------

test("hex → OKLCH → hex 왕복이 거의 같다", () => {
  for (const hex of ["#1f4d3a", "#e4572e", "#2d4fa0", "#dcc9a6", "#000000", "#ffffff"]) {
    const back = toHex(hexToOklch(hex));
    const d = [1, 3, 5].map((i) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)));
    assert.ok(Math.max(...d) <= 1, `${hex} → ${back}`);
  }
});

test("fitGamut 결과는 sRGB 안이고 밝기·색상은 유지", () => {
  const c = fitGamut(0.7, 0.4, 145);
  assert.ok(oklchToRgb(c.L, c.C, c.H).every((v) => v >= -0.001 && v <= 1.001));
  assert.equal(c.L, 0.7); assert.equal(c.H, 145);
  assert.ok(c.C < 0.4);
});

test("모든 색상·채도·모드에서 글자 단계 대비 기준을 넘는다", () => {
  for (const chroma of ["muted", "balanced", "vivid"]) {
    for (let h = 0; h < 360; h += 30) {
      const p = generate({ seed: h, chroma, harmony: "triadic" });
      for (const [mode, s] of Object.entries(p.schemes)) {
        for (const [k, v] of Object.entries(s.contrast)) {
          const need = k.includes("-12") ? 7 : 4.5;
          assert.ok(v >= need, `${chroma} ${h}° ${mode} ${k} = ${v.toFixed(2)}`);
        }
      }
    }
  }
});

test("단계는 라이트에서 어두워지고 다크에서 밝아진다", () => {
  const p = generate({ seed: 150 });
  const L = (arr) => arr.map((c) => c.L);
  const light = L(p.schemes.light.accent), dark = L(p.schemes.dark.accent);
  for (let i = 1; i < 12; i++) { assert.ok(light[i] <= light[i - 1] + 1e-9, `light ${i}`); assert.ok(dark[i] >= dark[i - 1] - 1e-9, `dark ${i}`); }
});

test("다크 9단계는 라이트보다 밝고 채도가 낮다", () => {
  const p = generate({ seed: 250, chroma: "vivid" });
  assert.ok(p.schemes.dark.accent[8].L > p.schemes.light.accent[8].L);
  assert.ok(p.schemes.dark.accent[8].C < p.schemes.light.accent[8].C);
});

test("hex 시드는 그 색상의 hue를 쓴다", () => {
  const p = generate({ seed: "#1F4D3A" });
  assert.ok(Math.abs(p.seed.hue - hexToOklch("#1F4D3A").H) < 0.1);
});

test("palette CLI: CSS 출력, JSON, 잘못된 입력", () => {
  const css = run("palette.mjs", "--seed", "150", "--prefix", "b-");
  assert.equal(css.status, 0);
  assert.match(css.stdout, /--b-accent-9: #[0-9a-f]{6};/);
  assert.match(css.stdout, /prefers-color-scheme: dark/);
  assert.equal(JSON.parse(run("palette.mjs", "--seed", "20", "--json", "--scheme", "light").stdout).schemes.light.accent.length, 12);
  assert.equal(run("palette.mjs").status, 1);
  assert.equal(run("palette.mjs", "--seed", "abc").status, 1);
  assert.equal(run("palette.mjs", "--seed", "10", "--chroma", "neon").status, 1);
});

test("contrast 기준값", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff") * 100) / 100, 21);
});

// ---------- dealer ----------

test("같은 시드는 같은 패, reroll은 다른 패", () => {
  const a = deal({ project: "p", seedDate: "2026-11-09" });
  const b = deal({ project: "p", seedDate: "2026-11-09" });
  const c = deal({ project: "p", seedDate: "2026-11-09", reroll: 1 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hands, c.hands);
});

test("후보끼리 계열·구성 방식·시그니처가 겹치지 않는다", () => {
  for (let r = 0; r < 20; r++) {
    const { hands } = deal({ project: "q", seedDate: "2026-11-09", candidates: 5, reroll: r });
    for (const key of ["family", "discipline", "signature"]) assert.equal(new Set(hands.map((h) => h[key])).size, hands.length, `${key} r${r}`);
  }
});

test("빌리는 축은 1–2개, 바탕과 다른 계열에서, 색과 구성을 함께 빌리지 않음", () => {
  for (let r = 0; r < 50; r++) {
    for (const h of deal({ project: "z", seedDate: "2026-11-09", candidates: 4, reroll: r }).hands) {
      assert.ok(h.borrow.length >= 1 && h.borrow.length <= 2);
      assert.ok(h.borrow.every((b) => b.from !== h.family));
      const axes = h.borrow.map((b) => b.axis);
      assert.ok(!(axes.includes("color") && axes.includes("composition")));
      assert.equal(new Set(axes).size, axes.length);
    }
  }
});

test("pin한 축은 모든 후보에 들어간다", () => {
  const { hands } = deal({ project: "p", seedDate: "2026-11-09", candidates: 3, pins: { hue: "150", borrow: "motion", from: "cinematic" } });
  for (const h of hands) { assert.equal(h.hue, 150); assert.equal(h.borrow[0].axis, "motion"); assert.equal(h.borrow[0].from, "cinematic"); }
});

test("pin 없이는 AI 티 조합을 나눠 주지 않는다", () => {
  for (let r = 0; r < 60; r++) {
    for (const h of deal({ project: "ban", seedDate: "2026-11-09", candidates: 6, reroll: r }).hands) {
      const raw = { family: h.family, hue: h.hue, borrow: h.borrow };
      assert.ok(!BANNED.some((b) => b.test(raw)), `${h.family} ${h.hue}`);
    }
  }
});

test("사용자가 AI 티 조합을 직접 고정하면 허용하고 경고한다", () => {
  const { hands } = deal({ project: "p", seedDate: "2026-11-09", candidates: 1, pins: { family: "terminal", hue: "190" } });
  assert.match(hands[0].warning, /시안/);
});

test("operate + workbench: 도구 화면에 맞는 패만 나눠 준다", () => {
  const op = MODE_RULES.operate;
  for (let r = 0; r < 40; r++) {
    for (const h of deal({ project: "tool", seedDate: "2026-11-09", candidates: 3, reroll: r, mode: "operate", structure: "workbench" }).hands) {
      assert.ok(op.families.includes(h.family), `바탕 ${h.family}`);
      assert.ok(STRUCTURE_DISCIPLINES.workbench.includes(h.discipline), `구성 ${h.discipline}`);
      assert.ok(op.signatures.includes(h.signature), `시그니처 ${h.signature}`);
      assert.ok(h.borrow.every((b) => ["color", "type"].includes(b.axis)), "빌리는 축은 색·타입만");
      assert.equal(h.axes.motion.from, "mode");
      assert.equal(h.axes.composition.from, "mode");
      assert.ok(!["poster-blocks", "full-bleed", "single-column", "gallery-wall"].includes(h.discipline));
    }
  }
});

test("모드만 주면 그 모드의 구성 방식, 모드 없이 구조만 주면 구조의 구성 방식", () => {
  for (let r = 0; r < 20; r++) {
    for (const h of deal({ project: "doc", seedDate: "2026-11-09", reroll: r, mode: "read" }).hands) assert.ok(MODE_RULES.read.disciplines.includes(h.discipline));
    for (const h of deal({ project: "mon", seedDate: "2026-11-09", reroll: r, structure: "monitor" }).hands) assert.ok(STRUCTURE_DISCIPLINES.monitor.includes(h.discipline));
  }
  const res = deal({ project: "p", seedDate: "2026-11-09", mode: "operate" });
  assert.equal(res.mode, "operate");
  assert.match(res.note, /라벨·버튼/);
});

test("색 전략: 모드별로 나눠 주고, pin하면 고정, 황토 색상은 주의 표시", () => {
  const seen = new Set();
  for (let r = 0; r < 40; r++) for (const h of deal({ project: "s", seedDate: "2026-11-09", reroll: r, mode: "operate" }).hands) { seen.add(h.strategy); assert.ok(h.strategyDesc); assert.equal(h.caution !== null, h.hue >= 20 && h.hue <= 85); }
  assert.ok(!seen.has("drenched"), "operate에는 몰입 없음");
  assert.ok(seen.has("committed"), "operate에도 확신 전략이 나옴");
  for (const h of deal({ project: "s", seedDate: "2026-11-09", pins: { strategy: "full" } }).hands) assert.equal(h.strategy, "full");
  assert.throws(() => deal({ project: "s", seedDate: "2026-11-09", pins: { strategy: "loud" } }));
  for (let r = 0; r < 30; r++) for (const h of deal({ project: "t", seedDate: "2026-11-09", reroll: r, mode: "operate" }).hands) assert.notEqual(h.family, "terminal", "operate 바탕에 터미널 없음");
});

test("구조 여럿은 쉼표로, 공통 구성 방식만", () => {
  const both = STRUCTURE_DISCIPLINES["list-detail"].filter((d) => STRUCTURE_DISCIPLINES.workbench.includes(d));
  for (let r = 0; r < 20; r++) for (const h of deal({ project: "c", seedDate: "2026-11-09", reroll: r, structure: "list-detail,workbench" }).hands) assert.ok(both.includes(h.discipline), h.discipline);
  assert.throws(() => deal({ project: "p", seedDate: "2026-11-09", structure: "workbench,nope" }));
});

test("잘못된 입력", () => {
  assert.throws(() => deal({ project: "p", seedDate: "2026-11-09", mode: "landing" }));
  assert.throws(() => deal({ project: "p", seedDate: "2026-11-09", structure: "editor" }));
  assert.equal(run("dealer.mjs", "--project", "p", "--seed-date", "2026-11-09", "--mode", "x").status, 1);
  assert.equal(run("dealer.mjs", "--project", "p", "--seed-date", "2026-11-09", "--mode", "operate", "--structure", "workbench").status, 0);
  assert.throws(() => deal({ project: "p", seedDate: "11/09" }));
  assert.throws(() => deal({ project: "p", seedDate: "2026-11-09", pins: { family: "nope" } }));
  assert.throws(() => deal({ project: "p", seedDate: "2026-11-09", candidates: 9 }));
  assert.equal(run("dealer.mjs", "--project", "p", "--seed-date", "x").status, 1);
  assert.equal(run("dealer.mjs", "--project", "p", "--seed-date", "2026-11-09").status, 0);
  assert.ok(Object.keys(FAMILIES).length >= 12);
});
