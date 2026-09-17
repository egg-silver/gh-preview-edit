# GitHub PR Preview Edit

PR 본문 작성 화면(Write / Preview 탭)에 **Edit** 탭을 추가한다. 렌더된 화면에서 문장을 직접 고치면, 고친 블록만 마크다운으로 되돌려 textarea에 반영한다. 안 건드린 블록은 원본 그대로 유지된다.

## 설치

```bash
npm install
npm run build        # dist/content.js 생성
```

1. Chrome에서 `chrome://extensions` 열기
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더(`gh-preview-edit`) 선택
4. GitHub PR 작성/편집 화면을 새로고침하면 Write · Preview 옆에 **Edit** 탭이 생긴다

코드를 고친 뒤에는 `npm run build` → `chrome://extensions`에서 새로고침 아이콘.

## 동작 범위

- 적용: `github.com`의 새 PR 작성(`/compare/...`)과 기존 PR 본문 편집(`/pull/N`). 코멘트 입력창에는 붙지 않는다.
- 편집 가능: 문단, 헤딩, 리스트(체크박스 포함), 인용, 표, 코드 블록.
- 편집 불가(보이기만 함): `<details>`/`<summary>` 태그 줄, HTML 주석 등 raw HTML 블록. 이건 Write 탭에서 고친다. details 안에 빈 줄로 구분된 문단·표는 편집된다.

## 키

- **Enter**: 줄바꿈 하나(GitHub 본문은 줄바꿈 하나가 그대로 줄바꿈). 두 번 치면 문단이 나뉜다.
- 리스트 안 **Enter**: 새 항목. **Shift+Enter**: 항목 안 줄바꿈.
- 헤딩에서 Enter는 무시된다.
- 붙여넣기는 항상 서식 없는 텍스트로 들어간다.

## 알아둘 것

- 렌더는 GitHub 서버가 아니라 확장이 직접 한다(markdown-it). @멘션, #123 자동 링크, 이모지 코드 같은 GitHub 전용 문법은 Edit 탭에서 평범한 글자로 보인다. 최종 확인은 Preview 탭으로.
- 고친 블록은 turndown으로 다시 마크다운이 되므로 서식이 정규화된다. 헤딩은 `##`, 리스트 마커는 `-`, 강조는 `_`/`**`, 코드 블록은 백틱 3개. 단어 밖의 `_`나 `*`에는 `\`가 붙을 수 있다.
- 편집 반영은 입력이 멈춘 뒤 250ms, 또는 포커스가 빠지거나 탭을 바꾸거나 폼을 제출할 때 즉시.

## 개발

```bash
npm test             # 마크다운 변환 라운드트립 테스트
npm run watch        # 저장할 때마다 dist/content.js 재빌드
```

- `src/markdown.js`: 렌더(블록마다 원본 줄 범위 기록) + HTML→마크다운 규칙 + 줄 범위 갈아끼우기
- `src/content.js`: GitHub DOM에 탭/패널 삽입, 편집 이벤트 → textarea 반영
