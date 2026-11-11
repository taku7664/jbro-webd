// 가상 폴더·프리셋 종류: 경로 정리, 옮기기·이름 바꾸기·지우기, 폴더 제안, save·list 옵션, 명령줄, 서버 경로
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";
import { save, query, loadEntries } from "../skills/webd-library/scripts/library.mjs";
import { ro, normFolder, kindOf, folderTree, moveItems, renameFolder, removeFolder, addFolder, suggestFolders, applySuggestions, readFolderFile } from "../skills/webd-library/scripts/folders.mjs";
import { startLibrary } from "../skills/webd-library/scripts/editor-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "skills", "webd-library", "scripts", "library.mjs");
const work = mkdtempSync(join(tmpdir(), "webd-folders-test-"));
after(() => rmSync(work, { recursive: true, force: true }));
let n = 0;
const freshLib = () => join(work, `lib${n++}`);
const put = (lib, name, o = {}) => { const p = join(work, `p${n++}.html`); writeFileSync(p, `<div class="x">${name}</div>`); return save(lib, { file: p, name, ...o }).meta; };
const meta = (lib, id) => JSON.parse(readFileSync(join(lib, id, "meta.json"), "utf8"));

test("폴더 경로: 공백·빈 칸·역슬래시를 정리하고 잘못된 이름은 거절", () => {
  assert.equal(normFolder("  잿빛 등대 / 대사창 /"), "잿빛 등대/대사창");
  assert.equal(normFolder("a\\b//c"), "a/b/c");
  assert.equal(normFolder(""), "");
  assert.equal(normFolder(null), "");
  assert.throws(() => normFolder(".숨김"), /점/);
  assert.throws(() => normFolder("a/b?"), /쓸 수 없는/);
  assert.throws(() => normFolder(Array.from({ length: 9 }, (_, i) => "f" + i).join("/")), /8단계/);
});

test("조사 으로/로: 받침을 보고 고른다", () => {
  assert.equal(ro("장비 무게"), "로");
  assert.equal(ro("대사창"), "으로");
  assert.equal(ro("폴더 없음"), "으로");
  assert.equal(ro("잿빛 등대"), "로");
  assert.equal(ro("물"), "로", "ㄹ 받침은 로");
  assert.equal(ro("SAO"), "(으)로");
});

test("종류: kind가 없으면 분류·태그로 추정한다", () => {
  assert.equal(kindOf({ kind: "token" }), "token");
  assert.equal(kindOf({ category: "section", tags: [] }), "screen");
  assert.equal(kindOf({ category: "other", tags: ["조립"] }), "screen");
  assert.equal(kindOf({ category: "other", tags: ["아이콘"] }), "pattern");
  assert.equal(kindOf({ category: "feedback", tags: ["애니메이션"] }), "effect");
  assert.equal(kindOf({ category: "button", tags: [] }), "component");
});

test("save --folder·--kind: meta에 남고, 다시 저장해도 유지되며, 빈 값은 폴더 없음", () => {
  const lib = freshLib();
  const m = put(lib, "틀", { folder: " 등대 / 대사창 ", kind: "component" });
  assert.equal(m.folder, "등대/대사창");
  assert.equal(m.kind, "component");
  assert.deepEqual(readFolderFile(lib), ["등대/대사창"]);
  const again = put(lib, "틀", { id: m.id, desc: "고침" });
  assert.equal(again.folder, "등대/대사창", "옵션을 안 주면 폴더 유지");
  assert.equal(again.kind, "component");
  const out = put(lib, "틀", { id: m.id, folder: "" });
  assert.equal(out.folder, undefined, "--folder \"\"는 폴더 없음");
  assert.throws(() => put(lib, "x", { kind: "button" }), /종류는/);
});

