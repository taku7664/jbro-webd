# Receipt

감열지 영수증의 언어로 화면을 짭니다. 좁은 한 줄 기둥, 점선 구분, 오른쪽 정렬 숫자, 마지막 합계 한 줄이 주인공입니다. 주문 요약, 가격 비교, 결제 확인, 변경 내역처럼 **항목과 숫자가 차례로 쌓이는 화면**에 어울립니다.

잘 맞는 모드: Operate, Read
맞지 않는 경우: 사진·영상이 중심인 화면, 넓은 마케팅 히어로

## 타입

- 디스플레이·본문 모두 고정폭: Nanum Gothic Coding (한글 포함, Google Fonts)
- 라틴 숫자를 더 또렷하게 하려면 숫자만 IBM Plex Mono, 한글은 Nanum Gothic Coding으로 폰트 스택 구성
- 스케일: 1.2 (14 / 16 / 19 / 23 / 28). 영수증답게 크기 차이는 작게, 위계는 굵기와 여백으로
- 모노스페이스는 여기서 장식이 아니라 매체 자체입니다(영수증 인쇄). 다른 스타일과 섞을 때는 숫자에만 남깁니다.

## 색

```
역할       값        쓰는 곳
bg         #DEDCD5   종이 바깥(책상)
paper      #F4F3EF   영수증 종이
ink        #232220   본문 인쇄
faded      #5E5B55   흐려진 인쇄, 보조 정보
stamp      #A3241B   합계·취소·중요 표시 도장 (한 화면에 1–2곳)
rule       #8E8B83   점선 구분선
```

```contrast
ink    paper  4.5
faded  paper  4.5
stamp  paper  4.5
ink    bg     4.5
paper  stamp  4.5
```

## 구성

- 그리드: 가운데 좁은 기둥 하나(최대 420–520px). 넓은 화면에서는 기둥을 왼쪽 1/3에 두고 오른쪽에 설명을 둘 수 있음
- 반경: 0. 종이 아래 끝만 톱니 모양(`clip-path` 지그재그)
- 테두리·그림자: 테두리 없음. 구분은 `1px dashed var(--rule)`. 종이에 아주 얕은 그림자 하나만 허용(오프셋 있는 부드러운 그림자, 색은 bg 계열). `clip-path`를 쓴 요소의 `box-shadow`는 잘려서 안 보이므로, 그림자는 바깥 래퍼에 `filter: drop-shadow()`로 줍니다.
- 밀도: 촘촘. 행 간격 6–8px, 묶음 사이는 점선 + 16px

## 컴포넌트

```css
.receipt-wrap { filter: drop-shadow(0 8px 14px rgba(60, 52, 40, .28)); }
.receipt { background: var(--paper); width: min(100%, 480px); padding: 28px 24px 36px;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), 95% 100%, 90% calc(100% - 8px), 85% 100%, 80% calc(100% - 8px),
    75% 100%, 70% calc(100% - 8px), 65% 100%, 60% calc(100% - 8px), 55% 100%, 50% calc(100% - 8px), 45% 100%,
    40% calc(100% - 8px), 35% 100%, 30% calc(100% - 8px), 25% 100%, 20% calc(100% - 8px), 15% 100%, 10% calc(100% - 8px), 5% 100%, 0 calc(100% - 8px)); }
.line { display: flex; justify-content: space-between; gap: 16px; font-variant-numeric: tabular-nums; }
.line .amount { text-align: right; white-space: nowrap; }
.sep { border: 0; border-top: 1px dashed var(--rule); margin: 16px 0; }
.total { font-weight: 700; font-size: 19px; }
.stamp { color: var(--stamp); border: 2px solid currentColor; padding: 2px 8px; display: inline-block; transform: rotate(-4deg); }
.btn { background: var(--ink); color: var(--paper); border: 0; border-radius: 0; padding: 12px 20px; font: inherit; font-weight: 700; width: 100%; }
.btn:hover { background: var(--stamp); }
```

카드 대신 영수증 한 장. 여러 항목을 비교할 때는 영수증을 나란히 두지 말고 한 장 안에서 줄로 비교합니다.

## 모션

- 진입 때 영수증이 위에서 한 번 출력되듯 내려옴: `translateY(-24px)` → 0, 400–600ms, ease-out. **내용은 처음부터 보이는 상태로.** `clip-path: inset(0 0 100% 0)`처럼 다 가린 채 시작하면 애니메이션이 늦거나 멈출 때(뒤쪽 탭, 느린 기기, 캡처 도구) 영수증이 통째로 안 보입니다. 시험 렌더에서 실제로 그랬습니다.
- 그 외 없음
- 숫자가 바뀔 때 깜빡이는 효과 없음

## 시그니처

- 아래 끝의 톱니 모양
- 합계 줄 옆의 기울어진 도장 하나

## 하지 않는 것

- 영수증을 여러 장 카드처럼 그리드에 늘어놓기
- 도장 색을 여러 곳에 뿌리기
- 바코드·QR을 장식으로 넣기 (실제 기능이 있을 때만)

## 접근성 주의

- `faded`는 보조 정보 전용. 가격·수량 같은 필수 정보에 쓰지 않습니다.
- 도장 회전은 짧은 글자에만. 긴 문장을 기울이지 않습니다.
- 표 형태 정보는 `<dl>`이나 `<table>`로 구조를 갖춰, 화면 낭독기가 항목과 금액을 짝지어 읽게 합니다.
