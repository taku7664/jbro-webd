# Art Deco

1920년대 호텔 로비의 언어. 엄격한 대칭, 기하학 장식선, 깊은 바탕에 금속성 포인트, 넓은 자간의 대문자 라틴 라벨. 호텔, 바·레스토랑, 주얼리, 공연장, 초대장에 어울립니다.

잘 맞는 모드: Persuade, Experience
맞지 않는 경우: 업무 도구, 캐주얼 서비스

## 타입

- 디스플레이: 기하학적이거나 고대비인 라틴(Marcellus, Italiana, Poiret One 계열). 한글 제목은 명조 굵게 또는 단정한 고딕
- 라틴 라벨: 대문자 + 자간 0.2em (한 종류만)
- 본문: 조용한 명조 또는 가벼운 고딕
- 스케일 1.414, 가운데 정렬 허용(이 스타일의 대칭 문법)

## 색

```
역할      값        쓰는 곳
deep      #14231F   바탕 (짙은 녹색)
surface   #1C302A   올라온 면
cream     #EFE6D2   본문
brass     #C9A45C   금속성 포인트 (선, 장식, 큰 글자)
on-brass  #14231F
dim       #B9B09C   보조
```

```contrast
cream     deep      4.5
dim       deep      4.5
brass     deep      4.5
cream     surface   4.5
on-brass  brass     4.5
```

금색은 단색으로. 금속 그라디언트는 쓰지 않습니다.

## 구성

- 중심축 대칭, 섹션 위아래에 기하학 장식선(부채꼴, 계단형, 겹선)
- 프레임: 1px 금색 선 두 겹(바깥·안쪽 간격 6px)
- 세로 리듬을 넉넉하게

## 컴포넌트

```css
.frame { border: 1px solid var(--brass); outline: 1px solid var(--brass); outline-offset: 6px; padding: 40px; }
.ornament { height: 24px; background:
  linear-gradient(var(--brass), var(--brass)) center / 40% 1px no-repeat,
  linear-gradient(var(--brass), var(--brass)) center / 1px 100% no-repeat; }
.label { font-family: "Marcellus", serif; text-transform: uppercase; letter-spacing: .2em; font-size: 13px; color: var(--brass); }
.btn { background: transparent; color: var(--brass); border: 1px solid var(--brass); padding: 14px 32px; letter-spacing: .12em; }
.btn:hover { background: var(--brass); color: var(--on-brass); }
```

## 모션

- 느리고 신중한 페이드(400–500ms). 튀는 것 없음

## 시그니처

- 두 겹 금색 프레임
- 섹션 사이 기하학 장식선

## 하지 않는 것

- 금색 그라디언트, 반짝이
- 대문자 라벨을 모든 제목 위에 (이 스타일에서도 한 종류, 필요한 곳에만)
- 한글에 넓은 자간

## 접근성 주의

- 금색 글자는 큰 글자에, 작은 본문은 cream
- 가운데 정렬은 짧은 블록에만
