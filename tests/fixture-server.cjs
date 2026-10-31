const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repositories = [
  { key: 'alpha/one', text: 'first', language: 'Go', type: 'source', stars: 60 },
  { key: 'bravo/two', text: 'target', language: 'Go', type: 'fork', stars: 50 },
  { key: 'charlie/three', text: 'target', language: 'Go', type: 'fork', stars: 40 },
  { key: 'delta/four', text: 'target', language: 'Go', type: 'fork', stars: 30 },
  { key: 'echo/five', text: 'target', language: 'Python', type: 'fork', stars: 20 },
  ...Array.from({ length: 35 }, (_, i) => ({ key: `bulk/repo-${i + 1}`, text: 'bulk', language: 'Rust', type: 'source', stars: 1000 - i })),
];
const lists = { ai: ['alpha/one', 'delta/four', 'charlie/three'], infra: ['bravo/two', 'echo/five'] };
const script = readFileSync(join(__dirname, '..', 'github-stars-tweaks.user.js'), 'utf8');
let origin;

function card(repo, overview) {
  const heading = overview ? 'h3' : 'h2';
  return `<div class="col-12"><div class="d-inline-block"><${heading}><a href="/${repo.key}">${repo.key}</a></${heading}></div>
    <div class="float-right"><button>Starred</button></div><div class="py-1"><p>${repo.text}</p></div>
    <div class="f6"><span itemprop="programmingLanguage">${repo.language}</span><a href="/${repo.key}/stargazers">${repo.stars}</a></div></div>`;
}

function pagination(url, page, total, pageSize = 2) {
  if (page * pageSize >= total) return '';
  const next = new URL(url, origin);
  next.searchParams.set('page', String(page + 1));
  return `<div class="paginate-container"><div class="pagination"><a rel="next" href="${next.pathname}${next.search}">Next</a></div></div>`;
}

function createHelper() {
  return `<dialog-helper><dialog id="fixture-create"><h2>Create list</h2><button data-close-dialog-id="fixture-create">Close</button><form action="/stars/Fixture/lists" method="post"><input name="user_list[name]"></form></dialog></dialog-helper>`;
}

function listHelper(slug) {
  return `<dialog-helper><dialog id="edit-list-dialog-${slug}"><h2>Edit list</h2><button data-close-dialog-id="edit-list-dialog-${slug}">Close</button></dialog></dialog-helper>
    <dialog-helper><dialog id="delete-list-dialog-${slug}"><h2>Delete list?</h2><button data-close-dialog-id="delete-list-dialog-${slug}">Close</button></dialog></dialog-helper>`;
}

function overview(url) {
  const p = url.searchParams;
  let results = repositories.filter(repo => (!p.get('q') || `${repo.key} ${repo.text}`.includes(p.get('q').toLowerCase())) &&
    (!p.get('type') || repo.type === p.get('type')) && (!p.get('language') || repo.language.toLowerCase() === p.get('language').toLowerCase()));
  if (p.get('sort') === 'stars') results = [...results].sort((a, b) => b.stars - a.stars);
  const page = Number(p.get('page') || 1);
  return `<div><div class="tmp-my-3"><h2>Lists</h2><button data-show-dialog-id="fixture-create">Create list</button>${createHelper()}</div>
    <div id="profile-lists-container"><a href="/stars/Fixture/lists/ai"><h3>AI</h3><span class="color-fg-muted">3 repositories</span></a>
    <a href="/stars/Fixture/lists/infra"><h3>Infrastructure</h3><span class="color-fg-muted">2 repositories</span></a></div>
    <div class="d-flex flex-column">Old filters <div id="stars-type-filter-menu-list"><a href="/Fixture?tab=stars&language=Go&type=public">Public</a></div>
    <ul id="stars-language-filter-menu-list"><li><a href="/Fixture?tab=stars&language=Go">Go</a></li><li><a href="/Fixture?tab=stars&language=Python">Python</a></li></ul>
    <div id="stars-sort-menu-list"><a href="/Fixture?tab=stars&language=Go&sort=stars">Most stars</a></div></div>
    <turbo-frame id="user-starred-repos"><div class="d-lg-flex"><div class="${url.searchParams.has('without_topics') ? 'col-lg-12' : 'col-lg-9'}">
    <div class="position-relative"><h2>Starred repositories</h2></div>${p.get('q') === 'bulk' ? '<div class="TableObject"><span class="TableObject-item--primary">35 stars matching bulk</span></div>' : p.get('language') ? '<div class="TableObject"><span class="TableObject-item--primary">Filtered repositories</span><a class="issues-reset-query" href="/Fixture?tab=stars">Clear filter</a></div>' : ''}${results.slice((page - 1) * 30, page * 30).map(r => card(r, true)).join('')}${pagination(url, page, results.length, 30)}</div>
    ${url.searchParams.has('without_topics') ? '' : '<div class="col-lg-3">Starred topics</div>'}</div></turbo-frame></div>`;
}

