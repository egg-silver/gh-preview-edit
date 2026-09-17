import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer, createTurndown, blockToMarkdown, spliceLines, ATTR } from '../src/markdown.js';

const md = createRenderer();
const td = createTurndown();

const TEMPLATE = [
  '## Jira Ticket',                                   // 0
  '- Ticket: [EDU-687](https://goorm.atlassian.net/browse/EDU-687)', // 1
  '',                                                 // 2
  '## UI 스크린샷',                                    // 3
  '<!-- 해당 없으면 이 섹션 삭제 -->',                   // 4
  '',                                                 // 5
  '고등(inh) 전시 사이트 기준입니다. Before는 prod( `aidt/master` ), After는 STG 프리뷰입니다.', // 6
  '',                                                 // 7
  '<details>',                                        // 8
  '<summary><b>도움 요청 탭</b> · <code>새로 고침</code></summary>', // 9
  '',                                                 // 10
  '| Before | After |',                               // 11
  '| --- | --- |',                                    // 12
  '| a | b |',                                        // 13
  '',                                                 // 14
  '</details>',                                       // 15
  '',                                                 // 16
  '## 작업 배경',                                      // 17
  '도움요청이 `help_ticket` 에서 채팅으로 옮겨가면서 help_ticket이 아닌 chat_room을 바라보도록 로직 수정', // 18
  '',                                                 // 19
  '- 첫째',                                            // 20
  '- 둘째',                                            // 21
  '  - 중첩',                                          // 22
  '',                                                 // 23
  '```js',                                            // 24
  'const a = 1;',                                     // 25
  '',                                                 // 26
  'const b = 2;',                                     // 27
  '```',                                              // 28
  '',                                                 // 29
  '_(작성)_',                                          // 30
].join('\n');

function ranges(html) {
  return [...html.matchAll(new RegExp(`${ATTR}="(\\d+)-(\\d+)"`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
}

test('최상위 블록마다 줄 범위가 붙고, 리스트 뒤 빈 줄은 범위에 포함되지 않는다', () => {
  const html = md.render(TEMPLATE);
  assert.deepEqual(ranges(html), [
    [0, 1],   // h2
    [1, 2],   // ticket list (빈 줄 2 제외)
    [3, 4],   // h2
    [6, 7],   // paragraph
    [11, 14], // table (details 안)
    [17, 18], // h2
    [18, 19], // paragraph
    [20, 23], // list
    [24, 29], // fence
    [30, 31], // italic paragraph
  ]);
});

test('html_block(details, 주석)은 태그되지 않고 그대로 나온다', () => {
  const html = md.render(TEMPLATE);
  assert.match(html, /<details>\n<summary><b>도움 요청 탭<\/b>/);
  assert.match(html, /<!-- 해당 없으면 이 섹션 삭제 -->/);
  assert.doesNotMatch(html, /<details[^>]*data-gpe-lines/);
});

test('문단 수정: 단어 안 밑줄과 인라인 코드가 그대로 유지된다', () => {
  const out = blockToMarkdown(td, '<p>도움요청이 <code>help_ticket</code> 에서 채팅으로 옮겨가면서 help_ticket이 아닌 chat_room을 바라보도록 로직 수정!</p>');
  assert.equal(out, '도움요청이 `help_ticket` 에서 채팅으로 옮겨가면서 help_ticket이 아닌 chat_room을 바라보도록 로직 수정!');
});

test('단어 밖 밑줄(강조)은 이스케이프한다', () => {
  assert.equal(blockToMarkdown(td, '<p>_(작성)_</p>'), '\\_(작성)\\_');
  assert.equal(blockToMarkdown(td, '<p><em>(작성)</em></p>'), '_(작성)_');
});

test('리스트: 마커 뒤 공백 하나, 중첩은 2칸 들여쓰기', () => {
  const out = blockToMarkdown(td, '<ul><li>첫째</li><li>둘째<ul><li>중첩</li></ul></li></ul>');
  assert.equal(out, '- 첫째\n- 둘째\n  - 중첩');
});

test('번호 리스트와 체크박스', () => {
  assert.equal(blockToMarkdown(td, '<ol><li>a</li><li>b</li></ol>'), '1. a\n2. b');
  const html = md.render('- [ ] todo\n- [x] done');
  assert.equal(blockToMarkdown(td, html), '- [ ] todo\n- [x] done');
});

test('헤딩은 ATX, 링크는 인라인, 맨몸 URL은 그대로', () => {
  assert.equal(blockToMarkdown(td, '<h2>Jira Ticket</h2>'), '## Jira Ticket');
  assert.equal(blockToMarkdown(td, '<p><a href="https://x.dev/a">EDU-1</a></p>'), '[EDU-1](https://x.dev/a)');
  assert.equal(blockToMarkdown(td, md.render('https://x.dev/a 참고')), 'https://x.dev/a 참고');
});

test('문단 안 <br>은 줄바꿈 하나로', () => {
  assert.equal(blockToMarkdown(td, '<p>첫 줄<br>둘째 줄</p>'), '첫 줄\n둘째 줄');
  assert.equal(blockToMarkdown(td, '<p>첫 줄<br><br>둘째 문단</p>'), '첫 줄\n\n둘째 문단');
});

test('코드 블록: 언어와 빈 줄, 편집으로 생긴 <br>을 유지', () => {
  const rendered = md.render('```js\nconst a = 1;\n\nconst b = 2;\n```');
  assert.equal(blockToMarkdown(td, rendered), '```js\nconst a = 1;\n\nconst b = 2;\n```');
  assert.equal(
    blockToMarkdown(td, '<div><pre><code class="language-js">const a = 1;<br>const c = 3;</code></pre></div>'),
    '```js\nconst a = 1;\nconst c = 3;\n```',
  );
});

test('표: 정렬 유지', () => {
  const rendered = md.render('| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |');
  assert.equal(blockToMarkdown(td, rendered), '| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |');
});

test('크기 지정 이미지와 kbd는 HTML 그대로', () => {
  assert.equal(blockToMarkdown(td, '<p><img width="400" src="https://x/a.png" alt="a"></p>'), '<img width="400" src="https://x/a.png" alt="a">');
  assert.equal(blockToMarkdown(td, '<p>눌러 <kbd>Enter</kbd></p>'), '눌러 <kbd>Enter</kbd>');
});

test('블록 하나만 갈아끼우면 나머지는 바이트 그대로', () => {
  const edited = blockToMarkdown(td, '<p>고등(inh) 전시 사이트 기준입니다. Before는 prod( <code>aidt/master</code> ), After는 STG입니다.</p>');
  const { src, delta } = spliceLines(TEMPLATE, 6, 7, edited);
  const lines = TEMPLATE.split('\n');
  lines[6] = '고등(inh) 전시 사이트 기준입니다. Before는 prod( `aidt/master` ), After는 STG입니다.';
  assert.equal(src, lines.join('\n'));
  assert.equal(delta, 0);
});

test('줄 수가 바뀌면 delta가 나온다', () => {
  const { src, delta } = spliceLines('a\n\nb\nc\n\nd', 2, 4, 'b');
  assert.equal(src, 'a\n\nb\n\nd');
  assert.equal(delta, -1);
  assert.equal(spliceLines('a\n\nb', 2, 3, '').src, 'a\n');
});
