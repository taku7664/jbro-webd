import { copyFileSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const skillNames = ["webd", "webd-library"];

export function listFiles(dir) {
  if (!lstatSync(dir).isDirectory()) throw new Error(`일반 폴더가 필요합니다: ${dir}`);
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) return [entry.name];
    if (entry.isDirectory()) return listFiles(join(dir, entry.name)).map((file) => join(entry.name, file));
    throw new Error(`일반 파일이나 폴더만 복사할 수 있습니다: ${join(dir, entry.name)}`);
  }).sort();
}

function sync() {
  const agents = join(root, ".agents");
  const codexSkills = join(agents, "skills");
  for (const dir of [agents, codexSkills]) {
    const stat = lstatSync(dir, { throwIfNoEntry: false });
    if (stat && !stat.isDirectory()) throw new Error(`일반 폴더가 필요합니다: ${dir}`);
  }
  const copies = skillNames.map((name) => {
    const source = join(root, "skills", name);
    const target = join(codexSkills, name);
    const files = listFiles(source);
    const extras = lstatSync(target, { throwIfNoEntry: false }) ? listFiles(target).filter((file) => !files.includes(file)) : [];
    if (extras.length) {
      throw new Error(`원본에 없는 복사본이 있습니다. 확인하고 정리한 뒤 다시 실행하세요: ${name}/${extras.join(", ")}`);
    }
    return { name, source, target, files };
  });
  for (const { name, source, target, files } of copies) {
    for (const file of files) {
      const dest = join(target, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(source, file), dest);
    }
    console.log(`${name}: ${files.length}개 동기화`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) sync();
