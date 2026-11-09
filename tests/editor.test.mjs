// 실행: node --test tests/editor.test.mjs
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import {
  parseCss, setDecl, insertDecl, styleBlocks, replaceStyleBlocks, specificity, splitSelectors, varRefs, countVarUses, nudge, lineOf,
} from "../skills/webd-library/editor/css-model.mjs";
import { startEditor, hashOf } from "../skills/webd-library/scripts/editor-server.mjs";
import { save } from "../skills/webd-library/scripts/library.mjs";

const work = mkdtempSync(join(tmpdir(), "webd-editor-test-"));
after(() => rmSync(work, { recursive: true, force: true }));

const CSS = `:root {
  --space-3: 24px; --color-bg: #DCC9A6;
}
/* 머리 주석 */
body { margin: 0; background: var(--color-bg); }
.plan-row {
  display: grid;
  padding: var(--space-3) 16px;
  /* gap: 8px; */
  border-bottom: 1px solid #8A7158
}
@media (max-width: 600px) {
  .plan-row { padding: 12px; }
}
@keyframes draw { from { opacity: 0 } to { opacity: 1 } }
a[href="x{y}"] { color: red; }
`;

// ---------- CSS 모델 ----------

test("parseCss: 규칙·@media 조건·꺼진 선언을 읽고 @keyframes는 건너뛴다", () => {
  const { rules } = parseCss(CSS);
  assert.deepEqual(rules.map((r) => r.selector), [":root", "body", ".plan-row", ".plan-row", 'a[href="x{y}"]']);
  assert.deepEqual(rules[3].media, ["@media (max-width: 600px)"]);
  const row = rules[2];
  assert.deepEqual(row.decls.map((d) => [d.name, d.value, d.disabled]), [
    ["display", "grid", false], ["padding", "var(--space-3) 16px", false], ["gap", "8px", true], ["border-bottom", "1px solid #8A7158", false],
  ]);
  assert.equal(CSS.slice(row.decls[1].start, row.decls[1].end), "padding: var(--space-3) 16px;");
  assert.equal(CSS.slice(row.decls[3].start, row.decls[3].end), "border-bottom: 1px solid #8A7158", "마지막 ; 없는 선언");
});

