const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { join } = require('node:path');

const session = `stars-interaction-test-${process.pid}`;
let server;
let origin;

function browser(...args) {
  const result = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 30000,
  }));
  if (!result.success) throw new Error(result.error || 'Browser command failed');
  return result.data?.result;
}

function current() {
  return browser('eval', `(() => ({
    title: document.querySelector('#gst-toolbar h1')?.textContent.trim(),
    toolbar: !!document.querySelector('#gst-toolbar'),
    query: document.querySelector('#gst-query')?.value,
    type: document.querySelector('#gst-type')?.value,
    language: document.querySelector('#gst-language')?.value,
    sort: document.querySelector('#gst-sort')?.value,
    cards: Array.from(document.querySelectorAll('#user-list-repositories > .col-12, #user-starred-repos :is(.col-lg-9, .col-lg-12) > .col-12'))
      .map(card => card.querySelector('h2 a, h3 a')?.textContent.trim()),
    status: document.querySelector('#gst-results-status')?.textContent.trim()
  }))()`);
}

function chooseFilter(id, value) {
  browser('click', `#gst-${id}-menu summary`);
  browser('click', `#gst-${id}-menu [data-value="${value}"]`);
}

function openList(slug, title) {
  const path = `/stars/Fixture/lists/${slug}`;
  if (browser('eval', 'location.pathname') !== path) browser('click', `a[href="${path}"]`);
  browser('wait', '--fn', `location.pathname === '${path}' && document.querySelector('#gst-toolbar h1')?.textContent.trim() === '${title}'`);
}

