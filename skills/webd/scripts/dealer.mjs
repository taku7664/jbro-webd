#!/usr/bin/env node
// dealer.mjs — 방향 후보를 시드로 "나눠 주는" 딜러. 의존성 없음, Node 18+.
//
// 모델이 직접 고르면 비슷한 곳으로 수렴한다. 딜러는 후보마다
//   바탕 계열 · 빌릴 축과 출처 계열 · 구성 방식 · 기준 색상 · 시그니처 종류
// 를 나눠 주고, 모델은 다시 고르지 않고 받은 패를 주제에 맞게 정당화·구체화한다(reference/archetypes.md).
// 같은 --project / --seed-date / --reroll 이면 같은 패가 나온다. 시계·Math.random을 쓰지 않는다.
//
// 사용법:
//   node dealer.mjs --project "둘째화요일" --seed-date 2026-11-09 --candidates 3
//   node dealer.mjs --project x --seed-date 2026-11-09 --pin family=swiss --pin hue=150 --reroll 1 --json
// --pin 가능한 축: family, borrow(type|color|composition|motion), from(계열 id), discipline, hue(0-360), signature
// 종료 코드: 0 성공, 1 사용 오류, 3 조건을 만족하는 패를 만들 수 없음

import { pathToFileURL } from "node:url";

export const FAMILIES = {
  editorial: { name: "에디토리얼 절제", type: "명조 디스플레이 + 고딕 본문, 넉넉한 행간", color: "종이색 무채 + 먹색 + 차분한 포인트 하나", composition: "한 칼럼, 넓은 여백, 가는 선", motion: "거의 없음, 200–300ms 페이드" },
  swiss: { name: "스위스", type: "그로테스크 한 패밀리, 엄격한 스케일", color: "흑·백 + 강한 포인트 하나", composition: "보이는 그리드, 왼쪽 정렬, 반경·그림자 없음", motion: "즉시, 100–150ms" },
  neobrutal: { name: "네오브루탈", type: "아주 굵은 디스플레이 + 평범한 본문", color: "시끄러운 단색 한두 개 + 검은 테두리", composition: "두꺼운 테두리, 블러 없는 오프셋 그림자", motion: "짧고 물리적, 밀림" },
  terminal: { name: "터미널", type: "고정폭 위주, 굵기·색으로 위계", color: "색조 있는 어두운 바탕 + 포인트 하나", composition: "촘촘, 표, 상자 문자", motion: "즉시·타이핑" },
  data: { name: "데이터 전문가", type: "촘촘한 고딕 + 표 숫자", color: "차가운 무채 크롬, 채도는 데이터에만", composition: "좁은 간격, 차트가 주인공, 1px 경계", motion: "상태 변화만" },
  cinematic: { name: "시네마틱 다크", type: "거대한 디스플레이", color: "색조 있는 어둠 + 한 방향의 빛", composition: "전체 폭 섹션, 큰 크기 차이", motion: "연출 있는 등장 하나" },
  playful: { name: "기하 놀이", type: "둥글고 통통한 디스플레이", color: "같은 밝기의 밝은 색 3–4개", composition: "의미 있는 도형, 섞인 반경, 스티커", motion: "직접 조작에만 탄력" },
  softfuture: { name: "부드러운 미래", type: "따뜻한 중립 고딕", color: "아주 옅은 색조 대기 + 포인트 하나", composition: "겹친 면, 큰 반경, 구조로서의 투명", motion: "유동적, 층 순서 설명" },
  deco: { name: "아르데코", type: "고대비 디스플레이 + 조용한 본문", color: "깊은 바탕 + 금속성 포인트", composition: "엄격한 대칭, 가는 장식선", motion: "느리고 신중" },
  organic: { name: "자연·유기", type: "명조 본문 + 짧은 손글씨", color: "이끼·나무껍질·돌의 저채도", composition: "부드러운 형태, 질감", motion: "느린 페이드" },
  print: { name: "인쇄 공예", type: "굵은 디스플레이 + 담백한 본문", color: "별색 두세 개의 겹침", composition: "포스터 같은 덩어리, 판 어긋남", motion: "거의 없음" },
  wayfinding: { name: "공공 안내", type: "가독성 최우선 고딕, 큰 글자", color: "기능 색(노선·안전색)", composition: "엄격한 정보 위계, 픽토그램", motion: "없음" },
};

export const DISCIPLINES = {
  "single-column": "한 칼럼 서술. 넓은 여백, 위에서 아래로 읽힘",
  "strict-grid": "12칼럼 엄격 그리드. 모든 요소가 정렬선에 붙음",
  "asymmetric-split": "비대칭 분할. 한쪽이 무겁고 한쪽이 가벼움",
  "full-bleed": "화면 폭 전체를 쓰는 섹션의 연속",
  "dense-panels": "크기가 다른 패널 묶음. 중요도가 크기",
  "poster-blocks": "포스터처럼 큰 덩어리 두세 개",
  "ledger": "장부·표처럼 한 줄씩 읽히는 목록",
  "sidebar-reference": "고정 사이드 내비 + 본문 칼럼 (문서식)",
  "gallery-wall": "벽에 건 것처럼 크기·위치가 조금씩 다른 배치",
  "timeline": "시간·단계 축을 따라 흐르는 배치",
};

