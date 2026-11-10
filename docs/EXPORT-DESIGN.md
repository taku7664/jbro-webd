# 스프라이트 내보내기 설계

작성: 2026-11-10. 상태: **1단계 구현됨**(목록 → 편집기, 내보내기 탭, 한 장·9-slice·3-slice, 배율, PNG + JSON). 2단계(상태별)부터는 아직입니다.

1단계에서 설계와 달라진 점:
- 프레임이 하나뿐인 1단계에서는 "파일 각각/시트" 선택을 화면에 두지 않았습니다(결과가 같음). 상태·애니메이션이 들어오는 2단계에서 보입니다. 사양(`output.layout`)과 배치 코드(`pack.mjs`)는 이미 있습니다.
- 데이터 형식(JSON 해시/배열) 선택도 화면에서 뺐습니다(기본 해시, export.json의 `output.data`로만 바꿈). 간단·직관 원칙.
- 그려진 픽셀 범위에서는 시트의 `trimmed`를 쓰지 않고, 그림자를 포함한 이미지 전체를 프레임으로 둔 뒤 요소 상자 위치를 `meta.webd.source.box`에 적습니다(Aseprite 형식은 음수 오프셋을 표현하지 못함).
- 최소 크기로 다시 렌더할 때 `::before`·`::after`·자식 장식이 폭·높이 0이 되면 경고합니다(실제 조각 "잿빛 등대 슬롯 버튼"의 가로 주름선에서 발견).

## 0. 목표와 범위

라이브러리의 HTML/CSS 조각을 게임 엔진에 바로 넣을 수 있는 이미지와 데이터로 내보냅니다. 최종적으로 지원할 것은 다음과 같습니다(사용자 요청).

| 종류 | 설명 | 단계 |
|---|---|---|
| 한 장 | 조각(또는 고른 요소)을 투명 배경 PNG 한 장으로 | 1 |
| 9-slice | 모서리는 고정하고 변·가운데는 늘리거나 반복하는 틀. PNG + 인셋(L·T·R·B) | 1 |
| 3-slice | 가로(왼·오른쪽 고정) 또는 세로(위·아래 고정) | 1 |
| 상태별 | 기본·hover·pressed·focus·disabled·selected 등 상태마다 한 장 | 2 |
| 애니메이션 | CSS 애니메이션·전환을 프레임별로 | 3 |
| 묶음 | 위 결과를 파일 여러 개 또는 스프라이트 시트 한 장 + 좌표 JSON | 1(기본) → 4(트림·빽빽한 배치) |

**HTML이라서 생기는 장점**을 설계 중심에 둡니다. 이미지 편집기와 달리 조각을 **아무 크기로 다시 렌더**할 수 있고, 상태를 **CSS로 강제**할 수 있고, 애니메이션을 **원하는 시점으로 멈춰** 찍을 수 있습니다. 그래서 9-slice의 "최소 크기" 판을 잘라 붙이는 대신 그 크기로 직접 렌더하고, 상태·프레임을 사람이 하나씩 만들 필요가 없습니다.

## 1. 기존 도구에서 가져온 기준

