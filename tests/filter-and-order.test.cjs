const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStarsUrl, nextPageUrl, filterRepositoriesByMembership,
  orderRepositoriesByMembership, getRepositoryLoadPlan } = require('../github-stars-tweaks.user.js');

const origin = 'https://github.com';

test('builds GitHub search using the selected filters and native sort', () => {
  const url = new URL(buildStarsUrl('Ckrvxr', {
    query: 'graph database', type: 'fork', language: 'C++', sort: 'stars',
  }), origin);
  assert.equal(url.pathname, '/Ckrvxr');
  assert.equal(url.searchParams.get('tab'), 'stars');
  assert.equal(url.searchParams.get('q'), 'graph database');
  assert.equal(url.searchParams.get('type'), 'fork');
  assert.equal(url.searchParams.get('language'), 'C++');
  assert.equal(url.searchParams.get('sort'), 'stars');
  assert.equal(url.searchParams.get('direction'), 'desc');
});

test('default search omits filters and uses GitHub default order', () => {
  const url = new URL(buildStarsUrl('Ckrvxr', {}), origin);
  assert.equal(url.pathname, '/Ckrvxr');
  assert.equal(url.search, '?tab=stars');
});

function pageWithLinks(links) {
  return { querySelectorAll: () => links.map(link => ({
    textContent: link.text,
    getAttribute: name => link[name] || null,
  })) };
}

test('follows GitHub list and overview next links without leaving the current scope', () => {
  const list = { owner: 'Ckrvxr', kind: 'list', slug: 'ai' };
  assert.equal(nextPageUrl(pageWithLinks([{ text: 'Next', href: '/stars/Ckrvxr/lists/ai?page=2', rel: 'next' }]), list),
    'https://github.com/stars/Ckrvxr/lists/ai?page=2');
  const all = { owner: 'Ckrvxr', kind: 'all', slug: null };
  assert.equal(nextPageUrl(pageWithLinks([{ text: 'Next', href: '/Ckrvxr?tab=stars&after=cursor', rel: 'nofollow' }]), all),
    'https://github.com/Ckrvxr?tab=stars&after=cursor');
  assert.equal(nextPageUrl(pageWithLinks([{ text: 'Next', href: 'https://example.com/Ckrvxr?tab=stars' }]), all), null);
  assert.equal(nextPageUrl(pageWithLinks([{ text: 'Next', href: '/Other?tab=stars' }]), all), null);
  assert.equal(nextPageUrl(pageWithLinks([{ text: 'Next', href: '/stars/Ckrvxr/lists/other?page=2' }]), list), null);
});

test('selects an explicit loading strategy for each repository scope', () => {
  const list = { kind: 'list' }, all = { kind: 'all' };
  const defaults = { query: '', type: '', language: '', sort: 'default' };
  for (const [route, filters, plan] of [
    [list, defaults, 'native-list'],
    [list, { ...defaults, query: 'compiler' }, 'filtered-list-order'],
    [list, { ...defaults, sort: 'stars' }, 'search-list'],
    [all, defaults, 'search'],
  ]) assert.equal(getRepositoryLoadPlan(route, filters), plan);
});

test('filters a whole category while preserving GitHub result order', () => {
  const repositories = [{ key: '/b/second' }, { key: '/a/first' }, { key: '/c/third' }];
  assert.deepEqual(filterRepositoriesByMembership(repositories, new Set(['/c/third', '/a/first'])).map(repo => repo.key),
    ['/a/first', '/c/third']);
  assert.deepEqual(filterRepositoriesByMembership(repositories, null), repositories);
  assert.deepEqual(orderRepositoriesByMembership(repositories, new Set(['/c/third', '/a/first'])).map(repo => repo.key),
    ['/c/third', '/a/first'], 'default category order follows the original list');
});
