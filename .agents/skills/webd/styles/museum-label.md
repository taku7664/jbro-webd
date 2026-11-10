# Museum Label

미술관 벽과 작품 캡션의 언어입니다. 넓은 흰 벽, 작품은 크게, 설명은 작고 정확하게 작품 옆에 붙습니다. 포트폴리오, 사진·작품 갤러리, 제품 쇼케이스처럼 **작품이 주인공이고 UI는 물러나야 하는 Experience 화면**에 어울립니다.

잘 맞는 모드: Experience
맞지 않는 경우: 기능 설명이 많은 Persuade, 촘촘한 Operate

## 타입

- 본문·캡션: Pretendard 400/600
- 작품 제목: Pretendard 600, 캡션보다 한 단계만 크게
- 페이지 제목: Pretendard 300, 아주 크게(`clamp(40px, 7vw, 88px)`), 자간 -0.02em
- 캡션 크기 14px, 행간 1.6. 캡션 줄 길이 최대 40자
- 스케일: 1.25 (14 / 17 / 22 / 27 / 34) + 페이지 제목만 예외

## 색

```
역할        값        쓰는 곳
wall        #F3F3F1   벽
text        #1A1A1A   제목, 본문
caption     #55554F   캡션 정보(재료, 연도, 크기)
rule        #CBCBC5   얇은 구분선
room        #2E3A54   섹션 전환용 벽색 (전시실이 바뀌는 느낌, 페이지에 1–2곳)
on-room     #F3F3F1   room 위 글자
```

```contrast
text     wall   4.5
caption  wall   4.5
on-room  room   4.5
```

## 구성

- 그리드: 작품이 8–9칸, 캡션이 오른쪽 아래 3칸 또는 작품 아래. 작품마다 배치를 조금씩 바꿔 벽에 걸린 느낌을 냄
- 여백: 작품 사이 세로 간격 120–200px. 넓은 화면에서 여백이 곧 디자인
- 반경: 0
- 테두리·그림자: 작품에 테두리·그림자 없음. 캡션 위에만 1px `--rule`
- 밀도: 아주 여유

## 컴포넌트

```css
.work { display: grid; grid-template-columns: repeat(12, 1fr); gap: 24px; margin-block: 160px; }
.work img { grid-column: 1 / span 8; width: 100%; height: auto; display: block; }
.work:nth-child(even) img { grid-column: 4 / span 8; }
.label { grid-column: span 3; align-self: end; border-top: 1px solid var(--rule); padding-top: 12px; font-size: 14px; max-width: 40ch; }
.label h3 { margin: 0 0 4px; font-size: 17px; font-weight: 600; }
.label dl { margin: 0; color: var(--caption); }
.room { background: var(--room); color: var(--on-room); padding-block: 120px; }
@media (max-width: 760px) { .work img, .work:nth-child(even) img, .label { grid-column: 1 / -1; } .work { margin-block: 72px; } }
```

## 모션

- 없음이 기본. 작품 이미지가 로드될 때 자리를 미리 잡아 흔들림이 없게(`aspect-ratio`)
- 확대 보기는 사용자가 누를 때만, 200ms 페이드

## 시그니처

- 작품 옆 캡션 위의 짧은 선 하나
- 전시실이 바뀌듯 섹션 하나만 벽색이 바뀜

## 하지 않는 것

- 작품을 같은 크기 썸네일 그리드로 늘어놓기 (목록 페이지가 따로 필요하면 그때만)
- 작품 위에 글자·버튼 올리기
- 호버마다 확대·그림자

## 접근성 주의

- 작품 이미지의 `alt`는 작품 내용을 설명합니다. 캡션과 같은 내용을 반복하지 않습니다.
- 캡션 회색은 대비 4.5를 넘기는 값이므로 더 옅게 바꾸지 않습니다.
- 넓은 여백 때문에 키보드 이동이 길어지면 작품 목록으로 바로 가는 건너뛰기 링크를 둡니다.
