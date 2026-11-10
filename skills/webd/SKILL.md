---
name: webd
description: 웹·게임 UI를 만들거나 다시 디자인하거나 비평·감사·다듬을 때 사용합니다. 랜딩 페이지, 가격 페이지, 대시보드, 앱 화면, 설정, 폼·결제, 문서, 포트폴리오, 컴포넌트, 디자인 시스템(DESIGN.md), 레퍼런스 이미지나 스타일 이름("swiss 스타일로", "영수증 스타일로")으로 화면 만들기, "AI 티 안 나게", "더 대담하게/조용하게", 접근성·반응형·성능 점검, UX 문구 다듬기에 씁니다. Use to design, redesign, critique, audit, polish, harden or animate a web frontend. 메뉴·HUD·인벤토리 등 게임 UI 시안과 조각 제작에도 씁니다. 디자인과 무관한 백엔드·데이터 작업에는 쓰지 않습니다.
---

# WebD

"모델이 아무 결정도 안 했을 때 나오는 화면"을 피하고, 이 프로젝트를 위해 내린 결정이 보이는 웹 UI를 만듭니다. 결과는 디자인 디렉터의 수준을 목표로 합니다: 출시 가능한 코드, 분명한 관점, 사용자와 제품에 대한 이해, 꼼꼼한 마감.

이 문서는 길잡이입니다. 지침은 `reference/`에 나눠 두었고 **요청에 필요한 파일만, 그 단계 직전에 읽습니다.** `<스킬 폴더>`는 현재 읽는 `SKILL.md`가 들어 있는 폴더입니다.

## 우선순위

결정이 부딪히면 위가 이깁니다.

1. **접근성 하한선**: 대비, 키보드 포커스, reduced-motion, 확대 허용. 어떤 지정도 넘지 못합니다.
2. **사용자가 고정(pin)한 것**: 직접 말한 서체·색·스타일 이름·시대·재질과 레퍼런스에서 가져오기로 한 스타일. 금지 목록에 있는 항목이라도 사용자가 원하면 따릅니다. 분명한 브리프를 내 취향으로 돌리는 것은 실패입니다.
3. **선택한 스타일 사양**(`styles/`) 또는 잠근 `DESIGN.md`
4. **사용자 기본 취향**(`taste/`): 브리프에 방향이 없으면 웹은 `taste/web.md`의 모양·구성·글자·밀도를 참고하고, 게임은 `taste/game.md`에서 레퍼런스 계열 하나를 고릅니다. 레퍼런스의 색 값은 프로젝트 토큰에 옮기지 않습니다. 색은 프로젝트에서 정하고, 그 결정에 사용자 취향이 필요하면 확인합니다.
5. **AI 티 목록**(`reference/ai-tells.md`): 사용자가 비워 둔 축에서만
6. **업종·관례 기본값**: 마지막 수단. 쓸 때는 쓴다고 밝힘

## 명령

사용자가 명령 이름을 쓰거나("webd critique", "/webd polish") 그 뜻이 분명하면 해당 문서를 읽고 따릅니다. 두 명령이 다 맞으면 한 번 묻습니다.

| 명령 | 하는 일 | 문서 |
|---|---|---|
| (새 작업) | 새 화면: 조각별 제작·사용자 확정 → 화면 조립·사용자 검토 | 아래 「새 작업 흐름」 |
| `shape` | 만들기 전 인터뷰와 브리프 | `reference/ops/shape.md` |
| `critique` | 점수 매긴 디자인 비평 (휴리스틱, 인지 부하, 페르소나) | `reference/ops/critique.md` |
| `audit` | 구현 품질 감사 (접근성·성능·토큰·반응형·무결성, /20) | `reference/ops/audit.md` |
| `polish` | 출시 전 마지막 손질 | `reference/ops/polish.md` |
| `harden` | 넘침·다국어·오류·경계·입력에서 버티게 | `reference/ops/harden.md` |
| `onboard` | 첫 실행, 빈 상태, 기능 발견 | `reference/ops/onboard.md` |
| `optimize` | 로딩·렌더 성능 (Core Web Vitals) | `reference/ops/optimize.md` |
| `typeset` `layout` `colorize` `animate` `clarify` `adapt` | 한 축 집중 다듬기 (글자·구조·색·모션·문구·기기) | `reference/ops/refine.md` |
| `bolder` `quieter` `distill` `delight` `overdrive` | 목소리 크기 조절 | `reference/ops/intensity.md` |
| `extract` `document` | 반복을 토큰·컴포넌트로, DESIGN.md 작성 | `reference/ops/system.md` |
| `library` | UI 조각 저장·목록·재사용 | `webd-library` 스킬 |

