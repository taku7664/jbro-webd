# Riso Print

리소그래프(공판 인쇄)의 언어입니다. 별색 잉크 두 가지가 겹치는 곳에서 세 번째 색이 생기고, 판이 살짝 어긋나고, 거친 입자가 남습니다. 공연·전시 포스터, 독립 출판, 행사 안내, 작은 브랜드의 캠페인처럼 **손으로 찍은 인쇄물 같은 온기가 필요한 Persuade·Experience 화면**에 어울립니다.

잘 맞는 모드: Persuade, Experience
맞지 않는 경우: Operate 화면, 정밀한 데이터 표

## 타입

- 디스플레이: Black Han Sans 또는 Do Hyeon (한글 포함, 굵고 단단함). 아주 크게, 잉크 색으로
- 본문: Pretendard 400/600, 17px
- 스케일: 1.5 (16 / 24 / 36 / 54 / 81). 디스플레이는 `clamp(48px, 10vw, 120px)`

## 색

```
역할        값        쓰는 곳
paper       #ECEEE9   인쇄 용지 (차가운 미색)
blue        #2D4FA0   별색 1: 본문, 큰 형태
pink        #E8467C   별색 2: 큰 형태, 겹침
overlap     #6B2F7A   두 잉크가 겹친 곳 (multiply 결과의 근사값, 직접 쓰지 않음)
text        #1E2A47   본문 (청색 잉크를 진하게)
```

```contrast
text   paper  4.5
blue   paper  4.5
paper  blue   4.5
pink   paper  3.0
```

pink는 큰 글자(24px 이상)·도형에만 씁니다. 본문 글자색으로 쓰지 않습니다.

**글자와 잉크 도형이 겹칠 때** (위 표는 종이 바탕만 계산합니다. 시험 렌더 375px에서 파란 원이 본문 뒤로 들어가 읽을 수 없었습니다.)

```contrast
text   pink   3.0
```

- 본문·버튼·작은 글자 뒤에는 도형을 두지 않습니다. 남색 본문이 파란 잉크 위에 오면 대비 1.85입니다.
- 파란 도형은 어떤 글자 뒤에도 두지 않습니다. 파란 제목이 파란 원과 겹치면 2.07입니다.
- 큰 제목이 분홍 도형과 겹치는 것만 허용합니다. 파란 제목이 분홍 위에서 multiply로 겹치면 약 4.24입니다.
- 좁은 화면에서는 도형을 줄이고 위치를 다시 잡아 본문 블록이 시작하기 전에 끝나게 합니다. 렌더 후 본문 블록과 도형의 사각형이 겹치는지 계산합니다.

## 구성

- 그리드: 포스터처럼 큰 덩어리 2–3개. 비대칭 허용
- 겹침: 잉크 레이어를 `mix-blend-mode: multiply`로 겹쳐 세 번째 색을 만듦
- 판 어긋남: 같은 형태를 두 잉크로 그리고 한쪽을 2–4px 어긋나게
- 입자: SVG `feTurbulence` 노이즈를 아주 옅게(불투명도 .08–.12) 전체에 한 장
- 반경: 0 또는 완전한 원. 중간 반경 없음
- 테두리·그림자: 없음

## 컴포넌트

```css
.ink-blue { color: var(--blue); mix-blend-mode: multiply; }
.ink-pink { color: var(--pink); mix-blend-mode: multiply; }
.misreg { position: relative; }
.misreg::after { content: attr(data-text); position: absolute; inset: 0; color: var(--pink);
  mix-blend-mode: multiply; transform: translate(3px, -2px); pointer-events: none; }
.grain { position: fixed; inset: 0; pointer-events: none; opacity: .1;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.btn { background: var(--blue); color: var(--paper); border: 0; border-radius: 0; padding: 14px 28px; font-weight: 600; }
.btn:hover { background: var(--text); }
```

`data-text` 어긋남은 장식이므로 원문은 실제 글자로 두고 `::after`는 화면 낭독에서 읽히지 않습니다(가상 요소 content는 낭독기에 따라 읽힐 수 있으니 짧은 제목에만).

## 모션

- 처음 진입 때 두 잉크 레이어가 4px 어긋난 상태에서 제자리로 한 번 맞춰짐(300ms). 그 외 없음

## 시그니처

- 두 잉크가 겹친 자리의 보라색 (직접 칠하지 않고 multiply로 생김)
- 제목 하나에만 판 어긋남

## 하지 않는 것

- 별색을 셋 이상 쓰기
- 그라디언트 (리소는 망점·겹침으로 농도를 표현)
- 모든 글자에 어긋남 효과

## 접근성 주의

- pink는 본문 대비 기준(4.5)을 넘지 못합니다. 큰 글자·도형 전용.
- 입자 레이어는 글자 대비를 떨어뜨리므로 불투명도 .12를 넘기지 않습니다.
- `prefers-reduced-motion`에서는 어긋남 애니메이션 없이 최종 상태로.
