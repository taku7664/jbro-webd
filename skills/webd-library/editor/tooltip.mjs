// tooltip.mjs — 설명은 화면에 늘어놓지 않고 툴팁으로만 보인다.
// data-tip="첫 줄이 제목\n다음 줄부터 설명" 이 붙은 요소에 마우스를 올리거나 키보드로 포커스하면 뜬다.
// 브라우저 기본 title 툴팁보다 빨리(0.25초) 뜨고, 패널 밖으로 넘치지 않게 위치를 맞춘다.

let tip = null, timer = null, owner = null;

function ensure() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "ui-tip";
  tip.setAttribute("role", "tooltip");
  tip.id = "ui-tip";
  tip.hidden = true;
  document.body.append(tip);
  return tip;
}

function show(target) {
  const text = target.getAttribute("data-tip");
  if (!text) return;
  const t = ensure();
  const [head, ...rest] = text.split("\n");
  t.replaceChildren();
  const h = document.createElement("strong"); h.textContent = head; t.append(h);
  if (rest.length) { const p = document.createElement("span"); p.textContent = rest.join("\n"); t.append(p); }
  t.hidden = false;
  owner = target;
  target.setAttribute("aria-describedby", "ui-tip");
  // 기본은 요소 아래, 화면 아래로 넘치면 위. 가로는 화면 안으로 밀어 넣는다.
  const r = target.getBoundingClientRect(), b = t.getBoundingClientRect();
  const gap = 6, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  let top = r.bottom + gap;
  if (top + b.height > vh - 8) top = Math.max(8, r.top - gap - b.height);
  let left = r.left + r.width / 2 - b.width / 2;
  left = Math.max(8, Math.min(vw - b.width - 8, left));
  t.style.left = `${Math.round(left)}px`;
  t.style.top = `${Math.round(top)}px`;
}

function hide() {
  clearTimeout(timer);
  if (owner) owner.removeAttribute("aria-describedby");
  owner = null;
  if (tip) tip.hidden = true;
}

export function initTooltips(root = document) {
  const find = (e) => e.target instanceof Element ? e.target.closest("[data-tip]") : null;
  root.addEventListener("pointerover", (e) => {
    const t = find(e);
    if (t === owner) return;
    hide();
    if (t) timer = setTimeout(() => show(t), 250);
  });
  root.addEventListener("pointerout", (e) => {
    const t = find(e);
    if (t && !t.contains(e.relatedTarget)) hide();
  });
  root.addEventListener("focusin", (e) => { const t = find(e); if (t && t.matches(":focus-visible")) { hide(); show(t); } });
  root.addEventListener("focusout", hide);
  root.addEventListener("pointerdown", hide);
  root.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, true);
}