export const SIGNATURES = [
  "여백에 매단 거대한 순서 번호 (내용이 실제 순서일 때만)",
  "모든 인터랙티브 요소가 공유하는 하나의 물리적 반응",
  "포인트 색을 현재 위치와 주 행동에만 쓰는 규칙",
  "표 테두리·구분을 문자(상자 그리기, 점선 문자)로",
  "모든 이미지를 같은 고유 도형으로 자르기",
  "제목이 테두리를 끊고 들어가는 지도 범례식 머리",
  "섹션을 잇는 하나의 연속된 선",
  "주제 세계의 실제 물건 하나를 화면 구조로 (영수증, 표지판, 티켓)",
  "숫자·데이터를 주인공으로 한 타이포그래피",
  "한 번만 일어나는 진입 연출 하나",
  "주석·각주가 본문 옆 여백에 붙는 체계",
  "색 대신 굵기·크기만으로 만든 위계",
  "의도적으로 어긋난 정렬선 하나",
  "인쇄물의 흔적(판 어긋남, 재단선, 접힌 자국) 하나",
];

const AXES = ["type", "color", "composition", "motion"];
const BORROW_WEIGHTS = { type: 0.4, motion: 0.3, color: 0.15, composition: 0.15 };

// 알려진 AI 티 조합: 이 칸은 딜러가 나눠 주지 않는다 (pin으로 사용자가 고르면 허용)
const inRange = (h, a, b) => (a <= b ? h >= a && h <= b : h >= a || h <= b);
export const BANNED = [
  { why: "어두운 바탕 + 시안·청록 포인트", test: (c) => ["terminal", "cinematic", "softfuture"].includes(c.family) && inRange(c.hue, 175, 215) },
  { why: "보라–남색 포인트", test: (c) => inRange(c.hue, 265, 300) },
  { why: "크림 + 세리프 + 테라코타", test: (c) => ["editorial", "organic"].includes(c.family) && inRange(c.hue, 20, 45) },
  { why: "장식용 글래스모피즘 + 어두운 청색", test: (c) => c.family === "softfuture" && c.borrow.some((b) => b.from === "cinematic") },
];

// ---------- 결정적 난수 ----------

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function rng(seedStr) {
  let a = hash(seedStr)();
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function weighted(r, weights, exclude = []) {
  const entries = Object.entries(weights).filter(([k]) => !exclude.includes(k));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) { if ((x -= w) <= 0) return k; }
  return entries[entries.length - 1][0];
}

export const GOLDEN = 137.508;

