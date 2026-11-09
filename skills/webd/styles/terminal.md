# Terminal

잘 만든 TUI의 언어. 고정폭 글자, 상자 그리기 문자, 프롬프트와 커서, 표 중심의 촘촘한 정보. CLI 도구, 개발자 문서, 인프라·모니터링, 해커톤처럼 **실제로 터미널이 일터인 사람들**을 위한 화면에 어울립니다. 라이트 변형(종이 + 잉크)을 기본으로 둡니다. 어두운 바탕 + 형광은 흔한 AI 기본값이라 다크는 선택입니다.

잘 맞는 모드: Operate, Read(개발 문서)
맞지 않는 경우: 비개발자 소비자 서비스 (모노스페이스가 의상이 됨)

## 타입

- 고정폭 하나(JetBrains Mono, IBM Plex Mono) + **한글 고정폭 대체**(D2Coding, Nanum Gothic Coding) 반드시 스택에
- 위계는 크기보다 굵기·색·들여쓰기로. 크기 단계 3개(14 / 16 / 22)
- 긴 설명 문단은 고딕으로 바꿔도 됨(읽기)

## 색

라이트(기본)
```
역할      값        쓰는 곳
paper     #F7F7F2   바탕
ink       #1B1F1D   글자
dim       #5B635F   주석, 보조
prompt    #1F6F43   프롬프트·성공
warn      #8A5A00   경고
err       #B42318   오류
select    #DCE9E0   선택 배경
```

```contrast
ink     paper   4.5
dim     paper   4.5
prompt  paper   4.5
warn    paper   4.5
err     paper   4.5
ink     select  4.5
```

다크(선택): 바탕 `#14171A`, 글자 `#E3E7E4`, 포인트는 호박색 계열. 시안·네온 초록 글로우는 쓰지 않습니다.

## 구성

- 상자 그리기 문자(┌ ─ ┐ │)나 1px 선으로 패널
- 표 중심, 열 정렬, 촘촘
- 명령 예시는 `$ ` 프롬프트 + 복사 버튼, 출력은 dim

## 컴포넌트

```css
body { font-family: "JetBrains Mono", "D2Coding", "Nanum Gothic Coding", monospace; background: var(--paper); color: var(--ink); }
.panel { border: 1px solid var(--ink); }
.panel__title { display: inline-block; padding: 0 8px; margin-left: 12px; transform: translateY(-50%); background: var(--paper); }
.cmd::before { content: "$ "; color: var(--prompt); user-select: none; }
.caret { display: inline-block; width: .6em; background: var(--ink); }
@media (prefers-reduced-motion: no-preference) { .caret { animation: blink 1s steps(1) infinite; } }
@keyframes blink { 50% { opacity: .2; } }
```

깜빡이는 커서는 **입력 중인 곳 하나에만**. 장식 커서는 AI 티입니다.

## 모션

- 즉시 상태 변화. 출력이 줄 단위로 나타나는 연출은 실제 출력 스트림일 때만

## 시그니처

- 패널 제목이 테두리를 끊고 들어감
- 실제로 실행 가능한 명령 예시

## 하지 않는 것

- 비개발자 대상 화면에 모노스페이스 의상
- 장식 스캔라인, 글리치, 형광 글로우
- 한글 고정폭 대체 없이 라틴 모노만 지정

## 접근성 주의

- 깜빡임은 reduced-motion에서 정지, 화면에 하나
- 상자 문자는 `aria-hidden`, 구조는 HTML로
