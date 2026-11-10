# 스타일 목록

사용자가 스타일 이름을 말하면 이 목록에서 파일을 찾아 **그 파일 하나만** 읽습니다. 다른 스타일 파일은 열지 않습니다. 목록에 없으면 가까운 스타일 2–3개를 제안합니다.

파일 이름 규칙: 스타일 이름을 소문자로, 공백은 `-`로, "스타일"·"style"은 뺍니다. `transit map 스타일` → `transit-map.md`. 한국어 이름으로 부르면 "한국어로" 열에서 찾습니다.

새 스타일은 `_template.md`를 복사해 만들고, 색 대비를 확인한 뒤 이 목록에 한 줄을 추가합니다.

```
node "<스킬 폴더>/scripts/check-style.mjs" "<스킬 폴더>/styles"
```

스타일이 검출기 규칙과 겹치는 요소를 의도적으로 쓰면(예: neo brutal의 오프셋 그림자) `DESIGN.md`의 「고정」에 규칙 id를 적고 검증 때 `--allow`로 뺍니다.

## 정보·업무 (Operate)

| 이름 | 한국어로 | 파일 | 한 줄 설명 | 모드 |
|---|---|---|---|---|
| instrument panel | 계기판 | `instrument-panel.md` | 밝은 철판 바탕, 각인 라벨, 상태색은 글자와 함께 | Operate |
| ledger | 장부, 회계 장부 | `ledger.md` | 가는 괘선, 오른쪽 정렬 숫자, 합계 위 이중선 | Operate |
| terminal | 터미널 | `terminal.md` | 고정폭 + 한글 고정폭 대체, 상자 문자, 라이트 기본 | Operate, Read |
| receipt | 영수증 | `receipt.md` | 감열지 영수증, 점선, 오른쪽 정렬 숫자, 합계 도장 | Operate, Read |
| postal label | 송장, 택배 라벨 | `postal-label.md` | 크라프트 상자 위 흰 라벨, 굵은 칸, 진행 단계 | Operate, Persuade |
| public signage | 공공 안내, 표지판 | `public-signage.md` | 큰 고딕, 기능 색, 픽토그램, 번호 체계 | Operate, Read |

## 읽기 (Read)

| 이름 | 한국어로 | 파일 | 한 줄 설명 | 모드 |
|---|---|---|---|---|
| editorial magazine | 잡지, 에디토리얼 | `editorial-magazine.md` | 큰 제목, 지면 밖 인용구, 쪽 머리 | Read, Persuade |
| lab report | 실험 보고서, 논문 | `lab-report.md` | 번호 매긴 그림·표, 여백 각주, 세 줄 표 | Read |
| field notes | 현장 수첩, 관찰 노트 | `field-notes.md` | 모눈 종이, 연필 본문, 손글씨 주석, 형광펜 한 줄 | Read |
| hanji ink | 한지, 먹, 전통 | `hanji-ink.md` | 한지 바탕, 먹 본문, 붉은 낙관 하나, 세로쓰기 제목 | Read, Experience |

## 설득·브랜드 (Persuade)

| 이름 | 한국어로 | 파일 | 한 줄 설명 | 모드 |
|---|---|---|---|---|
| swiss grid | 스위스, 국제주의 | `swiss-grid.md` | 보이는 그리드, 왼쪽 정렬, 포인트 하나 | Persuade, Read, Operate |
| transit map | 노선도 | `transit-map.md` | 굵은 선·원형 정거장·노선 색으로 흐름 | Persuade, Read |
| blueprint | 도면, 청사진 | `blueprint.md` | 청사진 바탕, 치수선, 표제란 | Persuade, Read |
| ticket stub | 티켓, 입장권 | `ticket-stub.md` | 절취선과 홈, 큰 좌석·게이트 번호 | Persuade, Operate |
| neo brutal | 네오브루탈 | `neo-brutal.md` | 두꺼운 테두리, 오프셋 그림자, 시끄러운 단색 | Persuade, Experience |
| riso print | 리소 인쇄, 리소그래프 | `riso-print.md` | 별색 두 가지 겹침, 판 어긋남, 입자 | Persuade, Experience |
| art deco | 아르데코 | `art-deco.md` | 대칭, 두 겹 금색 프레임, 깊은 녹색 바탕 | Persuade, Experience |

## 작품·몰입 (Experience)

| 이름 | 한국어로 | 파일 | 한 줄 설명 | 모드 |
|---|---|---|---|---|
| museum label | 미술관 캡션, 전시 | `museum-label.md` | 넓은 벽, 큰 작품, 작고 정확한 캡션 | Experience |
| cinema dark | 시네마틱, 영화 | `cinema-dark.md` | 색조 있는 어둠, 한 방향의 빛, 화면 폭 제목 | Experience, Persuade |
| pixel arcade | 픽셀, 8비트, 레트로 게임 | `pixel-arcade.md` | 계단형 모서리, 점수판, steps() 모션 | Experience, Persuade |

## 게임 (Play)

게임 레퍼런스 사양은 타입·구성·조작과 색의 역할을 정의합니다. 색 값과 대비 표는 실제 프로젝트의 `DESIGN.md`에서 정하고 검증합니다. 고정 팔레트가 있는 위 스타일 사양은 저장소의 `check-style` 검사를 따릅니다.

| 이름 | 한국어로 | 파일 | 한 줄 설명 | 모드 |
|---|---|---|---|---|
| game sao holo | SAO 풍, 단계형 홀로 메뉴 | `game/game-sao-holo.md` | 원형 메뉴에서 오른쪽으로 이어지는 사선 패널과 선택 띠 | Play |
| game skill tree | 다이아몬드 스킬 트리, 어쌔신 크리드식 | `game/game-skill-tree.md` | 영역 세 개와 원형 노드, 선행 관계 연결선 | Play |
| game character sheet | 캐릭터 도감, 방패 용사식 | `game/game-character-sheet.md` | 인물 중심, 원형 레벨 게이지, 능력치 목록 | Play |
| game fantasy inventory | 판타지 장비 인벤토리 | `game/game-fantasy-inventory.md` | 슬롯 격자, 장비 실루엣, 탭과 조작 안내 | Play |
