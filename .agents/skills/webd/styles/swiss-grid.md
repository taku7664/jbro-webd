# Swiss Grid

국제주의 타이포그래피 양식. 보이는 그리드, 왼쪽 정렬, 크기와 위치만으로 만든 위계. 장식이 없어서 결정 하나하나가 그대로 드러납니다. 정보가 많은 제품 소개, 기관·문화 행사, 연차 보고서, 디자인 스튜디오에 어울립니다.

잘 맞는 모드: Persuade, Read, Operate
맞지 않는 경우: 따뜻함·친근함이 핵심인 소비자 서비스

## 타입

- 그로테스크 한 패밀리만. 라틴: Archivo, Instrument Sans, Inter Tight 등에서 성격 있는 것. 한글: Pretendard, SUIT
- 제목 굵기 700, 자간 -0.02em. 본문 400
- 스케일 1.414 (14 / 20 / 28 / 40 / 56 / 80). 큰 제목은 화면 폭에 맞춰 크게
- 대문자 라벨은 쓰지 않거나 한 종류만

## 색

```
역할      값        쓰는 곳
paper     #F5F5F2   바탕
ink       #111111   글자, 그리드 선
muted     #5C5C58   보조 글자
signal    #D7261E   포인트 하나: 주 행동, 현재 위치, 핵심 숫자 하나
on-signal #FFFFFF   signal 위 글자
```

```contrast
ink        paper    4.5
muted      paper    4.5
signal     paper    3.0
on-signal  signal   4.5
```

signal은 큰 글자·면·선 전용(3.0). 작은 본문 글자색으로 쓰지 않습니다.

## 구성

- 12칼럼, 칼럼 사이 24px. 요소가 정렬선에 정확히 붙음
- 반경 0, 그림자 0. 구분은 1px 선 또는 여백
- 비대칭: 제목은 넓은 칸, 본문은 좁은 칸에 왼쪽 정렬
- 숫자·날짜·분류를 칼럼 머리에 두는 표 같은 배치

## 컴포넌트

```css
.grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; }
.rule { border-top: 1px solid var(--ink); padding-top: 12px; }
.btn { background: var(--signal); color: var(--on-signal); border: 0; border-radius: 0; padding: 14px 24px; font-weight: 700; }
.btn--plain { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
.index { font-variant-numeric: tabular-nums; color: var(--muted); }
```

## 모션

- 거의 없음. 상태 변화 100–150ms, 선형에 가까운 감속

## 시그니처

- 화면 전체를 가로지르는 1px 그리드 선이 실제로 보임
- signal 색이 화면에 단 한두 곳

## 하지 않는 것

- 가운데 정렬
- 둥근 모서리, 그림자, 그라디언트
- signal 색을 장식에

## 접근성 주의

- signal(#D7261E)은 큰 글자·면 전용. 버튼 글자는 흰색으로.
- 선만으로 구분한 표에 제목 셀(`th`)을 반드시.
