# jbro-webd

AI 티 나지 않는 웹 UI를 설계·구현·검증하는 Claude Code 스킬 **WebD**와, 만든 UI 조각을 저장해 다시 쓰는 **WebD 라이브러리**를 담은 플러그인입니다.

> 상태: 초안(0.1.0). 실제 프로젝트에서 써 보며 다듬는 중입니다.

| 스킬 | 하는 일 |
|---|---|
| `webd` | 새 화면 만들기(맥락 → 방향 → 구현 → 검증)와 작업 명령 18개(critique, audit, polish, harden, bolder 등), 기초 지식 12영역, 화면 유형 7종, 스타일 20종, 검사·생성 스크립트 5개 |
| `webd-library` | UI 조각을 단독 HTML로 저장, 목록 페이지에서 미리보기·검색·기간 필터·정렬, 브라우저에서 CSS 직접 편집·저장, 다른 프로젝트에 옮겨 쓰기 |

## 생각

모델에게 "예쁘게", "독특하게"라고 하면 학습 데이터의 평균이 나옵니다. WebD는 그 평균을 피하려고 결정을 **확인 가능한 형태**로 남기게 합니다.

```
맥락 → 방향 → 구현(2단계) → 검증
```

- **맥락**: 누가, 무엇을 하려고 보는 화면인지 정하고 화면 모드(Persuade / Operate / Read / Experience)를 고릅니다.
- **방향**: 스타일 이름, 레퍼런스 이미지, 레퍼런스 2개 충돌, 이미 잘 나온 화면 중 하나로 4축(타입·색·구성·모션) + 시그니처를 정하고 `DESIGN.md`를 잠급니다.
- **구현**: 1차는 구조와 콘텐츠, 2차는 타입·색·간격만 다듬습니다.
- **검증**: 자동 검사 → 실제 렌더 확인 → 비평 → 수정 스펙

결정이 부딪히면 `접근성 하한선 > 사용자가 고정한 것 > 스타일 사양·DESIGN.md > AI 티 목록 > 기본값` 순서로 정합니다.

## 구조

```
.claude-plugin/
  plugin.json          플러그인 정보
  marketplace.json     마켓플레이스로 추가할 때 읽는 목록
skills/webd/
  SKILL.md             길잡이: 우선순위, 명령표, 새 작업 흐름, 요청별 진입점, 도구
  reference/
    context.md         맥락 잡기, PRODUCT.md 작성
    modes.md           화면 모드 4개 (Persuade·Operate·Read·Experience 깊이)
    structure.md       화면 구조 판단: 일곱 질문 → 꼭 넣을 것, 작업대형 골격, 페이지형 쏠림 점검
    visual-quality.md  미감 기준: 기준 제품, 색 전략, 위계 순서, 선·상자 줄이기, 다른 눈의 비평
    direction.md       방향 정하기 경로 A–D, DESIGN.md 잠금
    archetypes.md      아키타입 12, 미학 계열 12, 리믹스 규칙, register 다이얼, 시그니처
    industries.md      업종 22개의 지킬 것·흔한 기본값·위험
    build.md           2단계 구현
    craft-floor.md     품질 하한선 (UI 수정 직전에만 읽음)
    ai-tells.md        AI 티 목록
    verify.md          검증과 수정 스펙
    foundations/       기초 지식: typography, hangul, color, layout, motion, interaction,
                       responsive, ux-writing, usability, data-viz, ethics, design-systems
    ops/               작업 명령: critique, audit, polish, harden, onboard, optimize, shape,
                       refine(typeset·layout·colorize·animate·clarify·adapt),
                       intensity(bolder·quieter·distill·delight·overdrive), system(extract·document)
    surfaces/          구조 질문에 미리 답한 예시: landing, pricing, dashboard, forms, docs, portfolio, states, game(게임 UI)
  scripts/
    detect.mjs         정적 검출기 35규칙
    render-check.mjs   렌더 검사 (설치된 Chrome·Edge 헤드리스, Node 22+)
    check-style.mjs    스타일 사양 대비 계산
    palette.mjs        OKLCH 12단계 팔레트, 대비 자동 보정
    dealer.mjs         방향 후보를 시드로 나눠 주는 딜러
    image-tokens.mjs   레퍼런스 이미지의 색을 실제 픽셀로 측정 (경로 B)
    css-inventory.mjs  CSS에 쓰인 값을 세어 토큰 후보·흩어진 값 표시 (경로 D, audit)
  styles/              이름으로 부르는 스타일 20종 + INDEX.md + _template.md
  taste/               사용자 기본 취향(레퍼런스에서 측정): web.md, game.md. 브리프가 방향을 비우면 출발점
  templates/
    PRODUCT.md
    DESIGN.md
skills/webd-library/
  SKILL.md             저장·목록·재사용·삭제 절차
  scripts/
    library.mjs        save / list / show / remove / index / path / edit
    gallery.mjs        목록 페이지(index.html) 생성
    editor-server.mjs  CSS 편집용 로컬 서버 (127.0.0.1 전용)
  editor/
    editor.html, editor.css, editor-app.mjs   편집 화면
    css-model.mjs      CSS 원문을 자리만 고치는 모델 (화면·테스트 공용)
docs/
  sources.md           참고 자료와 차용 범위
  gap-analysis.md      원본 대비 빈칸 분석과 작업 순서
tests/                 node --test 로 실행하는 검출기·렌더 검사·팔레트·딜러·라이브러리·편집기 테스트
```

