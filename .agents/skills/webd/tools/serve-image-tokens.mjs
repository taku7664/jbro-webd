import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const pages = new Map([
  ["/tools/image-tokens.html", ["./image-tokens.html", "text/html"]],
  ["/tools/image-tokens-app.mjs", ["./image-tokens-app.mjs", "text/javascript"]],
  ["/scripts/browser/image-measure.mjs", ["../scripts/browser/image-measure.mjs", "text/javascript"]],
].map(([url, [file, type]]) => [url, { body: readFileSync(new URL(file, import.meta.url)), type }]));

const server = createServer((request, response) => {
  const page = request.method === "GET" && pages.get(request.url);
  if (!page) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": `${page.type}; charset=utf-8` });
  response.end(page.body);
});

server.listen(0, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${server.address().port}/tools/image-tokens.html`);
});
