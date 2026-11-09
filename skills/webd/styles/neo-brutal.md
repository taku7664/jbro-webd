# Neo Brutal

HTML을 배운 진(zine). 두꺼운 검은 테두리, 블러 없는 오프셋 그림자, 시끄러운 단색 두세 개, 일부러 어설픈 정렬과 완전한 자신감. 개발자 도구의 랜딩, 인디 프로젝트, 창작자 커뮤니티, 행사처럼 **기존 문법을 비트는 게 메시지인 곳**에 어울립니다.

잘 맞는 모드: Persuade, Experience
맞지 않는 경우: 금융·의료처럼 신뢰가 먼저인 곳, 촘촘한 업무 화면 (개발자 대상 도구는 예외적으로 가능)

## 타입

- 디스플레이: 아주 굵은 그로테스크(라틴 Archivo Black·Bricolage Grotesque 800, 한글 Black Han Sans·Pretendard 900)
- 본문: 평범한 고딕 또는 고정폭
- 숫자는 크게
- 스케일 1.5

## 색

```
역할      값        쓰는 곳
paper     #FFFDF5   바탕
ink       #111111   글자, 테두리, 그림자
pop-1     #FFD23F   면 (카드·버튼 배경)
pop-2     #4CC9F0   면
pop-3     #FF6B6B   면
```

```contrast
ink   paper   4.5
ink   pop-1   4.5
ink   pop-2   4.5
ink   pop-3   4.5
```

pop 색 위의 글자는 항상 ink(검정). pop 색을 글자색으로 쓰지 않습니다.

## 구성

- 테두리 3px 검정, 그림자 `4px 4px 0 var(--ink)`(이 스타일에서는 의도된 선택이므로 검출기 `hard-offset-shadow`를 `--allow`)
- 반경 0 또는 일부러 섞음
- 요소가 살짝 회전(-2°~2°)하거나 겹쳐도 됨. 단 본문 블록은 반듯하게
- 섹션마다 pop 색 하나를 면으로

## 컴포넌트

```css
.box { background: var(--pop-1); color: var(--ink); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 20px; }
.btn { background: var(--pop-3); color: var(--ink); border: 3px solid var(--ink); box-shadow: 4px 4px 0 var(--ink); padding: 12px 22px; font-weight: 800; transition: transform .1s, box-shadow .1s; }
.btn:active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--ink); }
.btn:focus-visible { outline: 3px dashed var(--ink); outline-offset: 4px; }
```

## 모션

- 누르면 그림자만큼 밀리는 반응(100ms). 페이드·부드러운 등장 없음

## 시그니처

- 모든 조작 요소가 같은 그림자를 공유하고 누르면 밀림
- 거대한 숫자나 단어 하나가 섹션을 가로지름

## 하지 않는 것

- pop 색을 글자색으로
- 회전·겹침을 본문에
- 그라디언트, 블러

## 접근성 주의

- 회전한 요소도 포커스 링이 보이게
- 색만으로 구분하지 않음 (pop 색은 장식, 의미는 글자로)