SKILL.md는 짧게 두고, 단계별 파일은 그 단계에서만 읽습니다. 스타일 파일도 지정된 하나만 읽습니다.

## 설치 (로컬 테스트)

GitHub에 올리기 전에는 로컬 경로로 추가합니다. Claude Code 대화창에서:

```
/plugin marketplace add <사용자 폴더>\Documents\GitHub\jbro-webd
/plugin install jbro-webd@jbro-webd
```

스킬만 빠르게 시험하려면 `skills/webd` 폴더를 프로젝트의 `.claude/skills/webd`로 복사해도 됩니다.

## 사용 예

```
webd로 커피 원두 구독 서비스 랜딩 페이지 만들어 줘.
```

```
이 스크린샷의 간격이랑 색감만 가져와서 설정 화면 다시 잡아 줘.
```

```
transit map 스타일로 온보딩 흐름 페이지 만들어 줘.
```

```
지금 대시보드 webd critique 해 줘.
```

```
webd audit. 접근성이랑 반응형 위주로.
```

```
가격 섹션만 webd bolder. 나머지는 그대로.
```

```
방금 만든 가격 표 라이브러리에 저장해 줘.
```

```
라이브러리 보여 줘. 지난달에 저장한 버튼만.
```

```
플랜 표 편집기로 열어 줘. 간격을 직접 만져 볼게.
```

## 도구

모두 의존성 없는 Node 스크립트입니다. 종료 코드는 문제(high·medium)가 있으면 2, 없으면 0, 사용 오류는 1입니다.

```
node skills/webd/scripts/detect.mjs <파일 또는 폴더> [--allow 규칙,규칙] [--json]
node skills/webd/scripts/render-check.mjs <파일|URL> [--widths 375,1440] [--scheme light,dark] [--out 폴더]
node skills/webd/scripts/check-style.mjs skills/webd/styles
node skills/webd/scripts/palette.mjs --seed 150 [--chroma muted|balanced|vivid] [--harmony split]
node skills/webd/scripts/dealer.mjs --project <이름> --seed-date 2026-11-09 --mode operate --structure workbench [--pin family=swiss]
node skills/webd/scripts/image-tokens.mjs <이미지> [--crop x,y,w,h] [--at x,y]
node skills/webd/scripts/css-inventory.mjs <파일·폴더>
```

