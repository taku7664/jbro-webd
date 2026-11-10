# Instrument Panel

공장·발전소 계기판의 언어입니다. 칠한 철판 같은 회녹색 바탕, 각인된 라벨, 상태마다 정해진 색과 이름. 모니터링 대시보드, 관리자 화면, 장비·서버 상태 화면처럼 **오래 켜 두고 이상을 빨리 알아채야 하는 Operate 화면**에 어울립니다.

어두운 바탕에 네온을 올리는 흔한 대시보드와 반대로, 밝은 바탕에서 상태색만 또렷하게 씁니다.

잘 맞는 모드: Operate
맞지 않는 경우: 감성 중심 랜딩, 긴 읽을거리

## 타입

- 본문·라벨: IBM Plex Sans KR 400/600, 14px 기준(촘촘한 화면)
- 숫자: IBM Plex Mono 500 + `tabular-nums`. 한글이 섞이는 칸은 폰트 스택에 IBM Plex Sans KR을 이어 둠
- 패널 제목: IBM Plex Sans KR 600, 13px, 자간 0.02em. 대문자 변환 없음(한글이라 의미도 없음)
- 스케일: 1.2 (12 / 14 / 17 / 20 / 24 / 29). 큰 숫자(현재값)만 29–40px

## 색

```
역할        값        쓰는 곳
bg          #D3D7D0   칠한 철판
panel       #E6E8E2   패널 면
text        #161A17   본문, 값
label       #474E48   각인 라벨, 단위
line        #9CA39B   패널 경계
ok          #2C6636   정상
warn        #7D5300   주의
alarm       #9E241C   경보
on-alarm    #F6F4F0   경보 배지 위 글자
```

```contrast
text      panel   4.5
label     panel   4.5
ok        panel   4.5
warn      panel   4.5
alarm     panel   4.5
on-alarm  alarm   4.5
text      bg      4.5
```

## 구성

- 그리드: 12칼럼, 패널은 2–4칸 단위. 같은 크기 카드 반복 대신 **값의 중요도에 따라 크기를 다르게**
- 한 줄의 패널 칸 수 합이 12가 되게 배치합니다. 큰 패널을 `grid-row: span 2`로 세로로 늘려 옆의 작은 패널 두 줄과 맞추면 빈칸이 생기지 않습니다. 시험 렌더에서 6+3+3 / 3+3 배치가 오른쪽 절반을 비웠습니다.
- 반경: 2px
- 테두리·그림자: 패널은 1px `--line` + 위쪽 안쪽 하이라이트 1px(철판 모서리). 그림자 없음
- 밀도: 촘촘. 패널 안 여백 12–16px

## 컴포넌트

```css
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 2px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .6); padding: 14px 16px; }
.panel h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--label); letter-spacing: .02em; }
.value { font-family: "IBM Plex Mono", "IBM Plex Sans KR", monospace; font-variant-numeric: tabular-nums; font-size: 32px; color: var(--text); }
.unit { font-size: 13px; color: var(--label); margin-left: 4px; }
.status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.status::before { content: ""; width: 10px; height: 10px; background: currentColor; }      /* 사각 표시등, 깜빡이지 않음 */
.status--ok { color: var(--ok); } .status--warn { color: var(--warn); }
.status--alarm { color: var(--on-alarm); background: var(--alarm); padding: 2px 8px; }
.gauge { height: 8px; background: var(--bg); border: 1px solid var(--line); }
.gauge > span { display: block; height: 100%; background: var(--text); }
```

## 모션

- 값이 바뀔 때 숫자 자체는 바로 바뀌고, 바뀐 패널 테두리만 600ms 동안 진해졌다 돌아옴
- 경보도 깜빡이지 않음. 위치·색·글자로 알림

## 시그니처

- 상태 표시등이 원이 아니라 각진 사각형
- 경보 상태만 배지가 반전(색 배경 + 밝은 글자)

## 하지 않는 것

- 어두운 바탕 + 네온 글로우
- 의미 없는 스파크라인, 장식용 원형 게이지
- 상태를 색만으로 표시 (항상 "정상/주의/경보" 글자와 함께)
- 깜빡이는 점

## 접근성 주의

- 상태는 색 + 글자 + 위치로 구분합니다. 색각 이상이 있어도 읽혀야 합니다.
- 값이 자동으로 바뀌는 영역은 `aria-live="polite"`를 검토하되, 너무 자주 바뀌면 낭독이 시끄러우니 경보만 알립니다.
- 촘촘한 화면이라도 클릭 대상은 44×44px을 지킵니다.