test.before(async () => {
  server = spawn(process.execPath, [join(__dirname, 'fixture-server.cjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  const [output] = await once(server.stdout, 'data');
  origin = output.toString().trim();
  browser('open', `${origin}/Fixture?tab=stars`);
});
test.after(() => {
  try { browser('close'); } finally { server?.kill(); }
});

test('starts before the body exists and reveals the enhanced page after initialization', () => {
  browser('open', `${origin}/Fixture?tab=stars&early=1`);
  assert.deepEqual(browser('eval', 'window.__earlyState'), { body: false, pending: true, style: true });
  assert.equal(browser('eval', 'window.__initialLayoutVisibility'), 'hidden');
  browser('wait', '--fn', `!!document.querySelector('#gst-toolbar')`);
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('.Layout')).visibility`), 'visible');
  assert.equal(browser('eval', `document.documentElement.classList.contains('gst-pending')`), false);
  assert.equal(browser('eval', `document.body.classList.contains('gst-active')`), true);
  browser('open', `${origin}/unrelated?early=1`);
  assert.deepEqual(browser('eval', 'window.__earlyState'), { body: false, pending: false, style: false });
  assert.equal(browser('eval', `!!document.querySelector('#gst-toolbar')`), false);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('reveals the original page if the expected Stars layout is absent', () => {
  browser('open', `${origin}/Fixture?tab=stars&early=1&missing_frame=1`);
  assert.equal(browser('eval', `document.documentElement.classList.contains('gst-pending')`), false);
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('.Layout')).visibility`), 'visible');
  assert.equal(browser('eval', `document.querySelector('main p')?.textContent`), 'Profile unavailable');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('provides one shared title and filter toolbar and hides duplicated overview controls', () => {
  const state = current();
  assert.equal(state.toolbar, true);
  assert.equal(state.title, 'All repositories');
  assert.ok(browser('eval', `getComputedStyle(document.querySelector('#user-profile-frame > div > .d-flex.flex-column')).display === 'none'`));
  assert.ok(browser('eval', `!!document.querySelector('#gst-manage')`));
});

test('removes the redundant sidebar heading and gives the layout vertical breathing room', () => {
  const state = browser('eval', `(() => {
    const nav = document.getElementById('gst-navigation');
    const layout = document.querySelector('.gst-layout');
    const style = getComputedStyle(layout);
    return { heading: !!nav.querySelector('.gst-title'), owner: !!nav.querySelector('.gst-owner'),
      top: parseFloat(style.paddingTop), bottom: parseFloat(style.paddingBottom),
      links: [...nav.querySelectorAll('.gst-link')].map(link => link.textContent.trim()) };
  })()`);
  assert.equal(state.heading, false);
  assert.equal(state.owner, false);
  assert.ok(state.top >= 24 && state.bottom >= 24);
  assert.match(state.links[0], /All repositories/);
  assert.ok(browser('eval', `!!document.querySelector('#gst-manage')`));
});

test('places the overview and list repository counts alongside the title', () => {
  const position = () => browser('eval', `(() => {
    const heading = document.querySelector('#gst-toolbar h1');
    const count = document.querySelector('#gst-results-status');
    const a = heading.getBoundingClientRect(), b = count.getBoundingClientRect();
    return { text: count.textContent.trim(), sameRow: b.left >= a.right && b.top < a.bottom && b.bottom > a.top,
      hasIcon: !!count.querySelector('svg'),
      oldCount: [...document.querySelectorAll('#user-profile-frame > div > .tmp-my-3 > .color-fg-muted')]
        .some(e => /\\d+ repositories/.test(e.textContent)),
      description: document.querySelector('#user-profile-frame > div > .tmp-my-3 > .color-fg-muted')?.textContent.trim() };
  })()`);
  assert.equal(position().text, '40 repositories');
  assert.equal(position().hasIcon, false);
  assert.equal(position().sameRow, true);
  openList('ai', 'AI');
  assert.equal(position().text, '3 repositories');
  assert.equal(position().hasIcon, false);
  assert.equal(position().sameRow, true);
  assert.equal(position().oldCount, false);
  assert.equal(position().description, 'List description');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('keeps the gap below the filters consistent between overview and categories', () => {
  browser('set', 'viewport', '1280', '800');
  const gap = selector => browser('eval', `(() => {
    const form = document.querySelector('#gst-filters').getBoundingClientRect();
    const card = document.querySelector('${selector} > .col-12').getBoundingClientRect();
    return Math.round(card.top - form.bottom);
  })()`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const overviewGap = gap('#user-starred-repos .col-lg-9');
  openList('ai', 'AI');
  browser('eval', `document.querySelector('#user-profile-frame > div > .tmp-my-3 > .color-fg-muted').hidden = true`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(gap('#user-list-repositories'), overviewGap);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '3 repositories'`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(gap('#user-list-repositories'), overviewGap);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('shows All on the default type and language buttons', () => {
  const labels = () => browser('eval', `['type', 'language'].map(id => document.querySelector('#gst-' + id + '-menu summary').textContent.trim())`);
  assert.deepEqual(labels(), ['Type: All', 'Language: All']);
  chooseFilter('type', 'fork');
  chooseFilter('language', 'Go');
  assert.deepEqual(labels(), ['Type: Forks', 'Language: Go']);
  chooseFilter('type', '');
  chooseFilter('language', '');
  assert.deepEqual(labels(), ['Type: All', 'Language: All']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('keeps the native list dialog invisible until its position is corrected', () => {
  const frames = browser('eval', `new Promise(resolve => {
    const actions = document.querySelector('#user-starred-repos .col-12 .float-right');
    actions.insertAdjacentHTML('beforeend', '<user-list-menu><select-panel><button aria-haspopup="dialog" aria-controls="fixture-repo-menu">Lists</button><dialog id="fixture-repo-menu">Lists</dialog></select-panel></user-list-menu>');
    const button = actions.querySelector('user-list-menu button');
    const dialog = actions.querySelector('dialog');
    button.addEventListener('click', () => {
      dialog.show();
      const right = button.getBoundingClientRect().right;
      dialog.style.cssText = 'position: fixed; left: ' + right + 'px; right: auto; top: 100px; margin: 0; width: 320px; box-sizing: border-box';
      dialog.dataset.expectedLeft = Math.max(0, right - 320);
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { dialog.style.left = dialog.dataset.expectedLeft + 'px'; }))));
    });
    const frames = [];
    const sample = () => {
      frames.push({ left: dialog.getBoundingClientRect().left, expected: Number(dialog.dataset.expectedLeft), opacity: getComputedStyle(dialog).opacity, open: dialog.open });
      if (frames.length === 6) resolve(frames); else requestAnimationFrame(sample);
    };
    button.click();
    requestAnimationFrame(sample);
  })`);
  assert.ok(frames.slice(0, 3).every(frame => frame.opacity === '0' && frame.left !== frame.expected));
  assert.equal(frames.at(-1).left, frames.at(-1).expected);
  assert.equal(frames.at(-1).opacity, '1');
  assert.ok(frames.every(frame => frame.open));
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('offers three sorting options with Recently starred as the default', () => {
  const menu = browser('eval', `(() => ({
    options: [...document.querySelectorAll('#gst-sort-menu [role="menuitemradio"]')].map(item => item.textContent.trim()),
    checked: document.querySelector('#gst-sort-menu [aria-checked="true"]')?.textContent.trim(),
    summary: document.querySelector('#gst-sort-menu summary').textContent.trim(),
    value: document.querySelector('#gst-sort').value
  }))()`);
  assert.deepEqual(menu.options, ['Recently starred', 'Recently active', 'Most stars']);
  assert.equal(menu.checked, 'Recently starred');
  assert.equal(menu.summary, 'Sort: Recently starred');
  assert.equal(menu.value, 'default');
});

test('uses the GitHub scope total without counting pages when only sorting', () => {
  browser('eval', `(() => {
    const original = window.fetch;
    window.__sortedRequests = [];
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('sort') === 'stars') window.__sortedRequests.push(url.searchParams.get('page') || '1');
      return original(input, ...args);
    };
  })()`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `document.querySelector('#user-starred-repos .col-12 h3 a')?.textContent.trim() === 'bulk/repo-1'`);
  assert.equal(current().status, '40 repositories');
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('uses an exact accessible GitHub counter instead of an abbreviated one', () => {
  browser('open', `${origin}/Fixture?tab=stars&compact_counter=1`);
  chooseFilter('sort', 'stars');
  assert.equal(current().status, '1,234 repositories');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('counts pages when the GitHub scope total is unavailable', () => {
  browser('open', `${origin}/Fixture?tab=stars&without_counter=1`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '40 repositories'`);
  assert.equal(current().cards.length, 30);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('uses the list total immediately when only sorting a category', () => {
  openList('ai', 'AI');
  browser('wait', '--fn', `!!document.querySelector('#gst-navigation').__gstLists`);
  browser('eval', `(() => {
    const original = window.fetch;
    window.__sortedRequests = [];
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('sort') === 'updated') {
        window.__sortedRequests.push(url.searchParams.get('page') || '1');
        return new Promise(() => {});
      }
      return original(input, ...args);
    };
  })()`);
  chooseFilter('sort', 'updated');
  assert.equal(current().status, '3 repositories');
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('shows the first GitHub-sorted page without waiting for later pages', () => {
  chooseFilter('type', 'source');
  browser('eval', `(() => {
    const original = window.fetch;
    window.__sortedRequests = [];
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('sort') === 'stars') {
        window.__sortedRequests.push(url.searchParams.get('page') || '1');
        if (url.searchParams.get('page') === '2') return new Promise((resolve, reject) => {
          window.__releaseCount = () => original(input, ...args).then(resolve, reject);
        });
      }
      return original(input, ...args);
    };
  })()`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `document.querySelector('#user-starred-repos .col-12 h3 a')?.textContent.trim() === 'bulk/repo-1'`);
  assert.equal(current().cards.length, 30);
  assert.equal(current().status, 'Counting repositories…');
  browser('wait', '--fn', `typeof window.__releaseCount === 'function'`);
  browser('eval', 'window.__releaseCount()');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '36 matching repositories'`);
  assert.equal(current().cards.length, 30);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 36`);
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1', '2']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('shares the in-flight background request when the user scrolls early', () => {
  chooseFilter('type', 'source');
  browser('eval', `(() => {
    const original = window.fetch;
    window.__sortedRequests = [];
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('sort') === 'stars') {
        window.__sortedRequests.push(url.searchParams.get('page') || '1');
        if (url.searchParams.get('page') === '2') return new Promise((resolve, reject) => {
          window.__releaseCount = () => original(input, ...args).then(resolve, reject);
        });
      }
      return original(input, ...args);
    };
  })()`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `typeof window.__releaseCount === 'function' && !!document.querySelector('.gst-stream')`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelector('.gst-stream')?.textContent.includes('Loading')`);
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1', '2']);
  browser('eval', 'window.__releaseCount()');
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 36`);
  assert.equal(current().status, '36 matching repositories');
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1', '2']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('retains results and retries a failed background count', () => {
  chooseFilter('type', 'source');
  browser('eval', `(() => {
    const original = window.fetch;
    let fail = true;
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (fail && url.searchParams.get('sort') === 'stars' && url.searchParams.get('page') === '2') {
        fail = false; return Promise.resolve(new Response('', { status: 500 }));
      }
      return original(input, ...args);
    };
  })()`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `!!document.querySelector('#gst-count-retry')`);
  assert.equal(current().cards.length, 30);
  assert.match(current().status, /Could not count/);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `!!document.querySelector('.gst-stream .gst-retry')`);
  assert.match(current().status, /Could not count/);
  browser('click', '#gst-count-retry');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '36 matching repositories'`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 36`);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('shows sorted category matches without waiting for the rest of all Stars', () => {
  openList('ai', 'AI');
  browser('wait', '--fn', `!!document.querySelector('#gst-navigation').__gstLists`);
  chooseFilter('sort', 'updated');
  browser('wait', '--fn', `!!document.querySelector('#user-list-repositories .col-12 h3 a')`);
  browser('eval', `(() => {
    const original = window.fetch;
    window.__sortedRequests = [];
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('sort') === 'updated') {
        window.__sortedRequests.push(url.searchParams.get('page') || '1');
        if (url.searchParams.get('page') === '2') return new Promise((resolve, reject) => {
          window.__releaseCount = () => original(input, ...args).then(resolve, reject);
        });
      }
      return original(input, ...args);
    };
  })()`);
  chooseFilter('type', 'source');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('Counting repositories')`);
  assert.deepEqual(current().cards, ['alpha/one']);
  browser('wait', '--fn', `typeof window.__releaseCount === 'function'`);
  browser('eval', 'window.__releaseCount()');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '1 matching repository'`);
  assert.deepEqual(browser('eval', 'window.__sortedRequests'), ['1', '2']);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('returns an unfiltered category to its original order without loading all Stars', () => {
  openList('ai', 'AI');
  browser('wait', '--fn', `!!document.querySelector('#gst-navigation').__gstLists`);
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `!!document.querySelector('#user-list-repositories .col-12 h3 a')`);
  browser('eval', `(() => {
    const original = window.fetch;
    window.__resetRequests = [];
    window.fetch = (input, ...args) => { window.__resetRequests.push(new URL(input, location.href).pathname); return original(input, ...args); };
  })()`);
  chooseFilter('sort', 'default');
  browser('wait', '--fn', `document.querySelector('#user-list-repositories .col-12 h2 a')?.textContent.trim() === 'alpha/one'`);
  assert.equal(browser('eval', `window.__resetRequests.some(path => path === '/Fixture')`), false);
  assert.equal(browser('eval', `window.__resetRequests[0]`), '/stars/Fixture/lists/ai');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('uses GitHub SelectMenu dropdowns for the repository filters', () => {
  for (const [id, title] of [['type', 'Filter by type'], ['language', 'Filter by language'], ['sort', 'Sort by']]) {
    const menu = `#gst-${id}-menu`;
    browser('click', `${menu} summary`);
    assert.equal(browser('eval', `document.querySelector('${menu}').open`), true);
    assert.equal(browser('eval', `document.querySelector('${menu} .SelectMenu-title').textContent`), title);
    assert.equal(browser('eval', `document.querySelectorAll('${menu} [role="menuitemradio"][aria-checked="true"]').length`), 1);
    browser('click', `${menu} .SelectMenu-closeButton`);
    assert.equal(browser('eval', `document.querySelector('${menu}').open`), false);
  }
  browser('click', '#gst-sort-menu summary');
  browser('click', '#gst-sort-menu [data-value="stars"]');
  assert.equal(current().sort, 'stars');
  assert.equal(browser('eval', `document.querySelector('#gst-sort-menu').open`), false);
  assert.equal(browser('eval', `document.querySelector('#gst-sort-menu [data-value="stars"]').getAttribute('aria-checked')`), 'true');
  browser('click', '#gst-sort-menu summary');
  browser('press', 'Escape');
  assert.equal(browser('eval', `document.querySelector('#gst-sort-menu').open`), false);
  chooseFilter('sort', 'default');
  assert.equal(browser('eval', `document.querySelector('#gst-sort-menu summary').textContent.trim()`), 'Sort: Recently starred');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent === '40 repositories'`);
});

test('filter menus remain clickable above GitHub’s backdrop on a narrow screen', () => {
  browser('set', 'viewport', '320', '740');
  browser('click', '#gst-language-menu summary');
  assert.equal(browser('eval', `document.querySelector('#gst-language-menu').open`), true);
  browser('click', '#gst-language-menu .SelectMenu-closeButton');
  assert.equal(browser('eval', `document.querySelector('#gst-language-menu').open`), false);
  assert.equal(browser('eval', 'document.documentElement.scrollWidth'), 320);
  browser('set', 'viewport', '1280', '800');
});

test('automatically appends filtered results when scrolling to the end', () => {
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 stars matching bulk')`);
  assert.ok(browser('eval', `(() => { const a = document.querySelector('#gst-toolbar h1').getBoundingClientRect(), b = document.querySelector('#gst-results-status').getBoundingClientRect(); return b.left >= a.right && b.top < a.bottom && b.bottom > a.top; })()`));
  assert.equal(current().cards.length, 30);
  assert.equal(browser('eval', `!!document.querySelector('.gst-pages')`), false);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 35`);
  assert.equal(current().cards[0], 'bulk/repo-1');
  assert.equal(current().cards[34], 'bulk/repo-35');
  assert.equal(current().status, '35 stars matching bulk');
});

test('retains filtered first-page results when a later page fails and retries', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `(() => {
    const original = window.fetch;
    let fail = true;
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (fail && url.searchParams.get('q') === 'bulk' && url.searchParams.get('page') === '2') {
        fail = false; return Promise.resolve(new Response('', { status: 500 }));
      }
      return original(input, ...args);
    };
  })()`);
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 stars matching bulk')`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `!!document.querySelector('.gst-stream .gst-retry')`);
  assert.equal(current().cards.length, 30);
  assert.equal(current().status, '35 stars matching bulk');
  browser('click', '.gst-stream .gst-retry');
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 35`);
  assert.equal(current().status, '35 stars matching bulk');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('ignores a delayed search response after switching categories', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `(() => {
    const original = window.fetch;
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (url.searchParams.get('q') === 'bulk') return new Promise((resolve, reject) => {
        window.__releaseSearch = () => original(input, ...args).then(resolve, reject);
      });
      return original(input, ...args);
    };
  })()`);
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `typeof window.__releaseSearch === 'function'`);
  openList('infra', 'Infrastructure');
  browser('eval', 'window.__releaseSearch()');
  browser('eval', 'new Promise(resolve => setTimeout(resolve, 150))');
  assert.equal(current().title, 'Infrastructure');
  assert.deepEqual(current().cards, ['bravo/two', 'echo/five']);
  assert.equal(current().query, '');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('automatically loads additional unfiltered overview pages', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 40`);
  const cards = current().cards;
  assert.equal(cards.length, 40, 'scrolling should load the next page');
  assert.deepEqual(cards.slice(0, 4), ['alpha/one', 'bravo/two', 'charlie/three', 'delta/four']);
  assert.equal(new Set(cards).size, cards.length);
});

