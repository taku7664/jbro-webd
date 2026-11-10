# jbro-webd

Codex와 Claude Code에서 쓰는 웹·게임 UI 디자인 스킬 **WebD**와, UI 조각을 저장하고 편집하는 **WebD 라이브러리**입니다.

> 상태: 초안(0.1.0). 실제 프로젝트에서 써 보며 다듬는 중입니다.

| 스킬 | 하는 일 |
|---|---|
| `webd` | 웹·게임 UI의 스타일을 정하고 조각별로 제작·검토한 뒤 화면을 조립합니다. 디자인 비평, 접근성 검사, 스타일 사양과 측정 도구를 제공합니다. |
| `webd-library` | UI 조각을 단독 HTML로 저장, 목록 페이지에서 미리보기·검색·기간 필터·정렬, 카드를 눌러 브라우저에서 CSS 직접 편집·저장, 게임용 스프라이트 내보내기(PNG + Aseprite 호환 JSON, 9-slice·3-slice), 다른 프로젝트에 옮겨 쓰기 |

## 생각

모델에게 "예쁘게", "독특하게"라고 하면 학습 데이터의 평균이 나옵니다. WebD는 그 평균을 피하려고 결정을 **확인 가능한 형태**로 남기게 합니다.

```
맥락 → 방향(스타일만) → 조각 목록 → [한 조각 제작 → 자동 거르기 → 저장 → 편집기 검토 → 사용자 확정] 반복 → 화면 조립 → 화면 단위 사용자 검토
```

- **맥락과 방향**은 대상·목표·화면 모드(Persuade / Operate / Read / Experience / Play)와 스타일을 정합니다. 레퍼런스에서 모양·배치·타이포·밀도를 참고하고 색은 프로젝트에서 별도로 정합니다.
- **조각 제작과 검토**는 현재 조각의 구조·동작과 필요한 상태부터 맞춥니다. 자동 검사와 비평으로 대비·넘침·겹침·잘림·위계 문제를 거르고, 라이브러리 편집기에서 사용자가 현재 버전을 확정할 때까지 다듬습니다.
- **화면 조립과 검토**는 확정된 조각으로 전체 작업 흐름을 맞추고 사용자에게 다시 확인받습니다. 사용자 응답이 없으면 **사용자 검토 대기**입니다.

결정이 부딪히면 `접근성 하한선 > 사용자가 고정한 것 > 스타일 사양·DESIGN.md > 사용자 기본 취향의 스타일 축 > AI 티 목록 > 기본값` 순서로 정합니다.

## 구조

```
.agents/skills/         Codex가 찾는 동기화 복사본
.claude-plugin/
  plugin.json          플러그인 정보
  marketplace.json     마켓플레이스로 추가할 때 읽는 목록
skills/webd/
  SKILL.md             길잡이: 우선순위, 명령표, 새 작업 흐름, 요청별 진입점, 도구
  reference/
    context.md         맥락 잡기, PRODUCT.md 작성
    modes.md           화면 모드 5개 (Persuade·Operate·Read·Experience·Play)
    structure.md       화면 구조 판단: 일곱 질문 → 꼭 넣을 것, 작업대형 골격, 페이지형 쏠림 점검
    visual-quality.md  미감 기준: 기준 제품, 색 전략, 위계 순서, 선·상자 줄이기, 다른 눈의 비평
    direction.md       방향 정하기 경로 A–D, DESIGN.md 잠금
    archetypes.md      아키타입 12, 미학 계열 12, 리믹스 규칙, register 다이얼, 시그니처
    industries.md      업종 22개의 지킬 것·흔한 기본값·위험
    build.md           조각별 제작·편집기 검토·화면 조립
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
    browser/          페이지 검사와 공용 이미지 계산 모듈
    render-check.mjs   선택형 렌더 검사 (Chrome·Edge 헤드리스, Node 22+)
    check-style.mjs    스타일 사양 대비 계산
    palette.mjs        OKLCH 12단계 팔레트, 대비 자동 보정
    dealer.mjs         방향 후보를 시드로 나눠 주는 딜러
    image-tokens.mjs   레퍼런스 이미지의 색을 실제 픽셀로 측정 (경로 B)
    css-inventory.mjs  CSS에 쓰인 값을 세어 토큰 후보·흩어진 값 표시 (경로 D, audit)
  tools/               브라우저 이미지 색 측정 도구
  styles/              고정 팔레트 사양 20종, 레퍼런스 기반 게임 사양 4종, INDEX.md, _template.md
  taste/               사용자 기본 취향의 스타일 축: web.md, game.md
  templates/
    PRODUCT.md
    DESIGN.md
skills/webd-library/
  SKILL.md             저장·목록·재사용·삭제 절차
  scripts/
    library.mjs        save / list / show / remove / index / path / open / edit
    gallery.mjs        목록 페이지(index.html) 생성
    editor-server.mjs  목록·편집기·내보내기 로컬 서버 (127.0.0.1 전용)
    export/            스프라이트 내보내기: spec·capture(헤드리스 렌더)·png·pack·formats·run
  editor/
    editor.html, editor.css, editor-app.mjs   편집 화면
    export-panel.mjs   편집기의 내보내기 탭
    css-model.mjs      CSS 원문을 자리만 고치는 모델 (화면·테스트 공용)
docs/
  sources.md           참고 자료와 차용 범위
  gap-analysis.md      원본 대비 빈칸 분석과 작업 순서
tests/                 node --test 로 실행하는 검출기·렌더 검사·팔레트·딜러·라이브러리·편집기 테스트
```

