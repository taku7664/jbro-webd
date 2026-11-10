// 실행: node --test tests/library.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { save, query, remove, loadEntries, writeIndex, ensureDocument, slugify, localIso, detectBackground } from "../skills/webd-library/scripts/library.mjs";
import { neutralDoc, NEUTRAL_BG } from "../skills/webd-library/scripts/gallery.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "skills", "webd-library", "scripts", "library.mjs");
const work = mkdtempSync(join(tmpdir(), "webd-lib-test-"));
after(() => rmSync(work, { recursive: true, force: true }));

let n = 0;
const freshLib = () => join(work, `lib${n++}`);
const part = (html) => { const p = join(work, `part${n++}.html`); writeFileSync(p, html); return p; };

test("조각을 저장하면 단독 문서로 감싸고 meta·index를 만든다", () => {
  const lib = freshLib();
  const r = save(lib, { file: part('<button class="b">구독</button>'), name: "Subscribe Button", category: "button", tags: "cta, 초록", desc: "초록 CTA" });
  assert.match(r.meta.id, /^\d{8}-subscribe-button$/);
  const html = readFileSync(join(lib, r.meta.id, "component.html"), "utf8");
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<button class="b">구독<\/button>/);
  assert.deepEqual(r.meta.tags, ["cta", "초록"]);
  assert.equal(r.meta.createdAt, r.meta.updatedAt);
  assert.match(r.meta.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.ok(existsSync(join(lib, "index.html")));
});

test("완성된 문서는 그대로 저장한다", () => {
  const doc = "<!doctype html><html><head></head><body><p>x</p></body></html>";
  assert.equal(ensureDocument(doc, "t"), doc);
});