export function deal({ project, seedDate, candidates = 3, reroll = 0, pins = {} }) {
  if (!project) throw usage("--project가 필요합니다.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seedDate || "")) throw usage("--seed-date는 YYYY-MM-DD (재현 기준 날짜, 시계를 쓰지 않음)");
  if (!(candidates >= 1 && candidates <= 6)) throw usage("--candidates는 1–6");
  validatePins(pins);

  const r = rng(`${project}|${seedDate}|${reroll}`);
  const baseHue = pins.hue !== undefined ? Number(pins.hue) : Math.floor(r() * 360);
  const usedFamilies = new Set(), usedDisc = new Set(), usedSig = new Set();
  const hands = [];

  for (let i = 0; i < candidates; i++) {
    let hand = null;
    for (let attempt = 0; attempt < 200 && !hand; attempt++) {
      const familyPool = Object.keys(FAMILIES).filter((f) => !usedFamilies.has(f) || Object.keys(FAMILIES).length <= usedFamilies.size);
      const family = pins.family || pick(r, familyPool);
      const n = pins.borrow ? 1 : r() < 0.3 ? 2 : 1;
      const borrow = [];
      for (let k = 0; k < n; k++) {
        const exclude = borrow.map((b) => b.axis);
        if (borrow.some((b) => b.axis === "color")) exclude.push("composition");     // 색과 구성은 같이 빌리지 않음
        if (borrow.some((b) => b.axis === "composition")) exclude.push("color");
        const axis = k === 0 && pins.borrow ? pins.borrow : weighted(r, BORROW_WEIGHTS, exclude);
        const fromPool = Object.keys(FAMILIES).filter((f) => f !== family);
        const from = k === 0 && pins.from ? pins.from : pick(r, fromPool);
        borrow.push({ axis, from });
      }
      const discPool = Object.keys(DISCIPLINES).filter((d) => !usedDisc.has(d));
      const discipline = pins.discipline || pick(r, discPool.length ? discPool : Object.keys(DISCIPLINES));
      const hue = pins.hue !== undefined ? Number(pins.hue) : Math.round((baseHue + GOLDEN * (i + attempt * 0.37)) % 360);
      const sigPool = SIGNATURES.filter((s) => !usedSig.has(s));
      const signature = pins.signature || pick(r, sigPool.length ? sigPool : SIGNATURES);
      const c = { family, borrow, discipline, hue, signature };
      const pinnedAll = pins.family && pins.hue !== undefined;
      const banned = BANNED.find((b) => b.test(c));
      if (banned && !pinnedAll) continue;     // 사용자가 고정한 조합이면 허용
      hand = { ...c, warning: banned ? `사용자 고정 조합이 AI 티 군집과 겹침: ${banned.why}` : null };
    }
    if (!hand) throw Object.assign(new Error("조건을 만족하는 패를 만들 수 없음 (pin을 줄여 보세요)"), { code: 3 });
    usedFamilies.add(hand.family); usedDisc.add(hand.discipline); usedSig.add(hand.signature);
    hands.push(describe(hand, i + 1));
  }
  return { project, seedDate, reroll, pins, hands };
}

function describe(h, n) {
  const fam = FAMILIES[h.family];
  const axes = Object.fromEntries(AXES.map((a) => {
    const b = h.borrow.find((x) => x.axis === a);
    return [a, b ? { value: FAMILIES[b.from][a], from: b.from, borrowed: true } : { value: fam[a], from: h.family, borrowed: false }];
  }));
  return {
    n, family: h.family, familyName: fam.name, borrow: h.borrow, dominant: h.borrow[0].axis,
    discipline: h.discipline, disciplineDesc: DISCIPLINES[h.discipline], hue: h.hue, signature: h.signature, axes, warning: h.warning,
    palette: `node palette.mjs --seed ${h.hue}`,
  };
}

function validatePins(p) {
  if (p.family && !FAMILIES[p.family]) throw usage(`family는 ${Object.keys(FAMILIES).join(", ")} 중 하나`);
  if (p.from && !FAMILIES[p.from]) throw usage(`from은 계열 id`);
  if (p.borrow && !AXES.includes(p.borrow)) throw usage(`borrow는 ${AXES.join(", ")} 중 하나`);
  if (p.discipline && !DISCIPLINES[p.discipline]) throw usage(`discipline은 ${Object.keys(DISCIPLINES).join(", ")} 중 하나`);
  if (p.hue !== undefined && !(Number(p.hue) >= 0 && Number(p.hue) <= 360)) throw usage("hue는 0–360");
  if (p.from && p.family && p.from === p.family) throw usage("from은 family와 달라야 합니다");
}

function usage(msg) { return Object.assign(new Error(msg), { code: 1 }); }

const AXIS_KO = { type: "타입", color: "색", composition: "구성", motion: "모션" };

function main() {
  const argv = process.argv.slice(2);
  const o = { pins: {}, candidates: 3, reroll: 0, json: false };
  try {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i], v = argv[i + 1];
      if (a === "--json") o.json = true;
      else if (a === "--project") { o.project = v; i++; }
      else if (a === "--seed-date") { o.seedDate = v; i++; }
      else if (a === "--candidates") { o.candidates = Number(v); i++; }
      else if (a === "--reroll") { o.reroll = Number(v); i++; }
      else if (a === "--pin") { const [k, ...rest] = (v || "").split("="); if (!rest.length) throw usage("--pin은 축=값 형식"); o.pins[k] = rest.join("="); i++; }
      else if (a === "--list") { console.log(JSON.stringify({ families: Object.fromEntries(Object.entries(FAMILIES).map(([k, f]) => [k, f.name])), disciplines: DISCIPLINES, signatures: SIGNATURES }, null, 2)); return 0; }
      else throw usage(`알 수 없는 옵션: ${a}`);
    }
    const res = deal(o);
    if (o.json) { console.log(JSON.stringify(res, null, 2)); return 0; }
    console.log(`딜: ${res.project} · ${res.seedDate} · reroll ${res.reroll}${Object.keys(res.pins).length ? ` · 고정 ${JSON.stringify(res.pins)}` : ""}\n`);
    for (const h of res.hands) {
      console.log(`후보 ${h.n}: ${h.familyName} 바탕 + ${h.borrow.map((b) => `${AXIS_KO[b.axis]}은 ${FAMILIES[b.from].name}에서`).join(", ")}`);
      for (const a of AXES) console.log(`  ${AXIS_KO[a]}${h.dominant === a ? "(지배)" : ""}: ${h.axes[a].value}${h.axes[a].borrowed ? `  ← ${FAMILIES[h.axes[a].from].name}` : ""}`);
      console.log(`  구성 방식: ${h.disciplineDesc}`);
      console.log(`  기준 색상: ${h.hue}°  (${h.palette})`);
      console.log(`  시그니처 종류: ${h.signature}`);
      if (h.warning) console.log(`  ⚠ ${h.warning}`);
      console.log("");
    }
    console.log("받은 패를 다시 고르지 말고, 주제 세계의 레퍼런스 두 개로 정당화하고 구체화하세요 (direction.md 경로 C).");
    return 0;
  } catch (e) { console.error(e.message); return e.code ?? 1; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main();