SKILL.md는 짧게 두고, 단계별 파일은 그 단계에서만 읽습니다. 스타일 파일도 지정된 하나만 읽습니다.

## 설치 (로컬 테스트)

### Codex

이 저장소에서 세션을 열고 스킬 선택 메뉴에서 WebD를 고릅니다. Codex 0.153.4의 스킬 목록에는 `jbro-webd:webd`와 `jbro-webd:webd-library`로 표시됩니다. 수정은 `skills/`에 하고 루트에서 `node scripts/sync-codex.mjs`를 실행합니다. 복사본의 파일 목록과 내용은 테스트에서 원본과 비교합니다. [OpenAI CLI 설치 문서의 Codex 프로젝트 경로](https://developers.openai.com/api/reference/cli#use-the-cli-from-a-coding-agent)

### Claude Code

로컬 플러그인을 추가하려면 Claude Code 대화창에서 실행합니다.

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
이 스크린샷의 간격과 글자 위계를 가져와서 설정 화면 다시 잡아 줘.
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

페이지 렌더와 이미지 색 측정은 내부 브라우저에서 먼저 확인합니다. Node 명령에는 추가 패키지가 필요 없습니다. 정적·렌더 검사 명령은 high·medium이 있으면 2, 없으면 0, 사용 오류는 1을 반환합니다.

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
- **페이지 검사**는 내부 브라우저에서 `scripts/browser/page-checks.mjs`로 대비·작은 글자·넘침·터치 대상·첫 화면 수치·한글 폰트 후보를 JSON으로 읽습니다. 선택형 **render-check**는 같은 검사에 실제 렌더 폰트·Tab·나가기 경고·화면 캡처를 더합니다. [렌더 검사 절차](skills/webd/reference/verify.md#2-렌더-확인)
- **check-style**: 스타일 사양의 `contrast` 블록으로 대비 계산.
- **palette**: 기준 색상 하나로 OKLCH 12단계 라이트·다크 팔레트와 기능 색. 글자 단계 대비를 자동으로 맞춤.
- **image-tokens**는 로컬 서버의 `skills/webd/tools/image-tokens.html`에 파일을 고르거나 끌어 놓아 면적 순 색·역할 후보·대비를 읽습니다. 영역(`x,y,너비,높이`)과 지점(`x,y`)을 넣고 결과 JSON을 복사할 수 있습니다. 헤드리스 명령도 같은 계산을 사용합니다.
- **css-inventory**: HTML `<style>`·`style=""`·CSS 파일에서 색·글자 크기·간격·반경·그림자·굵기·행간·시간 값을 세고, 토큰 밖 색, 4px 격자 밖 간격, 거의 같은 글자 크기를 짚습니다.
- **dealer**: 방향 후보마다 계열·빌린 축·구성 방식·색상·시그니처를 시드로 나눠 줌. 사용자 고정 축은 `--pin`, AI 티 조합은 나눠 주지 않음. `--mode`·`--structure`를 주면 화면에 안 맞는 패(도구 화면의 포스터 구성 등)를 뺌.

저장소 루트에서 아래 명령을 실행하고 출력된 로컬 주소를 내부 브라우저에서 엽니다. 도구에 필요한 세 파일만 제공하며 사용 후 Ctrl+C로 종료합니다.

```
node skills/webd/tools/serve-image-tokens.mjs
```

## 라이브러리

기본 저장 위치는 `~/.webd/library/`입니다. `--lib <폴더>` 또는 `WEBD_LIBRARY` 환경 변수로 바꿀 수 있습니다.

라이브러리에는 재사용할 UI 조각을 HTML로 저장합니다. `button` 분류에는 실제 버튼이나 CTA 링크 하나를 넣습니다. 상태 비교 화면과 스프라이트 시트는 별도 산출물로 관리합니다.

```
node skills/webd-library/scripts/library.mjs save --file part.html --name "가격 표" --category table --tags 가격,구독
node skills/webd-library/scripts/library.mjs list --sort updated --since 2026-10-01 --until 2026-10-31
node skills/webd-library/scripts/library.mjs index      # 목록 페이지 다시 만들기
node skills/webd-library/scripts/library.mjs open       # 라이브러리 서버: 목록에서 카드를 누르면 편집기 (Ctrl+C로 닫음)
node skills/webd-library/scripts/library.mjs edit <id>  # 같은 서버를 열고 그 조각의 편집기를 바로 띄움
```

- 컴포넌트마다 `component.html`(단독으로 열림)과 `meta.json`(이름, 분류, 태그, 저장·수정 시각, 출처, 미리보기 크기, 원래 배경색 `background`)을 둡니다.
- 같은 id로 다시 저장하면 이전 파일은 `history/`로 가고 저장 시각은 유지됩니다. 같은 초에 여러 번 저장해도 history 파일이 덮이지 않습니다.
- `remove`는 `.trash/`로 옮기기만 합니다.
- 썸네일은 이미지 파일이 아니라 `component.html`을 iframe으로 띄워 축소한 실제 렌더입니다. 별도 캡처 도구가 필요 없고 저장한 코드가 바뀌면 바로 반영되지만, 항목이 많으면 무거워지고 웹폰트는 네트워크가 있어야 보입니다.
- 목록 페이지(`index.html`)는 `file://`로 열립니다. 미리보기, 검색, 분류·태그·기간 필터, 저장일·수정일·이름·분류 정렬, HTML 복사를 지원하고 라이트·다크 모드를 따릅니다.
- **미리보기 배경 원래/중립**: 기본은 컴포넌트 원래 배경입니다. 중립으로 바꾸면 라이트 `#E2E6E8`, 다크 `#2C3236` 단색 위에 보여 주고 카드에 원래 배경색 칩을 붙입니다. 고른 값은 그 브라우저에만 기억합니다. `file://`에서는 iframe 안을 바깥에서 고칠 수 없어서(Chromium의 `contentDocument`가 `null`) 중립일 때만 배경 덮어쓰기를 넣은 사본을 `srcdoc`으로 띄웁니다. 저장된 `component.html`은 바뀌지 않습니다.

### CSS 편집

Codex에서는 `open --no-open`(또는 `edit <id> --no-open`)으로 `127.0.0.1` 라이브러리 서버를 띄우고 내부 브라우저로 엽니다. 서버로 연 목록에서는 카드를 누르면 편집기가 열리고, 파일로 연 `index.html`에서는 편집 명령을 복사합니다. 사용자가 버전을 확정하면 조각 ID와 함께 기록합니다.
목록과 편집기는 `skills/webd-library/editor/theme.css`의 색·서체·공통 작업 막대·표면·주 버튼 스타일을 함께 사용합니다. 목록은 `index` 생성 시 이 CSS를 HTML에 포함합니다.
편집기 하이라키의 요소 아이콘은 Lucide Static 1.71.0에서 필요한 SVG만 로컬 자산으로 포함했습니다. 라이선스는 `skills/webd-library/editor/LUCIDE-LICENSE.txt`에 있습니다.

- **하이라키와 인스펙터**: 왼쪽의 간결한 본문 요소 트리에서 요소를 펼치거나 접고 고릅니다(`script`·`style`·`template`은 숨김). 고른 요소는 미리보기에 강조되고, 오른쪽 인스펙터에서 속성 이름과 값이 정렬된 열로 나타납니다. 상단 박스 모델은 유지합니다.
- **미리보기 배경과 크기**: 편집기는 저장된 미리보기 너비와 높이로 조각을 보여 줍니다. 조각 문서에 배경이 없으면 목록과 편집기 모두 체크무늬로 투명 영역을 표시합니다. 체크무늬는 저장 HTML에 포함되지 않습니다.
- **좁은 화면**: 휴대폰 폭에서는 구조·미리보기·스타일을 전환합니다. 트리에서 요소를 고르면 스타일 화면으로 이동합니다.
- **미리보기 요소 선택**: 처음에는 미리보기의 버튼과 링크를 직접 조작할 수 있습니다. 미리보기에서 대상을 고를 때는 "요소 선택"을 켭니다. 위쪽 경로에서도 부모 요소를 고를 수 있습니다.
- **박스 모델**: 개발자 도구처럼 margin(주황)·border(노랑)·padding(초록)·content(파랑)를 미리보기 위에 겹쳐 보여 주고, 패널에 각 변 값을 그립니다. "전체 간격 보기"는 모든 요소의 margin·padding을 한꺼번에 보여 줍니다.
- **스타일 탭**: 고른 요소에 걸린 규칙을 우선순위 순서로 보여 줍니다. 속성 이름·값을 직접 고치고(↑↓ 1, Shift 10, Alt 0.1), 체크박스로 끄고(`/* 주석 */`으로 남음), 속성을 더할 수 있습니다. 덮인 선언은 줄을 긋고, `:hover` 같은 상태 규칙은 따로 표시합니다.
- **토큰**: 값이 `var(--x)`이면 토큰 값과 쓰는 곳 개수를 보여 줍니다. 그 자리 값을 숫자로 바꾸면 그 규칙만, "이 요소가 쓰는 토큰"에서 바꾸면 그 토큰을 쓰는 곳 전부가 바뀝니다.
- **CSS 전체 탭**: `<style>` 원문을 바로 고칩니다.
- **저장**: 고치는 대로 미리보기에 반영되고, "저장"(Ctrl+S)을 눌러야 새 버전으로 저장됩니다(`save --id`와 같은 경로, history 유지). 원문은 다시 쓰지 않고 바꾼 자리만 고쳐서 주석·들여쓰기가 그대로 남습니다. 되돌리기·다시 실행을 지원합니다.
- **편집 중인 내용 보존**. 화면에서 저장 안 한 변경은 `<id>/.draft.json`에 남습니다. 말로 받은 피드백을 반영하기 전에 그 파일을 확인하고, 수정본을 `save --id <id> --file <수정 HTML>`로 저장합니다. 편집기가 새 버전을 감지해 다시 불러오며 저장 안 한 변경이 있으면 먼저 묻습니다. 그새 파일이 바뀌었으면 저장을 멈추고 덮어쓸지 묻습니다.
- 한계: `style` 속성(인라인 스타일)과 바깥 CSS 파일은 화면에서 고치지 않습니다. 스크립트가 `<style>`을 더하거나 바꾸는 컴포넌트는 편집을 막습니다.

### 스프라이트 내보내기

편집기의 **내보내기** 탭에서 조각(또는 하이라키에서 고른 요소)을 게임에서 쓸 PNG와 좌표 JSON으로 내보냅니다. 설치된 Chrome·Edge를 헤드리스로 띄워 다시 렌더하므로 배율(1·2·3·4x)마다 선명하게 나옵니다. 설계와 단계는 [docs/EXPORT-DESIGN.md](docs/EXPORT-DESIGN.md)에 있습니다.

- 지금 되는 것(1단계): 한 장, 9-slice, 3-slice 가로·세로. 인셋은 CSS(테두리·radius·`clip-path` 깎임)에서 추정하거나 미리보기의 점선을 끌어 정하고, 최소 크기로 다시 렌더해 작은 이미지를 만듭니다. 결과 미리보기와 늘려 보기로 확인한 뒤 내보냅니다.
- 출력: `<라이브러리 실제 경로의 상위>/export/<id>/`(조각마다 다른 폴더 지정 가능). PNG마다 같은 이름의 Aseprite 호환 JSON이 붙고, `meta.webd.engines`에 Unity·Godot·CSS `border-image` 값이 들어 있습니다.
- 다음 단계: 상태별(hover·pressed·disabled 등), 애니메이션 프레임, 빽빽한 시트 배치와 엔진 가져오기 파일.

## 테스트

```
node --test tests/*.test.mjs
```

Node 22 이상에서 실행합니다. 헤드리스 브라우저가 필요한 테스트는 Chrome·Edge·Chromium을 찾지 못하면 건너뜁니다. 이미지 색 계산과 복사본 동기화 테스트는 브라우저 없이 실행합니다.

## 아직 없는 것

- 실제 프로젝트에서의 검증 결과 (지금까지는 가상 페이지 7개로만 시험)
- Claude Code 플러그인으로 설치한 상태에서 스킬·명령 호출 확인
- 사용자와 게임 조각을 라이브러리 편집기로 다듬고 확정한 실사용 기록

## 참고

[docs/sources.md](docs/sources.md)