test("setDecl: 그 자리만 바꾸고 나머지 글자(주석·들여쓰기)는 그대로", () => {
  const row = parseCss(CSS).rules[2];
  const out = setDecl(CSS, row.decls[1], "padding", "16px 16px");
  assert.equal(out, CSS.replace("padding: var(--space-3) 16px;", "padding: 16px 16px;"));
  // 끄기 → 주석, 켜기 → 되살림
  const off = setDecl(CSS, row.decls[0], "display", "grid", true);
  assert.match(off, /\/\* display: grid; \*\//);
  const offRow = parseCss(off).rules[2];
  assert.equal(offRow.decls[0].disabled, true);
  assert.equal(setDecl(off, offRow.decls[0], "display", "grid", false), CSS.replace("display: grid;", "display: grid;"));
  // 꺼진 gap 켜기
  const on = setDecl(CSS, row.decls[2], "gap", "8px", false);
  assert.match(on, /\n  gap: 8px;\n/);
});

test("setDecl: 이름을 비우면 지우고, 빈 줄이 남지 않는다", () => {
  const row = parseCss(CSS).rules[2];
  const out = setDecl(CSS, row.decls[0], "", "");
  assert.ok(!out.includes("display: grid"));
  assert.match(out, /\.plan-row \{\n  padding:/);
});

test("insertDecl: 여러 줄 규칙은 들여쓰기를 따르고, 마지막 ; 없는 선언에 ; 를 붙인다", () => {
  const row = parseCss(CSS).rules[2];
  const out = insertDecl(CSS, row, "border-radius", "4px");
  assert.match(out, /border-bottom: 1px solid #8A7158;\n  border-radius: 4px;\n\}/);
  const one = "a { color: red; }";
  assert.equal(insertDecl(one, parseCss(one).rules[0], "margin", "0"), "a { color: red; margin: 0; }");
  const tight = "a{color:red}";
  assert.equal(insertDecl(tight, parseCss(tight).rules[0], "margin", "0"), "a{color:red; margin: 0; }");
  const empty = "a {}";
  assert.equal(insertDecl(empty, parseCss(empty).rules[0], "margin", "0"), "a { margin: 0; }");
  // 고친 결과를 다시 읽으면 선언이 하나 늘어 있다
  assert.equal(parseCss(out).rules[2].decls.length, row.decls.length + 1);
});

test("styleBlocks / replaceStyleBlocks: <style> 본문만 바꾸고 개수가 다르면 오류", () => {
  const html = '<!doctype html><html><head><style>a{color:red}</style><style media="print">b{}</style></head><body><p>x</p></body></html>';
  assert.deepEqual(styleBlocks(html), ["a{color:red}", "b{}"]);
  assert.equal(replaceStyleBlocks(html, ["a{color:blue}", "b{}"]), html.replace("red", "blue"));
  assert.throws(() => replaceStyleBlocks(html, ["x"]));
});

test("명시도·쉼표 나누기·토큰 찾기·숫자 조절·줄 번호", () => {
  assert.deepEqual(specificity("#a .b p"), [1, 1, 1]);
  assert.deepEqual(specificity(".a:hover::before"), [0, 2, 1]);
  assert.deepEqual(specificity(":where(.a) p"), [0, 0, 1]);
  assert.deepEqual(specificity(":is(#x, .y) a[href]"), [1, 1, 1]);
  assert.deepEqual(splitSelectors(".a, :is(.b, .c) > p"), [".a", ":is(.b, .c) > p"]);
  assert.deepEqual(varRefs("var(--space-3) var( --x, 2px)"), ["--space-3", "--x"]);
  assert.equal(countVarUses([CSS], "--space-3"), 1);
  assert.equal(countVarUses([CSS], "--space"), 0, "이름 앞부분만 같으면 세지 않음");
  assert.deepEqual(nudge("24px 16px", 7, 1), { value: "24px 17px", caret: 7 });
  assert.equal(nudge("24px", 0, 10).value, "34px");
  assert.equal(nudge("1.5rem", 0, 0.1).value, "1.6rem");
  assert.equal(nudge("1px", 0, -1).value, "0px");
  assert.equal(nudge("auto", 0, 1).value, "auto");
  assert.equal(lineOf(CSS, CSS.indexOf(".plan-row")), 6);
});

// ---------- 편집 서버 ----------

function req(port, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", ...headers } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, text, json, headers: res.headers }); });
    });
    r.on("error", reject);
    if (body !== undefined) r.write(typeof body === "string" ? body : JSON.stringify(body));
    r.end();
  });
}

async function setup() {
  const lib = mkdtempSync(join(work, "lib-"));
  const src = join(work, `src-${Date.now()}.html`);
  writeFileSync(src, `<!doctype html><html><head><style>${CSS}</style></head><body><div class="plan-row">한 사람</div></body></html>`);
  const { meta } = save(lib, { file: src, name: "플랜 표", viewport: "800x400" });
  const ed = await startEditor({ lib, id: meta.id, token: "t".repeat(32) });
  return { lib, id: meta.id, ed, dir: join(lib, meta.id), T: { "x-webd-token": "t".repeat(32) } };
}

test("편집 서버: 토큰·Host 검사, 읽기 전용 파일, 경로 탈출 차단", async () => {
  const { id, ed, T } = await setup();
  try {
    const p = ed.port, eid = encodeURIComponent(id);
    assert.match(ed.url, new RegExp(`^http://127\\.0\\.0\\.1:${p}/edit/`));
    assert.equal((await req(p, "GET", `/edit/${eid}`)).status, 403, "토큰 없음");
    assert.equal((await req(p, "GET", `/edit/${eid}?t=${"t".repeat(32)}`)).status, 200);
    assert.equal((await req(p, "GET", `/api/${eid}`)).status, 403);
    assert.equal((await req(p, "GET", `/api/${eid}`, { headers: { ...T, host: "evil.example:80" } })).status, 403, "Host가 다르면 거절");
    assert.equal((await req(p, "GET", `/api/other-id`, { headers: T })).status, 404, "시작할 때 고른 항목만");
    assert.equal((await req(p, "GET", `/lib/${eid}/component.html`)).status, 200);
    assert.equal((await req(p, "GET", `/lib/${eid}/meta.json`)).status, 200);
    assert.equal((await req(p, "GET", `/lib/${eid}/..%2F..%2Fsecret.txt`)).status, 404, "..로 시작하는 조각은 점 파일 규칙으로 막힘");
    assert.equal((await req(p, "GET", `/assets/..%2Fscripts%2Feditor-server.mjs`)).status, 403, "assets 폴더 밖");
    assert.equal((await req(p, "GET", `/lib/${eid}/.draft.json`)).status, 404, "점 파일은 내주지 않음");
    assert.equal((await req(p, "GET", `/assets/css-model.mjs`)).headers["content-type"], "text/javascript; charset=utf-8");
    const o = await req(p, "POST", `/api/${eid}/save`, { headers: { ...T, origin: "http://evil.example" }, body: { html: "<html></html>" } });
    assert.equal(o.status, 403, "다른 출처의 POST 거절");
  } finally { await ed.close(); }
});

