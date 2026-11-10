# Ledger

회계 장부의 언어. 가는 괘선, 오른쪽 정렬 숫자, 차변·대변처럼 나란한 두 칸, 붉은 잉크의 음수. 가계부, 회계·정산, 재고, 예산, 구독 관리처럼 **숫자를 한 줄씩 대조하는 Operate 화면**에 어울립니다.

잘 맞는 모드: Operate
맞지 않는 경우: 감성 랜딩, 사진 중심 화면

## 타입

- 본문: 담백한 고딕(IBM Plex Sans KR, Pretendard) 15px
- 숫자: 표 숫자가 좋은 서체. `font-variant-numeric: tabular-nums slashed-zero`. 라틴 고정폭(IBM Plex Mono)을 숫자에만 쓰고 한글은 고딕으로 대체 지정
- 제목: 같은 고딕 600, 작게. 장부는 숫자가 주인공
- 스케일 1.2

## 색

```
역할       값        쓰는 곳
page       #FAF9F4   장부 종이
ink        #1E2321   글자
rule       #C9D3CF   가는 괘선
rule-strong #7A8783  합계 위 굵은 선
red-ink    #B3261E   음수·연체
green-ink  #2F6B3E   양수·완료
muted      #56605C   날짜·메모
```

```contrast
ink        page   4.5
muted      page   4.5
red-ink    page   4.5
green-ink  page   4.5
rule-strong page  3.0
```

## 구성

- 표가 기본 레이아웃. 날짜 | 항목 | 분류 | 금액 | 잔액
- 괘선은 1px `--rule`, 합계 위에만 2px `--rule-strong` 두 줄(이중선)
- 금액 열은 오른쪽 정렬, 소수점·천 단위 위치 고정
- 왼쪽 여백에 세로 붉은 선 하나(장부 여백선) 선택

## 컴포넌트

```css
.ledger { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums slashed-zero; }
.ledger td, .ledger th { padding: 8px 12px; border-bottom: 1px solid var(--rule); text-align: left; }
.ledger .amount { text-align: right; font-family: "IBM Plex Mono", "IBM Plex Sans KR", monospace; }
.ledger .neg { color: var(--red-ink); }
.ledger tfoot td { border-top: 3px double var(--rule-strong); font-weight: 600; }
```

음수는 색만이 아니라 `-` 기호나 괄호 `(12,000)`도 함께.

## 모션

- 값이 바뀐 행만 배경을 잠깐 표시(600ms). 그 외 없음

## 시그니처

- 합계 위 이중선
- 숫자 열이 화면 전체에서 같은 오른쪽 정렬선에 맞음

## 하지 않는 것

- 숫자 카드 그리드(히어로 지표)
- 빨강·초록만으로 손익 표시
- 비례 숫자

## 접근성 주의

- 표에 `<caption>`, 머리 셀 `scope`
- 음수를 화면 낭독기가 "마이너스"로 읽게(기호 포함)