test('retains loaded list cards and retries a failed next page', () => {
  browser('eval', `(() => {
    const original = window.fetch;
    let fail = true;
    window.__restoreFetch = () => { window.fetch = original; };
    window.fetch = (input, ...args) => {
      const url = new URL(input, location.href);
      if (fail && url.pathname.endsWith('/lists/ai') && url.searchParams.get('page') === '2') {
        fail = false; return Promise.resolve(new Response('', { status: 500 }));
      }
      return original(input, ...args);
    };
  })()`);
  openList('ai', 'AI');
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `!!document.querySelector('.gst-stream .gst-retry')`);
  assert.deepEqual(current().cards, ['alpha/one', 'delta/four']);
  browser('click', '.gst-stream .gst-retry');
  browser('wait', '--fn', `document.querySelectorAll('#user-list-repositories > .col-12').length === 3`);
  assert.deepEqual(current().cards, ['alpha/one', 'delta/four', 'charlie/three']);
  browser('eval', 'window.__restoreFetch()');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('packs unequal cards upward without overlapping cards or pagination', () => {
  browser('set', 'viewport', '1440', '900');
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 stars matching bulk')`);
  browser('eval', `(() => {
    const cards = document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12');
    cards[0].querySelector('p').textContent = 'Long repository description '.repeat(35);
    cards[1].querySelector('p').textContent = 'Short';
    cards[2].querySelector('p').textContent = 'Short';
    cards[3].querySelector('p').textContent = 'Short';
  })()`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const result = browser('eval', `(() => {
    const root = document.querySelector('#user-starred-repos .col-lg-9');
    const cards = [...root.querySelectorAll(':scope > .col-12')].map(e => e.getBoundingClientRect());
    const pagination = root.querySelector('.gst-stream').getBoundingClientRect();
    let overlaps = false;
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) overlaps = true;
    }
    return { first: cards[0].toJSON(), second: cards[1].toJSON(), third: cards[2].toJSON(),
      fourth: cards[3].toJSON(), fifth: cards[4].toJSON(), sixth: cards[5].toJSON(), overlaps, paginationTop: pagination.top,
      bottom: Math.max(...cards.map(card => card.bottom)), rootBottom: root.getBoundingClientRect().bottom,
      paginationBottom: pagination.bottom };
  })()`);
  assert.ok(result.first.height > result.second.height * 2, 'fixture needs unequal card heights');
  assert.ok(Math.abs(result.first.top - result.second.top) < 1, 'first two repositories must retain their left-to-right order');
  assert.ok(Math.abs(result.third.left - result.first.left) < 1 && Math.abs(result.fourth.left - result.second.left) < 1 &&
    Math.abs(result.fifth.left - result.first.left) < 1 && Math.abs(result.sixth.left - result.second.left) < 1,
    'each successive pair must remain in left-to-right order');
  assert.ok(result.fourth.top < result.first.bottom, 'shorter columns should be filled independently');
  assert.ok(result.fourth.top - result.second.bottom <= 16 && result.sixth.top - result.fourth.bottom <= 16,
    'vertical gaps should remain compact');
  assert.equal(result.overlaps, false);
  assert.ok(result.paginationTop >= result.bottom, 'pagination must follow every card');
  assert.ok(result.rootBottom >= result.paginationBottom, 'the grid must contain pagination');
  browser('set', 'viewport', '320', '740');
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const mobile = browser('eval', `({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    columns: [...document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12')].map(e => e.style.getPropertyValue('--gst-grid-column')) })`);
  assert.equal(mobile.scroll, mobile.width, 'resizing to one column must not create implicit columns');
  assert.ok(mobile.columns.every(column => column === '1'));
  browser('set', 'viewport', '1440', '900');
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.deepEqual(browser('eval', `Array.from(document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12'))
    .slice(0, 6).map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '1', '2', '1', '2']);
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 35`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.deepEqual(browser('eval', `Array.from(document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12'))
    .slice(-5).map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '1', '2', '1']);
  browser('set', 'viewport', '1280', '800');
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.deepEqual(browser('eval', `Array.from(document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12'))
    .slice(-5).map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '1', '2', '1']);
});

test('keeps the enhanced layout when GitHub rewrites body classes during Turbo load', () => {
  browser('open', `${origin}/Fixture?tab=stars&early=1`);
  browser('eval', `(() => {
    document.addEventListener('turbo:load', () => document.body.classList.remove('gst-active'), { once: true });
    document.dispatchEvent(new Event('turbo:load'));
  })()`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(resolve))');
  assert.ok(browser('eval', `document.body.classList.contains('gst-active')`));
  assert.ok(browser('eval', `!!document.querySelector('#gst-toolbar')`));
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#profile-lists-container')).display`), 'none');
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('switches between overview and lists without flashing the unenhanced page', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `(() => {
    window.__flickerFrames = [];
    const sample = () => {
      const frame = document.getElementById('user-profile-frame');
      const bodyActive = document.body.classList.contains('gst-active');
      const frameStyled = frame.classList.contains('gst-overview') || frame.classList.contains('gst-list');
      const hasToolbar = !!document.getElementById('gst-toolbar');
      const lists = document.getElementById('profile-lists-container');
      const listsVisible = lists ? getComputedStyle(lists).display !== 'none' : false;
      const breadcrumb = frame.querySelector(':scope > div:not(#gst-toolbar) > a.breadcrumb');
      const breadcrumbVisible = breadcrumb ? getComputedStyle(breadcrumb).display !== 'none' : false;
      if (!bodyActive || !frameStyled || !hasToolbar || listsVisible || breadcrumbVisible) {
        window.__flickerFrames.push({ bodyActive, frameStyled, hasToolbar, listsVisible, breadcrumbVisible });
      }
      if (window.__samplingFlicker) requestAnimationFrame(sample);
    };
    window.__samplingFlicker = true;
    requestAnimationFrame(sample);
  })()`);
  openList('ai', 'AI');
  openList('infra', 'Infrastructure');
  browser('click', '#gst-navigation a[href="/Fixture?tab=stars"]');
  browser('wait', '--fn', `location.search === '?tab=stars' && document.querySelector('#gst-toolbar h1')?.textContent.trim() === 'All repositories'`);
  const flickers = browser('eval', `(() => { window.__samplingFlicker = false; return window.__flickerFrames; })()`);
  assert.deepEqual(flickers, []);
});

test('restores the enhanced view after Turbo prepares a cache snapshot', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `document.dispatchEvent(new Event('turbo:before-cache'))`);
  browser('eval', 'new Promise(resolve => requestAnimationFrame(resolve))');
  assert.ok(browser('eval', `!!document.querySelector('#gst-toolbar')`), 'toolbar must not remain missing on the live page');
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#profile-lists-container')).display`), 'none');
  assert.ok(browser('eval', `document.body.classList.contains('gst-active')`));
});

test('reinitializes the enhanced view as soon as Turbo renders a replacement body', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', `(() => {
    document.dispatchEvent(new Event('turbo:before-cache'));
    const replacement = document.body.cloneNode(true);
    replacement.classList.remove('gst-active');
    document.getElementById('gst-style').remove();
    document.body.replaceWith(replacement);
    document.dispatchEvent(new Event('turbo:render'));
  })()`);
  assert.ok(browser('eval', `!!document.querySelector('#gst-toolbar')`));
  assert.ok(browser('eval', `document.body.classList.contains('gst-active')`));
  assert.ok(browser('eval', `!!document.getElementById('gst-style')`));
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#profile-lists-container')).display`), 'none');
});