test("button 저장은 상태 비교 화면을 거절하고 라이브러리를 만들지 않는다", () => {
  const lib = freshLib();
  const file = part('<main><h1>슬롯 상태</h1><figure><button>기본</button></figure><figure><button disabled>호버</button></figure></main>');
  const result = spawnSync(process.execPath, [cli, "save", "--lib", lib, "--file", file, "--name", "슬롯 버튼", "--category", "button"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /컨트롤 하나/);
  assert.equal(existsSync(lib), false);
});

test("button 저장은 단일 CTA와 내부 아이콘을 허용하고 별도 컨트롤·설명을 거절한다", () => {
  const lib = freshLib();
  const cta = '<div style="padding: 12px"><a href="/help" data-note="<button>"><svg aria-hidden="true"><path d="M0 0"/></svg>도움말</a></div>';
  assert.equal(save(lib, { file: part(cta), name: "CTA", category: "button" }).meta.category, "button");
  const native = '<style>button::before {content:"<button>"}</style><!-- <button> --><button><span>확인</span></button><script>const example = "<button>";</script>';
  assert.equal(save(lib, { file: part(native), name: "확인", category: "button" }).meta.category, "button");
  for (const html of [
    '<button>확인</button><p>상태 안내</p>',
    '<button>기본</button><button hidden>선택</button>',
    '<button>확인<input type="text"></button>',
    '<button>확인<span role="button" tabindex="0">다른 조작</span></button>',
    '<button>확인</button><p>본문 밖 설명</p></button>',
    '<a data-note="href=/demo">조작 불가</a>',
    '<template><button>견본</button></template>',
    '<div hidden><button>숨김</button></div>',
  ]) {
    assert.throws(() => save(lib, { file: part(html), name: "예제", category: "button" }), /컨트롤 하나/);
  }
  const menu = '<nav aria-label="분류"><button>무기</button><button>장비</button></nav>';
  assert.equal(save(lib, { file: part(menu), name: "분류 메뉴", category: "nav" }).meta.category, "nav");
  assert.equal(loadEntries(lib).length, 3);
});

test("스프라이트 PNG와 HTML로 이름만 바꾼 바이너리는 등록하지 않는다", () => {
  const lib = freshLib();
  const png = join(work, "sprite-sheet.png");
  const renamed = join(work, "sprite-sheet.html");
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(png, header);
  writeFileSync(renamed, header);
  assert.throws(() => save(lib, { file: png, name: "Sprite Sheet" }), /별도 산출물/);
  assert.throws(() => save(lib, { file: renamed, name: "Sprite Sheet" }), /UTF-8 HTML/);
  assert.equal(existsSync(lib), false);
});

test("button 갱신 거절은 기존 HTML·메타·이력·목록을 보존한다", () => {
  const lib = freshLib();
  const first = save(lib, { file: part("<button>확인</button>"), name: "확인", category: "button" });
  const paths = [join(first.dir, "component.html"), join(first.dir, "meta.json"), join(lib, "index.html")];
  const before = paths.map(p => readFileSync(p, "utf8"));
  const invalid = part("<button>기본</button><button>눌림</button>");
  assert.throws(() => save(lib, { id: first.meta.id, file: invalid }), /컨트롤 하나/);
  assert.deepEqual(paths.map(p => readFileSync(p, "utf8")), before);
  assert.equal(existsSync(join(first.dir, "history")), false);
  const next = save(lib, { id: first.meta.id, file: part("<input type=submit value=확인>") });
  assert.equal(next.meta.versions, 2);
  assert.equal(readdirSync(join(first.dir, "history")).length, 1);
});

test("같은 이름이면 id 뒤에 번호가 붙는다", () => {
  const lib = freshLib();
  const a = save(lib, { file: part("<p>a</p>"), name: "Hero" });
  const b = save(lib, { file: part("<p>b</p>"), name: "Hero" });
  assert.notEqual(a.meta.id, b.meta.id);
  assert.match(b.meta.id, /-2$/);
});

test("슬러그: 한글은 남기고 기호는 하이픈, 남는 게 없으면 component", () => {
  assert.equal(slugify("로스팅 곡선 히어로"), "로스팅-곡선-히어로");
  assert.equal(slugify("Roast Curve 2"), "roast-curve-2");
  assert.equal(slugify("초록 CTA 버튼!"), "초록-cta-버튼");
  assert.equal(slugify("★☆"), "component");
});

test("--id로 다시 저장하면 createdAt 유지, history에 이전 버전, versions 증가", async () => {
  const lib = freshLib();
  const first = save(lib, { file: part("<p>v1</p>"), name: "Pricing", category: "table" });
  await new Promise((r) => setTimeout(r, 1100));
  const second = save(lib, { file: part("<p>v2</p>"), id: first.meta.id, desc: "고친 버전" });
  assert.equal(second.updated, true);
  assert.equal(second.meta.createdAt, first.meta.createdAt);
  assert.notEqual(second.meta.updatedAt, first.meta.updatedAt);
  assert.equal(second.meta.versions, 2);
  assert.equal(second.meta.name, "Pricing");
  assert.equal(second.meta.category, "table");
  const hist = readdirSync(join(lib, first.meta.id, "history"));
  assert.equal(hist.length, 1);
  assert.match(readFileSync(join(lib, first.meta.id, "history", hist[0]), "utf8"), /v1/);
  assert.match(readFileSync(join(lib, first.meta.id, "component.html"), "utf8"), /v2/);
});

const sample = [
  { id: "a", name: "나 버튼", description: "", category: "button", tags: ["cta"], createdAt: "2026-09-02T10:00:00+09:00", updatedAt: "2026-11-01T10:00:00+09:00" },
  { id: "b", name: "가 히어로", description: "커피", category: "hero", tags: [], createdAt: "2026-10-15T10:00:00+09:00", updatedAt: "2026-10-15T10:00:00+09:00" },
  { id: "c", name: "다 표", description: "", category: "table", tags: ["cta", "가격"], createdAt: "2026-11-05T10:00:00+09:00", updatedAt: "2026-11-06T10:00:00+09:00" },
];
const ids = (l) => l.map((e) => e.id).join("");

test("정렬: 기본 저장일 최신순, 수정일, 이름, 분류, 순서 지정", () => {
  assert.equal(ids(query(sample)), "cba");
  assert.equal(ids(query(sample, { sort: "created", order: "asc" })), "abc");
  assert.equal(ids(query(sample, { sort: "updated" })), "cab");
  assert.equal(ids(query(sample, { sort: "name" })), "bac");
  assert.equal(ids(query(sample, { sort: "category" })), "abc");
});

test("기간 필터는 정렬 기준 날짜로 거른다", () => {
  assert.equal(ids(query(sample, { since: "2026-10-01" })), "cb");
  assert.equal(ids(query(sample, { until: "2026-10-15" })), "ba");
  assert.equal(ids(query(sample, { sort: "updated", since: "2026-11-01", until: "2026-11-01" })), "a");
});

test("분류·태그·검색 필터", () => {
  assert.equal(ids(query(sample, { category: "hero" })), "b");
  assert.equal(ids(query(sample, { tag: "cta" })), "ca");
  assert.equal(ids(query(sample, { q: "커피" })), "b");
});

test("잘못된 옵션은 오류", () => {
  assert.throws(() => query(sample, { sort: "size" }));
  assert.throws(() => query(sample, { since: "2026/10/01" }));
  assert.throws(() => save(freshLib(), { file: part("<p/>"), name: "x", category: "widget" }));
  assert.throws(() => save(freshLib(), { file: part("<p/>"), name: "x", viewport: "big" }));
});

test("remove는 .trash로 옮기고 목록에서 빠진다", () => {
  const lib = freshLib();
  const r = save(lib, { file: part("<p>x</p>"), name: "Temp" });
  const dest = remove(lib, r.meta.id);
  assert.ok(dest.includes(".trash"));
  assert.ok(existsSync(join(dest, "component.html")));
  assert.equal(loadEntries(lib).length, 0);
  assert.equal(remove(lib, "없는-id"), null);
});

test("index.html: 데이터가 포함되고 </script>가 이스케이프된다", () => {
  const lib = freshLib();
  save(lib, { file: part('<p>a</p><script>console.log("</script>")</script>'), name: "Script Part" });
  const out = readFileSync(writeIndex(lib), "utf8");
  const dataBlock = out.slice(out.indexOf('<script id="data"'), out.indexOf("</script>", out.indexOf('<script id="data"')));
  assert.ok(!dataBlock.includes("</script"), "데이터 블록 안에 </script 가 그대로 있으면 안 됨");
  assert.match(dataBlock, /Script Part/);
});

test("localIso는 시간대 오프셋을 붙인다", () => {
  assert.match(localIso(new Date(2026, 10, 9, 8, 5, 3)), /^2026-11-09T08:05:03[+-]\d{2}:\d{2}$/);
});

test("CLI: save → list → show → remove, 종료 코드", () => {
  const lib = freshLib();
  const run = (...a) => spawnSync(process.execPath, [cli, ...a, "--lib", lib], { encoding: "utf8" });
  const s = run("save", "--file", part("<nav>메뉴</nav>"), "--name", "Top Nav", "--category", "nav", "--tags", "header");
  assert.equal(s.status, 0, s.stderr);
  const id = /저장: (\S+)/.exec(s.stdout)[1];
  const l = run("list", "--json");
  assert.equal(JSON.parse(l.stdout)[0].id, id);
  assert.equal(run("show", id).status, 0);
  assert.equal(run("show", "nope").status, 3);
  assert.equal(run("save", "--name", "no file").status, 1);
  assert.equal(run("list", "--sort", "size").status, 1);
  assert.equal(run("remove", id).status, 0);
  assert.equal(run("remove", id).status, 3);
  assert.equal(run("bogus").status, 1);
});

// ---------- 원래 배경 / 중립 배경 ----------

test("detectBackground: body 배경, 토큰 풀기, @media 무시, 인라인 우선, 없으면 null", () => {
  const doc = (css, body = "<body>") => `<!doctype html><html><head><style>${css}</style></head>${body}<p>x</p></body></html>`;
  assert.equal(detectBackground(doc(":root{--color-bg:#DCC9A6} body{margin:0;background:var(--color-bg);color:#000}")), "#DCC9A6");
  assert.equal(detectBackground(doc("body{background-color:rgb(1, 2, 3)} @media (prefers-color-scheme: dark){body{background:#000}}")), "rgb(1, 2, 3)");
  assert.equal(detectBackground(doc("body{background:#fff url(a.png) no-repeat}")), "#fff url(a.png) no-repeat");
  assert.equal(detectBackground(doc("body{background:linear-gradient(#000, #fff)}")), "linear-gradient(#000, #fff)");
  assert.equal(detectBackground(doc("html{background:Ivory}")), "ivory");
  assert.equal(detectBackground(doc("body{background:var(--nope, #123456)}")), "#123456");
  assert.equal(detectBackground(doc("body{background:#111}", '<body style="background: #abcdef">')), "#abcdef");
  assert.equal(detectBackground(doc("body{color:red}")), null);
  assert.equal(detectBackground(doc("body{background:transparent}")), null);
  assert.equal(detectBackground("<p>조각</p>"), null);
});

test("save는 meta.background를 기록하고, 다시 저장하면 새 HTML 기준으로 바꾼다", () => {
  const lib = freshLib();
  const a = save(lib, { file: part("<style>body{background:#DCC9A6}</style><p>a</p>"), name: "Bg" });
  assert.equal(a.meta.background, "#DCC9A6");
  assert.equal(JSON.parse(readFileSync(join(lib, a.meta.id, "meta.json"), "utf8")).background, "#DCC9A6");
  const b = save(lib, { file: part("<p>b</p>"), id: a.meta.id });
  assert.equal(b.meta.background, null);
  // 저장한 component.html에는 전환용 코드가 들어가지 않는다
  assert.ok(!readFileSync(join(lib, a.meta.id, "component.html"), "utf8").includes("webd-neutral-bg"));
});

test("background가 없는 예전 meta도 목록이 깨지지 않고 HTML에서 배경을 계산한다", () => {
  const lib = freshLib();
  const r = save(lib, { file: part("<style>:root{--bg:#0F2A1D} body{background:var(--bg)}</style><p>old</p>"), name: "Old" });
  const metaPath = join(lib, r.meta.id, "meta.json");
  const old = JSON.parse(readFileSync(metaPath, "utf8"));
  delete old.background;
  writeFileSync(metaPath, JSON.stringify(old));
  const out = readFileSync(writeIndex(lib), "utf8");
  const data = JSON.parse(out.slice(out.indexOf(">", out.indexOf('<script id="data"')) + 1, out.indexOf("</script>", out.indexOf('<script id="data"'))));
  assert.equal(data[0].background, "#0F2A1D");
  assert.ok(!("background" in JSON.parse(readFileSync(metaPath, "utf8"))), "예전 meta는 고치지 않음");
});

test("neutralDoc: <base>와 덮어쓰기 스타일을 head에 넣고, 원래 HTML은 그대로 둔다", () => {
  const html = "<!doctype html><html><head><meta charset=utf-8><style>body{background:#DCC9A6}</style></head><body>x</body></html>";
  const out = neutralDoc(html, "./20261109-a/");
  assert.match(out, /<head><base href="\.\/20261109-a\/">/);
  assert.ok(out.indexOf("webd-neutral-bg") > out.indexOf("body{background:#DCC9A6}"), "덮어쓰기 스타일이 원래 스타일보다 뒤에 와야 함");
  assert.ok(out.includes(NEUTRAL_BG.light) && out.includes(NEUTRAL_BG.dark), "NEUTRAL_BG와 같은 색");
  assert.equal(out.replace(/<base[^>]*>/, "").replace(/<style id="webd-neutral-bg">.*?<\/style>/, ""), html);
  assert.ok(!neutralDoc('<html><head><base href="x/"></head></html>', "./y/").includes("./y/"), "이미 base가 있으면 넣지 않음");
  assert.match(neutralDoc("<p>no head</p>", "./z/"), /^<base href="\.\/z\/"><p>no head<\/p><style id="webd-neutral-bg">/);
});

test("index.html: 배경 전환 UI와 중립 문서 함수가 들어간다", () => {
  const lib = freshLib();
  save(lib, { file: part("<style>body{background:#DCC9A6}</style><p>a</p>"), name: "Toggle" });
  const out = readFileSync(writeIndex(lib), "utf8");
  assert.match(out, /id="bgswitch"/);
  assert.match(out, /value="original" checked/);
  assert.match(out, /webd-library-bg/);
  assert.match(out, /const neutralDoc = function neutralDoc\(/);
  assert.match(out, /library\.mjs\\" edit /, "편집 버튼이 복사할 명령");
});
