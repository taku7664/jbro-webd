# Ticket Stub

입장권·탑승권의 언어. 절취선, 둥글게 파인 홈, 큰 좌석·게이트 번호, 바코드 영역. 공연·전시·영화 예매, 행사 등록, 여행 일정, 체험 예약처럼 **"이것이 당신의 입장권"인 화면**에 어울립니다.

잘 맞는 모드: Persuade, Operate(예매 확인)
맞지 않는 경우: 긴 문서, 복잡한 대시보드

## 타입

- 정보 라벨: 작은 고딕 600 (Pretendard, SUIT)
- 큰 값(좌석, 게이트, 날짜): 좁은 굵은 디스플레이(Barlow Condensed 계열) + 한글 굵은 고딕
- 숫자 `tabular-nums`
- 스케일 1.333, 큰 값만 크게 튐

## 색

```
역할       값        쓰는 곳
backdrop   #2B2D42   티켓 뒤 배경
stub       #F6F1E7   티켓 종이
ink        #23202A   글자
muted      #5F5A66   라벨
accent     #B83A4C   행사 색 (띠, 주 행동)
on-accent  #FFFFFF
perf       #B9B1A2   절취선
```

```contrast
ink        stub      4.5
muted      stub      4.5
accent     stub      4.5
on-accent  accent    4.5
stub       backdrop  4.5
```

## 구성

- 티켓 한 장: 본권(왼쪽, 넓음) + 절취선 + 반권(오른쪽, 좁음)
- 절취선 양 끝에 반원 홈(바깥 배경색 원으로 뚫린 것처럼)
- 정보는 라벨 위·값 아래의 쌍으로 격자 배치
- 모바일: 본권 위·반권 아래로 세로 전환, 절취선도 가로로

## 컴포넌트

```css
.ticket { display: grid; grid-template-columns: 1fr auto 160px; background: var(--stub); color: var(--ink); border-radius: 12px; position: relative; }
.ticket__perf { width: 0; border-left: 2px dashed var(--perf); margin: 16px 0; }
.ticket::before, .ticket::after { content: ""; position: absolute; left: calc(100% - 160px - 13px); width: 26px; height: 26px; border-radius: 50%; background: var(--backdrop); }
.ticket::before { top: -13px; } .ticket::after { bottom: -13px; }
.field__label { font-size: 12px; font-weight: 600; color: var(--muted); }
.field__value { font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) { .ticket { grid-template-columns: 1fr; } .ticket__perf { border-left: 0; border-top: 2px dashed var(--perf); margin: 0 16px; } .ticket::before, .ticket::after { display: none; } }
```

## 모션

- 예매 완료 때 반권이 살짝 찢어지듯 떨어지는 연출 하나(완료 화면만). reduced-motion이면 정지 상태

## 시그니처

- 절취선과 반원 홈
- 화면에서 가장 큰 글자가 좌석·게이트 번호

## 하지 않는 것

- 장식용 가짜 바코드 (실제 입장 코드가 있을 때만)
- 티켓을 여러 장 카드 격자로
- 행사 색을 글자 본문에

## 접근성 주의

- 라벨·값 쌍을 `<dl>`로
- 입장 코드(QR)는 대체 텍스트로 코드 번호 제공
- 12px 라벨은 굵기 600 이상, 대비 확인