test('restores the initial view and scroll position when returning from a cached page', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 stars matching bulk')`);
  browser('eval', `document.querySelector('.gst-stream').scrollIntoView()`);
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 35`);
  browser('eval', `(() => {
    document.dispatchEvent(new Event('turbo:before-cache'));
    const frame = document.getElementById('user-profile-frame');
    frame.replaceWith(frame.cloneNode(true));
    document.dispatchEvent(new Event('turbo:load'));
  })()`);
  assert.equal(current().query, '');
  assert.equal(current().cards[0], 'alpha/one');
  assert.equal(browser('eval', 'scrollY'), 0);
  assert.ok(browser('eval', `!!document.querySelector('.gst-stream')`));
});

test('filters all pages of the selected list and retains GitHub result ordering', () => {
  assert.equal(current().toolbar, true);
  openList('ai', 'AI');
  browser('fill', '#gst-query', 'target');
  chooseFilter('type', 'fork');
  chooseFilter('language', 'Go');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('2 matching repositories')`);
  assert.deepEqual(current().cards, ['delta/four', 'charlie/three'], 'default ordering follows the list');
  chooseFilter('sort', 'stars');
  browser('wait', '--fn', `document.querySelector('#user-list-repositories h3 a')?.textContent.trim() === 'charlie/three'`);
  const state = current();
  assert.deepEqual(state.cards, ['charlie/three', 'delta/four']);
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#user-profile-frame > div > a.breadcrumb')).display`), 'none');
});

