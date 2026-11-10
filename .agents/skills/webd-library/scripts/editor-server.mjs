// editor-server.mjs — 컴포넌트 하나를 브라우저에서 CSS로 직접 고치고 저장하는 로컬 편집 서버. 의존성 없음, Node 18+.
//
// 왜 서버인가: file:// 로 연 페이지는 iframe 안쪽 문서를 만질 수 없고(Chromium에서 contentDocument가 null), 파일도 쓸 수 없다.
// 그래서 127.0.0.1에만 열리는 작은 서버가 편집 화면과 컴포넌트를 같은 출처로 내주고, 저장은 library.mjs의 save 경로로 한다.
//
// 안전:
//   - 127.0.0.1에만 바인딩하고, Host 머리글이 127.0.0.1:<포트> 또는 localhost:<포트>가 아니면 거절(DNS 리바인딩 차단).
//   - API는 실행마다 새로 만드는 토큰이 있어야 한다(편집 화면 URL의 ?t=). 다른 사이트는 토큰을 모른다.
//   - 시작할 때 고른 항목 하나(<id>)만 읽고 쓴다.
//
// 경로:
//   GET  /edit/<id>?t=…           편집 화면
//   GET  /assets/<파일>            편집 화면 코드(editor/ 폴더)
//   GET  /lib/<id>/<파일>          컴포넌트 파일(미리보기 iframe용, 읽기 전용, 점으로 시작하는 파일 제외)
//   GET  /api/<id>                 { meta, html, hash, draft }
//   POST /api/<id>/save            { html, baseHash, force? } → 새 버전 저장(history 유지). 파일이 그새 바뀌었으면 409
//   POST /api/<id>/draft           { …변경 내역 } 또는 null → <id>/.draft.json 쓰기/지우기
//   GET  /api/<id>/events          SSE. component.html이 바뀌면 { hash } 를 보냄

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, watch, statSync } from "node:fs";
import { join, dirname, normalize, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { save } from "./library.mjs";

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "editor");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2",
};
const MAX_BODY = 5 * 1024 * 1024;

export const hashOf = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * 편집 서버를 연다. 반환: Promise<{ url, port, token, close() }>
 * @param {{ lib: string, id: string, port?: number, token?: string }} o
 */