- **detect**: 소스에서 정규식으로 찾을 수 있는 AI 티·접근성·반응형 35규칙. 0건이 "문제 없음"을 뜻하지 않습니다.
- **render-check**: 설치된 Chrome·Edge를 헤드리스로 띄워 실제 렌더를 봅니다. 글자 바로 뒤에 깔린 색 기준의 대비(겹친 도형·multiply 포함), SVG 축소까지 계산한 작은 글자, 한글을 실제로 그린 폰트(스택 밖 대체 감지, 버튼 `font: inherit` 누락 등), 지정 폭 기준 가로 넘침, 앱 틀인데 문서가 스크롤되는 세로 넘침(패널 밖으로 새는 absolute 요소 지목), Tab으로 확인한 포커스 표시, 터치 대상(좁은 폭 44px·넓은 폭 24px), 나가기 경고(beforeunload) 감지, 스크린샷. 스크롤 패널에 잘려 안 보이는 글자는 대비 검사에서 뺍니다. 이미지 위 글자 대비와 디자인 판단은 보지 않습니다.
- **check-style**: 스타일 사양의 `contrast` 블록으로 대비 계산.
- **palette**: 기준 색상 하나로 OKLCH 12단계 라이트·다크 팔레트와 기능 색. 글자 단계 대비를 자동으로 맞춤.
- **image-tokens**: 레퍼런스 스크린샷을 헤드리스 브라우저 캔버스로 읽어 면적 순 색, 바탕·면·글자·포인트 후보, 바탕 대비를 냅니다. `--crop`으로 브라우저 틀·스크롤바를 빼고, `--at x,y`로 특정 픽셀을 읽습니다. 글자 가장자리 서브픽셀 번짐은 포인트 후보에서 뺍니다. 간격·반경은 재지 않습니다.
- **css-inventory**: HTML `<style>`·`style=""`·CSS 파일에서 색·글자 크기·간격·반경·그림자·굵기·행간·시간 값을 세고, 토큰 밖 색, 4px 격자 밖 간격, 거의 같은 글자 크기를 짚습니다.
- **dealer**: 방향 후보마다 계열·빌린 축·구성 방식·색상·시그니처를 시드로 나눠 줌. 사용자 고정 축은 `--pin`, AI 티 조합은 나눠 주지 않음. `--mode`·`--structure`를 주면 화면에 안 맞는 패(도구 화면의 포스터 구성 등)를 뺌.

## 라이브러리

기본 저장 위치는 `~/.webd/library/`입니다. `--lib <폴더>` 또는 `WEBD_LIBRARY` 환경 변수로 바꿀 수 있습니다.

```
node skills/webd-library/scripts/library.mjs save --file part.html --name "가격 표" --category table --tags 가격,구독
node skills/webd-library/scripts/library.mjs list --sort updated --since 2026-10-01 --until 2026-10-31
node skills/webd-library/scripts/library.mjs index      # 목록 페이지 다시 만들기
node skills/webd-library/scripts/library.mjs edit <id>  # CSS 편집 화면 열기 (Ctrl+C로 닫음)
```

- 컴포넌트마다 `component.html`(단독으로 열림)과 `meta.json`(이름, 분류, 태그, 저장·수정 시각, 출처, 미리보기 크기, 원래 배경색 `background`)을 둡니다.
- 같은 id로 다시 저장하면 이전 파일은 `history/`로 가고 저장 시각은 유지됩니다. 같은 초에 여러 번 저장해도 history 파일이 덮이지 않습니다.
- `remove`는 `.trash/`로 옮기기만 합니다.
- 썸네일은 이미지 파일이 아니라 `component.html`을 iframe으로 띄워 축소한 실제 렌더입니다. 별도 캡처 도구가 필요 없고 저장한 코드가 바뀌면 바로 반영되지만, 항목이 많으면 무거워지고 웹폰트는 네트워크가 있어야 보입니다.
- 목록 페이지(`index.html`)는 `file://`로 열립니다. 미리보기, 검색, 분류·태그·기간 필터, 저장일·수정일·이름·분류 정렬, HTML 복사를 지원하고 라이트·다크 모드를 따릅니다.
- **미리보기 배경 원래/중립**: 기본은 컴포넌트 원래 배경입니다. 중립으로 바꾸면 라이트 `#E2E6E8`, 다크 `#2C3236` 단색 위에 보여 주고 카드에 원래 배경색 칩을 붙입니다. 고른 값은 그 브라우저에만 기억합니다. `file://`에서는 iframe 안을 바깥에서 고칠 수 없어서(Chromium의 `contentDocument`가 `null`) 중립일 때만 배경 덮어쓰기를 넣은 사본을 `srcdoc`으로 띄웁니다. 저장된 `component.html`은 바뀌지 않습니다.

