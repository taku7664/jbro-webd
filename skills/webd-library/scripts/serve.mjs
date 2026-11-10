// serve.mjs — library.mjs open·edit가 띄우는 서버 자식 프로세스. 직접 실행하지 않는다.
// 부모(library.mjs)가 스크립트 변경을 지켜보다가 이 프로세스를 다시 띄운다(같은 포트·토큰이라 열린 탭이 그대로 동작).
// 토큰은 명령줄이 아니라 환경변수로 받는다(프로세스 목록에 보이지 않게).
import { startLibrary } from "./editor-server.mjs";

const lib = process.env.WEBD_SERVE_LIB;
const port = Number(process.env.WEBD_SERVE_PORT || 0);
const token = process.env.WEBD_SERVE_TOKEN;
const lan = process.env.WEBD_SERVE_LAN === "1";
delete process.env.WEBD_SERVE_TOKEN;

let srv = null;
const stop = async (code = 0) => { try { await srv?.close(); } finally { process.exit(code); } };
process.on("message", (m) => { if (m === "stop") stop(0); });
process.on("disconnect", () => stop(0));   // 부모가 죽으면 같이 닫는다
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

try {
  srv = await startLibrary({ lib, port, token, lan });
  process.send?.({ ready: true, port: srv.port, lanHosts: srv.lanHosts ?? [] });
} catch (e) {
  process.send?.({ error: e.message, code: e.code });
  process.exit(1);
}
