# Public Signage

공공 안내 표지판의 언어. 멀리서도 읽히는 큰 고딕, 기능에 따라 정해진 색, 픽토그램, 화살표, 번호. 길 찾기·예약·민원·교통·병원 안내처럼 **처음 온 사람이 헤매지 않아야 하는 화면**에 어울립니다.

잘 맞는 모드: Operate, Read
맞지 않는 경우: 감성 중심 브랜드, 럭셔리

## 타입

- 가독성 최우선 고딕: Pretendard, Noto Sans KR, SUIT. 굵기 500–700
- 본문 18px 이상, 안내 제목은 크게(32–56px)
- 숫자(번호, 출구, 시간)는 크게, `tabular-nums`
- 한 화면에 패밀리 하나

## 색

```
역할       값        쓰는 곳
ground     #FFFFFF   바탕
text       #1A1A1A   글자
guide      #00539C   안내·이동 (화살표, 길 표시)
on-guide   #FFFFFF
caution    #F2B705   주의 띠 (면 전용, 글자는 text)
danger     #C8102E   금지·위험
on-danger  #FFFFFF
muted      #545454   보조 글자
```

```contrast
text       ground    4.5
muted      ground    4.5
guide      ground    4.5
on-guide   guide     4.5
text       caution   4.5
on-danger  danger    4.5
```

caution은 글자색이 아니라 면 색입니다. 그 위 글자는 text.

## 구성

- 큰 안내 블록: 픽토그램 + 짧은 글 + 방향 화살표 + 번호
- 한 블록에 정보 하나. 여러 정보를 한 판에 몰지 않음
- 반경 4px, 그림자 없음
- 큰 터치 대상(56px 이상)

## 컴포넌트

```css
.sign { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 20px; background: var(--guide); color: var(--on-guide); border-radius: 4px; font-weight: 700; font-size: 22px; min-height: 72px; }
.sign__no { font-size: 32px; font-variant-numeric: tabular-nums; }
.caution-band { background: repeating-linear-gradient(-45deg, var(--caution) 0 16px, var(--text) 16px 32px); height: 8px; }
.pictogram { width: 40px; height: 40px; }
```

## 모션

- 없음. 상태 변화만 즉시

## 시그니처

- 모든 안내 블록이 같은 문법: 픽토그램 → 글 → 화살표
- 번호 체계(출구 3, 창구 12)가 화면 전체에서 일관

## 하지 않는 것

- 장식 색, 그라디언트
- 작은 글자, 얇은 굵기
- 픽토그램만 두고 글자 생략

## 접근성 주의

- 픽토그램은 `aria-hidden`, 의미는 글자로
- 색만으로 금지·주의를 구분하지 않음 (아이콘 + 글자)
- 경고 띠 무늬는 장식이므로 정보를 담지 않음