**명령 없이 "webd"만 부른 경우**: 자동으로 아무것도 실행하지 않습니다. 프로젝트 상태를 보고 가장 쓸모 있는 다음 명령 2–3개를 이유 한 줄씩과 함께 제안하고, 위 표를 보여 줍니다.
- `PRODUCT.md`가 없고 화면을 새로 만든다 → `shape` 또는 새 작업 흐름
- 코드는 있는데 `DESIGN.md`가 없다 → `document`
- 비평한 적이 없다 → `critique`
- 바뀐 파일이 한 화면에 몰려 있다 → 그 파일로 범위를 좁힌 `audit`·`polish`
- `detect.mjs`를 돌려 특정 군집이 많이 나온다 → 맞는 명령(그라디언트 글자·eyebrow → `quieter`/`typeset`, 회색만 → `colorize`)

## 새 작업 흐름

```
맥락 → 방향(스타일만) → 조각 목록 → [한 조각 제작 → 자동 거르기 → 저장 → 편집기 검토 → 사용자 확정] 반복 → 화면 조립 → 화면 단위 사용자 검토
```

| 단계 | 할 일 | 읽을 파일 |
|---|---|---|
| 맥락 | 대상·목표·화면 모드·화면 구조, `PRODUCT.md` | `reference/context.md`, `reference/modes.md`, `reference/structure.md` (흐릿하면 `ops/shape.md`) |
| 방향 | 4축과 시그니처를 정해 `DESIGN.md` 잠금. 레퍼런스에서 스타일을 빌리고 색은 프로젝트에서 정함 | `reference/direction.md`, `taste/web.md` 또는 `taste/game.md` |
| 조각 목록 | 화면을 구성하는 조각과 각 조각의 기본·선택·비활성·빈·오류 상태를 정함 | `reference/build.md` |
| 한 조각씩 제작·확정 | 같은 크기의 레퍼런스 옆에서 반경·간격·글자 크기와 굵기·선·선택 효과를 맞춤. 정적 검사·렌더·비평으로 문제를 거르고 라이브러리 편집기에서 사용자와 확인 | `reference/build.md`, `reference/verify.md`, `webd-library` 스킬 |
| 화면 조립·검토 | 사용자가 확정한 조각만 조립. 통합 상태와 조작을 다시 거르고 화면 전체를 사용자에게 확인받음 | `reference/verify.md` |

사용자가 현재 조각을 확정할 때까지 다음 조각을 만들지 않습니다. 사용자가 없는 실행에서는 현재 조각 또는 화면을 **사용자 검토 대기**로 남깁니다. 등록 후보는 `webd-library`의 「등록 단위」를 따릅니다. 상태 비교 화면과 스프라이트 시트는 별도 검토·산출 파일로 다룹니다.

새 작업이 아니어도 판단이 필요한 축이 생기면 해당 기초 문서를 읽습니다:

| 축 | 문서 |
|---|---|
| 보기 좋음 (위계·묶기·색 전략·기준 제품) | `reference/visual-quality.md` |
| 글자 / 한글 | `reference/foundations/typography.md`, `hangul.md` |
| 색 | `reference/foundations/color.md` |
| 구성·위계·간격 | `reference/foundations/layout.md` |
| 모션 | `reference/foundations/motion.md` |
| 상호작용·상태·폼 | `reference/foundations/interaction.md` |
| 반응형·인쇄·이메일 | `reference/foundations/responsive.md` |
| UX 문구 | `reference/foundations/ux-writing.md` |
| 사용성·접근성 | `reference/foundations/usability.md` |
| 차트·대시보드 | `reference/foundations/data-viz.md` |
| 다크 패턴·정직한 설득 | `reference/foundations/ethics.md` |
| 토큰·컴포넌트 체계 | `reference/foundations/design-systems.md` |
| 화면 구조 (어떤 화면이든 먼저) | `reference/structure.md`: 일곱 질문 → 꼭 넣을 것·하지 말 것, 작업대형 골격(편집기·조합기·생성 도구), 페이지형 쏠림 점검 |
| 화면 유형 예시 | `reference/surfaces/` landing, pricing, dashboard, forms(가입·로그인·결제·설정), docs, portfolio, states(404·오류·빈·로딩). 구조 질문에 미리 답한 예시이며, 목록에 없는 화면도 `structure.md`로 판단 |
| 업종별 지킬 것·흔한 기본값 | `reference/industries.md` |
| 아키타입·미학 계열·리믹스·register | `reference/archetypes.md` |

## 요청별 진입점

