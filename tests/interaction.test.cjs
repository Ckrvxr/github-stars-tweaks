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
    cards: Array.from(document.querySelectorAll('#user-list-repositories > .col-12, #user-starred-repos .col-lg-9 > .col-12'))
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

test('provides one shared title and filter toolbar and hides duplicated overview controls', () => {
  const state = current();
  assert.equal(state.toolbar, true);
  assert.equal(state.title, 'All repositories');
  assert.ok(browser('eval', `getComputedStyle(document.querySelector('#user-profile-frame > div > .d-flex.flex-column')).display === 'none'`));
  assert.ok(browser('eval', `!!document.querySelector('#gst-manage')`));
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
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('matching repositories')`);
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

test('paginates a search covering all repository pages', () => {
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 matching repositories')`);
  assert.equal(current().cards.length, 30);
  browser('click', '.gst-pages button:last-child');
  assert.equal(current().cards.length, 5);
  assert.equal(current().cards[0], 'bulk/repo-31');
  browser('click', '.gst-pages button:first-child');
  assert.equal(current().cards[0], 'bulk/repo-1');
});

test('packs unequal cards upward without overlapping cards or pagination', () => {
  browser('set', 'viewport', '1440', '900');
  browser('fill', '#gst-query', 'bulk');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('35 matching repositories')`);
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
    const pagination = root.querySelector('.gst-pages').getBoundingClientRect();
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
  assert.ok(Math.abs(result.first.top - result.second.top) < 1 && Math.abs(result.second.top - result.third.top) < 1,
    'first three repositories must retain their left-to-right order');
  assert.ok(Math.abs(result.fourth.left - result.first.left) < 1 && Math.abs(result.fifth.left - result.second.left) < 1 &&
    Math.abs(result.sixth.left - result.third.left) < 1, 'each successive group must remain in left-to-right order');
  assert.ok(result.fifth.top < result.first.bottom, 'shorter columns should be filled independently');
  assert.ok(result.fifth.top - result.second.bottom <= 16 && result.sixth.top - result.third.bottom <= 16,
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
    .slice(0, 6).map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '3', '1', '2', '3']);
  browser('click', '.gst-pages button:last-child');
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.deepEqual(browser('eval', `Array.from(document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12'))
    .map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '3', '1', '2']);
  browser('set', 'viewport', '1280', '800');
  browser('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.deepEqual(browser('eval', `Array.from(document.querySelectorAll('#user-starred-repos .col-lg-9 > .col-12'))
    .map(e => e.style.getPropertyValue('--gst-grid-column'))`), ['1', '2', '1', '2', '1']);
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
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('Could not load all pages')`);
  assert.match(current().status, /Could not load all pages/);
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
  assert.equal(browser('eval', `document.querySelector('#gst-manage-dialog')?.open`), true);
  browser('click', '#gst-manage-dialog > button');
  browser('fill', '#gst-query', 'nonexistent');
  browser('click', '#gst-submit');
  browser('wait', '--fn', `document.querySelector('#gst-results-status')?.textContent.includes('0 matching repositories')`);
});

test('stores a manual list order in the userscript manager and restores it after reload', () => {
  assert.equal(current().toolbar, true);
  browser('click', '#gst-manage');
  browser('click', '#gst-manage-order');
  browser('click', '#gst-order-items [data-href="/stars/Fixture/lists/infra"] .gst-order-up');
  browser('click', '#gst-order-save');
  const names = () => browser('eval', `Array.from(document.querySelectorAll('#gst-navigation .gst-link')).slice(1).map(e => e.querySelector('.gst-name').textContent)`);
  assert.deepEqual(names(), ['Infrastructure', 'AI']);
  browser('reload');
  browser('wait', '--fn', `document.querySelectorAll('#gst-navigation .gst-link').length === 3`);
  assert.deepEqual(names(), ['Infrastructure', 'AI']);
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
