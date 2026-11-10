# Cinema Dark

영화 타이틀 시퀀스의 언어. 색조 있는 깊은 어둠, 한 방향에서 들어오는 빛 하나, 화면을 가득 채우는 거대한 제목, 어둠에서 드러나는 장면들. 영화·공연·게임 트레일러, 사진가 포트폴리오, 한정 출시 캠페인에 어울립니다.

잘 맞는 모드: Experience, Persuade
맞지 않는 경우: 정보가 많은 업무 화면, 긴 글

## 타입

- 디스플레이: 아주 크고 좁은 그로테스크 또는 고대비 세리프(라틴), 한글은 굵은 고딕(Black Han Sans, Pretendard 900) 또는 명조 굵게
- 본문: 절제된 고딕 400, 17px, 행간 1.7 (어두운 바탕이라 일반보다 약간 넓게)
- 제목과 본문 크기 차이 3배 이상

## 색

```
역할      값        쓰는 곳
night     #0F1416   바탕 (순수 검정 아님, 짙은 청록 기운)
surface   #182023   올라온 면
text      #E9ECEA   본문 (순수 흰색 아님)
dim       #A2ABA8   보조
light     #F2C46D   빛: 포인트 하나 (주 행동, 강조 한 곳)
on-light  #1A1408
```

```contrast
text      night     4.5
dim       night     4.5
text      surface   4.5
light     night     4.5
on-light  light     4.5
```

빛 색은 주제에서 고릅니다. 시안·보라 네온은 피합니다.

## 구성

- 전체 폭 섹션의 연속, 섹션마다 장면 하나
- 큰 크기 차이(3배 이상), 넓은 세로 여백
- 빛은 한 방향: 한쪽 위에서 들어오는 방사형 그라디언트 **한 곳**에만(섹션마다 반복하지 않음)
- 사진·영상 위 글자는 대비 계산(`render-check`가 이미지 위는 판정 못 하므로 직접)

## 컴포넌트

```css
body { background: var(--night); color: var(--text); line-height: 1.7; }
.scene { min-height: 100dvh; display: grid; align-content: end; padding: 10vh 6vw; }
.scene--lit { background: radial-gradient(120% 80% at 20% 0%, rgba(242,196,109,.16), transparent 60%), var(--night); }
.title { font-size: clamp(56px, 12vw, 180px); line-height: .95; letter-spacing: -0.02em; }
.btn { background: var(--light); color: var(--on-light); border: 0; padding: 16px 28px; font-weight: 700; }
```

## 모션

- 이 스타일의 연출 하나: 첫 장면 제목이 어둠에서 드러남(600ms, 위치 이동 없이 밝기). 내용은 처음부터 보이는 상태에서 시작해 흐림→선명
- 스크롤 연동은 장면 전환에만, reduced-motion에서 끔

## 시그니처

- 한 방향에서 들어오는 빛 하나
- 화면 폭을 채우는 제목

## 하지 않는 것

- 섹션마다 글로우, 네온 테두리
- 순수 검정 바탕 + 순수 흰 글자
- 모든 섹션에 같은 페이드 등장

## 접근성 주의

- 어두운 바탕 긴 글은 피하고, 필요하면 행간을 넓히고 굵기를 한 단계 가볍게
- 자동 재생 영상은 음소거 + 멈춤 버튼
