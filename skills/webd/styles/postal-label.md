# Postal Label

우편·소포 송장의 언어. 크라프트 상자 위의 흰 라벨, 굵은 수신·발신 칸, 우편번호, 바코드 띠, "취급 주의" 도장. 배송 추적, 물류, 이커머스 주문 상태, 중고 거래, 선물 보내기처럼 **물건이 어디쯤 오고 있는지를 보여 주는 화면**에 어울립니다.

잘 맞는 모드: Operate, Persuade
맞지 않는 경우: 긴 읽을거리, 럭셔리

## 타입

- 고딕 굵게(Pretendard 700, SUIT 800)로 칸 제목, 본문 400
- 송장 번호·우편번호: 라틴 고정폭 + 한글 대체, 크게, `tabular-nums`
- 스케일 1.25

## 색

```
역할       값        쓰는 곳
kraft      #C9A97C   상자 바탕
label      #FFFDF8   라벨 종이
ink        #1D1B19   글자
muted      #5A554F   보조
stamp      #B8321F   도장 (주의·지연)
on-stamp   #FFFDF8
route      #22577A   진행 경로·현재 단계
```

```contrast
ink       label   4.5
muted     label   4.5
stamp     label   4.5
route     label   4.5
on-stamp  stamp   4.5
ink       kraft   4.5
```

## 구성

- 크라프트 바탕 위 흰 라벨 한 장이 주 내용 영역
- 라벨 안: 발신 | 수신 칸, 그 아래 송장 번호, 맨 아래 진행 단계(접수 → 집하 → 이동 → 배송 중 → 완료)
- 진행 단계는 가로 줄(넓은 화면) / 세로 목록(좁은 화면), 현재 단계는 route 색 + 글자 "현재"
- 반경 2px, 라벨에 아주 얕은 그림자

## 컴포넌트

```css
.label { background: var(--label); color: var(--ink); border-radius: 2px; box-shadow: 0 6px 16px -10px rgba(60,40,20,.5); padding: 24px; }
.label__grid { display: grid; grid-template-columns: 1fr 1fr; border: 2px solid var(--ink); }
.label__grid > * { padding: 12px; border-right: 2px solid var(--ink); }
.tracking-no { font: 700 22px/1 "IBM Plex Mono", "Pretendard", monospace; letter-spacing: .04em; font-variant-numeric: tabular-nums; }
.step[aria-current="step"] { color: var(--route); font-weight: 700; }
.stamp { color: var(--stamp); border: 2px solid currentColor; padding: 2px 8px; transform: rotate(-5deg); display: inline-block; font-weight: 800; }
```

## 모션

- 현재 단계 표시가 이전 단계에서 한 칸 이동하는 전환 하나(300ms)

## 시그니처

- 굵은 2px 칸으로 나뉜 송장 라벨
- 지연·주의 상황에만 찍히는 도장

## 하지 않는 것

- 크라프트 질감 사진을 크게 깔아 글자 대비를 떨어뜨림
- 가짜 바코드 장식
- 도장 남발

## 접근성 주의

- 진행 단계는 순서 목록 + `aria-current="step"`
- 송장 번호 복사 버튼, 화면 낭독기가 숫자를 끊어 읽도록 묶음 공백
