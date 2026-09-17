import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

export const ATTR = 'data-gpe-lines';

// 최상위 블록 중 편집 대상. html_block은 래핑하면 <details> 중첩이 깨져서 제외, hr은 텍스트가 없어 제외.
const TAGGED = new Set([
  'paragraph_open', 'heading_open', 'bullet_list_open', 'ordered_list_open',
  'blockquote_open', 'table_open',
]);
const WRAPPED = new Set(['fence', 'code_block']);

const PLACEHOLDER = '\u0000';

export function createRenderer() {
  const md = new MarkdownIt({ html: true, linkify: true, breaks: true }).use(taskLists);

  md.core.ruler.push('gpe_lines', (state) => {
    const lines = state.src.split('\n');
    for (const tok of state.tokens) {
      if (tok.type === 'th_open' || tok.type === 'td_open') {
        // turndown-gfm은 align 속성만 읽는다.
        const style = tok.attrGet('style');
        const m = style && /text-align:\s*(left|center|right)/.exec(style);
        if (m) tok.attrSet('align', m[1]);
        continue;
      }
      if (tok.level !== 0 || !tok.map) continue;
      let [start, end] = tok.map;
      // 리스트/인용 map은 뒤따르는 빈 줄을 포함할 수 있다. 그대로 갈아끼우면 다음 블록이 lazy continuation으로 붙는다.
      while (end > start && lines[end - 1].trim() === '') end -= 1;
      const range = `${start}-${end}`;
      if (TAGGED.has(tok.type)) {
        tok.attrSet(ATTR, range);
        tok.attrSet('contenteditable', 'true');
      } else if (WRAPPED.has(tok.type)) {
        tok.meta = { ...(tok.meta || {}), gpe: range };
      }
    }
  });

  for (const type of WRAPPED) {
    const orig = md.renderer.rules[type];
    md.renderer.rules[type] = (tokens, idx, options, env, self) => {
      const inner = orig(tokens, idx, options, env, self);
      const range = tokens[idx].meta && tokens[idx].meta.gpe;
      if (!range) return inner;
      return `<div ${ATTR}="${range}" contenteditable="true">${inner}</div>`;
    };
  }

  return md;
}

// contenteditable 편집 후 pre 안에는 <br>/<div>가 생긴다. textContent는 이걸 잃는다.
function codeText(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += child.nodeValue;
    else if (child.nodeName === 'BR') out += '\n';
    else if (child.nodeType === 1) {
      const isBlock = /^(DIV|P)$/.test(child.nodeName);
      out += (isBlock && out && !out.endsWith('\n') ? '\n' : '') + codeText(child);
    }
  }
  return out;
}

function isWordChar(ch) {
  return /[\p{L}\p{N}]/u.test(ch || '');
}

export function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    br: '',
  });
  td.use(gfm);

  // 기본 escape는 단어 안의 _ 와 [ ] 까지 전부 이스케이프해 원문이 지저분해진다.
  const baseEscape = td.escape.bind(td);
  td.escape = (text) =>
    baseEscape(text.replace(/_/g, PLACEHOLDER))
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(new RegExp(PLACEHOLDER, 'g'), (ch, offset, s) => {
        const inWord = isWordChar(s[offset - 1]) && isWordChar(s[offset + 1]);
        return inWord ? '_' : '\\_';
      });

  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node, options) {
      let prefix = options.bulletListMarker + ' ';
      const parent = node.parentNode;
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '. ';
      }
      const indent = ' '.repeat(prefix.length);
      content = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/^(\[[ x]\])\s+/, '$1 ')
        .replace(/\n/gm, '\n' + indent);
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    },
  });

  // 연속 <br>는 문단 나눔. turndown은 인접 줄바꿈을 max로 합치므로 첫 br이 2개를 내야 한다.
  td.addRule('lineBreak', {
    filter: 'br',
    replacement(content, node) {
      return node.nextSibling && node.nextSibling.nodeName === 'BR' ? '\n\n' : '\n';
    },
  });

  td.addRule('bareLink', {
    filter(node) {
      if (node.nodeName !== 'A' || !node.getAttribute('href')) return false;
      const href = node.getAttribute('href');
      const text = node.textContent.trim();
      return text === href || text === href.replace(/\/$/, '') || href === 'mailto:' + text;
    },
    replacement(content, node) {
      return node.textContent.trim();
    },
  });

  td.addRule('fencedCodeBlock', {
    filter(node, options) {
      return options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE'
        && node.firstChild && node.firstChild.nodeName === 'CODE';
    },
    replacement(content, node) {
      const className = node.firstChild.getAttribute('class') || '';
      const language = (className.match(/language-(\S+)/) || [null, ''])[1];
      const code = codeText(node.firstChild).replace(/\n$/, '');
      return `\n\n\`\`\`${language}\n${code}\n\`\`\`\n\n`;
    },
  });

  td.addRule('sizedImage', {
    filter(node) {
      return node.nodeName === 'IMG'
        && (node.hasAttribute('width') || node.hasAttribute('height') || node.hasAttribute('style'));
    },
    replacement(content, node) {
      return node.outerHTML;
    },
  });

  td.keep(['kbd', 'sup', 'sub', 'details', 'summary', 'video']);
  return td;
}

export function blockToMarkdown(td, elementOrHtml) {
  return td.turndown(elementOrHtml).trim();
}

export function spliceLines(src, start, end, replacement) {
  const lines = src.split('\n');
  const rep = replacement === '' ? [] : replacement.split('\n');
  lines.splice(start, end - start, ...rep);
  return { src: lines.join('\n'), delta: rep.length - (end - start) };
}
