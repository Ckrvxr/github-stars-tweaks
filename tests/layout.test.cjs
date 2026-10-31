const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const session = `stars-layout-test-${process.pid}`;
const source = readFileSync(join(__dirname, '..', 'github-stars-tweaks.user.js'), 'utf8');
const style = source.match(/const STYLE = `([\s\S]*?)`;/)?.[1];
if (!style) throw new Error('Could not find the userscript stylesheet');

function browser(...args) {
  const result = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 30000,
  });
  const response = JSON.parse(result);
  if (!response.success) throw new Error(response.error || 'Browser command failed');
  return response.data?.result;
}

const cards = Array.from({ length: 30 }, (_, index) => `
  <div class="col-12">
    <div class="d-inline-block"><h2><a href="#">Repository ${index + 1}</a></h2></div>
    <div class="float-right"><a class="sponsor" href="/sponsors/example">Sponsor</a><button class="starred">Starred</button></div>
    <div class="py-1"><p class="d-inline-block">A deliberately long repository description that wraps across several lines in a compact card, so the preview remains readable without becoming taller and taller.</p></div>
    <div class="f6">JavaScript · 100 stars</div>
  </div>`).join('');
const html = `<!doctype html><html><head><style>
  * { box-sizing: border-box } body { margin: 0; font: 14px/20px sans-serif }
  .gst-container { padding: 32px } .gst-link { display: block }
  .float-right { display: flex; gap: 8px }
  .float-right .sponsor { width: 90px } .float-right .starred { width: 129px }
  .d-inline-block { display: inline-block !important }
  ${style}
  </style></head><body class="gst-active"><main><div class="gst-container">
  <div class="Layout gst-layout"><div class="Layout-sidebar"><nav id="gst-navigation">
  <div class="gst-links"><a class="gst-link">All repositories</a>
  <a class="gst-link" aria-current="page">A category</a></div></nav></div>
  <div class="Layout-main"><div id="user-profile-frame"><h1>Repositories</h1>
  <div id="user-list-repositories">${cards}</div>
  <div id="user-starred-repos"><div class="d-lg-flex"><div class="col-lg-9">
  <div class="paginate-container"><a href="#next">Next</a></div></div>
  <div class="col-lg-3"><h2>Starred topics</h2><a href="#topic">Microcontroller</a></div>
  </div></div></div></div></div></div></main></body></html>`;

test.before(() => browser('open', `data:text/html;charset=utf-8,${encodeURIComponent(html)}`));
test.after(() => browser('close'));

test('category navigation remains visible while scrolling a long list', () => {
  browser('set', 'viewport', '1200', '800');
  browser('eval', 'window.scrollTo(0, 600)');
  const result = browser('eval', `(() => ({
    scroll: window.scrollY,
    top: document.getElementById('gst-navigation').getBoundingClientRect().top
  }))()`);
  assert.ok(result.scroll >= 500, 'fixture must actually scroll');
  assert.ok(result.top >= 48 && result.top <= 80, `navigation must remain below GitHub's sticky header: ${result.top}`);
});

test('hides starred topics without hiding repository pagination', () => {
  const result = browser('eval', `(() => ({
    topics: getComputedStyle(document.querySelector('#user-starred-repos > .d-lg-flex > .col-lg-3')).display,
    pagination: getComputedStyle(document.querySelector('#user-starred-repos .paginate-container')).display
  }))()`);
  assert.equal(result.topics, 'none');
  assert.notEqual(result.pagination, 'none');
});

test('long descriptions are displayed in full despite GitHub utility classes', () => {
  browser('set', 'viewport', '1200', '800');
  const result = browser('eval', `(() => {
    const description = document.querySelector('#user-list-repositories .py-1 p');
    return { height: description.clientHeight, fullHeight: description.scrollHeight,
      lineHeight: parseFloat(getComputedStyle(description).lineHeight) };
  })()`);
  assert.ok(result.height > result.lineHeight * 2, 'fixture must have more than two lines');
  assert.equal(result.height, result.fullHeight, 'description must not be clipped');
});

test('hides repository Sponsor links while retaining Star controls', () => {
  const result = browser('eval', `({
    sponsor: getComputedStyle(document.querySelector('#user-list-repositories .sponsor')).display,
    star: getComputedStyle(document.querySelector('#user-list-repositories .starred')).display
  })`);
  assert.equal(result.sponsor, 'none');
  assert.notEqual(result.star, 'none');
});

test('a sponsored repository name remains readable on a narrow phone', () => {
  browser('set', 'viewport', '320', '800');
  const result = browser('eval', `(() => {
    const title = document.querySelector('#user-list-repositories > .col-12 > .d-inline-block');
    return { width: title.getBoundingClientRect().width };
  })()`);
  assert.ok(result.width >= 120, `repository name is squeezed into ${result.width}px`);
});

test('repository grid adjusts from two columns to three and then one', () => {
  const columns = () => browser('eval', `getComputedStyle(document.getElementById('user-list-repositories')).gridTemplateColumns.split(' ').length`);
  browser('set', 'viewport', '1200', '800');
  assert.equal(columns(), 2);
  browser('set', 'viewport', '1440', '900');
  assert.equal(columns(), 3);
  browser('set', 'viewport', '390', '844');
  assert.equal(columns(), 1);
  const size = browser('eval', '({ width: innerWidth, page: document.documentElement.scrollWidth })');
  assert.equal(size.page, size.width, 'mobile page must not overflow horizontally');
});