test('resets the shared filters when switching to a different list', () => {
  openList('ai', 'AI');
  browser('fill', '#gst-query', 'target');
  chooseFilter('type', 'fork');
  chooseFilter('language', 'Go');
  chooseFilter('sort', 'stars');
  assert.equal(current().query, 'target');
  openList('infra', 'Infrastructure');
  const state = current();
  assert.equal(state.query, '');
  assert.equal(state.type, '');
  assert.equal(state.language, '');
  assert.equal(state.sort, 'default');
});

test('clearly reports empty results and failed page loads', () => {
  openList('infra', 'Infrastructure');
  browser('fill', '#gst-query', 'nonexistent');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('0 matching repositories')`);
  assert.match(browser('eval', `document.querySelector('#user-list-repositories').textContent`), /No repositories match/);
  browser('fill', '#gst-query', 'simulate-failure');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('Could not load repositories')`);
  assert.match(current().status, /Could not load repositories/);
  assert.equal(browser('eval', `document.querySelector('#gst-filter-retry')?.textContent`), 'Retry');
});

test('opens the original create, edit and delete-confirmation dialogs without submitting them', () => {
  openList('infra', 'Infrastructure');
  assert.equal(current().toolbar, true);
  for (const [action, target] of [
    ['#gst-manage-create', '#fixture-create'],
    ['#gst-manage-edit', '#edit-list-dialog-infra'],
    ['#gst-manage-delete', '#delete-list-dialog-infra'],
  ]) {
    browser('click', '#gst-manage');
    browser('click', action);
    assert.equal(browser('eval', `document.querySelector('${target}').open`), true);
    browser('click', `${target} [data-close-dialog-id]`);
  }
});

