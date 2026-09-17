# PR 본문 프리뷰 편집 확장 설계

## 목표

GitHub PR 본문(새 PR 작성, 기존 PR 본문 편집)을 렌더된 화면에서 문장 단위로 고치고, 결과가 마크다운으로 textarea에 반영되게 한다. 문서 구조 편집(헤딩 추가, 서식 툴바)은 범위 밖. github.com만 지원.

## 핵심 요구

- 안 건드린 블록의 마크다운은 바이트 하나도 바뀌지 않는다. PR 템플릿(`<details>`, HTML 주석, 표)이 그대로 살아야 한다.
- 별도 서버·빌드 도구 없이 크롬 확장(MV3, content script 하나)으로 끝난다.

## 접근

자체 렌더 + 블록 단위 되돌리기.

1. textarea 마크다운을 markdown-it으로 파싱·렌더한다. 최상위 블록 토큰(paragraph, heading, list, blockquote, table, fence)의 `map`(줄 범위)을 `data-gpe-lines="s-e"`로 DOM에 남기고 `contenteditable`을 준다.
2. 블록에서 `input`이 발생하면 그 블록 요소만 turndown으로 마크다운화하고, 원본의 `[s, e)` 줄만 갈아끼운다. 줄 수가 달라지면 뒤 블록들의 범위를 delta만큼 옮긴다.
3. 갈아끼운 문자열을 textarea.value에 쓰고 `input`/`change` 이벤트를 쏘아 GitHub 폼 상태를 갱신한다.

## DOM 통합

- 컨테이너: `tab-container.js-previewable-comment-form` 중 `textarea[name="pull_request[body]"]`(또는 `/pull/` 페이지의 `issue[body]`)를 가진 것.
- `tab-container`는 `[role=tab]`과 `[role=tabpanel]`을 순서로 짝짓는다. Preview 탭 뒤에 Edit 탭, Preview 패널 뒤에 Edit 패널을 넣으면 GitHub 쪽 탭 전환을 그대로 탄다. `tab-container-changed`에서 Edit이 선택됐으면 렌더, `tab-container-change`(전환 직전)에서 미반영 편집을 flush. 이벤트가 안 오는 경우 클릭 후 수동 전환 fallback.
- Turbo 네비게이션과 늦게 붙는 폼을 위해 `turbo:load` + MutationObserver로 재스캔.

## 변환 규칙(turndown)

- `headingStyle: atx`, `bulletListMarker: '-'`, `codeBlockStyle: fenced`, `<br>` → `\n`, 연속 `<br>` → 문단 나눔.
- 리스트 항목은 `- ` 뒤 공백 하나, 중첩 들여쓰기는 마커 폭.
- 단어 안 `_`(help_ticket)와 `[`, `]`는 이스케이프하지 않는다.
- 텍스트가 URL과 같은 링크는 맨몸 URL로.
- 크기 속성 있는 `<img>`, `kbd/sup/sub/details/summary/video`는 HTML 그대로.
- 코드 블록 텍스트는 `<br>`/`<div>`를 줄바꿈으로 읽는다(contenteditable 편집 잔재).
- 표 정렬은 markdown-it의 `style`을 `align` 속성으로 옮겨 turndown-gfm이 읽게 한다.

## 편집 불가 영역

html_block 토큰(`<details>`, `<summary>` 줄, `<!-- -->`)은 래핑하면 브라우저 파서가 details 중첩을 깨므로 태그하지 않고 raw로 둔다. 결과적으로 읽기 전용. details 안에서 빈 줄로 분리된 문단·표는 별도 토큰이라 편집된다. 패널 하단에 힌트 한 줄.

## 키 처리

- Enter: 헤딩이면 무시, 리스트 항목 안이면 브라우저 기본(새 항목), 그 외 `insertLineBreak`.
- 붙여넣기: text/plain만 `insertText`.

## 한계

- 렌더가 GitHub와 100% 같지 않다(@멘션, #이슈 자동링크, :emoji:). 최종 확인은 Preview 탭.
- 편집한 블록은 서식이 정규화된다(마커·강조 기호·이스케이프).
- 사용자 본인의 raw HTML을 innerHTML로 그대로 렌더한다. 본인 PR 본문이므로 허용.

## 테스트

`test/markdown.test.js`(node:test): 줄 범위 태깅, 리스트 뒤 빈 줄 제외, 각 변환 규칙, 블록 하나 갈아끼웠을 때 나머지 바이트 동일성.
