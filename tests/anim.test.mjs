// 애니메이션 프레임 시각(editor/anim.mjs). 페이지 안 함수(animInfo·seekAnimations)는 내보내기 시험(실제 브라우저)에서 본다.
import test from "node:test";
import assert from "node:assert/strict";
import { frameTimes, FPS_CHOICES } from "../skills/webd-library/editor/anim.mjs";

test("frameTimes: 길이를 fps로 나눈 시각, 반복의 끝(= 처음)은 빼고, 최대 개수에서 자른다", () => {
  assert.deepEqual(frameTimes(1000, 4).times, [0, 250, 500, 750]);
  assert.deepEqual(frameTimes(0, 24).times, [0], "애니메이션 없음");
  assert.deepEqual(frameTimes(100, 4).times, [0], "fps 간격보다 짧으면 한 장");
  const long = frameTimes(10000, 60, 120);
  assert.equal(long.times.length, 120); assert.equal(long.clipped, true); assert.equal(long.total, 600);
  assert.equal(frameTimes(1000, 24).times.length, 24);
  assert.ok(FPS_CHOICES.includes(24));
});