test('restores interactive controls after GitHub restores a cached page', () => {
  openList('ai', 'AI');
  browser('eval', `(() => {
    const nav = document.getElementById('gst-navigation');
    nav.replaceWith(nav.cloneNode(true));
    const frame = document.getElementById('user-profile-frame');
    frame.replaceWith(frame.cloneNode(true));
    document.dispatchEvent(new Event('turbo:load', { bubbles: true }));
  })()`);
  browser('wait', '--fn', `document.querySelectorAll('#gst-navigation .gst-link').length === 3`);
  browser('click', '#gst-manage');
  assert.equal(browser('eval', `document.querySelector('#gst-manage-menu')?.open`), true);
  browser('click', '#gst-manage');
  assert.equal(browser('eval', `document.querySelector('#gst-manage-menu')?.open`), false);
  browser('fill', '#gst-query', 'nonexistent');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('0 matching repositories')`);
});

test('maps a GitHub recently starred URL to the default option', () => {
  browser('open', `${origin}/Fixture?tab=stars&sort=created`);
  assert.equal(current().sort, 'default');
  assert.equal(browser('eval', `document.querySelector('#gst-sort-menu [aria-checked="true"]').textContent.trim()`), 'Recently starred');
});

test('reflects filters already present in a GitHub Stars URL', () => {
  browser('open', `${origin}/Fixture?tab=stars&q=target&type=fork&language=Go&sort=stars&direction=desc`);
  const state = current();
  assert.equal(state.title, 'All repositories');
  assert.equal(state.query, 'target');
  assert.equal(state.type, 'fork');
  assert.equal(state.language, 'Go');
  assert.equal(browser('eval', `document.querySelector('#gst-language').selectedOptions[0].textContent`), 'Go');
  assert.equal(browser('eval', `document.querySelector('#gst-language-menu [data-value="Go"]').getAttribute('aria-checked')`), 'true');
  assert.match(browser('eval', `document.querySelector('#gst-language-menu summary').textContent`), /Go/);
  assert.equal(state.sort, 'stars');
  assert.equal(state.status, 'Filtered repositories');
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#user-starred-repos .TableObject')).display`), 'none');
});