### CSS 편집

`edit <id>`를 실행하면 `127.0.0.1`에만 열리는 편집 서버가 뜨고 브라우저에 편집 화면이 열립니다(`--port`, `--no-open`). 목록 페이지 카드의 "편집" 버튼은 이 명령을 복사합니다.

- **요소 선택**: 미리보기에서 클릭하면 고르고, 위쪽 경로로 부모 요소로 올라갑니다. "요소 선택"을 끄면 컴포넌트를 직접 조작할 수 있습니다.
- **박스 모델**: 개발자 도구처럼 margin(주황)·border(노랑)·padding(초록)·content(파랑)를 미리보기 위에 겹쳐 보여 주고, 패널에 각 변 값을 그립니다. "전체 간격 보기"는 모든 요소의 margin·padding을 한꺼번에 보여 줍니다.
- **스타일 탭**: 고른 요소에 걸린 규칙을 우선순위 순서로 보여 줍니다. 속성 이름·값을 직접 고치고(↑↓ 1, Shift 10, Alt 0.1), 체크박스로 끄고(`/* 주석 */`으로 남음), 속성을 더할 수 있습니다. 덮인 선언은 줄을 긋고, `:hover` 같은 상태 규칙은 따로 표시합니다.
- **토큰**: 값이 `var(--x)`이면 토큰 값과 쓰는 곳 개수를 보여 줍니다. 그 자리 값을 숫자로 바꾸면 그 규칙만, "이 요소가 쓰는 토큰"에서 바꾸면 그 토큰을 쓰는 곳 전부가 바뀝니다.
- **CSS 전체 탭**: `<style>` 원문을 바로 고칩니다.
- **저장**: 고치는 대로 미리보기에 반영되고, "저장"(Ctrl+S)을 눌러야 새 버전으로 저장됩니다(`save --id`와 같은 경로, history 유지). 원문은 다시 쓰지 않고 바꾼 자리만 고쳐서 주석·들여쓰기가 그대로 남습니다. 되돌리기·다시 실행을 지원합니다.
- **Claude와 같이 쓰기**: 저장 안 한 변경은 `<id>/.draft.json`에 남아 Claude가 읽을 수 있고, 다시 열면 이어서 편집할지 묻습니다. Claude가 파일을 고치면 편집 화면이 바로 다시 불러오고, 화면에 저장 안 한 변경이 있으면 먼저 묻습니다. 그새 파일이 바뀌었으면 저장을 멈추고 덮어쓸지 묻습니다.
- 한계: `style` 속성(인라인 스타일)과 바깥 CSS 파일은 화면에서 고치지 않습니다. 스크립트가 `<style>`을 더하거나 바꾸는 컴포넌트는 편집을 막습니다.

## 테스트

```
node --test tests/
```

Node 24에서는 `tests/` 폴더 지정이 안 될 수 있으니 `node --test tests/*.test.mjs`(셸 확장)로 실행합니다. 렌더 검사 테스트는 Chrome·Edge가 없으면 건너뜁니다.

## 아직 없는 것

- 실제 프로젝트에서의 검증 결과 (지금까지는 가상 페이지 7개로만 시험)
- 플러그인으로 설치한 상태에서 스킬·명령이 제대로 불려 오는지 확인
- 작업 명령(critique, audit 등)을 실제 화면에 돌려 본 결과
- 경로 B(레퍼런스 이미지)·D(화면에서 시스템 추출) 시험

## 참고

[docs/sources.md](docs/sources.md)