- **게임 UI**(메뉴, HUD, 인벤토리, 스킬 트리, 캐릭터 화면 등): Play 모드(`reference/modes.md`), `taste/game.md`, `reference/surfaces/game.md`. 결과는 HTML/CSS 시안, 16:9, 키보드·패드 조작.
- **새 화면·새 프로젝트**: 새 작업 흐름. `PRODUCT.md`가 있으면 읽고 맥락 단계를 건너뜀.
- **도구 화면**(편집기, 조합기, 생성기, 관리 화면, 설정 등 사용자가 무언가를 만들거나 고치는 화면): `structure.md`로 구조를 먼저 정하고, 홈페이지식 구성으로 끌려가지 않았는지 「페이지형 쏠림 점검」으로 확인.
- **스타일 이름 지정**("bento 스타일로", "영수증 스타일로"): `styles/INDEX.md`에서 파일 하나만 찾아 읽음. 없으면 가까운 스타일 2–3개 제안.
- **레퍼런스 이미지·스크린샷**: 글로 다시 설명하지 말고 `direction.md` 경로 B.
- **기존 화면 다듬기**: 기존 정체성(색·서체·카피·동작)과 범위 밖을 유지. 사실 카피를 바꾸거나 주장을 더하기 전에 물음. `DESIGN.md`가 없으면 현재 코드에서 토큰을 읽어 기준으로.
- **기존 화면 갈아엎기**: 제품의 진실·콘텐츠·기능·제약은 유지하고 겉모습을 새로 정함. 방향 단계부터. `DESIGN.md`가 없다는 것만으로 백지가 아님.
- **리뷰만**: `critique`(디자인) 또는 `audit`(구현). 고치라는 요청이 없으면 코드를 바꾸지 않음.
- **조각 저장·재사용**: `webd-library` 스킬. 가져올 때는 지금 프로젝트의 `DESIGN.md` 토큰으로 바꿔 넣음.

## 도구

페이지 검사와 이미지 도구는 브라우저에서 실행합니다. 명령줄 스크립트는 의존성 없는 Node 도구입니다.

| 스크립트 | 하는 일 |
|---|---|
| `scripts/detect.mjs <경로> [--allow 규칙]` | 소스의 AI 티·접근성 정적 검사 (35규칙) |
| `scripts/browser/page-checks.mjs` | 열린 페이지에서 대비, 작은 글자, 가로·세로 넘침, 터치 대상, 첫 화면 수치, 한글 폰트 점검 후보를 JSON으로 확인. 내부 브라우저 우선 경로는 `reference/verify.md` |
| `scripts/render-check.mjs <파일·URL> [--widths] [--scheme] [--out]` | 선택 경로. Chrome·Edge 헤드리스로 같은 렌더 검사와 실제 한글 폰트·Tab·나가기 경고·스크린샷 확인 |
| `scripts/check-style.mjs <styles 폴더>` | 스타일 사양의 색 대비 계산 |
| `scripts/palette.mjs --seed <색상\|#hex>` | OKLCH 12단계 라이트·다크 팔레트, 대비 자동 보정, 기능 색 |
| `tools/image-tokens.html` 또는 `scripts/image-tokens.mjs <이미지> [--crop] [--at x,y]` | 이미지의 면적 순 색, 역할 후보, 영역과 지점, 대비를 측정. 브라우저와 선택형 헤드리스 명령이 같은 계산을 사용 |
| `scripts/css-inventory.mjs <파일·폴더>` | CSS에 쓰인 색·글자 크기·간격·반경 등을 세고 토큰 밖 값·격자 밖 간격을 짚음 (경로 D, extract, audit) |
| `scripts/dealer.mjs --project <이름> --seed-date <날짜> --mode <모드> --structure <유형>` | 방향 후보를 시드로 나눠 줌 (계열·빌린 축·구성·색상·시그니처). 모드·구조에 안 맞는 패는 빼고, `--pin`으로 사용자 고정 |

## 지키는 것

- **기존 파일을 덮어쓰지 않습니다.** `PRODUCT.md`·`DESIGN.md`가 있으면 읽고 이어 씀. 바꿀 때는 무엇을 왜 바꾸는지 먼저 말함.
- **사실이 아닌 카피를 지어내지 않습니다.** 수치·고객사·후기는 사용자가 준 것만. 없으면 자리 표시로 남기고 알림. 기능이 돌아가려면 데이터가 필요한 경우(견적 단가, 예시 주문)에는 예시값을 쓰되 화면에 "예시"·"가정"을 표시하고 `PRODUCT.md`에 가정으로 적습니다.
- **"독특하게"를 형용사로 처리하지 않습니다.** 결정은 토큰·규칙·금지 조건처럼 확인할 수 있는 형태로 남김.
- **렌더를 직접 봅니다.** 지원 폭에서 실제 화면을 보고, 한 번 볼 때 여러 문제를 찾아 몰아서 고친 뒤 다시 봄. 못 봤으면 못 봤다고 보고.
- **검증 결과를 꾸미지 않습니다.** 검사가 못 잡는 항목, 보지 못한 폭은 미확인.
- **혐오·군국주의·차별의 상징**을 주제 세계에서 왔다는 이유로 장식에 쓰지 않습니다.
- **기만 장치**(가짜 긴급, 숨긴 비용, 부끄럽게 만드는 거절 문구)는 요청받아도 만들지 않고 정직한 대안을 제안합니다(`foundations/ethics.md`).

## 보고

- 정한 모드와 방향(스타일 이름, 또는 레퍼런스 충돌 문장과 4축)
- 만든·바꾼 파일과 바뀐 값
- 검증 방법·폭·결과, 남은 지적, 미확인 범위
- 기본값으로 둔 축
- 새 작업은 조각 ID, 거른 항목, 사용자가 확정한 조각과 검토 대기 대상을 기록합니다. 별도 저장 요청은 `webd-library` 절차를 따릅니다.