test('handles stars overview without starred topics using col-lg-12 layout', () => {
  browser('open', `${origin}/Fixture?tab=stars&without_topics=1`);
  const state = current();
  assert.equal(state.title, 'All repositories');
  assert.equal(state.cards.length, 30);
  assert.equal(browser('eval', `getComputedStyle(document.querySelector('#user-starred-repos .position-relative')).display`), 'none');
  assert.ok(browser('eval', `document.querySelector('#user-starred-repos .col-lg-12').classList.contains('gst-masonry')`));
  browser('eval', 'window.scrollTo(0, document.body.scrollHeight)');
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-12 > .col-12').length === 40`);
  assert.equal(current().cards.length, 40);
  browser('open', `${origin}/Fixture?tab=stars`);
});

test('groups each updated time and pins it to the card edge', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('set', 'viewport', '1200', '800');
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 30`);
  const result = browser('eval', `(() => {
    const cards = [...document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12')];
    const meta = cards[0].querySelector('.f6');
    const updated = meta.querySelector('.gst-updated');
    const card = cards[0].getBoundingClientRect();
    return {
      grouped: cards.filter(card => card.querySelector(':scope > .f6 > .gst-updated')).length,
      bare: cards.filter(card => [...card.querySelector('.f6').childNodes]
        .some(node => node.nodeType === 3 && node.nodeValue.trim() === 'Updated')).length,
      total: cards.length,
      text: updated.textContent.trim(),
      nowrap: getComputedStyle(updated).whiteSpace,
      gap: getComputedStyle(meta).columnGap,
      right: updated.getBoundingClientRect().right,
      limit: card.right - parseFloat(getComputedStyle(cards[0]).paddingRight),
    };
  })()`);
  assert.equal(result.grouped, result.total, 'every card must group its updated time');
  assert.equal(result.bare, 0, 'no bare Updated label may be left behind');
  assert.equal(result.text, 'Updated recently');
  assert.equal(result.nowrap, 'nowrap');
  assert.equal(result.gap, '12px');
  assert.ok(Math.abs(result.right - result.limit) <= 1, `updated time must sit on the card edge: ${result.right} vs ${result.limit}`);
});

test('tints the updated time from green through yellow to red by age', () => {
  const result = browser('eval', `(() => {
    const cards = [...document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12')].slice(0, 3);
    const probe = document.createElement('span');
    document.body.append(probe);
    probe.style.color = 'color-mix(in oklch, #1a7f37 100%, #bc4c00)';
    const green = getComputedStyle(probe).color;
    probe.style.color = 'color-mix(in oklch, #bc4c00 0%, #cf222e)';
    const red = getComputedStyle(probe).color;
    probe.remove();
    return {
      green, red,
      ages: cards.map(card => card.style.getPropertyValue('--gst-age')),
      from: cards.map(card => card.style.getPropertyValue('--gst-age-from')),
      colors: cards.map(card => getComputedStyle(card.querySelector('.gst-updated')).color),
    };
  })()`);
  assert.equal(result.ages[0], '0.000');
  assert.equal(result.ages[2], '1.000');
  assert.deepEqual(result.from, ['var(--gst-green)', 'var(--gst-green)', 'var(--gst-yellow)']);
  assert.equal(result.colors[0], result.green, 'a fresh repository must use GitHub success green');
  assert.equal(result.colors[2], result.red, 'a repository a year old must use GitHub danger red');
  assert.notEqual(result.colors[1], result.colors[0]);
  assert.notEqual(result.colors[1], result.colors[2]);
});

test('wraps the metadata row without stranding the updated time', () => {
  browser('set', 'viewport', '320', '800');
  const result = browser('eval', `(() => {
    const meta = document.querySelector('#user-starred-repos .col-lg-9 > .col-12 > .f6');
    meta.querySelector('[itemprop="programmingLanguage"]').textContent = 'An extremely long language name here';
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const updated = meta.querySelector('.gst-updated').getBoundingClientRect();
      const bounds = meta.getBoundingClientRect();
      resolve({ height: bounds.height, lineHeight: parseFloat(getComputedStyle(meta).lineHeight),
        right: updated.right, metaRight: bounds.right, bottom: updated.bottom, metaBottom: bounds.bottom });
    })));
  })()`);
  assert.ok(result.height > result.lineHeight * 1.5, `meta row must wrap on a phone: ${result.height}`);
  assert.ok(Math.abs(result.right - result.metaRight) <= 1, `wrapped update must stay right-aligned: ${result.right} vs ${result.metaRight}`);
  assert.ok(result.bottom <= result.metaBottom + 1, 'updated time must stay inside the metadata row');
  browser('set', 'viewport', '1280', '800');
});

test('decorates repositories that are appended while scrolling', () => {
  browser('open', `${origin}/Fixture?tab=stars`);
  browser('eval', 'window.scrollTo(0, document.body.scrollHeight)');
  browser('wait', '--fn', `document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12').length === 40`);
  const result = browser('eval', `(() => {
    const cards = [...document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12')];
    const last = cards.at(-1);
    const updated = last.querySelector('.gst-updated');
    return { total: cards.length, grouped: !!updated, age: last.style.getPropertyValue('--gst-age'),
      text: updated?.textContent.trim(), right: updated?.getBoundingClientRect().right,
      limit: last.getBoundingClientRect().right - parseFloat(getComputedStyle(last).paddingRight) };
  })()`);
  assert.equal(result.total, 40);
  assert.equal(result.grouped, true);
  assert.match(result.age, /^\d\.\d{3}$/);
  assert.equal(result.text, 'Updated recently');
  assert.ok(Math.abs(result.right - result.limit) <= 1);
});