export function startEditor({ lib, id, port = 0, token = randomBytes(16).toString("hex") }) {
  const dir = join(lib, id);
  const file = join(dir, "component.html");
  const draftPath = join(dir, ".draft.json");
  if (!existsSync(join(dir, "meta.json")) || !existsSync(file)) {
    const e = new Error(`없는 항목: ${id}`); e.code = 3; return Promise.reject(e);
  }
  const clients = new Set();
  let lastHash = hashOf(readFileSync(file, "utf8"));
  let timer = null;
  const watcher = watch(dir, (_ev, name) => {
    if (name && name !== "component.html") return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      let h; try { h = hashOf(readFileSync(file, "utf8")); } catch { return; }
      if (h === lastHash) return;
      lastHash = h;
      for (const res of clients) res.write(`data: ${JSON.stringify({ hash: h })}\n\n`);
    }, 150);
  });
  const ping = setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000);

  const server = createServer(async (req, res) => {
    const addr = server.address();
    const okHosts = [`127.0.0.1:${addr.port}`, `localhost:${addr.port}`];
    if (!okHosts.includes(req.headers.host)) return send(res, 403, "잘못된 Host");
    const url = new URL(req.url, `http://${req.headers.host}`);
    const parts = url.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return "\0"; } });
    const authed = () => {
      const t = req.headers["x-webd-token"] || url.searchParams.get("t") || "";
      const a = Buffer.from(String(t)), b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    };
    try {
      if (req.method === "GET" && parts[0] === "edit" && parts[1] === id && parts.length === 2) {
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다. 터미널에 나온 주소로 여세요.");
        return sendFile(res, join(ASSETS, "editor.html"));
      }
      if (req.method === "GET" && parts[0] === "assets" && parts.length === 2) return sendInside(res, ASSETS, parts[1]);
      if (req.method === "GET" && parts[0] === "lib" && parts[1] === id && parts.length >= 3) {
        if (parts.slice(2).some((p) => p.startsWith("."))) return send(res, 404, "없음");
        return sendInside(res, dir, parts.slice(2).join("/"));
      }
      if (parts[0] === "api" && parts[1] === id) {
        if (!authed()) return send(res, 403, "토큰이 없거나 다릅니다.");
        if (req.method === "POST") {
          // 다른 출처 페이지가 보낸 요청은 거절(Origin이 있으면 같은 서버여야 함)
          const origin = req.headers.origin;
          if (origin && !okHosts.some((h) => origin === `http://${h}`)) return send(res, 403, "다른 출처");
        }
        const action = parts[2] ?? "";
        if (req.method === "GET" && action === "") {
          const html = readFileSync(file, "utf8");
          const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
          let draft = null;
          if (existsSync(draftPath)) { try { draft = JSON.parse(readFileSync(draftPath, "utf8")); } catch {} }
          return json(res, 200, { meta, html, hash: hashOf(html), draft });
        }
        if (req.method === "GET" && action === "events") {
          res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
          res.write(`data: ${JSON.stringify({ hash: lastHash, hello: true })}\n\n`);
          clients.add(res);
          req.on("close", () => clients.delete(res));
          return;
        }
        if (req.method === "POST" && action === "save") {
          const body = await readJson(req);
          if (typeof body?.html !== "string" || !/<html[\s>]/i.test(body.html)) return json(res, 400, { error: "html이 없거나 완성된 문서가 아닙니다." });
          const current = readFileSync(file, "utf8");
          if (!body.force && body.baseHash !== hashOf(current)) return json(res, 409, { error: "편집을 시작한 뒤 파일이 바뀌었습니다.", hash: hashOf(current) });
          const tmp = mkdtempSync(join(tmpdir(), "webd-edit-"));
          try {
            const p = join(tmp, "component.html");
            writeFileSync(p, body.html);
            const r = save(lib, { file: p, id });
            const html = readFileSync(file, "utf8");
            lastHash = hashOf(html);
            if (existsSync(draftPath)) rmSync(draftPath, { force: true });
            return json(res, 200, { meta: r.meta, html, hash: lastHash });
          } finally { rmSync(tmp, { recursive: true, force: true }); }
        }
        if (req.method === "POST" && action === "draft") {
          const body = await readJson(req);
          if (body === null) { rmSync(draftPath, { force: true }); return json(res, 200, { ok: true, removed: true }); }
          if (typeof body !== "object" || !Array.isArray(body.styles)) return json(res, 400, { error: "styles 배열이 필요합니다." });
          writeFileSync(draftPath, JSON.stringify({ ...body, id }, null, 2) + "\n");
          return json(res, 200, { ok: true });
        }
      }
      return send(res, 404, "없음");
    } catch (e) {
      return json(res, e.status ?? 500, { error: e.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", (e) => { watcher.close(); clearInterval(ping); reject(e); });
    server.listen(port, "127.0.0.1", () => {
      const p = server.address().port;
      resolve({
        port: p, token,
        url: `http://127.0.0.1:${p}/edit/${encodeURIComponent(id)}?t=${token}`,
        close: () => new Promise((r) => {
          watcher.close(); clearInterval(ping); clearTimeout(timer);
          for (const c of clients) c.end();
          server.close(() => r());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}

function send(res, status, text) { res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }).end(text); }
function json(res, status, obj) { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(obj)); }
function sendFile(res, p) {
  res.writeHead(200, { "content-type": TYPES[extname(p).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  res.end(readFileSync(p));
}
function sendInside(res, root, rel) {
  const p = normalize(join(root, rel));
  if (!(p + sep).startsWith(normalize(root) + sep) || p === normalize(root)) return send(res, 403, "범위 밖");
  if (!existsSync(p) || !statSync(p).isFile()) return send(res, 404, "없음");
  return sendFile(res, p);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { const e = new Error("요청이 너무 큽니다."); e.status = 413; reject(e); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); } catch { const e = new Error("JSON이 아닙니다."); e.status = 400; reject(e); } });
    req.on("error", reject);
  });
}
