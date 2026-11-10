# Pixel Arcade

8비트 아케이드의 언어. 픽셀 경계, 계단처럼 깎인 모서리, 제한된 팔레트, 점수판, "PRESS START". 인디 게임, 게임 행사, 레트로 커뮤니티, 놀이형 이벤트 페이지에 어울립니다.

잘 맞는 모드: Experience, Persuade
맞지 않는 경우: 금융·의료, 긴 글

## 타입

- 픽셀 서체는 **큰 제목·점수·짧은 라벨에만**(라틴 Press Start 2P, Silkscreen / 한글 둥근모꼴·갈무리 계열, 제공처·라이선스 확인)
- 본문은 읽히는 고딕(Pretendard)
- 픽셀 서체는 원래 크기의 정수배로(8, 16, 24, 32px)
- 이미지·아이콘 `image-rendering: pixelated`

## 색

```
역할      값        쓰는 곳
screen    #1D1B2F   바탕
panel     #2A2745   패널
text      #F4F1E8   본문
dim       #B8B3CC   보조
coin      #F7C948   점수·주 행동
on-coin   #1D1B2F
life      #E85D5D   생명·오류 (면, 아이콘)
go        #5CC97B   성공 (면, 아이콘)
```

```contrast
text     screen   4.5
dim      screen   4.5
text     panel    4.5
coin     screen   4.5
on-coin  coin     4.5
life     screen   3.0
go       screen   3.0
```

## 구성

- 4px 단위 그리드, 모든 크기·여백이 4의 배수
- 모서리는 계단형(clip-path 다각형)으로 깎음, 둥근 반경 없음
- 테두리 4px, 그림자는 4px 단위 블록
- 점수판처럼 숫자를 크게

## 컴포넌트

```css
.px-box { background: var(--panel); border: 4px solid var(--text);
  clip-path: polygon(0 8px, 8px 8px, 8px 0, calc(100% - 8px) 0, calc(100% - 8px) 8px, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 8px calc(100% - 8px), 0 calc(100% - 8px)); }
.btn { background: var(--coin); color: var(--on-coin); border: 0; padding: 12px 20px; font-family: "Press Start 2P", "Pretendard", monospace; font-size: 16px; box-shadow: 0 4px 0 #8a6a12; }
.btn:active { transform: translateY(4px); box-shadow: none; }
.score { font-family: "Press Start 2P", monospace; font-variant-numeric: tabular-nums; }
img, svg { image-rendering: pixelated; }
```

## 모션

- `steps()` 이징으로 프레임처럼 끊어지는 움직임. 부드러운 곡선 이징 쓰지 않음
- 반복 애니메이션(코인 회전 등)은 하나, 화면 밖에서 정지, reduced-motion 정지

## 시그니처

- 계단형으로 깎인 모서리
- 점수판처럼 큰 숫자

## 하지 않는 것

- 픽셀 서체로 본문
- 픽셀 서체를 정수배가 아닌 크기로 (흐려짐)
- 깜빡이는 "INSERT COIN"을 화면 여러 곳에

## 접근성 주의

- 픽셀 서체 글자는 대비가 충분해도 읽기 어려움 → 크기 16px 이상, 짧게
- 한글 픽셀 서체가 없으면 제목만 라틴, 한글은 고딕 (render-check `hangul-fallback`)