test("편집 서버: 저장하면 새 버전·history, 그새 파일이 바뀌면 409, force로 덮어쓰기", async () => {
  const { id, ed, T, dir } = await setup();
  try {
    const p = ed.port, eid = encodeURIComponent(id);
    const g = await req(p, "GET", `/api/${eid}`, { headers: T });
    assert.equal(g.status, 200);
    assert.equal(g.json.hash, hashOf(g.json.html));
    const [style] = styleBlocks(g.json.html);
    const row = parseCss(style).rules[2];
    const html = replaceStyleBlocks(g.json.html, [setDecl(style, row.decls[1], "padding", "12px 16px")]);

    // 초안 쓰기 → 읽기에 포함
    assert.equal((await req(p, "POST", `/api/${eid}/draft`, { headers: T, body: { baseHash: g.json.hash, styles: [style], log: [{ kind: "set" }] } })).status, 200);
    assert.ok(existsSync(join(dir, ".draft.json")));
    assert.equal((await req(p, "GET", `/api/${eid}`, { headers: T })).json.draft.log.length, 1);

    const s = await req(p, "POST", `/api/${eid}/save`, { headers: T, body: { html, baseHash: g.json.hash } });
    assert.equal(s.status, 200, s.text);
    assert.equal(s.json.meta.versions, 2);
    assert.match(readFileSync(join(dir, "component.html"), "utf8"), /padding: 12px 16px;/);
    assert.equal(readdirSync(join(dir, "history")).length, 1);
    assert.ok(!existsSync(join(dir, ".draft.json")), "저장하면 초안을 지움");

    // 예전 hash로 저장 → 409
    const stale = await req(p, "POST", `/api/${eid}/save`, { headers: T, body: { html, baseHash: g.json.hash } });
    assert.equal(stale.status, 409);
    const forced = await req(p, "POST", `/api/${eid}/save`, { headers: T, body: { html, baseHash: g.json.hash, force: true } });
    assert.equal(forced.status, 200);
    assert.equal(forced.json.meta.versions, 3);
    assert.equal(readdirSync(join(dir, "history")).length, 2, "같은 초에 저장해도 history가 덮이지 않음");

    assert.equal((await req(p, "POST", `/api/${eid}/save`, { headers: T, body: { html: "<p>조각</p>", baseHash: forced.json.hash } })).status, 400);
    assert.equal((await req(p, "POST", `/api/${eid}/draft`, { headers: T, body: "null" })).status, 200);
  } finally { await ed.close(); }
});

test("편집 서버: 파일이 밖에서 바뀌면 SSE로 새 hash를 보낸다", async () => {
  const { id, ed, T, dir } = await setup();
  try {
    const got = await new Promise((resolve, reject) => {
      const r = request({ host: "127.0.0.1", port: ed.port, path: `/api/${encodeURIComponent(id)}/events?t=${"t".repeat(32)}` }, (res) => {
        let buf = "", hello = false;
        res.on("data", (c) => {
          buf += c;
          const events = buf.split("\n\n"); buf = events.pop();
          for (const e of events) {
            if (!e.startsWith("data: ")) continue;
            const d = JSON.parse(e.slice(6));
            if (d.hello && !hello) { hello = true; setTimeout(() => writeFileSync(join(dir, "component.html"), "<!doctype html><html><head><style>a{}</style></head><body>바뀜</body></html>"), 50); }
            else if (!d.hello) { r.destroy(); resolve(d.hash); }
          }
        });
      });
      r.on("error", (e) => { if (e.code !== "ECONNRESET") reject(e); });
      r.end();
      setTimeout(() => reject(new Error("SSE 시간 초과")), 4000);
    });
    assert.equal(got, hashOf(readFileSync(join(dir, "component.html"), "utf8")));
  } finally { await ed.close(); }
  void T;
});

test("편집 서버: 없는 항목이면 code 3으로 거절", async () => {
  await assert.rejects(startEditor({ lib: mkdtempSync(join(work, "empty-")), id: "nope" }), (e) => e.code === 3);
});
