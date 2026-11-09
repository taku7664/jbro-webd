# Lab Report

실험 보고서·학술지의 언어. 번호 매긴 그림과 표, 캡션, 각주, 방법·결과·논의의 엄격한 순서. 연구 결과 공개, 기술 백서, 벤치마크, 데이터 저널리즘, 과학 교육처럼 **근거를 보여 주는 읽을거리**에 어울립니다.

잘 맞는 모드: Read
맞지 않는 경우: 감성 캠페인, 빠른 앱 조작

## 타입

- 본문: 명조(Noto Serif KR, Hahmlet) 17px, 행간 1.75
- 제목·캡션·표: 고딕(IBM Plex Sans KR)
- 수식·변수: 이탤릭 라틴 세리프는 라틴 변수에만. 한글에는 이탤릭 없음
- 숫자 `tabular-nums`, 단위는 띄어 쓰기 통일
- 스케일 1.2

## 색

```
역할      값        쓰는 곳
paper     #FCFCFA   바탕
text      #1B1D1F   본문
caption   #4E5459   캡션, 각주
figure-1  #1F5C99   그림 계열 1
figure-2  #C2571A   그림 계열 2
rule      #D5D8DB   표 선
```

```contrast
text      paper   4.5
caption   paper   4.5
figure-1  paper   3.0
figure-2  paper   3.0
```

figure 색은 그래프 선·점 전용(3.0). 강조 계열 하나 외에는 회색.

## 구성

- 본문 칼럼 하나(한 줄 35–40자) + 넓은 화면의 오른쪽 여백에 각주·참고
- 그림·표는 본문보다 넓게 나갈 수 있음, 번호 + 캡션은 그림 **아래**, 표 캡션은 표 **위**
- 섹션 번호(1, 1.1, 1.2)는 실제 구조이므로 사용
- 표는 위·아래·머리 아래 세 줄만(가로 괘선 최소)

## 컴포넌트

```css
figure { margin: 2rem 0; }
figcaption { font: 14px/1.5 "IBM Plex Sans KR", sans-serif; color: var(--caption); margin-top: .5rem; }
figcaption b { color: var(--text); }   /* "그림 3." */
table.booktabs { border-collapse: collapse; border-top: 2px solid var(--text); border-bottom: 2px solid var(--text); }
table.booktabs thead th { border-bottom: 1px solid var(--text); }
.footnote-ref { font-size: .75em; vertical-align: super; }
```

## 모션

- 없음. 그림 상호작용(확대, 계열 켜고 끄기)만

## 시그니처

- 번호 매긴 그림·표와 본문 참조("그림 3 참고")가 실제 링크로 연결
- 여백 각주

## 하지 않는 것

- 그래프 3D, 이중 축
- 근거 없는 수치
- 각주를 툴팁에만

## 접근성 주의

- 그림마다 글 요약, 데이터 표 제공
- 각주 링크와 돌아가기 링크 쌍
