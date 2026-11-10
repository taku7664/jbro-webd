// anim.mjs — CSS 애니메이션(@keyframes)을 프레임으로 다룬다. 편집기 타임라인의 프레임 줄과 내보내기가 함께 쓴다.
// 설계: docs/EXPORT-DESIGN.md 4절(애니메이션). animInfo·seekAnimations는 헤드리스 페이지에 함수 원문으로 넘기므로 바깥 변수를 쓰지 않는다.
//
// 길이: 지금 문서(상태를 건 뒤)에서 돌고 있는 CSS 애니메이션 중 가장 긴 "지연 + 한 번 재생 × 반복 수(무한이면 1)".
// 프레임 시각: 0, 1000/fps, 2000/fps … (길이 미만). 반복 애니메이션은 마지막 프레임 다음이 다시 0이 되게 길이는 빼고 센다.

export const FPS_CHOICES = [8, 12, 24, 30, 60];
export const MAX_FRAMES = 240;

/** 문서의 CSS 애니메이션 정보. 전환(transition)은 세지 않는다. */
export function animInfo(doc) {
  const list = [];
  for (const a of doc.getAnimations()) {
    if (a.animationName == null) continue;            // CSSAnimation만(CSSTransition에는 transitionProperty)
    const t = a.effect?.getTiming?.() || {};
    const dur = typeof t.duration === "number" ? t.duration : 0;
    const iter = t.iterations === Infinity ? Infinity : (t.iterations ?? 1);
    const one = (t.delay || 0) + dur * (Number.isFinite(iter) ? iter : 1);
    list.push({ name: a.animationName, duration: dur, delay: t.delay || 0, iterations: Number.isFinite(iter) ? iter : "infinite", length: one });
  }
  let length = list.reduce((m, x) => Math.max(m, x.length), 0);
  const loops = list.filter((x) => x.iterations === "infinite" && x.duration > 0);
  // 주기가 다른 반복이 섞이면 최소공배수 길이로 찍어야 끝과 처음이 이어진다(10ms 단위). 너무 길면(가장 긴 주기의 4배·10초 넘음) 가장 긴 주기로.
  const periods = [...new Set(loops.map((x) => Math.max(10, Math.round(x.duration / 10) * 10)))];
  let mixed = periods.length > 1;
  if (mixed) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const lcm = periods.reduce((a, b) => (a / gcd(a, b)) * b);
    const delay = loops.reduce((m, x) => Math.max(m, x.delay), 0);
    if (lcm <= Math.max(...periods) * 4 && lcm <= 10000) { length = Math.max(length, delay + lcm); mixed = false; }
  }
  return { length, count: list.length, names: [...new Set(list.map((x) => x.name))], loop: loops.length > 0, mixed };
}

/** 모든 애니메이션을 멈추고 t(ms) 시점으로 옮긴다. t가 null이면 다시 재생한다. */
export function seekAnimations(doc, t) {
  for (const a of doc.getAnimations()) {
    if (a.animationName == null) continue;
    try {
      if (t == null) a.play();
      else { a.pause(); a.currentTime = t; }
    } catch { /* 이미 끝난 애니메이션 등 */ }
  }
}

/** 길이(ms)를 fps로 나눈 프레임 시각들. 최대 max개(넘으면 잘림 표시). */
export function frameTimes(length, fps, max = MAX_FRAMES) {
  if (!(length > 0) || !(fps > 0)) return { times: [0], clipped: false };
  const step = 1000 / fps;
  const n = Math.max(1, Math.round(length / step));
  const count = Math.min(n, max);
  return { times: Array.from({ length: count }, (_, i) => Math.round(i * step * 1000) / 1000), clipped: n > max, total: n };
}
