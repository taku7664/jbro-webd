import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, skillNames } from "../scripts/sync-codex.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const name of skillNames) {
  test(`Codex 복사본의 파일과 내용이 원본과 같다: ${name}`, () => {
    const source = join(root, "skills", name);
    const copy = join(root, ".agents", "skills", name);
    const files = listFiles(source);
    assert.deepEqual(listFiles(copy), files, "node scripts/sync-codex.mjs로 동기화하세요.");
    for (const file of files) {
      assert.ok(readFileSync(join(copy, file)).equals(readFileSync(join(source, file))), `${name}/${file} 동기화 필요`);
    }
  });
}
