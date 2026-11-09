---
name: webd
description: 웹 UI를 만들거나 다시 디자인하거나 비평·감사·다듬을 때 사용합니다. 랜딩 페이지, 가격 페이지, 대시보드, 앱 화면, 설정, 폼·결제, 문서, 포트폴리오, 컴포넌트, 디자인 시스템(DESIGN.md), 레퍼런스 이미지나 스타일 이름("swiss 스타일로", "영수증 스타일로")으로 화면 만들기, "AI 티 안 나게", "더 대담하게/조용하게", 접근성·반응형·성능 점검, UX 문구 다듬기에 씁니다. Use to design, redesign, critique, audit, polish, harden or animate a web frontend. 디자인과 무관한 백엔드·데이터 작업에는 쓰지 않습니다.
---

# WebD

"모델이 아무 결정도 안 했을 때 나오는 화면"을 피하고, 이 프로젝트를 위해 내린 결정이 보이는 웹 UI를 만듭니다. 결과는 디자인 디렉터의 수준을 목표로 합니다: 출시 가능한 코드, 분명한 관점, 사용자와 제품에 대한 이해, 꼼꼼한 마감.

이 문서는 길잡이입니다. 지침은 `reference/`에 나눠 두었고 **요청에 필요한 파일만, 그 단계 직전에 읽습니다.** `<스킬 폴더>`는 이 스킬을 불러올 때 표시되는 base directory입니다.

## 우선순위

결정이 부딪히면 위가 이깁니다.

1. **접근성 하한선**: 대비, 키보드 포커스, reduced-motion, 확대 허용. 어떤 지정도 넘지 못합니다.
2. **사용자가 고정(pin)한 것**: 직접 말한 서체·색·스타일 이름·레퍼런스·시대·재질. 금지 목록에 있는 항목이라도 사용자가 원하면 따릅니다. 분명한 브리프를 내 취향으로 돌리는 것은 실패입니다.
3. **선택한 스타일 사양**(`styles/`) 또는 잠근 `DESIGN.md`
4. **AI 티 목록**(`reference/ai-tells.md`): 사용자가 비워 둔 축에서만
5. **업종·관례 기본값**: 마지막 수단. 쓸 때는 쓴다고 밝힘

## 명령

사용자가 명령 이름을 쓰거나("webd critique", "/webd polish") 그 뜻이 분명하면 해당 문서를 읽고 따릅니다. 두 명령이 다 맞으면 한 번 묻습니다.

| 명령 | 하는 일 | 문서 |
|---|---|---|
| (새 작업) | 새 화면·새 세계: 맥락 → 방향 → 구현 → 검증 | 아래 「새 작업 흐름」 |
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
맥락 → 방향 → 구현(2단계) → 검증
```

| 단계 | 할 일 | 읽을 파일 |
|---|---|---|
| 맥락 | 대상·목표·화면 모드·화면 구조, `PRODUCT.md` | `reference/context.md`, `reference/modes.md`, `reference/structure.md` (흐릿하면 `ops/shape.md`) |
| 방향 | 스타일·레퍼런스 이미지·레퍼런스 충돌·기존 화면 중 하나로 4축 + 시그니처, `DESIGN.md` 잠금 | `reference/direction.md`, 필요하면 `styles/INDEX.md` |
| 구현 | 1차 구조·콘텐츠 → 2차 글자·색·간격 | `reference/build.md`, **UI 코드를 고치기 직전에** `reference/craft-floor.md`와 `reference/visual-quality.md` |
| 검증 | 자동 검사 → 렌더 → 다른 눈의 비평 → 수정 스펙 | `reference/verify.md`, `reference/ai-tells.md`, `reference/visual-quality.md` |

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

- **새 화면·새 프로젝트**: 새 작업 흐름. `PRODUCT.md`가 있으면 읽고 맥락 단계를 건너뜀.
- **도구 화면**(편집기, 조합기, 생성기, 관리 화면, 설정 등 사용자가 무언가를 만들거나 고치는 화면): `structure.md`로 구조를 먼저 정하고, 홈페이지식 구성으로 끌려가지 않았는지 「페이지형 쏠림 점검」으로 확인.
- **스타일 이름 지정**("bento 스타일로", "영수증 스타일로"): `styles/INDEX.md`에서 파일 하나만 찾아 읽음. 없으면 가까운 스타일 2–3개 제안.
- **레퍼런스 이미지·스크린샷**: 글로 다시 설명하지 말고 `direction.md` 경로 B.
- **기존 화면 다듬기**: 기존 정체성(색·서체·카피·동작)과 범위 밖을 유지. 사실 카피를 바꾸거나 주장을 더하기 전에 물음. `DESIGN.md`가 없으면 현재 코드에서 토큰을 읽어 기준으로.
- **기존 화면 갈아엎기**: 제품의 진실·콘텐츠·기능·제약은 유지하고 겉모습을 새로 정함. 방향 단계부터. `DESIGN.md`가 없다는 것만으로 백지가 아님.
- **리뷰만**: `critique`(디자인) 또는 `audit`(구현). 고치라는 요청이 없으면 코드를 바꾸지 않음.
- **조각 저장·재사용**: `webd-library` 스킬. 가져올 때는 지금 프로젝트의 `DESIGN.md` 토큰으로 바꿔 넣음.

## 도구

모두 의존성 없는 Node 스크립트입니다.

| 스크립트 | 하는 일 |
|---|---|
| `scripts/detect.mjs <경로> [--allow 규칙]` | 소스의 AI 티·접근성 정적 검사 (35규칙) |
| `scripts/render-check.mjs <파일·URL> [--widths] [--scheme] [--out]` | 실제 렌더 검사: 글자 뒤 실제 대비, 작은 글자, 한글 대체, 가로 넘침, 앱 틀 세로 넘침, 포커스 표시, 터치 대상, 나가기 경고 감지, 스크린샷. 설치된 Chrome·Edge 사용 |
| `scripts/check-style.mjs <styles 폴더>` | 스타일 사양의 색 대비 계산 |
| `scripts/palette.mjs --seed <색상\|#hex>` | OKLCH 12단계 라이트·다크 팔레트, 대비 자동 보정, 기능 색 |
| `scripts/image-tokens.mjs <이미지> [--crop] [--at x,y]` | 레퍼런스 이미지의 색을 실제 픽셀로 측정: 면적 순 색, 바탕·면·글자·포인트 후보, 대비 (경로 B) |
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
- 다시 쓸 만한 조각이 있으면 라이브러리 저장을 한 줄로 제안(저장은 사용자가 원할 때만)
