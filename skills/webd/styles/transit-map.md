# Transit Map

지하철 노선도의 언어로 화면을 짭니다. 굵은 선이 흐름을, 원형 정거장이 단계를, 노선 색이 분류를 맡습니다. 단계·과정·여정이 있는 제품(온보딩 흐름, 배송 추적, 학습 경로, 로드맵)에 어울립니다.

> 초안 예시입니다. 실제 결과물로 검증하지 않았습니다.

잘 맞는 모드: Persuade, Read
맞지 않는 경우: 단계 구조가 없는 콘텐츠, 촘촘한 Operate 화면

## 타입

- 디스플레이: 폭이 약간 좁은 그로테스크 산세리프, 굵게 (예: Archivo, Barlow Semi Condensed)
- 본문: 같은 계열 보통 굵기, 또는 가독성 좋은 산세리프
- 한글 대안: Pretendard, SUIT
- 스케일: 1.333 (16 / 21 / 28 / 38 / 50)
- 역 이름처럼 짧은 라벨은 굵게, 대문자는 쓰지 않음

## 색

```
역할       값        쓰는 곳
bg         #F7F7F5   종이 같은 바탕
text       #1B1B1B   본문
line-1     #0B6E4F   주 노선(핵심 흐름)
line-2     #E4572E   보조 노선(분기)
line-3     #2E86AB   세 번째 분류(필요할 때만)
station    #FFFFFF   정거장 원 안쪽
muted      #6B6B66   보조 텍스트
```

노선 색은 분류 의미가 있을 때만 씁니다. 장식으로 색을 늘리지 않습니다.

## 구성

- 그리드: 12칼럼, 노선은 45°·90° 각도만 사용
- 반경: 0 (선 끝과 정거장 원만 둥글게)
- 테두리·그림자: 그림자 없음. 구분은 선 두께(2px / 6px)로
- 밀도: 보통. 정거장 사이 간격을 일정하게 유지

## 컴포넌트

```css
.line { height: 6px; background: var(--line-1); border-radius: 3px; }
.station {
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--station); border: 4px solid var(--line-1);
}
.station--transfer { width: 28px; height: 28px; border-color: var(--text); }
.btn {
  background: var(--line-1); color: #fff; border: 0; border-radius: 999px;
  padding: 12px 24px; font-weight: 700;
}
```

카드 대신 정거장 + 오른쪽 설명 텍스트 묶음을 씁니다.

## 모션

- 페이지 진입 때 노선이 한 번 그려지는 연출(stroke-dashoffset) 하나만
- 스크롤에 따라 현재 정거장을 채우는 정도까지 허용

## 시그니처

- 섹션을 잇는 하나의 연속된 노선
- 갈림길(분기)이 실제 선택지를 나타냄

## 하지 않는 것

- 노선을 곡선·임의 각도로 그리기
- 노선 색을 4개 넘게 쓰기
- 정거장 원 안에 아이콘 넣기

## 접근성 주의

- 노선 색만으로 분류를 구분하지 않고 라벨을 함께 씁니다.
- 선 그리기 애니메이션은 `prefers-reduced-motion`에서 완성된 상태로 보여 줍니다.
- 주황 노선(`#E4572E`) 위에 흰 글자를 올리면 대비가 부족할 수 있으니 확인합니다.