test("옮기기·이름 바꾸기·지우기: 하위 폴더까지 따라가고 프리셋은 지우지 않는다", () => {
  const lib = freshLib();
  const a = put(lib, "A", { folder: "등대" });
  const b = put(lib, "B", { folder: "등대/대사창" });
  const c = put(lib, "C");
  const before = meta(lib, a.id);

  const mv = moveItems(lib, [c.id], "등대/대사창/버튼");
  assert.deepEqual(mv.moved, [c.id]);
  assert.equal(meta(lib, c.id).folder, "등대/대사창/버튼");
  assert.equal(meta(lib, c.id).versions, 1, "옮겨도 버전은 그대로");
  assert.throws(() => moveItems(lib, [a.id, "없는-id"], "x"), /없는 프리셋/);
  assert.equal(meta(lib, a.id).folder, "등대", "하나라도 없으면 아무것도 안 바꿈");

  const t = folderTree(lib, loadEntries(lib));
  assert.deepEqual(t.folders, ["등대", "등대/대사창", "등대/대사창/버튼"]);
  assert.equal(t.counts["등대"], 3);
  assert.equal(t.direct["등대"], 1);

  const rn = renameFolder(lib, loadEntries(lib), "등대/대사창", "등대/VN");
  assert.equal(rn.moved.length, 2);
  assert.equal(meta(lib, b.id).folder, "등대/VN");
  assert.equal(meta(lib, c.id).folder, "등대/VN/버튼");
  assert.throws(() => renameFolder(lib, loadEntries(lib), "등대", "등대/안"), /자기 안/);
  addFolder(lib, "빈 폴더");
  assert.throws(() => renameFolder(lib, loadEntries(lib), "등대/VN", "빈 폴더"), /이미 있는/);

  const rm = removeFolder(lib, loadEntries(lib), "등대/VN");
  assert.equal(rm.parent, "등대");
  assert.equal(meta(lib, b.id).folder, "등대", "바로 안의 프리셋은 위 폴더로");
  assert.equal(meta(lib, c.id).folder, "등대/버튼", "하위 폴더는 한 단계 위로");
  assert.ok(existsSync(join(lib, c.id, "component.html")), "프리셋은 남아 있음");
  removeFolder(lib, loadEntries(lib), "등대");
  assert.equal(meta(lib, a.id).folder, undefined, "맨 위 폴더를 지우면 폴더 없음");
  assert.equal(meta(lib, a.id).updatedAt, before.updatedAt, "정리는 수정 시각을 바꾸지 않음");
});

test("폴더 제안: 이름이 태그로 시작하면 그 태그 폴더, 이미 폴더가 있으면 건드리지 않음", () => {
  const lib = freshLib();
  const a = put(lib, "잿빛 등대 슬롯 버튼", { tags: "게임UI,잿빛 등대" });
  const b = put(lib, "잿빛 등대 대사창 틀", { tags: "게임UI,잿빛 등대,9-slice" });
  const c = put(lib, "SAO 선택 목록 패널", { tags: "게임UI,SAO" });
  const d = put(lib, "그냥 카드", { tags: "카드" });
  const e = put(lib, "잿빛 등대 이름표", { tags: "잿빛 등대", folder: "따로" });
  const s = suggestFolders(loadEntries(lib));
  assert.deepEqual(s.map((x) => [x.folder, x.ids.length]), [["잿빛 등대", 2], ["SAO", 1]]);
  applySuggestions(lib, loadEntries(lib));
  assert.equal(meta(lib, a.id).folder, "잿빛 등대");
  assert.equal(meta(lib, b.id).folder, "잿빛 등대");
  assert.equal(meta(lib, c.id).folder, "SAO");
  assert.equal(meta(lib, d.id).folder, undefined);
  assert.equal(meta(lib, e.id).folder, "따로");
  assert.equal(suggestFolders(loadEntries(lib)).length, 0);
});

test("list --folder는 하위 폴더까지, \"\"는 폴더 없는 것만, --kind로 거른다", () => {
  const lib = freshLib();
  put(lib, "A", { folder: "등대", kind: "screen" });
  put(lib, "B", { folder: "등대/대사창" });
  put(lib, "C");
  const names = (o) => query(loadEntries(lib), o).map((e) => e.name).sort();
  assert.deepEqual(names({ folder: "등대" }), ["A", "B"]);
  assert.deepEqual(names({ folder: "등대/대사창" }), ["B"]);
  assert.deepEqual(names({ folder: "" }), ["C"]);
  assert.deepEqual(names({ kind: "screen" }), ["A"]);
});

