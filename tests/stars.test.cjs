const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { getRoute, extractLists, revealSelection, getProfileElements, ageRatio } = require('../github-stars-tweaks.user.js');

test('starts safely before the document element is available', () => {
  const listeners = {};
  let notify;
  let observed = false;
  const doc = {
    documentElement: null, head: null, readyState: 'loading',
    addEventListener: (type, fn) => { listeners[type] = fn; },
    getElementById: () => null,
    createElement: () => ({}),
  };
  class Observer {
    constructor(callback) { notify = callback; }
    observe(target) { observed = target === doc; }
    disconnect() {}
  }
  const source = readFileSync(join(__dirname, '..', 'github-stars-tweaks.user.js'), 'utf8');
  assert.doesNotThrow(() => vm.runInNewContext(source, {
    document: doc, window: { addEventListener() {} }, location: { href: 'https://github.com/Fixture?tab=stars' },
    MutationObserver: Observer, URL,
  }));
  assert.equal(observed, true);
  const classes = [];
  let style;
  doc.documentElement = { classList: { add: value => classes.push(value) }, append: element => { style = element; } };
  notify();
  assert.deepEqual(classes, ['gst-pending']);
  assert.equal(style.id, 'gst-style');
  assert.equal(typeof listeners.DOMContentLoaded, 'function');
});

test('recognizes the Stars overview and keeps the owner', () => {
  assert.deepEqual(getRoute('https://github.com/Ckrvxr?tab=stars&sort=created'), {
    owner: 'Ckrvxr', kind: 'all', slug: null,
  });
});

test('recognizes a list page, including its pagination', () => {
  assert.deepEqual(getRoute('https://github.com/stars/Ckrvxr/lists/artificial-intelligence?page=2'), {
    owner: 'Ckrvxr', kind: 'list', slug: 'artificial-intelligence',
  });
});

test('ignores unrelated pages and non-GitHub origins', () => {
  for (const url of [
    'https://github.com/Ckrvxr?tab=repositories',
    'https://github.com/stars/Ckrvxr/lists/',
    'https://github.com/stars/Ckrvxr/lists/robotics/edit',
    'https://example.com/Ckrvxr?tab=stars',
    'http://github.com/Ckrvxr?tab=stars',
  ]) assert.equal(getRoute(url), null, url);
});

test('selects the sidebar belonging to the profile frame, not an unrelated sticky header', () => {
  const sidebar = {};
  const layout = { querySelector: selector => selector === ':scope > .Layout-sidebar' ? sidebar : null };
  const frame = { closest: selector => selector === '.Layout' ? layout : null };
  const doc = { getElementById: id => id === 'user-profile-frame' ? frame : null };
  assert.deepEqual(getProfileElements(doc), { frame, layout, sidebar });
});

test('brings the selected category into view in a horizontally scrolling navigation', () => {
  const container = { scrollLeft: 0, getBoundingClientRect: () => ({ left: 0, right: 300 }) };
  const selected = { getBoundingClientRect: () => ({ left: 320, right: 430 }) };
  revealSelection(container, selected);
  assert.equal(container.scrollLeft, 130);
});

test('does not move the navigation when the selected category is visible', () => {
  const container = { scrollLeft: 20, getBoundingClientRect: () => ({ left: 0, right: 300 }) };
  const selected = { getBoundingClientRect: () => ({ left: 40, right: 120 }) };
  revealSelection(container, selected);
  assert.equal(container.scrollLeft, 20);
});

function anchor(href, name, count) {
  return {
    getAttribute: key => key === 'href' ? href : null,
    querySelector: selector => {
      if (selector === 'h3') return name === null ? null : { textContent: name };
      if (selector === '.color-fg-muted') return count === null ? null : { textContent: count };
      return null;
    },
  };
}

function documentWith(anchors) {
  return { querySelectorAll: () => anchors };
}

test('extracts the GitHub list names and counts in their original order', () => {
  const doc = documentWith([
    anchor('/stars/Ckrvxr/lists/common', ' Common ', '11 repositories'),
    anchor('/stars/Ckrvxr/lists/robotics', 'Robotics', '7 repositories'),
    anchor('/stars/Ckrvxr/lists/private-list', 'Private list', null),
  ]);
  assert.deepEqual(extractLists(doc, 'Ckrvxr'), [
    { name: 'Common', href: '/stars/Ckrvxr/lists/common', count: '11' },
    { name: 'Robotics', href: '/stars/Ckrvxr/lists/robotics', count: '7' },
    { name: 'Private list', href: '/stars/Ckrvxr/lists/private-list', count: null },
  ]);
});

test('ignores duplicate, foreign, malformed, and untitled list links', () => {
  const doc = documentWith([
    anchor('/stars/Ckrvxr/lists/common', 'Common', '1 repository'),
    anchor('/stars/Ckrvxr/lists/common', 'Common', '1 repository'),
    anchor('https://example.com/stars/Ckrvxr/lists/stolen', 'Foreign', '1 repository'),
    anchor('/stars/SomeoneElse/lists/other', 'Other user', '1 repository'),
    anchor('/stars/Ckrvxr/lists/broken/edit', 'Edit', '1 repository'),
    anchor('/stars/Ckrvxr/lists/empty', null, null),
  ]);
  assert.deepEqual(extractLists(doc, 'Ckrvxr'), [
    { name: 'Common', href: '/stars/Ckrvxr/lists/common', count: '1' },
  ]);
});

test('maps repository age onto a green-yellow-red ramp', () => {
  assert.equal(ageRatio(0), 0);
  assert.equal(ageRatio(30), 0);
  assert.equal(ageRatio(180), 0.5);
  assert.equal(ageRatio(365), 1);
  assert.equal(ageRatio(2000), 1);
  assert.equal(ageRatio(Number.NaN), 0);
  assert.ok(ageRatio(60) > 0 && ageRatio(60) < 0.5);
  assert.ok(ageRatio(270) > 0.5 && ageRatio(270) < 1);
});
