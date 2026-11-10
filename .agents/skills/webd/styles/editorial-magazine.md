# Editorial Magazine

월간지 지면의 언어. 큰 제목과 작은 본문의 극적인 크기 차이, 첫 글자 장식, 인용구, 지면을 가로지르는 사진, 쪽 머리(러닝 헤드). 브랜드 매거진, 긴 인터뷰, 문화·여행 콘텐츠, 출판사 웹진에 어울립니다.

잘 맞는 모드: Read, Persuade
맞지 않는 경우: 업무 도구

## 타입

- 제목: 고대비 명조 또는 성격 있는 디스플레이(마루부리 굵게, Hahmlet 가변). 라틴 제목이면 가변 세리프의 광학 크기 활용
- 본문: 명조 17–18px, 행간 1.8 (한글) / 고딕 본문도 가능
- 인용구: 본문 2배 크기 명조
- 스케일 1.5 이상, 제목과 본문의 차이를 크게

## 색

```
역할      값        쓰는 곳
paper     #FBFAF7   지면
ink       #1A1918   본문
grey      #5B5853   쪽 머리, 캡션
accent    #2F5D50   잡지 고유색 하나 (쪽 머리 선, 인용 부호, 링크)
on-accent #FBFAF7
```

```contrast
ink        paper   4.5
grey       paper   4.5
accent     paper   4.5
on-accent  accent  4.5
```

포인트 색은 주제에서 고릅니다. 크림 + 테라코타 조합은 AI 기본값이므로 피합니다.

## 구성

- 첫 화면: 지면 폭 사진 + 그 위나 아래에 큰 제목. 사진 위 글자는 대비 계산
- 본문 한 칼럼, 넓은 화면에서는 인용구·사진이 칼럼 밖으로 튀어나감(브레이크아웃)
- 쪽 머리: 위쪽 가는 선 + 잡지 이름 + 호수
- 첫 문단 첫 글자 장식은 라틴 본문에만(`::first-letter`). 한글은 첫 문단을 굵게·크게 하는 방식으로

## 컴포넌트

```css
.article { display: grid; grid-template-columns: 1fr min(36em, 100%) 1fr; }
.article > * { grid-column: 2; }
.article > .wide { grid-column: 1 / -1; }
.pull { font-size: 2em; line-height: 1.3; border-top: 2px solid var(--accent); padding-top: .5em; margin: 2em 0; }
.lede { font-size: 1.25em; font-weight: 600; }
.runninghead { display: flex; justify-content: space-between; border-top: 1px solid var(--accent); font-size: 13px; color: var(--grey); }
```

## 모션

- 거의 없음. 사진은 로딩 자리를 미리 잡음

## 시그니처

- 지면을 벗어나는 인용구 하나
- 쪽 머리의 호수·섹션 표기

## 하지 않는 것

- 사진 위에 그라디언트 덮개를 깔고 흰 글자 (대비를 계산하지 않은 채)
- 섹션마다 제목 위 작은 라벨
- 이탤릭 한글

## 접근성 주의

- 인용구는 `<blockquote>` + 출처
- 사진 대체 텍스트, 캡션과 중복하지 않기