test("명령줄: move·folder add·rename·remove·suggest", () => {
  const lib = freshLib();
  const a = put(lib, "잿빛 등대 칩", { tags: "잿빛 등대" });
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, "--lib", lib], { encoding: "utf8" });
  let r = run("folder", "suggest");
  assert.equal(r.status, 0); assert.match(r.stdout, /잿빛 등대 {2}1개/);
  assert.equal(meta(lib, a.id).folder, undefined, "--apply 없이는 바꾸지 않음");
  r = run("folder", "suggest", "--apply"); assert.equal(r.status, 0);
  assert.equal(meta(lib, a.id).folder, "잿빛 등대");
  r = run("folder", "add", "잿빛 등대/칩"); assert.equal(r.status, 0); assert.match(r.stdout, /만듦/);
  r = run("move", a.id, "--folder", "잿빛 등대/칩"); assert.equal(r.status, 0);
  assert.equal(meta(lib, a.id).folder, "잿빛 등대/칩");
  r = run("folder", "rename", "잿빛 등대", "등대"); assert.equal(r.status, 0);
  assert.equal(meta(lib, a.id).folder, "등대/칩");
  r = run("folder", "list"); assert.match(r.stdout, /칩 {2}1개/);
  r = run("folder", "remove", "등대/칩"); assert.equal(r.status, 0);
  assert.equal(meta(lib, a.id).folder, "등대");
  r = run("move", a.id); assert.equal(r.status, 1, "--folder 없으면 사용 오류");
  assert.match(readFileSync(join(lib, "index.html"), "utf8"), /프리셋 라이브러리/);
});

function req(port, method, path, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = request({ host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json", ...headers } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => { const text = Buffer.concat(chunks).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, text, json }); });
    });
    r.on("error", reject);
    if (body !== undefined) r.write(JSON.stringify(body));
    r.end();
  });
}

