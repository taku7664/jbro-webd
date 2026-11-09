# Hanji Ink

한지와 먹, 붉은 낙관(도장)의 언어. 닥종이의 따뜻한 미색, 번지는 먹, 넓은 여백, 마지막에 찍는 붉은 도장 하나. 전통 공예, 차·다도, 출판사, 박물관 전시, 한식 브랜드, 문학 플랫폼에 어울립니다.

잘 맞는 모드: Read, Experience, Persuade
맞지 않는 경우: 빠른 업무 도구, 데이터가 많은 화면

## 타입

- 본문: 명조 (마루부리, Noto Serif KR, 고운바탕), 18px, 행간 1.9
- 제목: 같은 명조의 굵은 굵기 또는 붓 느낌의 디스플레이 서체를 **제목에만**
- 숫자: 명조의 숫자 그대로. 표 숫자 필요하면 `tabular-nums`
- 스케일 1.333

## 색

```
역할      값        쓰는 곳
hanji     #F3EEE3   한지 바탕
ink       #1C1A17   먹 (본문)
ink-wash  #5A554C   담묵 (보조 글자)
seal      #A3271F   낙관 (도장, 주 행동 하나)
on-seal   #F3EEE3   낙관 위 글자
fiber     #D9D0BE   종이 결, 구분선
```

```contrast
ink       hanji    4.5
ink-wash  hanji    4.5
seal      hanji    4.5
on-seal   seal     4.5
```

## 구성

- 넓은 여백, 한 칼럼 본문(한 줄 35–40자). 넓은 화면에서는 왼쪽에 큰 제목, 오른쪽에 본문
- 반경 0. 테두리 대신 여백과 가는 종이 결 선(`--fiber`)
- 바탕에 아주 옅은 종이 섬유 질감(SVG 노이즈, 불투명도 0.05 이하) 선택
- 세로쓰기(`writing-mode: vertical-rl`)는 짧은 제목·장식 문구에만. 본문은 가로쓰기

## 컴포넌트

```css
body { background: var(--hanji); color: var(--ink); font-family: "MaruBuri", "Noto Serif KR", serif; line-height: 1.9; word-break: keep-all; }
.seal { display: inline-grid; place-items: center; width: 56px; height: 56px; background: var(--seal); color: var(--on-seal); font-weight: 700; border-radius: 4px; transform: rotate(-3deg); }
.btn { background: var(--seal); color: var(--on-seal); border: 0; border-radius: 2px; padding: 12px 24px; }
.vertical-title { writing-mode: vertical-rl; letter-spacing: 0.2em; }
hr { border: 0; border-top: 1px solid var(--fiber); }
```

## 모션

- 먹이 번지듯 천천히 나타나는 페이드 하나(첫 화면 제목, 600ms). 그 외 없음
- 내용은 처음부터 보이는 상태에서 시작

## 시그니처

- 페이지(또는 섹션) 끝에 찍힌 붉은 낙관 하나
- 큰 제목 하나만 세로쓰기

## 하지 않는 것

- 태극·국기·특정 종교 상징을 장식으로
- 붓글씨 서체로 본문
- 한지 사진을 배경으로 크게 깔아 글자 대비를 떨어뜨림
- 낙관 색을 여러 곳에

## 접근성 주의

- 세로쓰기 제목도 화면 낭독기에 자연스럽게 읽히는지 확인
- 질감 레이어는 글자 대비를 떨어뜨리지 않을 만큼만
