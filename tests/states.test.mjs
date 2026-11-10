// 상태 찾기·걸기(editor/states.mjs)의 텍스트 도구 시험. DOM이 필요한 findStates·applyWebdState는
// 내보내기 시험(실제 브라우저)과 편집기 확인에서 본다.
import test from "node:test";
import assert from "node:assert/strict";
import { rewriteStateSelectors, rewriteStateSelector, compounds, tokenInfo } from "../skills/webd-library/editor/states.mjs";

test("rewriteStateSelectors: 규칙 선택자의 상태 가상 클래스만 :is()로 바꾼다", () => {
  const css = `.a:hover, .b:not(:disabled):focus-visible { color: red; content: ":hover"; }
@media (any-hover: hover) { .c:active { x: 1 } }
/* .d:hover */
::-webkit-scrollbar-thumb:hover { x: 2 }
@keyframes k { from { opacity: 0 } }
.e::after:hover { x: 3 }
.f:hovering { x: 4 }`;
  const out = rewriteStateSelectors(css);
  assert.match(out, /^\.a:is\(:hover,\[data-webd-hover\]\), \.b:not\(:is\(:disabled,\[data-webd-disabled\]\)\):is\(:focus-visible,\[data-webd-focus-visible\]\) \{/);
  assert.match(out, /content: ":hover";/, "선언 값은 그대로");
  assert.match(out, /@media \(any-hover: hover\) \{ \.c:is\(:active,\[data-webd-active\]\)/, "@media 조건은 그대로, 안쪽 규칙은 바꿈");
  assert.match(out, /::-webkit-scrollbar-thumb:hover \{/, "가상 요소 바로 뒤는 그대로");
  assert.match(out, /\.e::after:hover/);
  assert.match(out, /\.f:hovering/, "이름이 비슷한 다른 가상 클래스는 그대로");
  assert.match(out, /@keyframes k \{ from \{ opacity: 0 \} \}/);
  assert.equal(rewriteStateSelector("a:focus:hover"), "a:is(:focus,[data-webd-focus]):is(:hover,[data-webd-hover])");
});

test("compounds: 결합자로 나누고 속성·클래스·가상 클래스·가상 요소를 읽는다", () => {
  const c = compounds('.slot[aria-pressed="true"]:not(:disabled):hover > span.art::after');
  assert.equal(c.length, 2);
  assert.deepEqual(c[0].map((t) => t.kind), ["class", "attr", "pseudo", "pseudo"]);
  assert.deepEqual([c[0][1].name, c[0][1].op, c[0][1].value], ["aria-pressed", "=", "true"]);
  assert.equal(c[0][2].raw, ":not(:disabled)");
  assert.deepEqual(c[1].map((t) => t.kind), ["tag", "class", "pseudo-el"]);
});

test("tokenInfo: 이름표와 파일 이름용 키", () => {
  assert.deepEqual(tokenInfo({ kind: "pseudo", name: "hover" }), { id: ":hover", label: "호버", key: "hover" });
  assert.deepEqual(tokenInfo({ kind: "attr", name: "aria-pressed", value: "true" }), { id: "[aria-pressed=true]", label: "켜짐", key: "pressed" });
  assert.deepEqual(tokenInfo({ kind: "attr", name: "data-state", value: "low" }), { id: "[data-state=low]", label: "state: low", key: "state-low" });
  assert.deepEqual(tokenInfo({ kind: "attr", name: "disabled", value: null }), { id: "[disabled]", label: "비활성", key: "disabled" });
  assert.deepEqual(tokenInfo({ kind: "class", name: "is-locked" }), { id: ".is-locked", label: ".is-locked", key: "locked" });
  assert.deepEqual(tokenInfo({ kind: "class", name: "bar--low" }), { id: ".bar--low", label: "--low", key: "low" });
});
