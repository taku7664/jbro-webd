// menubar.mjs — 목록 화면과 편집기가 같이 쓰는 메뉴 바(파일·편집·보기…). 의존성 없음.
// 목록 페이지(gallery.mjs)는 file://로도 열리므로 이 파일의 코드를 그대로 넣어 쓴다(export만 뺌).
//
// menus: [{ label, items: () => 항목[] }]  — 메뉴를 열 때마다 items()를 불러 지금 상태(활성·체크)를 반영한다.
// 항목: { label, icon?, key?(단축키 글자), tip?(툴팁), disabled?, checked?(true/false면 체크 표시), run?(), sub?: () => 항목[] }
//       null은 구분선.
// 키보드: F10 또는 Alt 한 번 → 메뉴 바, ←→ 메뉴 이동, ↓·Enter 열기, ↑↓ 항목, → 하위 메뉴, ←·Esc 닫기.

export function createMenubar(root, menus, { icon = () => null } = {}) {
  root.classList.add("mb");
  root.setAttribute("role", "menubar");
  let open = null;            // { index, panel, sub }
  const tops = menus.map((m, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "mb-top"; b.textContent = m.label;
    b.setAttribute("role", "menuitem"); b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-expanded", "false");
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener("click", () => (open?.index === i ? close(true) : show(i, false)));
    b.addEventListener("pointerenter", () => { if (open && open.index !== i) show(i, false); });
    b.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); move(i, e.key === "ArrowRight" ? 1 : -1, Boolean(open)); }
      else if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); show(i, true); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); b.blur(); }
    });
    root.append(b);
    return b;
  });

  function move(i, d, keepOpen) {
    const j = (i + d + tops.length) % tops.length;
    tops.forEach((t, k) => { t.tabIndex = k === j ? 0 : -1; });
    if (keepOpen) show(j, true); else tops[j].focus();
  }

  function build(items, level) {
    const panel = document.createElement("div");
    panel.className = "mb-menu" + (level ? " is-sub" : "");
    panel.setAttribute("role", "menu");
    for (const it of items) {
      if (!it) { const s = document.createElement("div"); s.className = "mb-sep"; s.setAttribute("role", "separator"); panel.append(s); continue; }
      const b = document.createElement("button");
      b.type = "button"; b.className = "mb-item";
      const role = it.checked === true || it.checked === false ? "menuitemcheckbox" : "menuitem";
      b.setAttribute("role", role);
      if (role === "menuitemcheckbox") b.setAttribute("aria-checked", String(it.checked));
      if (it.disabled) b.disabled = true;
      if (it.tip) b.setAttribute("data-tip", it.tip);
      const ic = document.createElement("span"); ic.className = "mb-ic";
      const glyph = it.checked === true ? icon("check") : it.icon ? icon(it.icon) : null;
      if (glyph) ic.append(glyph);
      const t = document.createElement("span"); t.className = "mb-label"; t.textContent = it.label;
      const k = document.createElement("kbd"); k.className = "mb-key"; k.textContent = it.sub ? "" : it.key || "";
      b.append(ic, t, k);
      if (it.sub && !it.disabled) {
        b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-expanded", "false");
        const arrow = icon("chevron-right"); if (arrow) { arrow.classList.add("mb-arrow"); b.append(arrow); }
        const openSub = (focus) => {
          if (open?.sub?.owner === b) { if (focus) open.sub.panel.querySelector(".mb-item:not(:disabled)")?.focus(); return; }
          closeSub();
          const sp = build(it.sub(), level + 1);
          document.body.append(sp);
          const r = b.getBoundingClientRect(), pr = sp.getBoundingClientRect();
          const left = r.right + pr.width + 4 > innerWidth ? r.left - pr.width + 2 : r.right - 2;
          sp.style.left = Math.max(4, left) + "px";
          sp.style.top = Math.max(4, Math.min(r.top - 5, innerHeight - pr.height - 4)) + "px";
          b.setAttribute("aria-expanded", "true");
          open.sub = { panel: sp, owner: b };
          if (focus) sp.querySelector(".mb-item:not(:disabled)")?.focus();
        };
        b.addEventListener("pointerenter", () => openSub(false));
        b.addEventListener("click", () => openSub(true));
        b._openSub = openSub;
      } else {
        b.addEventListener("pointerenter", () => { if (!level) closeSub(); });
        b.addEventListener("click", () => { close(false); it.run?.(); });
      }
      panel.append(b);
    }
    panel.addEventListener("keydown", (e) => {
      const list = [...panel.querySelectorAll(".mb-item:not(:disabled)")];
      const i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === "Home") { e.preventDefault(); list[0]?.focus(); }
      else if (e.key === "End") { e.preventDefault(); list[list.length - 1]?.focus(); }
      else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (document.activeElement?._openSub) document.activeElement._openSub(true);
        else if (!level) move(open.index, 1, true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (level) { const owner = open?.sub?.owner; closeSub(); owner?.focus(); }
        else move(open.index, -1, true);
      } else if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation();
        if (level) { const owner = open?.sub?.owner; closeSub(); owner?.focus(); } else close(true);
      } else if (e.key === "Tab") { close(false); }
      e.stopPropagation();
    });
    return panel;
  }

  function show(i, focus) {
    close(false);
    const panel = build(menus[i].items(), 0);
    document.body.append(panel);
    const r = tops[i].getBoundingClientRect(), pr = panel.getBoundingClientRect();
    panel.style.left = Math.max(4, Math.min(r.left, innerWidth - pr.width - 4)) + "px";
    panel.style.top = r.bottom + 2 + "px";
    tops[i].setAttribute("aria-expanded", "true"); tops[i].classList.add("is-open");
    tops.forEach((t, k) => { t.tabIndex = k === i ? 0 : -1; });
    open = { index: i, panel, sub: null };
    if (focus) panel.querySelector(".mb-item:not(:disabled)")?.focus();
  }
  function closeSub() {
    if (!open?.sub) return;
    open.sub.owner.setAttribute("aria-expanded", "false");
    open.sub.panel.remove(); open.sub = null;
  }
  function close(focusTop) {
    if (!open) return;
    closeSub();
    const i = open.index;
    open.panel.remove();
    tops[i].setAttribute("aria-expanded", "false"); tops[i].classList.remove("is-open");
    open = null;
    if (focusTop) tops[i].focus();
  }

  addEventListener("pointerdown", (e) => {
    if (!open) return;
    if (root.contains(e.target) || open.panel.contains(e.target) || open.sub?.panel.contains(e.target)) return;
    close(false);
  }, true);
  addEventListener("resize", () => close(false));
  addEventListener("blur", () => close(false));
  // F10, 또는 Alt만 눌렀다 떼면 메뉴 바로
  let altAlone = false;
  addEventListener("keydown", (e) => {
    altAlone = e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey;
    if (e.key === "F10" && !e.shiftKey) { e.preventDefault(); tops[0].focus(); }
  }, true);
  addEventListener("keyup", (e) => {
    if (e.key === "Alt" && altAlone) { e.preventDefault(); if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur(); else tops[0].focus(); }
    altAlone = false;
  }, true);
  return { close, isOpen: () => Boolean(open) };
}
