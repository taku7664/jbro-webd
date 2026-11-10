// 계층 구조 편집(복사·붙여넣기·만들기)의 텍스트 도구 시험. 브라우저 동작은 편집기에서 직접 확인한다.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bodyRange, replaceBody, matchableSelector, ruleText, cssForCopy, topLevelBlocks, mergeCss, classValue, clipboardText,
} from "../skills/webd-library/editor/structure.mjs";
import { parseCss } from "../skills/webd-library/editor/css-model.mjs";

const DOC = `<!doctype html>\n<html><head><style>.a{color:red}</style></head>\n<body class="x">\n  <div class="a"></div>\n</body>\n</html>\n`;

test("bodyRange·replaceBody: <body> 안쪽만 바꾸고 나머지 글자는 그대로", () => {
  const r = bodyRange(DOC);
  assert.equal(DOC.slice(r.start, r.end), `\n  <div class="a"></div>\n`);
  const out = replaceBody(DOC, `\n  <p>새</p>\n`);
  assert.equal(out, DOC.replace(`\n  <div class="a"></div>\n`, `\n  <p>새</p>\n`));
  assert.ok(out.startsWith(`<!doctype html>\n<html><head><style>.a{color:red}</style></head>\n<body class="x">`));
});

test("replaceBody: 앞뒤 공백은 원문 것을 지킨다(브라우저가 붙인 빈 줄을 늘리지 않음)", () => {
  const out = replaceBody(DOC, `\n  <div class="a"></div>\n  <p>새</p>\n\n\n`);
  assert.equal(out, DOC.replace(`\n  <div class="a"></div>\n`, `\n  <div class="a"></div>\n  <p>새</p>\n`));
});

test("bodyRange: body가 없거나 여러 개면 null, replaceBody는 오류", () => {
  assert.equal(bodyRange("<div></div>"), null);
  assert.equal(bodyRange("<body></body><body></body>"), null);
  assert.throws(() => replaceBody("<div></div>", "x"), /body/);
});

test("matchableSelector: 상태·가상 요소를 떼고, 결합자로 끝나면 null", () => {
  assert.equal(matchableSelector(".btn:hover::after"), ".btn");
  assert.equal(matchableSelector(".a > .b:focus-visible"), ".a > .b");
  assert.equal(matchableSelector("::selection"), null);
  assert.equal(matchableSelector(".a >:hover"), null);
});

test("ruleText: @media 안 규칙은 조건으로 감싸 원문 그대로", () => {
  const css = "@media (min-width: 600px) {\n  .a { color: red; }\n}";
  const rule = parseCss(css).rules[0];
  assert.equal(ruleText(css, rule), "@media (min-width: 600px) {\n  .a { color: red; }\n}");
});

test("cssForCopy: 걸린 규칙 + 쓰는 토큰(이어지는 것까지) + 쓰는 @keyframes만 담는다", () => {
  const styles = [
    ":root { --base: #111; --ink: var(--base); --unused: 1px; }\n.card { color: var(--ink); animation: pop .2s; }\n.card:hover::after { content: ''; }\n.other { color: blue; }\n@keyframes pop { from { opacity: 0 } to { opacity: 1 } }\n@keyframes spin { to { rotate: 1turn } }",
  ];
  const css = cssForCopy(styles, (sel) => sel === ".card");
  assert.match(css, /--ink: var\(--base\);/);
  assert.match(css, /--base: #111;/);
  assert.doesNotMatch(css, /--unused/);
  assert.match(css, /\.card \{ color: var\(--ink\); animation: pop \.2s; \}/);
  assert.match(css, /\.card:hover::after/);
  assert.doesNotMatch(css, /\.other/);
  assert.match(css, /@keyframes pop/);
  assert.doesNotMatch(css, /spin/);
});

test("cssForCopy: 조상 규칙에 정의한 토큰도 :root로 옮겨 담는다(상태 규칙 값은 빼고)", () => {
  const styles = [":root { --rim: #000; }\n.slot { --rim: #4c514e; width: 10px; }\n.slot:hover { --rim: #fff; }\n.plate { background: var(--rim); }"];
  const css = cssForCopy(styles, (s) => s === ".plate", (s) => s === ".slot");
  assert.match(css, /:root \{\n  --rim: #4c514e;\n\}/);
  assert.doesNotMatch(css, /width: 10px/);
  assert.doesNotMatch(css, /#fff/);
});

test("cssForCopy: scope를 주면 토큰을 그 선택자 안에 담는다(붙여넣은 곳의 :root 토큰을 덮지 않게)", () => {
  const styles = [":root { --rim: #000; }\n.plate { background: var(--rim); }"];
  const css = cssForCopy(styles, (s) => s === ".plate", () => false, ".plate");
  assert.match(css, /^\.plate \{\n  --rim: #000;\n\}/);
  assert.doesNotMatch(css, /:root/);
});

test("cssForCopy: 맞는 규칙이 없으면 빈 글", () => {
  assert.equal(cssForCopy([".a{color:red}"], () => false), "");
});

test("topLevelBlocks·mergeCss: 이미 있는 블록(공백·주석 무시)은 건너뛰고 없는 것만 뒤에 붙인다", () => {
  assert.deepEqual(topLevelBlocks(".a{x:1}\n/* c } */\n@media (x){.b{y:2}}"), [".a{x:1}", "/* c } */\n@media (x){.b{y:2}}"]);
  const base = ".a { color: red; }\n";
  const r = mergeCss(base, ".a{color:red}\n\n.b { color: blue; }", "다른-조각에서 붙여넣은 div.b");
  assert.equal(r.added, 1);
  assert.ok(r.text.startsWith(base));
  assert.match(r.text, /\/\* 다른-조각에서 붙여넣은 div\.b \*\/\n\.b \{ color: blue; \}\n$/);
  assert.deepEqual(mergeCss(base, ".a {color: red}"), { text: base, added: 0 });
});

test("classValue·clipboardText", () => {
  assert.equal(classValue("  .card  card big "), "card big");
  assert.equal(classValue("   "), "");
  assert.equal(clipboardText("<i></i>", ".a{}"), "<style>\n.a{}\n</style>\n<i></i>\n");
  assert.equal(clipboardText("<i></i>", ""), "<i></i>\n");
});
