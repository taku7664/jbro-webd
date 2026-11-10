# 참고 자료와 차용 범위

WebD는 아래 자료의 **구조와 판단 기준**을 참고해 우리 말로 새로 썼습니다. 문장을 그대로 옮기지 않았습니다. 확인 시점과 커밋은 표에 적었습니다.

## 자료별로 가져온 것

| 자료 (커밋) | 라이선스 | 가져온 것 | WebD 위치 |
|---|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) (613fbf8) / [impeccable.style](https://impeccable.style/) | Apache-2.0 | 화면 모드 4개와 모드별 허용 범위, Operate에서 세계가 빌려주는 것은 서체·팔레트·밀도·시그니처 하나뿐이라는 규칙(mode-operate), 품질 하한선과 브라우저 표면, AI 기본값 군집과 따뜻한 주제에서 자주 나오는 모델 기본값(new-work 「Calibration」), 색 전략 4가지와 쓰는 장면으로 밝기 정하기, 작업 명령 체계(critique·audit·polish 등), 사용자 검토 전에 명백한 결함을 거르는 자동 비평, PRODUCT.md·DESIGN.md 분리 | `reference/modes.md`, `visual-quality.md`, `craft-floor.md`, `ai-tells.md`, `ops/`, `verify.md` |
| [design-for-ai](https://github.com/ryanthedev/design-for-ai) (37d7ae6) | README에 MIT, LICENSE 파일 없음 | 위계는 여백 → 굵기 → 크기 → 색 → 장식 순으로 한 요인씩(7장), 표 테두리의 1+1=3(7장), 지배 요소와 방향(6장), 단순한 비율 체계(5장), 레퍼런스 충돌·4축·시그니처·pin(design-dna), 아키타입·미학 계열, 딜러·OKLCH 팔레트·정적 검출기의 아이디어, 화면 종류별 밀도·터치 기준(surfaces) | `reference/visual-quality.md`, `direction.md`, `archetypes.md`, `scripts/dealer.mjs`, `palette.mjs`, `detect.mjs` |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (4f2dbb6) | MIT | 접근성 우선순위, 배포 전 점검표, 검사 폭(375/768/1024/1440), 4/8 간격 리듬, 라이트·다크 대비 규칙(pro-rules) | `reference/craft-floor.md`, `verify.md`, `visual-quality.md` 6절 |
| [claude-design-styles](https://github.com/chrismccoy/claude-design-styles) (04db634) | LICENSE 파일 없음 | "스타일당 파일 하나 + 짧은 목록, 이름으로 찾기" 형식 | `styles/INDEX.md`, `styles/_template.md` |
| [Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 저장소 LICENSE 참조 | 주제 세계에서 출발, 계획 → 브리프 대조 → 구현, AI 기본값 군집과 템플릿 장식 목록, 과감함은 한 곳에, 장신구 하나 빼기 | `reference/context.md`, `build.md`, `ai-tells.md`, `visual-quality.md` 8절 |
| [Reddit r/ClaudeCode: How Do You Create UI Designs That Don't Look AI-Generated?](https://www.reddit.com/r/ClaudeCode/s/10ONaqkJes) | — | 이미지를 글로 옮기지 않기, 첫 결과는 스케치, 2차 패스, 좋은 화면에서 시스템 뽑기, 비평을 스펙으로 | `reference/direction.md` 경로 B·D, `build.md`, `verify.md` |

## 가져오지 않은 것

- **claude-design-styles 스타일 원문 53개**: 라이선스가 없어 형식만 참고했습니다. `styles/`의 20개는 직접 썼습니다.
- **ui-ux-pro-max 데이터**(스타일·폰트 짝·업종 추론 CSV): 업종 평균으로 수렴하는 성향 때문에 넣지 않았습니다. `industries.md`는 "지킬 것과 흔한 기본값"만 적은 별도 표입니다.
- **Impeccable의 도구 체계**(concept-seed, 결정 페이지, 이미지 생성 comp, build-phase 게이트, comp-diff): 개념(배정된 방향, 마감 리뷰)만 가져오고 도구는 옮기지 않았습니다.
- **코드**: 검출기·딜러·팔레트·렌더 검사는 아이디어만 참고해 새로 작성했습니다.

## 읽은 범위 (정직하게)

- 1차 작성(2026-11-09 오전)에는 각 저장소의 목차·분량과 일부 문서만 읽고 구조를 다시 썼습니다. 그 결과 과정·금지 규칙은 갖췄지만 "보기 좋게 만드는 기준"이 비어, 시험 화면이 검사는 통과하고 보기에는 구렸습니다.
- 2차 보강(같은 날 오후)에 미감 관련 원문을 다시 읽었습니다: Impeccable `mode-operate`, `operate`, `craft-floor`, `new-work`, `layout`, `typeset`; design-for-ai 5·6·7장과 `surfaces`, `techniques` 목차; frontend-design 전문; ui-ux-pro-max `pro-rules`; Impeccable `colorize`, `polish`, `quieter`. 그 내용이 `visual-quality.md`와 `modes.md` Operate 절에 들어갔습니다.
- 아직 전문을 읽지 않은 것: Impeccable `critique.md`(854줄) 등 명령 문서 다수, design-for-ai 1–4·8·9장 전문과 `checklists.md`, claude-design-styles 스펙 대부분.
