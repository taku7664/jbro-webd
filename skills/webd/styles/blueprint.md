# Blueprint

설계 도면의 언어. 청사진 파랑 바탕에 흰 선, 치수선과 화살촉, 도면 번호가 적힌 표제란. 하드웨어·건축·공학 제품, 기술 문서의 개요, 제조 공정 소개처럼 **구조와 치수가 곧 이야기인 화면**에 어울립니다.

잘 맞는 모드: Persuade, Read
맞지 않는 경우: 긴 본문 읽기(어두운 바탕 장문), 감성 소비재

## 타입

- 제목·라벨: 좁은 기술 고딕(Barlow Semi Condensed 등) + 한글 고딕(SUIT, Pretendard)
- 본문: 같은 고딕 400, 16px
- 치수·도면 번호: 라틴 고정폭(IBM Plex Mono) + 한글 대체 지정
- 스케일 1.25

## 색

```
역할       값        쓰는 곳
blueprint  #123B6D   도면 바탕
line       #E8F0FA   선, 본문 글자
line-dim   #A9BEDA   보조 글자, 그리드
mark       #FFD25A   치수·강조 표시 (선·작은 면)
on-mark    #123B6D
paper      #F4F7FB   본문 영역 (라이트 섹션)
ink        #13263F   paper 위 글자
```

```contrast
line      blueprint   4.5
line-dim  blueprint   4.5
mark      blueprint   4.5
on-mark   mark        4.5
ink       paper       4.5
```

긴 본문은 `paper` 섹션에서 읽게 하고, 도면 바탕은 개요·도식에.

## 구성

- 20px 모눈 그리드 바탕(선 불투명도 낮게)
- 도식: SVG 선 2px, 치수선 + 화살촉 + 치수 글자
- 오른쪽 아래 표제란(도면 번호, 날짜, 축척)을 섹션 꼬리표로
- 반경 0, 그림자 없음, 테두리는 1px 선

## 컴포넌트

```css
.sheet { background-color: var(--blueprint); color: var(--line);
  background-image: linear-gradient(rgba(232,240,250,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(232,240,250,.08) 1px, transparent 1px);
  background-size: 20px 20px; }
.titleblock { display: grid; grid-template-columns: repeat(3, auto); border: 1px solid var(--line); font-family: "IBM Plex Mono", "SUIT", monospace; font-size: 13px; }
.titleblock > * { padding: 6px 10px; border-left: 1px solid var(--line); }
.btn { background: var(--mark); color: var(--on-mark); border: 0; padding: 12px 22px; font-weight: 700; }
```

## 모션

- 도식의 선이 한 번 그려지는 연출 하나(stroke-dashoffset). 내용은 그 전에도 보이게(점선 상태에서 시작)

## 시그니처

- 실제 치수가 적힌 도식
- 섹션마다 붙는 표제란

## 하지 않는 것

- 장식용 그리드만 깔고 실제 도식 없음 (그리드 배경은 AI 티로 읽힘)
- 긴 글을 도면 바탕에
- 노란 표시를 여기저기

## 접근성 주의

- 도식 SVG에 `role="img"`와 글 설명
- 치수 글자도 가장 좁은 화면에서 11px 이상(viewBox 축소 계산)
