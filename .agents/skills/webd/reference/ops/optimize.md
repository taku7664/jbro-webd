# optimize — 로딩·렌더 성능

느린 화면은 디자인이 아무리 좋아도 나쁜 화면입니다. 추측하지 말고 **재고, 고치고, 다시 잽니다.**

## 목표 (Core Web Vitals, 75번째 백분위 기준)

| 지표 | 좋음 | 뜻 |
|---|---|---|
| LCP | 2.5초 이하 | 가장 큰 내용(히어로 이미지·제목)이 보이기까지 |
| INP | 200ms 이하 | 입력에 화면이 반응하기까지 |
| CLS | 0.1 이하 | 로딩 중 레이아웃이 튀는 정도 |

## 재는 법

- 브라우저 개발자 도구 Lighthouse·Performance 패널, 느린 4G·중급 휴대폰 제한으로.
- 실제 사용자 데이터가 있으면(RUM) 그쪽이 우선.
- 고치기 전 수치를 적어 두고, 고친 뒤 같은 조건으로 다시 잽니다.

## 로딩

- **LCP 요소**를 찾습니다. 이미지면: 적절한 크기·형식(AVIF/WebP), `fetchpriority="high"`, 지연 로딩 금지. 글자면: 폰트 로딩이 막지 않게.
- 화면 아래 이미지·iframe은 `loading="lazy"`.
- 모든 이미지·영상에 `width`/`height` 또는 `aspect-ratio`(CLS).
- 폰트: 쓰는 굵기만, `font-display: swap`, 한글은 부분 집합(`hangul.md`). 첫 화면 제목 폰트만 preload.
- CSS: 첫 화면에 필요한 것 먼저. 쓰지 않는 CSS 제거.
- JS: 경로·기능 단위로 나눠 불러오기. 첫 화면에 필요 없는 스크립트는 `defer`·동적 import.
- 서드파티(분석, 채팅, 광고)는 `async`/`defer`, 정말 필요한지 점검. 성능 저하의 큰 원인입니다.

## 렌더

- 레이아웃 읽기와 쓰기를 섞지 않습니다(`offsetHeight` 읽고 style 쓰고를 반복 = 스래싱). 읽기를 모으고 쓰기를 모읍니다.
- 긴 목록(50개 이상)은 가상 스크롤. 화면 밖 섹션은 `content-visibility: auto` + `contain-intrinsic-size`.
- 큰 DOM(수천 노드)을 줄입니다.
- 프레임당 작업 16ms 이하. 무거운 계산은 Web Worker나 쪼개서(`scheduler.yield`, `requestIdleCallback`).

## 애니메이션

- transform·opacity 위주. 레이아웃 속성 애니메이션 금지(`motion.md`).
- blur·filter·그림자 애니메이션은 작은 영역만.
- `will-change`는 애니메이션 직전에 켜고 끝나면 끕니다.
- 스크롤 이벤트로 매 프레임 계산하지 않습니다. IntersectionObserver, `scroll-timeline`.

## 입력 반응 (INP)

- 클릭 핸들러에서 무거운 일을 바로 하지 말고 먼저 화면 피드백을 그린 뒤 처리.
- 검색 입력·리사이즈는 debounce·throttle.
- 리액트 등 프레임워크: 불필요한 재렌더 찾기(프로파일러), 큰 목록 항목 memo, 상태를 필요한 곳 가까이.

## 네트워크

- HTTP 캐시 헤더, 정적 자산 해시 이름.
- 압축(gzip/brotli).
- 같은 데이터를 여러 번 요청하지 않게 캐시.
- 느린 네트워크에서는 저해상도 이미지·애니메이션 축소를 검토.

## 보고

```
대상: …  조건: 느린 4G, 중급 모바일 에뮬레이션
        고치기 전 → 고친 뒤
LCP     4.1s   → 2.3s   (히어로 이미지 AVIF + fetchpriority)
CLS     0.21   → 0.02   (이미지 크기 지정, 폰트 size-adjust)
INP     310ms  → 140ms  (필터 계산 debounce)
```

측정하지 못한 지표는 추정치로 채우지 않고 미측정으로 적습니다.
