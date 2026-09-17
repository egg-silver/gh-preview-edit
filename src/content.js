import { createRenderer, createTurndown, blockToMarkdown, spliceLines, ATTR } from './markdown.js';

const md = createRenderer();
const td = createTurndown();

// 새 PR 작성 폼은 <tab-container>, 기존 PR 본문 편집 폼은 옛 마크업(div + write-selected/preview-selected 클래스).
const CONTAINER_SEL = '.js-previewable-comment-form';
const PREVIEW_PANEL_SEL = '.js-preview-panel, .preview-content';
const BODY_SEL = 'textarea[name="pull_request[body]"], textarea[name="issue[body]"]';
const BLOCK_SEL = `[${ATTR}]`;
const COMMIT_DELAY = 250;

function isPrPage() {
  return /\/compare\/|\/pull\/\d+/.test(location.pathname);
}

function attach(container) {
  if (container.dataset.gpeAttached) return;
  const textarea = container.querySelector(BODY_SEL);
  const tablist = container.querySelector('[role="tablist"]');
  const previewTab = tablist && tablist.querySelector('.js-preview-tab, .preview-tab');
  const previewPanel = container.querySelector(PREVIEW_PANEL_SEL);
  if (!textarea || !previewTab || !previewPanel) return;
  container.dataset.gpeAttached = '1';

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.className = 'btn-link tabnav-tab gpe-tab';
  tab.textContent = 'Edit';
  previewTab.after(tab);

  const panel = document.createElement('div');
  if (container.tagName === 'TAB-CONTAINER') panel.setAttribute('role', 'tabpanel');
  panel.hidden = true;
  panel.className = 'gpe-panel CommentBox-comment overflow-auto';
  panel.innerHTML = `
    <div class="gpe-body comment-body markdown-body"></div>
    <div class="gpe-hint">고친 블록만 마크다운으로 반영됩니다. 접힘 블록(details) 제목과 주석은 Write 탭에서 수정하세요.</div>
  `;
  const body = panel.querySelector('.gpe-body');
  // tab-container가 탭↔패널을 순서로 짝짓는다. 프리뷰 패널 바로 뒤가 세 번째 자리.
  previewPanel.after(panel);

  const state = { src: '', blocks: [], timers: new Map() };

  function render() {
    flushAll();
    state.src = textarea.value.replace(/\r\n?/g, '\n');
    body.innerHTML = md.render(state.src);
    body.querySelectorAll('details').forEach((d) => { d.open = true; });
    state.blocks = [...body.querySelectorAll(BLOCK_SEL)].map((el) => {
      const [start, end] = el.getAttribute(ATTR).split('-').map(Number);
      return { el, start, end };
    });
  }

  function blockOf(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const target = el && el.closest(BLOCK_SEL);
    return state.blocks.find((b) => b.el === target) || null;
  }

  function commit(block) {
    state.timers.delete(block);
    const markdown = blockToMarkdown(td, block.el);
    const oldEnd = block.end;
    const { src, delta } = spliceLines(state.src, block.start, block.end, markdown);
    if (delta === 0 && src === state.src) return;
    state.src = src;
    block.end += delta;
    for (const b of state.blocks) {
      if (b !== block && b.start >= oldEnd) {
        b.start += delta;
        b.end += delta;
      }
    }
    textarea.value = src;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function schedule(block) {
    clearTimeout(state.timers.get(block));
    state.timers.set(block, setTimeout(() => commit(block), COMMIT_DELAY));
  }

  function flushAll() {
    for (const [block, timer] of state.timers) {
      clearTimeout(timer);
      commit(block);
    }
    state.timers.clear();
  }

  body.addEventListener('input', (e) => {
    const block = blockOf(e.target);
    if (block) schedule(block);
  });
  body.addEventListener('focusout', flushAll);

  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const block = blockOf(e.target);
    if (!block) return;
    if (/^H[1-6]$/.test(block.el.tagName)) {
      e.preventDefault();
      return;
    }
    const sel = document.getSelection();
    const anchor = sel && sel.anchorNode;
    const anchorEl = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
    const inListItem = anchorEl && anchorEl.closest('li');
    // 리스트 안 Enter는 브라우저 기본(새 항목). 그 외는 <br> 하나. GitHub 본문은 줄바꿈 하나가 그대로 줄바꿈이다.
    if (inListItem && !e.shiftKey) return;
    e.preventDefault();
    document.execCommand('insertLineBreak');
  });

  body.addEventListener('paste', (e) => {
    if (!blockOf(e.target)) return;
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // 링크 클릭은 contenteditable 안에서는 이동하지 않지만, summary 토글은 막지 않는다.
  body.addEventListener('click', (e) => {
    if (e.target.closest('a')) e.preventDefault();
  });

  function selectEdit() {
    flushAll();
    container.classList.remove('write-selected', 'preview-selected');
    container.classList.add('gpe-selected');
    for (const t of tablist.querySelectorAll('[role="tab"]')) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.classList.toggle('selected', on);
    }
    for (const p of container.querySelectorAll('[role="tabpanel"]')) p.hidden = p !== panel;
    panel.hidden = false;
    render();
  }

  function deselectEdit() {
    if (!container.classList.contains('gpe-selected')) return;
    flushAll();
    container.classList.remove('gpe-selected');
    tab.setAttribute('aria-selected', 'false');
    tab.classList.remove('selected');
    panel.hidden = true;
  }

  tab.addEventListener('click', selectEdit);
  tablist.addEventListener('click', (e) => {
    const t = e.target.closest('[role="tab"]');
    if (t && t !== tab) deselectEdit();
  });
  // tab-container가 키보드 등으로 탭을 바꾼 경우.
  container.addEventListener('tab-container-changed', () => {
    if (tab.getAttribute('aria-selected') !== 'true') deselectEdit();
  });

  const form = textarea.closest('form');
  if (form) form.addEventListener('submit', flushAll, true);
}

function scan() {
  if (!isPrPage()) return;
  document.querySelectorAll(CONTAINER_SEL).forEach(attach);
}

let scheduled = 0;
function scheduleScan() {
  if (scheduled) return;
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    scan();
  });
}

scan();
document.addEventListener('turbo:load', scan);
document.addEventListener('turbo:render', scan);
new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
