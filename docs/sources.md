# 참고 자료와 차용 범위

WebD는 아래 자료의 **구조와 아이디어**를 참고해 새로 썼습니다. 문장을 그대로 옮기지 않았습니다. 확인 시점: 2026-11-09.

| 자료 | 라이선스 | 참고한 것 | WebD 위치 |
|---|---|---|---|
| [Impeccable](https://github.com/pbakaus/impeccable) / [impeccable.style](https://impeccable.style/) | Apache-2.0 | 화면 모드 4개, 수정 직전에만 읽는 품질 하한선, 브리프 우선 원칙, AI 티 카탈로그, 결정적 검출기 개념, PRODUCT.md·DESIGN.md 분리 | `reference/modes.md`, `craft-floor.md`, `ai-tells.md`, `verify.md` |
| [design-for-ai](https://github.com/ryanthedev/design-for-ai) | README에 MIT 표기, LICENSE 파일 없음 | 레퍼런스 2개 충돌, 4축 + 시그니처, 사용자 고정(pin) 축, 후보 비교 후 수렴, DESIGN.md 잠금 게이트 | `reference/direction.md` 경로 C |
| [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT | 접근성 우선 순위표, 배포 전 체크리스트(해상도 375/768/1024/1440), 쿼리 규약 | `reference/craft-floor.md`, `verify.md` |
| [claude-design-styles](https://github.com/chrismccoy/claude-design-styles) | LICENSE 파일 없음 | 짧은 목록 + 스타일당 파일 하나, 이름으로 파일을 찾는 규칙 | `styles/INDEX.md`, `styles/_template.md` |
| [Anthropic frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 저장소 LICENSE 참조 | 주제 세계에서 출발, 계획 → 브리프 대조 → 구현 2단계, AI 기본값 군집 목록, 과감함은 한 곳에 | `reference/context.md`, `build.md`, `ai-tells.md` |
| [Reddit r/ClaudeCode: How Do You Create UI Designs That Don't Look AI-Generated?](https://www.reddit.com/r/ClaudeCode/s/10ONaqkJes) | — | 이미지를 글로 옮기지 않기, 첫 결과는 스케치, 타입·색·간격 2차 패스, 구체적 금지 조건, 좋은 화면에서 시스템 추출, 비평을 서브에이전트용 스펙으로 | `reference/direction.md` 경로 B·D, `build.md`, `verify.md` |

## 차용하지 않은 것

- 스타일 사양 원문(claude-design-styles `spec/*.md`): 라이선스가 없어 형식만 참고했습니다. `styles/`의 스타일은 직접 씁니다.
- 업종별 추천 데이터(ui-ux-pro-max `data/*.csv`): 업종 평균으로 수렴하는 성향과 AI 티 목록과의 충돌 때문에 초안에서는 넣지 않았습니다.
- 검출기 코드(Impeccable, design-for-ai `detect.mjs`): WebD 전용 검출기는 아직 없습니다.
