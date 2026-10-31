// ==UserScript==
// @name         GitHub Stars Tweaks
// @namespace    https://github.com/
// @version      2.3.11
// @description  Browse GitHub star lists side by side with compact, responsive repository cards.
// @match        https://github.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const ORIGIN = 'https://github.com';

  function getRoute(value) {
    let url;
    try {
      url = new URL(value, ORIGIN);
    } catch {
      return null;
    }
    if (url.origin !== ORIGIN) return null;

    const list = url.pathname.match(/^\/stars\/([^/]+)\/lists\/([^/]+)\/?$/);
    if (list) return { owner: list[1], kind: 'list', slug: list[2] };

    const profile = url.pathname.match(/^\/([^/]+)\/?$/);
    if (profile && url.searchParams.get('tab') === 'stars') {
      return { owner: profile[1], kind: 'all', slug: null };
    }
    return null;
  }

  function extractLists(doc, owner) {
    const lists = [];
    const seen = new Set();
    for (const anchor of doc.querySelectorAll('#profile-lists-container a[href]')) {
      const route = getRoute(anchor.getAttribute('href'));
      const name = anchor.querySelector('h3')?.textContent.trim();
      if (!route || route.kind !== 'list' || route.owner.toLowerCase() !== owner.toLowerCase() || !name) continue;
      const href = new URL(anchor.getAttribute('href'), ORIGIN).pathname;
      if (seen.has(href)) continue;
      seen.add(href);
      const countText = anchor.querySelector('.color-fg-muted')?.textContent.trim() || '';
      const count = countText.match(/^[\d,]+/)?.[0] || null;
      lists.push({ name, href, count });
    }
    return lists;
  }

  function revealSelection(container, selected) {
    const bounds = container.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.left < bounds.left) container.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) container.scrollLeft += item.right - bounds.right;
  }

  function getProfileElements(doc) {
    const frame = doc.getElementById('user-profile-frame');
    const layout = frame?.closest('.Layout') || null;
    const sidebar = layout?.querySelector(':scope > .Layout-sidebar') || null;
    return { frame, layout, sidebar };
  }

  function buildStarsUrl(owner, filters) {
    const url = new URL(`/${owner}`, ORIGIN);
    url.searchParams.set('tab', 'stars');
    if (filters.query) url.searchParams.set('q', filters.query);
    if (filters.type) url.searchParams.set('type', filters.type);
    if (filters.language) url.searchParams.set('language', filters.language);
    if (filters.sort && filters.sort !== 'created' && filters.sort !== 'default') {
      url.searchParams.set('sort', filters.sort);
      url.searchParams.set('direction', 'desc');
    }
    return url.href;
  }

  function nextPageUrl(doc, route) {
    for (const link of doc.querySelectorAll('.paginate-container a[href]')) {
      const rel = (link.getAttribute('rel') || '').split(/\s+/);
      if (!rel.includes('next') && link.textContent.trim() !== 'Next') continue;
      const url = new URL(link.getAttribute('href'), ORIGIN);
      const next = getRoute(url.href);
      if (next && next.kind === route.kind && next.owner.toLowerCase() === route.owner.toLowerCase() &&
          (next.kind !== 'list' || next.slug === route.slug)) return url.href;
    }
    return null;
  }

  function orderLists(lists, order) {
    const byHref = new Map(lists.map(list => [list.href, list]));
    const result = [];
    for (const href of Array.isArray(order) ? order : []) {
      if (byHref.has(href)) {
        result.push(byHref.get(href));
        byHref.delete(href);
      }
    }
    return result.concat([...byHref.values()]);
  }

  function selectRepositories(repositories, membership, preserveListOrder = false) {
    if (!membership) return repositories;
    if (!preserveListOrder) return repositories.filter(repository => membership.has(repository.key));
    const byKey = new Map(repositories.map(repository => [repository.key, repository]));
    return [...membership].filter(key => byKey.has(key)).map(key => byKey.get(key));
  }

  if (typeof module === 'object' && module.exports && typeof window === 'undefined') {
    module.exports = { getRoute, extractLists, revealSelection, getProfileElements,
      buildStarsUrl, nextPageUrl, orderLists, selectRepositories };
    return;
  }

  const STYLE = `
    html.gst-pending main .Layout { visibility: hidden !important; }
    body.gst-active main .gst-container { max-width: 1200px !important; margin-inline: auto !important; }
    body.gst-active main .gst-layout {
      display: grid !important;
      grid-template-columns: 224px minmax(0, 1fr) !important;
      gap: 24px !important;
      align-items: start;
      padding-block: 24px 32px;
    }
    body.gst-active main .gst-layout > .Layout-sidebar,
    body.gst-active main .gst-layout > .Layout-main { width: auto !important; min-width: 0; margin: 0 !important; }
    body.gst-active main .gst-layout > .Layout-sidebar { align-self: stretch; }
    body.gst-active main .gst-layout > .Layout-sidebar > :not(#gst-navigation) { display: none !important; }
    #gst-navigation {
      position: sticky;
      top: 64px;
      max-height: calc(100vh - 80px);
      overflow: auto;
      padding: 4px 0 16px;
      color: var(--fgColor-default, var(--color-fg-default, #1f2328));
      font-size: 14px;
    }
    #gst-navigation .gst-section { display: flex; align-items: center; justify-content: space-between; margin: 18px 8px 7px; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); font-size: 12px; font-weight: 600; }
    #gst-manage { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; font-size: 20px; line-height: 1; }
    #gst-manage:hover { background: var(--bgColor-neutral-muted, var(--color-neutral-muted, #eaeef2)); }
    #gst-navigation .gst-link {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      min-height: 34px;
      padding: 7px 8px;
      border-radius: 6px;
      color: inherit;
      line-height: 20px;
      text-decoration: none;
    }
    #gst-navigation .gst-link:hover { background: var(--bgColor-neutral-muted, var(--color-neutral-muted, #f3f4f6)); }
    #gst-navigation .gst-link[aria-current="page"] {
      background: var(--bgColor-neutral-muted, var(--color-neutral-muted, #eaeef2));
      font-weight: 600;
    }
    #gst-navigation .gst-name { min-width: 0; overflow-wrap: anywhere; }
    #gst-navigation .gst-count { flex: none; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); font-size: 12px; font-variant-numeric: tabular-nums; font-weight: 400; }
    #gst-navigation .gst-message { margin: 6px 8px; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); font-size: 12px; }
    #gst-navigation .gst-retry { padding: 0; border: 0; background: none; color: var(--fgColor-accent, var(--color-accent-fg, #0969da)); cursor: pointer; font: inherit; text-decoration: underline; }
    body.gst-active #profile-lists-container { display: none; }
    body.gst-active #user-profile-frame.gst-overview > div:not(#gst-toolbar) > .tmp-my-3:first-child,
    body.gst-active #user-profile-frame.gst-overview > div:not(#gst-toolbar) > .d-flex.flex-column,
    body.gst-active #user-profile-frame.gst-list > div:not(#gst-toolbar) > a:first-child,
    body.gst-active #user-profile-frame.gst-list button[data-show-dialog-id^="edit-list-dialog-"],
    body.gst-active #user-starred-repos .col-lg-9 > .position-relative,
    body.gst-active #user-starred-repos .col-lg-9 > .TableObject { display: none !important; }
    body.gst-active #user-profile-frame.gst-list > div:not(#gst-toolbar) { display: flow-root; }
    body.gst-active #user-profile-frame.gst-list > div:not(#gst-toolbar) > .tmp-my-3 { margin-block: 0 !important; }
    body.gst-active #user-profile-frame.gst-list > div:not(#gst-toolbar) > .tmp-my-3 > div:first-child { margin-bottom: 0 !important; }
    body.gst-active #user-starred-repos > .d-lg-flex { display: block !important; margin-top: 20px !important; }
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9 { width: 100% !important; max-width: none !important; }
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-3 { display: none !important; }
    body.gst-active #user-list-repositories,
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9 {
      display: grid !important;
      --gst-card-min-width: 350px;
      --gst-card-gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, max(var(--gst-card-min-width), calc((100% - var(--gst-card-gap)) / 2))), 1fr));
      gap: var(--gst-card-gap);
      border-top: 0 !important;
      margin-top: 16px !important;
    }
    body.gst-active #user-list-repositories { margin-top: 6px !important; }
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9 > :not(.col-12),
    body.gst-active #user-list-repositories > .paginate-container { grid-column: 1 / -1; }
    body.gst-active #user-list-repositories.gst-masonry,
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9.gst-masonry {
      grid-auto-rows: 4px;
      grid-auto-flow: row dense;
      row-gap: 0;
    }
    body.gst-active #user-list-repositories.gst-masonry > *,
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9.gst-masonry > * {
      align-self: start;
      grid-row-end: span var(--gst-grid-span, 1);
    }
    body.gst-active #user-list-repositories.gst-masonry > .col-12,
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9.gst-masonry > .col-12 {
      grid-column: var(--gst-grid-column, auto);
    }
    body.gst-active #user-list-repositories > .col-12,
    body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9 > .col-12 {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'name actions' 'description description' 'meta meta';
      align-content: start;
      align-items: start;
      align-self: start;
      gap: 8px 10px;
      min-width: 0;
      width: auto !important;
      padding: 12px !important;
      border: 1px solid var(--borderColor-default, var(--color-border-default, #d1d9e0)) !important;
      border-radius: 6px;
      background: var(--bgColor-default, var(--color-canvas-default, #fff));
    }
    body.gst-active #user-list-repositories > .col-12 > .d-inline-block,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .d-inline-block { grid-area: name; min-width: 0; margin: 0 !important; }
    body.gst-active #user-list-repositories > .col-12 h2,
    body.gst-active #user-list-repositories > .col-12 h3,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 h3 { margin: 0; font-size: 14px !important; line-height: 1.45; overflow-wrap: anywhere; }
    body.gst-active #user-list-repositories > .col-12 > .float-right,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .float-right { grid-area: actions; float: none !important; }
    body.gst-active #user-list-repositories > .col-12 > .float-right > a[href^="/sponsors/"],
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .float-right > a[href^="/sponsors/"] { display: none !important; }
    body.gst-active #user-list-repositories > .col-12 > .py-1,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .py-1 { grid-area: description; min-width: 0; padding: 0 !important; }
    body.gst-active #user-list-repositories > .col-12 > .py-1 p,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .py-1 p {
      display: block !important;
      overflow: visible;
      -webkit-line-clamp: unset;
      overflow-wrap: anywhere;
      width: 100% !important;
      max-width: 100%;
      margin: 0 !important;
      padding-right: 0 !important;
    }
    body.gst-active #user-list-repositories > .col-12 > .f6,
    body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .f6 { grid-area: meta; margin: 0 !important; }
    body.gst-active #user-list-repositories > .paginate-container,
    body.gst-active #user-starred-repos .paginate-container { margin: 8px 0 0; }
    #gst-toolbar { margin: 0 0 14px; }
    #gst-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-bottom: 14px; }
    #gst-toolbar h1 { margin: 0; font-size: 24px !important; line-height: 1.25; }
    #gst-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    #gst-query { flex: 1 1 140px; min-width: 140px; }
    #gst-filters .gst-filter-menu { position: relative; }
    #gst-filters .gst-filter-menu .SelectMenu-item { width: 100%; text-align: left; }
    #gst-results-status { margin: 0; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); font-size: 14px; }
    #gst-results-status:empty { display: none; }
    user-list-menu dialog[data-gst-positioning] { opacity: 0 !important; }
    .gst-dialog { width: min(440px, calc(100vw - 32px)); max-height: min(80vh, 700px); overflow: auto; box-sizing: border-box; padding: 20px; border: 1px solid var(--borderColor-default, var(--color-border-default, #d1d9e0)); border-radius: 8px; background: var(--bgColor-default, var(--color-canvas-default, #fff)); color: var(--fgColor-default, var(--color-fg-default, #1f2328)); }
    .gst-dialog::backdrop { background: rgba(31, 35, 40, .4); }
    .gst-dialog h2 { margin: 0 0 16px; font-size: 18px; }
    .gst-dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
    .gst-manage-actions { display: grid; gap: 8px; }
    .gst-manage-actions button { text-align: left; }
    #gst-order-items { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    #gst-order-items li { display: flex; align-items: center; gap: 6px; }
    #gst-order-items li span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    #gst-order-items button { min-width: 34px; }
    .gst-stream { grid-column: 1 / -1; display: flex; justify-content: center; gap: 8px; align-items: center; min-height: 24px; margin-top: 8px; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); font-size: 12px; }
    .gst-empty { grid-column: 1 / -1; margin: 12px 0; color: var(--fgColor-muted, var(--color-fg-muted, #656d76)); }
    @media (max-width: 767px) {
      body.gst-active main .gst-layout { display: block !important; }
      #gst-navigation { position: static; max-height: none; margin-bottom: 18px; padding: 0; overflow: visible; }
      #gst-navigation .gst-links { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 5px; }
      #gst-navigation .gst-link { flex: none; white-space: nowrap; }
      #gst-navigation .gst-section { align-self: center; flex: none; gap: 6px; margin: 0 4px 0 12px; }
      #gst-filters { align-items: stretch; }
      #gst-query { flex-basis: calc(100% - 100px); }
      #gst-navigation .gst-name { overflow-wrap: normal; }
    }
    @media (max-width: 400px) {
      body.gst-active #user-list-repositories > .col-12,
      body.gst-active #user-starred-repos > .d-lg-flex > .col-lg-9 > .col-12 {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: 'name' 'description' 'meta' 'actions';
      }
      body.gst-active #user-list-repositories > .col-12 > .float-right,
      body.gst-active #user-starred-repos .col-lg-9 > .col-12 > .float-right { justify-self: end; }
    }
  `;

  function addStyle() {
    if (document.getElementById('gst-style')) return;
    const style = document.createElement('style');
    style.id = 'gst-style';
    style.textContent = STYLE;
    (document.head || document.documentElement).append(style);
  }

  function makeLink(label, href, count) {
    const link = document.createElement('a');
    link.className = 'gst-link';
    link.href = href;
    link.dataset.turboFrame = 'user-profile-frame';
    link.dataset.turboAction = 'advance';
    const name = document.createElement('span');
    name.className = 'gst-name';
    name.textContent = label;
    link.append(name);
    if (count !== null) {
      const number = document.createElement('span');
      number.className = 'gst-count';
      number.textContent = count;
      link.setAttribute('aria-label', `${label}, ${count} repositories`);
      link.append(number);
    }
    return link;
  }

  function updateSelection(nav, route) {
    for (const link of nav.querySelectorAll('.gst-link')) {
      const destination = getRoute(link.href);
      const selected = destination && destination.kind === route.kind &&
        (route.kind === 'all' || destination.slug === route.slug);
      if (selected) {
        link.setAttribute('aria-current', 'page');
        revealSelection(link.parentElement, link);
      } else link.removeAttribute('aria-current');
    }
  }

  function makeButton(label, id, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.textContent = label;
    if (id) button.id = id;
    button.addEventListener('click', action);
    return button;
  }

  function makeDialog(id, title) {
    document.getElementById(id)?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'gst-dialog';
    const heading = document.createElement('h2');
    heading.id = `${id}-title`;
    heading.textContent = title;
    dialog.setAttribute('aria-labelledby', heading.id);
    dialog.append(heading);
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    return dialog;
  }

  function orderKey(owner) {
    return `gst-list-order:${owner.toLowerCase()}`;
  }

  async function savedOrder(owner) {
    try {
      return typeof GM_getValue === 'function' ? await GM_getValue(orderKey(owner), []) : [];
    } catch {
      return [];
    }
  }

  async function showLists(nav, route, lists) {
    const order = await savedOrder(route.owner);
    const current = getRoute(location.href);
    if (!nav.isConnected || !current || current.owner.toLowerCase() !== route.owner.toLowerCase()) return;
    renderNavigation(nav, current, orderLists(lists, order), null);
  }

  function prepareCreateDialog(doc, route) {
    if (document.querySelector('meta[name="user-login"]')?.content.toLowerCase() !== route.owner.toLowerCase()) return;
    const trigger = [...doc.querySelectorAll('#user-profile-frame button[data-show-dialog-id]')]
      .find(button => button.textContent.trim() === 'Create list');
    const dialog = trigger && doc.getElementById(trigger.dataset.showDialogId);
    const helper = dialog?.closest('dialog-helper');
    if (!helper) return;
    document.getElementById('gst-native-create')?.remove();
    const element = doc === document ? helper : document.importNode(helper, true);
    element.id = 'gst-native-create';
    document.body.append(element);
  }

  function openOrderDialog(nav) {
    const route = getRoute(location.href);
    if (!route) return;
    const dialog = makeDialog('gst-order-dialog', 'Reorder lists');
    const hint = document.createElement('p');
    hint.textContent = 'Use the arrows to arrange lists. The order is saved in this script manager.';
    const items = document.createElement('ol');
    items.id = 'gst-order-items';
    for (const list of nav.__gstLists || []) {
      const row = document.createElement('li');
      row.dataset.href = list.href;
      const name = document.createElement('span');
      name.textContent = list.name;
      const up = makeButton('↑', null, () => row.previousElementSibling?.before(row));
      const down = makeButton('↓', null, () => row.nextElementSibling?.after(row));
      up.classList.add('gst-order-up');
      down.classList.add('gst-order-down');
      up.setAttribute('aria-label', `Move ${list.name} up`);
      down.setAttribute('aria-label', `Move ${list.name} down`);
      row.append(name, up, down);
      items.append(row);
    }
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'gst-dialog-actions';
    const save = makeButton('Save order', 'gst-order-save', async () => {
      const order = [...items.children].map(row => row.dataset.href);
      try {
        if (typeof GM_setValue !== 'function') throw new Error('Userscript storage unavailable');
        await GM_setValue(orderKey(route.owner), order);
        if (nav.isConnected) renderNavigation(nav, getRoute(location.href) || route, orderLists(nav.__gstLists, order), null);
        dialog.close();
      } catch {
        status.textContent = 'Could not save the order in the script manager.';
      }
    });
    actions.append(save, makeButton('Cancel', null, () => dialog.close()));
    dialog.append(hint, items, status, actions);
    dialog.showModal();
  }

  function openManagement(nav) {
    const route = getRoute(location.href);
    if (!route) return;
    const dialog = makeDialog('gst-manage-dialog', 'Manage lists');
    const actions = document.createElement('div');
    actions.className = 'gst-manage-actions';
    const own = document.querySelector('meta[name="user-login"]')?.content.toLowerCase() === route.owner.toLowerCase();
    const nativeDialog = selector => document.querySelector(selector);
    const openNative = selector => {
      const target = nativeDialog(selector);
      if (!target) return;
      dialog.close();
      target.showModal();
    };
    const create = makeButton('Create list', 'gst-manage-create', () => openNative('#gst-native-create dialog'));
    const edit = makeButton('Edit current list', 'gst-manage-edit', () => openNative('dialog[id^="edit-list-dialog-"]'));
    const remove = makeButton('Delete current list', 'gst-manage-delete', () => openNative('dialog[id^="delete-list-dialog-"]'));
    create.disabled = !own || !nativeDialog('#gst-native-create dialog');
    edit.disabled = !own || route.kind !== 'list' || !nativeDialog('dialog[id^="edit-list-dialog-"]');
    remove.disabled = !own || route.kind !== 'list' || !nativeDialog('dialog[id^="delete-list-dialog-"]');
    const reorder = makeButton('Reorder lists', 'gst-manage-order', () => { dialog.close(); openOrderDialog(nav); });
    reorder.disabled = !nav.__gstLists?.length;
    actions.append(create, edit, remove, reorder);
    dialog.append(actions);
    if (own && route.kind === 'all') {
      const hint = document.createElement('p');
      hint.textContent = 'Select a list to edit or delete it.';
      dialog.append(hint);
    }
    dialog.append(makeButton('Close', null, () => dialog.close()));
    dialog.lastElementChild.style.marginTop = '16px';
    dialog.showModal();
  }

  function renderNavigation(nav, route, lists, status) {
    const links = document.createElement('div');
    links.className = 'gst-links';
    links.append(makeLink('All repositories', `/${route.owner}?tab=stars`, null));
    const section = document.createElement('div');
    section.className = 'gst-section';
    const sectionLabel = document.createElement('span');
    sectionLabel.textContent = 'Lists';
    const manage = document.createElement('button');
    manage.id = 'gst-manage';
    manage.type = 'button';
    manage.textContent = '⋯';
    manage.setAttribute('aria-label', 'Manage lists');
    manage.addEventListener('click', () => openManagement(nav));
    section.append(sectionLabel, manage);
    links.append(section);
    for (const list of lists) links.append(makeLink(list.name, list.href, list.count));
    if (status) {
      const message = document.createElement('p');
      message.className = 'gst-message';
      message.textContent = status === 'loading' ? 'Loading lists…' : 'Could not load lists. ';
      if (status === 'error') {
        const retry = document.createElement('button');
        retry.className = 'gst-retry';
        retry.type = 'button';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => loadLists(nav, route));
        message.append(retry);
      }
      links.append(message);
    } else if (!lists.length) {
      const message = document.createElement('p');
      message.className = 'gst-message';
      message.textContent = 'No lists yet';
      links.append(message);
    }
    nav.__gstLists = lists;
    nav.replaceChildren(links);
    updateSelection(nav, route);
  }

  async function loadLists(nav, route) {
    renderNavigation(nav, route, [], 'loading');
    try {
      const response = await fetch(`/${route.owner}?tab=stars`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Failed to load lists');
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const current = getRoute(location.href);
      if (!nav.isConnected || !current || current.owner.toLowerCase() !== route.owner.toLowerCase()) return;
      prepareCreateDialog(doc, route);
      populateLanguages(doc);
      await showLists(nav, current, extractLists(doc, route.owner));
    } catch {
      if (nav.isConnected) renderNavigation(nav, getRoute(location.href) || route, [], 'error');
    }
  }

  let activeSearch = null;
  const languagesByOwner = new Map();

  function populateLanguages(doc) {
    const select = document.getElementById('gst-language');
    const route = getRoute(location.href);
    if (!select || !route) return;
    const owner = route.owner.toLowerCase();
    const found = new Map();
    for (const link of doc.querySelectorAll('#stars-language-filter-menu-list a[href*="language="]')) {
      const url = new URL(link.getAttribute('href'), ORIGIN);
      const language = url.searchParams.get('language');
      const label = link.textContent.trim();
      if (language && label) found.set(language.toLowerCase(), { language, label });
    }
    if (found.size) languagesByOwner.set(owner, [...found.values()]);
    const seen = new Set([...select.options].map(option => option.value.toLowerCase()));
    const languages = languagesByOwner.get(owner) || [];
    for (const { language, label } of [...languages].sort((a, b) => a.label.localeCompare(b.label))) {
      if (!seen.has(language.toLowerCase())) select.add(new Option(label, language));
    }
    select.__gstRender?.();
  }

  function repositoryKey(card) {
    const link = card.querySelector('.d-inline-block h2 a[href], .d-inline-block h3 a[href]');
    if (!link) return null;
    return new URL(link.getAttribute('href'), ORIGIN).pathname.replace(/\/$/, '').toLowerCase();
  }

  async function fetchRepositoryPage(url, route, signal) {
    const response = await fetch(url, { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
    const root = route.kind === 'list' ? doc.querySelector('#user-list-repositories') :
      doc.querySelector('#user-starred-repos > .d-lg-flex > .col-lg-9');
    if (!root) throw new Error('GitHub repository list was not found');
    const repositories = [...root.querySelectorAll(':scope > .col-12')].map(card => ({ key: repositoryKey(card), card }))
      .filter(repository => repository.key);
    const countNode = route.kind === 'all' ? doc.querySelector('#user-starred-repos .TableObject-item--primary') :
      [...doc.querySelectorAll('#user-profile-frame > div > .tmp-my-3 > .color-fg-muted')]
        .find(element => element.querySelector('.octicon-repo') || /\b[\d,]+\s+repositor(?:y|ies)\b/i.test(element.textContent));
    const countText = countNode?.textContent.trim().replace(/\s+/g, ' ');
    return { repositories, next: nextPageUrl(root, route), countText: /^[\d,]+\b/.test(countText || '') ? countText : null };
  }

  async function collectRepositories(start, route, signal) {
    const results = [];
    const visited = new Set();
    let url = start;
    while (url) {
      if (visited.has(url)) throw new Error('GitHub returned a repeated page');
      visited.add(url);
      const page = await fetchRepositoryPage(url, route, signal);
      results.push(...page.repositories);
      url = page.next;
    }
    return results;
  }

  let activeMasonry = null;

  function installMasonry(root) {
    if (activeMasonry?.root === root) return;
    if (activeMasonry) {
      activeMasonry.resize.disconnect();
      activeMasonry.mutation.disconnect();
      activeMasonry.root.classList.remove('gst-masonry');
      activeMasonry = null;
    }
    if (!root) return;
    // Assign cards left to right, then stack each column independently.
    const updateColumns = () => {
      const style = getComputedStyle(root);
      const width = root.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const minWidth = parseFloat(style.getPropertyValue('--gst-card-min-width'));
      const gap = parseFloat(style.getPropertyValue('--gst-card-gap'));
      const cards = [...root.children].filter(child => child.classList.contains('col-12'));
      const columns = Math.max(1, Math.min(2, cards.length, Math.floor((width + gap) / (minWidth + gap))));
      cards.forEach((card, index) => card.style.setProperty('--gst-grid-column', String(index % columns + 1)));
    };
    let rootWidth = 0;
    const resize = new ResizeObserver(entries => {
      for (const { target } of entries) {
        if (target === root) {
          if (root.clientWidth !== rootWidth) {
            rootWidth = root.clientWidth;
            updateColumns();
          }
          continue;
        }
        const style = getComputedStyle(target);
        const height = target.getBoundingClientRect().height +
          (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
        // Four-pixel grid tracks leave roughly a 12px gap between cards.
        const span = String(Math.max(1, Math.ceil((height + 12) / 4)));
        if (target.style.getPropertyValue('--gst-grid-span') !== span) target.style.setProperty('--gst-grid-span', span);
      }
    });
    const observeChildren = () => {
      resize.disconnect();
      updateColumns();
      resize.observe(root);
      for (const child of root.children) resize.observe(child);
    };
    const mutation = new MutationObserver(observeChildren);
    activeMasonry = { root, resize, mutation };
    root.classList.add('gst-masonry');
    mutation.observe(root, { childList: true });
    observeChildren();
  }

  let activeStream = null;
  let pageSnapshot = null;

  function stopStream() {
    if (!activeStream) return;
    activeStream.controller.abort();
    activeStream.observer.disconnect();
    activeStream.sentinel.remove();
    activeStream = null;
  }

  function startStream(root, hasMore, getNext, onRetry) {
    stopStream();
    const controller = new AbortController();
    const sentinel = document.createElement('div');
    sentinel.className = 'gst-stream';
    sentinel.setAttribute('role', 'status');
    sentinel.setAttribute('aria-live', 'polite');
    root.append(sentinel);
    let loading = false;
    let failed = false;
    let more = hasMore;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) load();
    }, { rootMargin: '200px 0px' });
    const stream = { root, controller, sentinel, observer };
    activeStream = stream;
    const showEnd = () => { sentinel.textContent = 'All repositories loaded.'; };
    const load = async () => {
      if (!more || loading || failed || activeStream !== stream) return;
      loading = true;
      observer.unobserve(sentinel);
      sentinel.textContent = 'Loading more repositories…';
      try {
        const batch = await getNext(controller.signal);
        if (controller.signal.aborted || !root.isConnected || activeStream !== stream) return;
        for (const card of batch.cards) root.insertBefore(card, sentinel);
        more = batch.hasMore;
        if (!more) showEnd();
        else {
          sentinel.textContent = '';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (activeStream === stream && !controller.signal.aborted) observer.observe(sentinel);
          }));
        }
      } catch {
        if (controller.signal.aborted || activeStream !== stream) return;
        failed = true;
        sentinel.textContent = 'Could not load more repositories.';
        const retry = makeButton('Retry', 'gst-stream-retry', () => stream.retry());
        retry.classList.add('gst-retry');
        sentinel.append(retry);
      } finally {
        loading = false;
      }
    };
    stream.retry = () => {
      if (!failed) return false;
      onRetry?.();
      failed = false;
      load();
      return true;
    };
    if (more) observer.observe(sentinel);
    else showEnd();
  }

  function startNativeStream(root, route) {
    if (activeStream?.root === root) return;
    let next = nextPageUrl(root, route);
    const visited = new Set([location.href]);
    root.querySelector(':scope > .paginate-container')?.remove();
    startStream(root, !!next, async signal => {
      if (visited.has(next)) throw new Error('GitHub returned a repeated page');
      const url = next;
      const page = await fetchRepositoryPage(url, route, signal);
      visited.add(url);
      next = page.next;
      return { cards: page.repositories.map(repository => repository.card), hasMore: !!next };
    });
  }

  function renderResults(target, repositories, status) {
    const pageSize = 30;
    let index = pageSize;
    const children = repositories.slice(0, pageSize).map(repository => repository.card);
    if (!repositories.length) {
      const empty = document.createElement('p');
      empty.className = 'gst-empty';
      empty.textContent = 'No repositories match these filters.';
      children.push(empty);
    }
    target.replaceChildren(...children);
    status.textContent = `${repositories.length} matching ${repositories.length === 1 ? 'repository' : 'repositories'}`;
    startStream(target, index < repositories.length, async () => {
      const cards = repositories.slice(index, index + pageSize).map(repository => repository.card);
      index += pageSize;
      return { cards, hasMore: index < repositories.length };
    });
  }

  function addOptions(select, values) {
    for (const [value, label] of values) select.add(new Option(label, value));
  }

  function makeFilterMenu(select, label, title, defaultText = null) {
    const details = document.createElement('details');
    details.id = `${select.id}-menu`;
    details.className = 'details-reset details-overlay position-relative gst-filter-menu';
    const summary = document.createElement('summary');
    summary.className = 'btn';
    summary.setAttribute('aria-haspopup', 'true');
    const summaryText = document.createElement('span');
    const caret = document.createElement('span');
    caret.className = 'dropdown-caret';
    summary.append(summaryText, document.createTextNode(' '), caret);
    const menu = document.createElement('details-menu');
    menu.className = 'SelectMenu right-0';
    const modal = document.createElement('div');
    modal.className = 'SelectMenu-modal';
    const header = document.createElement('header');
    header.className = 'SelectMenu-header';
    const heading = document.createElement('span');
    heading.className = 'SelectMenu-title';
    heading.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'SelectMenu-closeButton';
    close.setAttribute('aria-label', 'Close menu');
    close.innerHTML = '<svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" class="octicon octicon-x"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 0 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>';
    close.addEventListener('click', () => { details.open = false; summary.focus(); });
    header.append(heading, close);
    const list = document.createElement('div');
    list.className = 'SelectMenu-list';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', title);
    select.hidden = true;
    select.__gstRender = () => {
      const selected = select.selectedOptions[0];
      const valueText = selected?.index === 0 ? defaultText : selected?.textContent;
      summaryText.textContent = valueText ? `${label}: ${valueText}` : label;
      list.replaceChildren();
      for (const option of select.options) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'SelectMenu-item';
        item.dataset.value = option.value;
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(option.selected));
        item.innerHTML = '<svg aria-hidden="true" height="16" width="16" viewBox="0 0 16 16" class="octicon octicon-check SelectMenu-icon SelectMenu-icon--check"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path></svg>';
        item.append(document.createTextNode(option.textContent));
        item.addEventListener('click', () => {
          select.value = option.value;
          select.__gstRender();
          details.open = false;
          summary.focus();
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        list.append(item);
      }
    };
    select.__gstRender();
    modal.append(header, list);
    menu.append(modal);
    details.append(summary, menu, select);
    return details;
  }

  function installToolbar(frame, route) {
    const previous = frame.querySelector(':scope > #gst-toolbar');
    if (previous?.__gstBound) return;
    activeSearch?.abort();
    const toolbar = document.createElement('div');
    toolbar.id = 'gst-toolbar';
    toolbar.__gstBound = true;
    const oldHeading = previous?.querySelector('h1') ||
      (route.kind === 'list' ? frame.querySelector(':scope > div > .tmp-my-3 > div:first-child h1') : null);
    const previousStatus = previous?.querySelector('#gst-results-status');
    const listCount = route.kind === 'list' && !previousStatus ?
      [...frame.querySelectorAll(':scope > div > .tmp-my-3 > .color-fg-muted')]
        .find(element => element.querySelector('.octicon-repo') || /\b[\d,]+\s+repositor(?:y|ies)\b/i.test(element.textContent)) : null;
    const counter = document.querySelector('[data-tab-item="stars"] [data-component="counter"]');
    const counterText = counter?.textContent || '';
    const count = counterText.match(/\(([\d,]+)\)/)?.[1] ||
      (counter?.querySelector('[aria-hidden="true"]') || counter)?.textContent.trim();
    const overviewTotal = count && /^[\d,]+$/.test(count) ? `${count} repositories` : '';
    const scopeTotal = previous?.dataset.gstScopeTotal ||
      (route.kind === 'list' ? listCount?.textContent.trim().replace(/\s+/g, ' ') : overviewTotal) || '';
    toolbar.dataset.gstScopeTotal = scopeTotal;
    const heading = oldHeading || document.createElement('h1');
    previous?.remove();
    if (!oldHeading) heading.textContent = route.kind === 'all' ? 'All repositories' : route.slug;
    const form = document.createElement('form');
    form.id = 'gst-filters';
    form.setAttribute('role', 'search');
    const query = document.createElement('input');
    query.id = 'gst-query';
    query.type = 'search';
    query.className = 'form-control';
    query.placeholder = 'Search repositories';
    query.setAttribute('aria-label', 'Search repositories');
    const submit = document.createElement('button');
    submit.id = 'gst-submit';
    submit.type = 'submit';
    submit.className = 'btn';
    submit.textContent = 'Search';
    const type = document.createElement('select');
    type.id = 'gst-type';
    type.className = 'form-select';
    type.setAttribute('aria-label', 'Repository type');
    addOptions(type, [['', 'All types'], ['public', 'Public'], ['private', 'Private'], ['source', 'Sources'],
      ['fork', 'Forks'], ['sponsorable', 'Can be sponsored'], ['mirror', 'Mirrors'], ['template', 'Templates']]);
    const language = document.createElement('select');
    language.id = 'gst-language';
    language.className = 'form-select';
    language.setAttribute('aria-label', 'Language');
    addOptions(language, [['', 'All languages']]);
    const sort = document.createElement('select');
    sort.id = 'gst-sort';
    sort.className = 'form-select';
    sort.setAttribute('aria-label', 'Sort repositories');
    addOptions(sort, [['default', 'Recently starred'], ['updated', 'Recently active'], ['stars', 'Most stars']]);
    const status = document.createElement('span');
    status.id = 'gst-results-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (previousStatus) status.append(...previousStatus.childNodes);
    else if (listCount) {
      status.append(...listCount.childNodes);
      listCount.remove();
    } else if (route.kind === 'all') {
      const nativeStatus = frame.querySelector('#user-starred-repos .TableObject-item--primary')?.textContent.trim();
      status.textContent = nativeStatus || overviewTotal;
    }
    form.append(query, submit,
      makeFilterMenu(type, 'Type', 'Filter by type', 'All'),
      makeFilterMenu(language, 'Language', 'Filter by language', 'All'),
      makeFilterMenu(sort, 'Sort', 'Sort by', sort.options[0].textContent));
    const titleRow = document.createElement('div');
    titleRow.id = 'gst-heading';
    titleRow.append(heading, status);
    toolbar.append(titleRow, form);
    frame.prepend(toolbar);
    populateLanguages(document);
    if (route.kind === 'all') {
      const params = new URL(location.href).searchParams;
      query.value = params.get('q') || '';
      type.value = params.get('type') || '';
      const selectedLanguage = params.get('language');
      if (selectedLanguage) {
        const option = [...language.options].find(item => item.value.toLowerCase() === selectedLanguage.toLowerCase());
        if (!option) language.add(new Option(selectedLanguage, selectedLanguage));
        language.value = option?.value || selectedLanguage;
      }
      const selectedSort = params.get('sort');
      if (['updated', 'stars'].includes(selectedSort)) sort.value = selectedSort;
    }
    for (const select of [type, language, sort]) select.__gstRender();

    const apply = async () => {
      activeSearch?.abort();
      stopStream();
      const controller = new AbortController();
      activeSearch = controller;
      const filters = { query: query.value.trim(), type: type.value, language: language.value, sort: sort.value };
      const filtered = !!(filters.query || filters.type || filters.language);
      status.textContent = !filtered && scopeTotal ? scopeTotal : 'Loading repositories…';
      const allRoute = { owner: route.owner, kind: 'all', slug: null };
      const listUrl = `${ORIGIN}/stars/${route.owner}/lists/${route.slug}`;
      try {
        const target = route.kind === 'list' ? frame.querySelector('#user-list-repositories') :
          frame.querySelector('#user-starred-repos > .d-lg-flex > .col-lg-9');
        if (!target) throw new Error('GitHub repository list was not found');
        if (route.kind === 'list' && filters.sort === 'default' && filtered) {
          const [all, members] = await Promise.all([
            collectRepositories(buildStarsUrl(route.owner, filters), allRoute, controller.signal),
            collectRepositories(listUrl, route, controller.signal),
          ]);
          if (controller.signal.aborted || !toolbar.isConnected) return;
          renderResults(target, selectRepositories(all, new Set(members.map(repository => repository.key)), true), status);
          return;
        }
        const directList = route.kind === 'list' && filters.sort === 'default';
        const pageRoute = directList ? route : allRoute;
        const url = directList ? listUrl : buildStarsUrl(route.owner, filters);
        const [first, members] = await Promise.all([
          fetchRepositoryPage(url, pageRoute, controller.signal),
          route.kind === 'list' && !directList ? collectRepositories(listUrl, route, controller.signal) : Promise.resolve(null),
        ]);
        if (controller.signal.aborted || !toolbar.isConnected) return;
        const membership = members ? new Set(members.map(repository => repository.key)) : null;
        const totalLabel = !filtered && scopeTotal ? scopeTotal : (membership ? null : first.countText);
        const matches = page => membership ? page.repositories.filter(repository => membership.has(repository.key)) : page.repositories;
        const buffered = matches(first);
        let total = buffered.length;
        let next = first.next;
        let inFlight = null;
        let countError = null;
        const visited = new Set([url]);
        const showCount = () => {
          status.textContent = totalLabel || (next ? 'Counting repositories…' :
            `${total} ${filtered ? 'matching ' : ''}${total === 1 ? 'repository' : 'repositories'}`);
        };
        const scanNext = () => {
          if (inFlight) return inFlight;
          const current = next;
          inFlight = (async () => {
            try {
              if (visited.has(current)) throw new Error('GitHub returned a repeated page');
              const page = await fetchRepositoryPage(current, pageRoute, controller.signal);
              if (controller.signal.aborted || !toolbar.isConnected) return;
              visited.add(current);
              next = page.next;
              const found = matches(page);
              buffered.push(...found);
              total += found.length;
              showCount();
            } catch (error) {
              if (!controller.signal.aborted && toolbar.isConnected) {
                countError = error;
                if (!totalLabel) {
                  status.textContent = 'Could not count repositories. ';
                  status.append(makeButton('Retry', 'gst-count-retry', () => {
                    if (!activeStream?.retry()) retryCount();
                  }));
                }
              }
              throw error;
            }
          })().finally(() => { inFlight = null; });
          return inFlight;
        };
        const countInBackground = async () => {
          while (next && !countError && !controller.signal.aborted && toolbar.isConnected) {
            try { await scanNext(); } catch { return; }
          }
        };
        const retryCount = () => {
          countError = null;
          showCount();
          if (!totalLabel) countInBackground();
        };
        const getNext = async signal => {
          while (!buffered.length && next && !signal.aborted) {
            if (countError) throw countError;
            await scanNext();
          }
          if (signal.aborted || !toolbar.isConnected) return { cards: [], hasMore: false };
          const cards = buffered.splice(0, 30).map(repository => repository.card);
          return { cards, hasMore: !!(buffered.length || next) };
        };
        showCount();
        const batch = await getNext(controller.signal);
        if (controller.signal.aborted || !toolbar.isConnected) return;
        if (!batch.cards.length) {
          const empty = document.createElement('p');
          empty.className = 'gst-empty';
          empty.textContent = 'No repositories match these filters.';
          target.replaceChildren(empty);
        } else target.replaceChildren(...batch.cards);
        startStream(target, batch.hasMore, getNext, retryCount);
        if (!totalLabel && next) countInBackground();
      } catch (error) {
        if (controller.signal.aborted || !toolbar.isConnected) return;
        status.textContent = 'Could not load repositories. ';
        status.append(makeButton('Retry', 'gst-filter-retry', apply));
      }
    };
    form.addEventListener('submit', event => { event.preventDefault(); apply(); });
    for (const select of [type, language, sort]) select.addEventListener('change', apply);
  }

  function activate() {
    const route = getRoute(location.href);
    const { frame, layout, sidebar } = getProfileElements(document);
    if (!route || !frame || !layout || !sidebar) {
      if (!route || document.readyState !== 'loading') document.documentElement.classList.remove('gst-pending');
      document.body?.classList.remove('gst-active');
      document.getElementById('gst-navigation')?.remove();
      activeSearch?.abort();
      stopStream();
      pageSnapshot = null;
      installMasonry(null);
      return;
    }

    addStyle();
    document.body.classList.add('gst-active');
    layout.classList.add('gst-layout');
    layout.parentElement.classList.add('gst-container');
    frame.classList.toggle('gst-overview', route.kind === 'all');
    frame.classList.toggle('gst-list', route.kind === 'list');
    const root = route.kind === 'list' ? frame.querySelector('#user-list-repositories') :
      frame.querySelector('#user-starred-repos > .d-lg-flex > .col-lg-9');
    if (root && pageSnapshot?.root !== root) {
      pageSnapshot = { frame, root, children: [...frame.childNodes].map(node => node.cloneNode(true)) };
    }
    installToolbar(frame, route);
    installMasonry(root);
    if (root) startNativeStream(root, route);
    else { stopStream(); pageSnapshot = null; }
    if (frame.dataset.gstReturnToTop) {
      delete frame.dataset.gstReturnToTop;
      window.scrollTo(0, 0);
    }
    let nav = document.getElementById('gst-navigation');
    if (nav && nav.dataset.owner.toLowerCase() !== route.owner.toLowerCase()) {
      nav.remove();
      nav = null;
    }
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'gst-navigation';
      nav.dataset.owner = route.owner;
      nav.setAttribute('aria-label', 'Star lists');
      sidebar.prepend(nav);
      if (route.kind === 'list') loadLists(nav, route);
    }
    if (route.kind === 'all') {
      prepareCreateDialog(document, route);
      showLists(nav, route, extractLists(document, route.owner));
    } else if (!nav.__gstLists) loadLists(nav, route);
    else updateSelection(nav, route);
    document.documentElement.classList.remove('gst-pending');
  }

  document.addEventListener('click', event => {
    if (!document.body.classList.contains('gst-active')) return;
    const button = event.target.closest('#user-profile-frame user-list-menu button[aria-haspopup="dialog"][aria-controls]');
    const dialog = button && document.getElementById(button.getAttribute('aria-controls'));
    if (dialog && button.closest('user-list-menu').contains(dialog) && !dialog.open) {
      dialog.setAttribute('data-gst-positioning', '');
      const deadline = performance.now() + 500;
      const revealWhenPositioned = () => {
        if (dialog.open) {
          const anchor = button.getBoundingClientRect();
          const bounds = dialog.getBoundingClientRect();
          const expectedLeft = Math.max(0, Math.min(anchor.right - bounds.width, innerWidth - bounds.width));
          if (bounds.width && Math.abs(bounds.left - expectedLeft) <= 16) {
            dialog.removeAttribute('data-gst-positioning');
            return;
          }
        }
        if (!dialog.isConnected || performance.now() >= deadline) dialog.removeAttribute('data-gst-positioning');
        else requestAnimationFrame(revealWhenPositioned);
      };
      requestAnimationFrame(revealWhenPositioned);
    }
  }, true);
  document.addEventListener('click', event => {
    for (const menu of document.querySelectorAll('#gst-filters .gst-filter-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = document.querySelector('#gst-filters .gst-filter-menu[open]');
    if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
  });
  function resetCachedPage() {
    if (!pageSnapshot?.frame.isConnected) return;
    activeSearch?.abort();
    stopStream();
    installMasonry(null);
    const { frame, children } = pageSnapshot;
    frame.replaceChildren(...children.map(node => node.cloneNode(true)));
    frame.dataset.gstReturnToTop = 'true';
    pageSnapshot = null;
    return true;
  }

  document.addEventListener('turbo:before-cache', () => {
    if (resetCachedPage()) queueMicrotask(activate);
  });
  document.addEventListener('turbo:render', activate);
  window.addEventListener('pageshow', event => {
    if (event.persisted) { resetCachedPage(); activate(); }
  });
  document.addEventListener('turbo:load', () => {
    activate();
    queueMicrotask(activate);
  });
  window.addEventListener('resize', () => {
    const route = getRoute(location.href);
    const nav = document.getElementById('gst-navigation');
    if (route && nav) updateSelection(nav, route);
  });
  document.addEventListener('turbo:frame-load', event => {
    if (event.target.id === 'user-profile-frame' || event.target.id === 'user-starred-repos') activate();
  });
  const start = () => {
    if (getRoute(location.href)) {
      document.documentElement.classList.add('gst-pending');
      addStyle();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
    else activate();
  };
  if (document.documentElement) start();
  else {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      start();
    });
    observer.observe(document, { childList: true });
  }
})();
