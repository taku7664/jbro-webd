import { analyzeImage, measurePixels } from "../scripts/browser/image-measure.mjs";

const form = document.querySelector("form");
const image = document.querySelector("#image");
const drop = document.querySelector("#drop");
const cropInput = document.querySelector("#crop");
const pointsInput = document.querySelector("#points");
const colorsInput = document.querySelector("#colors");
const measure = document.querySelector("#measure");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const copy = document.querySelector("#copy");

function coordinates(value, count, label) {
  const values = value.split(",").map((part) => part.trim());
  if (values.length !== count || values.some((part) => !/^\d+$/.test(part) || !Number.isSafeInteger(Number(part)))) {
    throw new Error(`${label}을 픽셀 정수로 입력하세요.`);
  }
  return values.map(Number);
}

drop.addEventListener("dragover", (event) => event.preventDefault());
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  if (event.dataTransfer.files.length) image.files = event.dataTransfer.files;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  measure.disabled = true;
  copy.disabled = true;
  result.value = "";
  status.textContent = "측정 중…";
  let src;
  try {
    const file = image.files[0];
    if (!file) throw new Error("이미지를 선택하세요.");
    const crop = cropInput.value.trim() ? coordinates(cropInput.value, 4, "측정 영역") : null;
    const at = pointsInput.value.trim().split(/\s+/).filter(Boolean).map((point) => coordinates(point, 2, "지점"));
    src = URL.createObjectURL(file);
    const measurement = await analyzeImage({ src, crop, at, colors: colorsInput.valueAsNumber }, measurePixels);
    result.value = JSON.stringify({ file: file.name, ...measurement }, null, 2);
    copy.disabled = false;
    status.textContent = `${measurement.width}×${measurement.height}px 이미지에서 색 ${measurement.colors.length}개를 측정했습니다.`;
  } catch (error) {
    status.textContent = error.name === "EncodingError" ? "이미지를 읽지 못했습니다." : error.message;
  } finally {
    if (src) URL.revokeObjectURL(src);
    measure.disabled = false;
  }
});

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(result.value);
    status.textContent = "JSON을 복사했습니다.";
  } catch {
    result.focus();
    result.select();
    status.textContent = "결과를 선택했습니다. 복사 단축키를 누르세요.";
  }
});
