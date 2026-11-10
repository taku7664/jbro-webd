# Field Notes

현장 관찰 수첩의 언어입니다. 모눈 종이 위에 연필로 쓴 본문, 파란 잉크로 단 주석, 형광펜으로 그은 핵심 한 줄. 조사 보고서, 사례 연구, 개발 일지, 학습 노트처럼 **생각의 과정을 보여 주는 읽을거리**에 어울립니다.

잘 맞는 모드: Read
맞지 않는 경우: 빠른 결정이 필요한 Persuade 화면, 촘촘한 Operate 화면

## 타입

- 본문: IBM Plex Sans KR 400, 17px, 행간 1.8 (연필 글씨 느낌은 색으로만 내고 글꼴은 읽기 좋게)
- 주석·손글씨: Nanum Pen Script (한글 포함). **짧은 주석에만**, 본문에 쓰지 않음. 크기는 본문보다 1.3배
- 제목: IBM Plex Sans KR 600
- 측정값·날짜: IBM Plex Mono (숫자만), 한글 대체는 IBM Plex Sans KR
- 스케일: 1.25 (14 / 17 / 21 / 27 / 33)

## 색

```
역할        값        쓰는 곳
paper       #EEF0E8   모눈 종이
grid        #CFD6C6   5mm 모눈 선
pencil      #2C2F2A   본문
pencil-2    #565B53   보조 텍스트
ink         #23468C   주석, 링크
marker      #E3D26A   형광펜 (글자 뒤 배경으로만)
```

```contrast
pencil    paper   4.5
pencil-2  paper   4.5
ink       paper   4.5
pencil    marker  4.5
```

## 구성

- 그리드: 본문 칼럼 65ch + 오른쪽 여백 칼럼(주석용, 넓은 화면에서만)
- 주석은 마크업에서 **주석이 가리키는 문단 바로 뒤에** 둡니다. 넓은 화면에서는 grid로 오른쪽 여백 칸에 올리고, 좁은 화면에서는 그 문단 바로 아래에 들여 씁니다. 주석을 본문 끝에 몰아 두면 좁은 화면에서 어느 문단에 대한 메모인지 알 수 없게 됩니다(시험 렌더에서 확인).
- 배경: `background-image`로 5mm(약 19px) 모눈. 선 1px `--grid`
- 반경: 0
- 테두리·그림자: 없음. 붙인 사진·도표에만 마스킹 테이프 한 조각(반투명 사각형) 허용
- 밀도: 여유

## 컴포넌트

```css
body { background-color: var(--paper);
  background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 19px 19px; }
.note { font-family: "Nanum Pen Script", cursive; font-size: 1.3em; color: var(--ink); }
.hl { background: linear-gradient(transparent 55%, var(--marker) 55%); }
.figure { position: relative; background: #fff; padding: 8px; }
.figure::before { content: ""; position: absolute; top: -10px; left: 24px; width: 72px; height: 20px;
  background: rgba(227, 210, 106, .55); transform: rotate(-3deg); }
a { color: var(--ink); text-decoration-style: wavy; text-underline-offset: 4px; }
```

## 모션

- 형광펜이 처음 화면에 들어올 때 왼쪽에서 한 번 그어짐(`background-size` 0→100%, 500ms). 페이지에 1–2곳만
- 그 외 없음

## 시그니처

- 오른쪽 여백의 손글씨 주석
- 핵심 문장 하나에만 그은 형광펜

## 하지 않는 것

- 본문 전체를 손글씨 폰트로
- 형광펜을 문단마다
- 종이 질감 사진 배경 (모눈 CSS로 충분)

## 접근성 주의

- 모눈 선은 본문 대비를 해치지 않을 만큼 옅게. 글자 뒤에 선이 지나가도 읽히는지 확인합니다.
- 손글씨 주석에 핵심 정보를 숨기지 않습니다. 본문만 읽어도 내용이 이어져야 합니다.
- 물결 밑줄 링크는 색과 모양이 함께 구분되므로 유지합니다.