function listPage(url, slug) {
  const members = lists[slug] || [];
  const page = Number(url.searchParams.get('page') || 1);
  const subset = members.slice((page - 1) * 2, page * 2).map(key => repositories.find(r => r.key === key));
  const name = slug === 'ai' ? 'AI' : 'Infrastructure';
  return `<div><a class="breadcrumb" href="/Fixture?tab=stars">Stars</a><div class="tmp-my-3"><div><h1>${name}</h1>
    <button data-show-dialog-id="edit-list-dialog-${slug}">Edit list</button>${listHelper(slug)}</div><div class="color-fg-muted">List description</div><div class="color-fg-muted"><svg class="octicon octicon-repo mr-1"></svg>${members.length} repositories</div></div>
    <div id="user-list-repositories">${subset.map(r => card(r, false)).join('')}${pagination(url, page, members.length)}</div></div>`;
}

const fixtureClient = `
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[data-turbo-frame="user-profile-frame"]');
    if (!link) return;
    event.preventDefault();
    const response = await fetch(link.href);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const frame = document.getElementById('user-profile-frame');
    frame.replaceChildren(...Array.from(doc.getElementById('user-profile-frame').childNodes));
    history.pushState({}, '', link.href);
    frame.dispatchEvent(new Event('turbo:frame-load', { bubbles: true }));
  });
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close-dialog-id]');
    if (close) document.getElementById(close.dataset.closeDialogId)?.close();
  });
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, origin);
  const slug = url.pathname.match(/^\/stars\/Fixture\/lists\/(\w+)$/)?.[1];
  if (url.searchParams.get('q') === 'simulate-failure') {
    res.writeHead(500);
    res.end('Fixture failure');
    return;
  }
  const content = slug ? listPage(url, slug) : overview(url);
  const source = script.replace("const ORIGIN = 'https://github.com';", `const ORIGIN = '${origin}';`).replace(/<\/script/gi, '<\\/script');
  const early = url.searchParams.has('early');
  const earlyScript = early ? `<script>${source}</script><script>window.__earlyState = { body: !!document.body, pending: document.documentElement.classList.contains('gst-pending'), style: !!document.getElementById('gst-style') };</script>` : '';
  const page = `<!doctype html><html><head><meta name="user-login" content="Fixture">${earlyScript}<style>
    body { font: 14px sans-serif; margin: 0 } .Layout { display: flex } .Layout-sidebar { width: 230px }
    .Layout-main { flex: 1 } .float-right { display: flex } .gst-container { padding: 32px }
    .btn { padding: 6px 10px } .pagination a { display: inline-block; padding: 6px }
    .tmp-my-3 { margin: 16px 0 } .tmp-my-3 > div:first-child { margin-bottom: 8px }
    .details-overlay[open] > summary::before { content: ''; position: fixed; inset: 0; z-index: 80 }
    .SelectMenu { position: absolute; z-index: 99; background: white }
    @media (max-width: 544px) { .SelectMenu { position: fixed; top: 30%; left: 16px; right: 16px } }
    </style></head><body>${url.searchParams.has('without_counter') ? '' : `<a data-tab-item="stars" href="/Fixture?tab=stars"><span data-component="counter">${url.searchParams.has('compact_counter') ? '<span aria-hidden="true">1.2k</span><span>(1,234)</span>' : '40'}</span></a>`}<main><div><div class="Layout">${early ? '<script>window.__initialLayoutVisibility = getComputedStyle(document.querySelector(".Layout")).visibility;</script>' : ''}<div class="Layout-sidebar"></div><div class="Layout-main">
    ${url.searchParams.has('missing_frame') ? '<p>Profile unavailable</p>' : `<turbo-frame id="user-profile-frame">${content}</turbo-frame>`}</div></div></div></main>
    <script>${fixtureClient}</script>${early ? '' : `<script>${source}</script>`}</body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page);
});
server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(origin);
});