| 출처 | 가져온 것 |
|---|---|
| [Unity 9-slicing](https://docs.unity.com/en-us/engine/current/manual/unity2d/sprite/9-slice/9-slicing) | Sliced(모서리 고정, 위·아래 변은 가로로만, 좌·우 변은 세로로만, 가운데는 양쪽으로 늘림)와 Tiled(늘리는 대신 반복). 인셋은 Sprite Editor의 L·B·R·T. `Sprite.border`가 (L, B, R, T) 순서라는 것은 이 페이지에 없고 일반 지식이라 구현 때 다시 확인 |
| [Godot NinePatchRect](https://docs.godotengine.org/en/stable/classes/class_ninepatchrect.html) | `patch_margin_left/top/right/bottom`, 축별 늘림 방식 Stretch·Tile·Tile Fit, `draw_center` |
| [Aseprite CLI](https://www.aseprite.org/docs/cli/) | 시트 배치(horizontal·vertical·rows·columns·packed), `json-hash`·`json-array`, `meta.frameTags`(name·from·to), `meta.slices`(keys의 bounds·center·pivot), border·shape·inner padding, `--scale`, `--trim`, 파일 이름 틀 `{title}{tag}{frame}` |

데이터 형식은 **Aseprite JSON 호환**으로 정합니다. 9-slice 정보가 `slices[].keys[].center`로 이미 표준처럼 쓰이고, Unity·Godot·Phaser 쪽에 Aseprite JSON 가져오기 도구가 있기 때문입니다(도구별 지원 범위는 추측이며 구현 때 확인). 엔진별 값(Unity 인셋 순서, Godot 마진)은 같은 JSON의 `meta.webd.engines`에 덧붙입니다. `frames[].frame·sourceSize·spriteSourceSize·duration` 필드 이름은 Aseprite·TexturePacker의 일반적인 출력 형식에서 가져왔고, 위 CLI 문서에는 나오지 않습니다.

## 2. 전체 구조

```
라이브러리 서버 (library.mjs open, 127.0.0.1)
 ├─ /                 목록 (카드 클릭 → 편집기)
 ├─ /edit/<id>        편집기: 하이라키 · 미리보기 · [인스펙터 | CSS 원문 | 내보내기]
 └─ /api/<id>/export  내보내기 실행 ─┐
                                   ▼
  ① 사양(spec)  →  ② 프레임 목록 펼치기  →  ③ 캡처  →  ④ 후처리  →  ⑤ 배치·쓰기
  export.json       상태 × 애니메이션 × 배율     헤드리스      트림·9-slice     PNG·시트·JSON
```

| 모듈(예정 경로) | 역할 | 테스트 |
|---|---|---|
| `scripts/library-server.mjs` | 지금의 편집 서버를 라이브러리 전체용으로 넓힘. 목록·편집기·조각 파일·API를 한 출처, 한 토큰으로 서빙. `startEditor`는 호환용으로 남김 | 서버 테스트 |
| `scripts/export/spec.mjs` | 사양 기본값·검증, 프레임 목록 펼치기 | 순수 함수 단위 테스트 |
| `scripts/export/capture.mjs` | 브라우저 하나를 띄워 재사용. 문서 넣기 → 대상 고립 → 상태 강제 → 애니메이션 정지·이동 → 투명 캡처 | 브라우저 있을 때만 |
| `scripts/export/png.mjs` | 의존성 없는 PNG 읽기·쓰기(zlib) | 단위 테스트 |
| `scripts/export/pack.mjs` | 트림, 시트 배치(줄·행렬, 간격), 좌표 계산 | 단위 테스트 |
| `scripts/export/formats.mjs` | Aseprite 호환 JSON + 엔진별 값 | 단위 테스트 |
| `editor/export-panel.mjs` | 내보내기 탭 UI, 미리보기 위 안내선 | 브라우저 확인 |

브라우저 실행은 `webd/scripts/render-check.mjs`의 `findBrowser`·`launch`·`connect`를 다시 씁니다. 이 서버는 사용자 PC에서 도는 것이라 Codex 샌드박스의 헤드리스 제약(HANDOFF 6-6)과는 상관이 없습니다. 다만 Chrome·Edge가 없으면 "브라우저를 찾지 못했습니다. `WEBD_BROWSER`로 경로를 지정하세요"라고 안내하고 멈춥니다.

## 3. 사양(spec): `export.json`

조각마다 `<라이브러리>/<id>/export.json`에 저장합니다. meta.json에 넣지 않는 이유는 `save()`가 meta를 매번 새로 만들어 모르는 필드가 사라지기 때문입니다. 설정이 남으므로 CSS를 고친 뒤 **같은 설정으로 다시 내보내기**만 누르면 됩니다.

```jsonc
{
  "version": 1,
  "name": "slot-button",                 // 파일 이름 바탕
  "target": { "kind": "root" },          // 또는 { "kind": "element", "path": [1,0,2], "label": "div.panel" }
  "background": "transparent",           // transparent | keep (조각 원래 배경 포함)
  "bleed": "auto",                       // 그림자·광채가 상자 밖으로 나간 만큼 자동 포함 | none
  "scales": [1, 2],
  "slice": {
    "mode": "none",                      // none | nine | three-h | three-v
    "insets": { "l": 12, "t": 12, "r": 12, "b": 12 },   // CSS px(1배율 기준)
    "fill": "stretch",                   // stretch | tile
    "frameOnly": true,                   // 글자·아이콘을 빼고 틀만 찍음
    "size": "compact"                    // compact(인셋 + 가운데 최소) | original
  },
  "states": [                            // 2단계
    { "name": "normal" },
    { "name": "hover",    "pseudo": ["hover"] },
    { "name": "pressed",  "pseudo": ["hover", "active"] },
    { "name": "disabled", "attrs": { "disabled": "" } },
    { "name": "selected", "classes": ["is-selected"] }
  ],
  "animation": null,                     // 3단계: { "fps": 24, "duration": "auto", "loop": true }
  "output": {
    "layout": "sheet",                   // files | sheet
    "sheet": { "type": "rows", "columns": "auto", "padding": 2, "extrude": 0 },
    "data": "aseprite-hash"              // aseprite-hash | aseprite-array
  }
}
```

**프레임 목록 펼치기**: 상태 × 애니메이션 프레임 × 배율. 배율마다 시트(또는 파일 묶음)를 따로 만듭니다(`name@2x.png`). 프레임 이름 틀은 `{name}_{state}_{frame}`이고, 상태나 애니메이션이 하나뿐이면 그 부분을 뺍니다.

## 4. 캡처 방식

| 문제 | 처리 |
|---|---|
| 저장 안 한 편집도 찍혀야 함 | 편집기가 지금 화면의 HTML(저장 요청과 같은 본문)을 보냄. 서버는 조각 주소로 연 뒤 `Page.setDocumentContent`로 바꿔 넣음 → 상대 경로 자산이 그대로 동작 |
| 투명 배경 | `Emulation.setDefaultBackgroundColorOverride`를 알파 0으로 + `html, body { background: transparent !important }` 주입(`background: keep`이면 생략) |
| 고른 요소만 | 대상에 표시 클래스를 달고 `html, body, body * { visibility: hidden }`, 대상에는 `visible`. 조상의 배경·테두리·형제가 안 찍히고, 대상 안에서 원래 숨겨진 요소는 그대로 숨음 |
| 그림자·광채 | 상자보다 넓게(사방 64px) 찍은 뒤 투명 픽셀을 트림. 잘라 낸 만큼을 `spriteSourceSize`와 피벗에 기록. 9-slice면 넘친 만큼을 인셋에 더함 |
| 배율 | `Emulation.setDeviceMetricsOverride`의 `deviceScaleFactor` = 1·2·3. 확대가 아니라 다시 렌더하므로 글자·선이 선명함 |
| 상태(2단계) | 가상 클래스는 CDP `CSS.forcePseudoState`(hover·active·focus·focus-visible·focus-within·visited). `disabled`·`aria-*`·`data-state`·클래스는 속성을 직접 바꿈. 상태 사이에는 문서를 원래대로 되돌림 |
| 애니메이션(3단계) | `document.getAnimations()`로 CSS 애니메이션·전환을 모두 멈추고 `currentTime`을 프레임 시각으로 맞춤. 길이 `auto`는 가장 긴 1회 반복 길이. JS(requestAnimationFrame) 애니메이션은 CDP 가상 시간으로 따로 처리하고, 못 하면 "JS 애니메이션은 지원하지 않음"이라고 알림 |
| 폰트 | 캡처 전에 `document.fonts.ready`를 기다림 |

## 5. 9-slice·3-slice

1. **인셋 자동 추정**: 대상의 계산된 `border-*-width`, 네 모서리 `border-radius`, `clip-path: polygon()`의 모서리 깎임을 읽어 변마다 큰 값 + 1px을 제안합니다. 추정 근거를 값 옆에 적습니다(예: "radius 10 + border 1"). SAO식 사선 모서리처럼 추정이 어려운 모양은 사용자가 안내선을 끌어 정합니다.
2. **틀만 찍기**(기본 켜짐): 대상의 자식 요소와 글자를 `visibility: hidden`으로 숨기고 틀만 찍습니다. 버튼 라벨처럼 엔진에서 따로 그릴 내용이 이미지에 박히지 않게 합니다.
3. **최소 크기**(기본): 대상을 `width = L + R + 가운데`, `height = T + B + 가운데`로 **다시 렌더**합니다. 가운데는 늘림이면 4px, 반복이면 CSS 배경의 반복 주기(못 찾으면 원래 크기 유지 + 경고). 그 크기에서 모양이 깨지는 조각(최소 폭 지정 등)은 원래 크기로 찍고 이유를 알립니다.
4. **3-slice**: 가로는 L·R만, 세로는 T·B만 쓰고 반대 축은 원래 크기를 유지합니다.
5. **확인용 늘려 보기**: 내보내기 탭에서 결과 PNG를 인셋대로 늘린 모습(작게·크게·길게)을 바로 보여 줍니다. 엔진에 넣기 전에 모서리가 늘어나는 실수를 찾기 위한 것입니다.
6. **데이터**: Aseprite `slices[].keys[].bounds·center`, 그리고 `meta.webd.engines`에 Unity `border`(L, B, R, T), Godot `patch_margin_*`·`axis_stretch`. 모두 배율을 곱한 픽셀 값입니다.

## 6. UI/UX

원칙: **간단하고 직관적**(사용자 기준). 처음 여는 사람이 한 번에 "한 장 내보내기"를 할 수 있고, 9-slice·상태·애니메이션은 필요할 때만 펼칩니다. 목록·편집기와 같은 공통 테마(`theme.css`)를 쓰고, 라이트·다크 모드를 둘 다 확인합니다.

### 6-1. 목록 → 편집기

- `library.mjs open`(새 명령)이 라이브러리 서버를 띄우고 목록을 엽니다. **카드를 누르면 같은 탭에서 편집기가 열립니다.** 편집기 왼쪽 위에 `← 라이브러리`.
- 카드의 보조 버튼은 `내보내기`(편집기를 내보내기 탭으로 엶), `HTML 복사`, `ID 복사`. 새 탭으로 원본을 여는 기능은 메뉴로 내립니다.
- 목록을 `file://`로 직접 연 경우(서버 없음)에는 지금처럼 편집 명령을 복사하고, 맨 위에 "`library.mjs open`으로 열면 바로 편집할 수 있습니다"를 한 줄 띄웁니다.

### 6-2. 편집기의 내보내기 탭

오른쪽 패널 탭을 `인스펙터 | CSS 원문 | 내보내기`로 바꿉니다. 내보내기 탭이 열리면 가운데 미리보기의 박스 모델 표시가 **내보내기 표시**(대상 범위, 넘침 범위, 인셋 안내선)로 바뀝니다. Unity Sprite Editor처럼 이미지 위에서 선을 끌어 인셋을 정합니다.

```
┌ 내보내기 ─────────────────────────────┐
│ 대상      [조각 전체 ▾]  ← 하이라키 선택과 연동 │
│ 종류      (한 장)(9-slice)(3-slice 가로)(3-slice 세로) │
│ ┄ 9-slice일 때만 ┄                     │
│ 인셋      L [12] T [12] R [12] B [12]  [CSS에서 추정] │
│ 가운데    (늘림)(반복)                  │
│ 크기      (최소)(원래)   ☑ 틀만 찍기       │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ 상태      ☑ 기본 ☐ hover ☐ pressed ☐ disabled  [+ 추가] │  2단계
│ 애니메이션 [없음 ▾]  24fps · 18프레임      │  3단계
│ 배율      ☑ 1x ☑ 2x ☐ 3x               │
│ 묶음      (파일 각각)(시트 + JSON)  간격 [2]px │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
│ 결과 미리보기  [썸네일들]  [늘려 보기]       │
│ PNG 2장 + JSON · 1x 40×40, 2x 80×80      │
│ [ 내보내기 ]            폴더 열기 · 마지막 14:02 │
└────────────────────────────────────┘
```

- 인스펙터와 같은 **이름 - 값 두 열** 배치로 맞춥니다(사용자가 정한 인스펙터 기준).
- 상태·애니메이션 후보는 CSS에서 찾아 미리 채웁니다(`:hover`, `:active`, `:disabled`, `[aria-pressed]`, `.is-*`, `@keyframes`). 찾은 것이 없으면 항목을 숨기지 않고 "CSS에 상태 규칙이 없습니다"라고 씁니다.
- 결과 미리보기는 실제 내보내기와 같은 경로로 서버가 렌더한 이미지입니다. 설정을 바꾸면 0.6초 뒤 다시 그리고, 그동안은 이전 결과를 흐리게 둡니다.
- 저장하지 않은 CSS 변경이 있으면 버튼 위에 "저장 안 한 변경이 포함됩니다"라고 표시합니다(막지는 않음).
- 실패는 패널 안에 원인과 다음 할 일을 씁니다(브라우저 없음, 대상 요소 사라짐, 최소 크기에서 깨짐 등).

## 7. 산출물 위치와 이름

- 기본: `<라이브러리 실제 경로의 상위>/export/<id>/`. 지금 설정으로는 `F:\AI\WebD\export\<id>\`입니다(라이브러리가 `F:\AI\WebD\library`, C:의 `~/.webd/library`는 그곳을 가리키는 연결이라 실제 경로로 풀어서 계산). 환경변수 `WEBD_EXPORT`로 기본 상위 폴더를 바꿀 수 있고, **조각마다 내보내기 탭의 "폴더" 칸에서 직접 지정**할 수 있습니다(export.json에 저장).
- 라이브러리 폴더 안에 두지 않는 이유: 조각을 지우면 `.trash`로 옮겨지는데 산출물까지 같이 사라지고, 엔진으로 가져갈 파일을 한곳에서 모으기 어렵기 때문입니다.
- 파일: `<name>.png`, `<name>@2x.png`, `<name>.json`(배율마다 `<name>@2x.json`). 다시 내보내면 덮어쓰고, 직전 결과는 `<id>/.previous/`에 한 벌만 남깁니다.

## 8. 단계와 완료 조건

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| 1 | 라이브러리 서버(목록→편집기), 내보내기 탭, 한 장·9-slice·3-slice, 배율, 파일 각각·시트 + JSON, export.json 저장 | 저장된 실제 조각(SAO 패널, 슬롯 버튼)으로 PNG·JSON 생성, 투명 픽셀 확인, 늘려 보기 확인, 라이트·다크 화면 확인, 단위 테스트 통과 |
| 2 | 상태별(가상 클래스 강제, 속성·클래스), 상태 × 9-slice | 버튼 조각의 hover·pressed·disabled가 각각 다른 PNG로 나옴 |
| 3 | 애니메이션 프레임, `frameTags`, 상태 전환 프레임 | CSS 애니메이션 조각에서 프레임 수·시각이 사양과 맞음 |
| 4 | 트림·빽빽한 배치, 엔진 가져오기 파일(Unity·Godot), 명령줄 `library.mjs export <id>` | 엔진에서 실제로 가져와 확인(사용자 환경 필요) |

## 9. 사용자 결정 (2026-11-10)

1. 산출물 위치는 **내보내기 탭에서 지정할 수 있어야 함**. 기본값은 7절 안(`<라이브러리 상위>/export/<id>`, 이 PC에서는 `F:\AI\WebD\export\<id>`)
2. 엔진: "잘 만든 시트는 범용으로 쓴다". 특정 엔진에 묶지 않는 Aseprite 호환 JSON을 기본으로 하고, Unity·Godot 값을 같은 JSON에 함께 넣음
3. 1단계부터 바로 구현