test("서버: 이전 버전 목록·되돌리기, 복제해서 새 프리셋, 휴지통", async () => {
  const lib = freshLib();
  const a = put(lib, "틀", { folder: "등대", kind: "component", tags: "게임UI" });
  writeFileSync(join(lib, a.id, "export.json"), JSON.stringify({ name: "frame", scales: [2], lastExport: { at: "x", files: [] } }));
  const p2 = join(work, `v2-${n++}.html`); writeFileSync(p2, '<div class="x">둘째</div>');
  save(lib, { file: p2, id: a.id });
  const srv = await startLibrary({ lib, token: "c".repeat(32) });
  const T = { "x-webd-token": "c".repeat(32) };
  try {
    let r = await req(srv.port, "GET", `/api/${encodeURIComponent(a.id)}/history`, { headers: T });
    assert.equal(r.status, 200); assert.equal(r.json.versions.length, 1);
    assert.match(r.json.versions[0].at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    r = await req(srv.port, "POST", `/api/${encodeURIComponent(a.id)}/restore`, { headers: T, body: { file: "../meta.json" } });
    assert.equal(r.status, 400, "경로 이탈 거절");
    r = await req(srv.port, "POST", `/api/${encodeURIComponent(a.id)}/restore`, { headers: T, body: { file: (await req(srv.port, "GET", `/api/${encodeURIComponent(a.id)}/history`, { headers: T })).json.versions[0].file } });
    assert.equal(r.status, 200); assert.equal(r.json.meta.versions, 3, "되돌리기도 새 버전");
    assert.match(readFileSync(join(lib, a.id, "component.html"), "utf8"), /틀/);
    assert.equal((await req(srv.port, "GET", `/api/${encodeURIComponent(a.id)}/history`, { headers: T })).json.versions.length, 2, "지금 파일도 기록에 남음");

    r = await req(srv.port, "POST", `/api/${encodeURIComponent(a.id)}/duplicate`, { headers: T, body: { html: '<!doctype html><html><head></head><body><div class="x">화면 내용</div></body></html>' } });
    assert.equal(r.status, 200);
    const dup = r.json.meta;
    assert.notEqual(dup.id, a.id); assert.equal(dup.name, "틀 사본"); assert.equal(dup.folder, "등대"); assert.equal(dup.kind, "component");
    assert.match(readFileSync(join(lib, dup.id, "component.html"), "utf8"), /화면 내용/);
    const spec = JSON.parse(readFileSync(join(lib, dup.id, "export.json"), "utf8"));
    assert.deepEqual(spec.scales, [2]); assert.equal(spec.lastExport, undefined, "내보내기 기록은 따라가지 않음");

    r = await req(srv.port, "POST", "/items/remove", { headers: T, body: { ids: [dup.id, "없음"] } });
    assert.equal(r.status, 404, "하나라도 없으면 아무것도 안 지움");
    assert.ok(existsSync(join(lib, dup.id, "meta.json")));
    assert.equal((await req(srv.port, "POST", "/items/remove", { body: { ids: [dup.id] } })).status, 403, "토큰 없음");
    r = await req(srv.port, "POST", "/items/remove", { headers: T, body: { ids: [dup.id] } });
    assert.equal(r.status, 200); assert.deepEqual(r.json.removed, [dup.id]);
    assert.ok(!existsSync(join(lib, dup.id)), "목록에서 빠짐");
    assert.ok(existsSync(join(lib, ".trash")), "휴지통으로 옮김");
    const page = await req(srv.port, "GET", "/lib/?t=" + "c".repeat(32));
    assert.match(page.text, /id="menubar"/); assert.match(page.text, /id="atlas"[^>]*hidden/, "묶음 시트는 서랍(처음엔 숨김)");
    assert.doesNotMatch(page.text, /class="pick"/, "카드의 ‘묶음’ 칩은 ‘선택’으로 합침");
  } finally { await srv.close(); }
});

test("서버: 폴더 경로는 토큰이 있어야 하고, 바꾸면 트리를 돌려준다", async () => {
  const lib = freshLib();
  const a = put(lib, "잿빛 등대 칩", { tags: "잿빛 등대" });
  const b = put(lib, "카드");
  const srv = await startLibrary({ lib, token: "b".repeat(32) });
  const T = { "x-webd-token": "b".repeat(32) };
  try {
    assert.equal((await req(srv.port, "POST", "/folders/add", { body: { path: "x" } })).status, 403, "토큰 없음");
    assert.equal((await req(srv.port, "POST", "/folders/add", { headers: { ...T, origin: "http://evil.example" }, body: { path: "x" } })).status, 403, "다른 출처");
    let r = await req(srv.port, "GET", "/folders", { headers: T });
    assert.equal(r.status, 200); assert.equal(r.json.unfiled, 2); assert.equal(r.json.suggestions[0].folder, "잿빛 등대");
    r = await req(srv.port, "POST", "/folders/suggest", { headers: T, body: {} });
    assert.equal(r.status, 200); assert.deepEqual(r.json.tree.folders, ["잿빛 등대"]);
    r = await req(srv.port, "POST", "/folders/add", { headers: T, body: { path: "잿빛 등대/칩" } });
    assert.equal(r.json.folder, "잿빛 등대/칩");
    r = await req(srv.port, "POST", "/folders/move", { headers: T, body: { ids: [a.id, b.id], folder: "잿빛 등대/칩" } });
    assert.equal(r.status, 200); assert.equal(r.json.moved.length, 2);
    r = await req(srv.port, "POST", "/folders/move", { headers: T, body: { ids: ["../x"], folder: "y" } });
    assert.equal(r.status, 404, "없는 id·경로 이탈은 거절");
    r = await req(srv.port, "POST", "/folders/rename", { headers: T, body: { from: "잿빛 등대", to: "등대" } });
    assert.equal(r.status, 200); assert.equal(meta(lib, a.id).folder, "등대/칩");
    r = await req(srv.port, "POST", "/folders/remove", { headers: T, body: { path: "등대" } });
    assert.equal(r.status, 200); assert.equal(meta(lib, b.id).folder, "칩");
    r = await req(srv.port, "POST", "/folders/add", { headers: T, body: { path: ".숨김" } });
    assert.equal(r.status, 400);
    const page = await req(srv.port, "GET", "/lib/?t=" + "b".repeat(32));
    assert.match(page.text, /프리셋 라이브러리/);
    assert.match(page.text, /id="tree"/);
  } finally { await srv.close(); }
});
