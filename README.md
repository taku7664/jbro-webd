# jbro-webd

AI 티 나지 않는 웹 UI를 설계·구현·검증하는 Claude Code 스킬 **WebD**를 담은 플러그인입니다.

> 상태: 초안(0.0.1). 실제 프로젝트에서 써 보며 다듬는 중입니다.

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
  SKILL.md             길잡이: 우선순위, 흐름, 요청별 진입점
  reference/
    context.md         맥락 잡기, PRODUCT.md 작성
    modes.md           화면 모드 4개
    direction.md       방향 정하기 경로 A–D, DESIGN.md 잠금
    build.md           2단계 구현
    craft-floor.md     품질 하한선 (UI 수정 직전에만 읽음)
    ai-tells.md        AI 티 목록
    verify.md          검증과 수정 스펙
  styles/
    INDEX.md           스타일 목록
    _template.md       새 스타일 양식
    transit-map.md     예시 스타일
  templates/
    PRODUCT.md
    DESIGN.md
docs/
  sources.md           참고 자료와 차용 범위
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
지금 대시보드 webd 기준으로 리뷰만 해 줘.
```

## 아직 없는 것

- WebD 전용 결정적 검출기 (`scripts/`)
- 스타일 추가 (현재 예시 1개)
- 실제 프로젝트에서의 검증 결과

## 참고

[docs/sources.md](docs/sources.md)
