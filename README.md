# GitHub Stars Tweaks

A userscript designed to make GitHub Stars feel like browsing a curated bookshelf, enabling seamless continuous navigation across lists.

## Picture

<img width="1470" height="802" alt="PixPin_2026-11-01_01-36-19" src="https://github.com/user-attachments/assets/7250ae3c-8eb8-4f52-8e48-333d90f92681" />

## Features

- **Side-by-side Switching**: View existing lists in the sidebar and switch between them with a single click. The repository count for the current scope is displayed next to the title, fully preserving browser back/forward history navigation.
- **Compact Presentation**: Repositories are distributed left-to-right into a responsive masonry layout where cards fill upward independently. Displays at most two columns on wider screens and a single column on narrow viewports, keeping page content centered with a constrained max-width. Descriptions are displayed in full; Sponsor buttons on cards and the Starred Topics section on the overview are cleanly hidden from the UI without affecting sponsorship or topic following states.
- **Freshness Colour**: The whole “Updated …” phrase is pinned to the card's right edge so a wrapped metadata row never ends in a lone fragment, and it is tinted on a green → orange → red ramp: fully green for the first month, orange at half a year, fully red at a year, interpolated logarithmically in OKLCH so weeks, months and quarters stay evenly spaced. The three anchors are GitHub's own `--fgColor-success`, `--fgColor-severe` and `--fgColor-danger`, so light and dark themes stay legible, and the relative time itself already states the age, so colour is never the only signal.
- **Continuous Browsing**: Automatically loads the next batch of repositories on scroll when approaching the bottom of all repositories, lists, or filtered views—no manual pagination needed. Retains already-loaded content if a request fails, with a clickable Retry button; browsing restarts from the top when navigating back from a repository page.
- **Unified Filtering**: Both the full Stars overview and individual lists support keyword search, repository type, language, and sorting. Type a keyword and click Search; type, language, and sort use native GitHub-styled dropdown menus that filter immediately on change. Overview results load page-by-page as returned by GitHub; when a list uses a non-default sort, members are fetched first and matching items are rendered progressively. When combining a list's default sort with filters, all matching pages are checked first to preserve native ordering. Filters reset when switching lists.
- **Unified Management**: Click the `⋯` menu next to the sidebar's "Lists" heading to create a new list, or edit or delete the current list via a native GitHub-styled dropdown menu. Select the target list in the sidebar before editing or deleting; create, edit, and delete operations use native GitHub dialogs, requiring explicit confirmation for deletions.

Repositories default to Recently starred, preserving the original page order; Recently active, Most stars, and Name sorting are also available. Name sorts case-insensitively by author and then repository name (A–Z). It loads all matching pages before sorting, then still renders the sorted results in scroll-loaded batches. When filtering, the script uses GitHub's native search results and intersects them with the current list; network or page errors are surfaced clearly and incomplete results will never masquerade as full results.

## Installation & Updates

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [ScriptCat](https://scriptcat.org/) or [Violentmonkey](https://violentmonkey.github.io/) in your browser.
2. Click [`github-stars-tweaks.user.js`](https://github.com/Ckrvxr/github-stars-tweaks/raw/refs/heads/main/github-stars-tweaks.user.js), and install.
3. Refresh the **Stars** tab or any list page on your GitHub profile.

The script runs at early page load and only adjusts the UI on GitHub Stars overview and list detail pages. During initialization, repository areas are briefly hidden to minimize layout shift and flicker. Filtering and list fetching use GitHub same-origin requests—no personal access tokens, Gists, or external services are required, and the script never automatically modifies stars or lists. Create, edit, and delete actions occur only when explicitly performed by the user via GitHub's native dialogs. Disabling the script immediately restores GitHub's native interface.

GitHub's DOM structure may change over time; if a list or filter fails to load, simply click Retry. When no filters are active, sorting uses GitHub's native total count directly without background counting, which may differ slightly from the pagination total. When filters are active and GitHub does not provide an exact count, the script counts matching items in the background, temporarily displaying "Counting repositories…" next to the title before revealing the final count; fetched pages are retained in memory for smooth subsequent scrolling, and retries are available on failure. Background counting and maintaining original category order during filtered searches may take longer for large star collections.

## Verification

Running the complete test suite requires Node.js, `agent-browser`, and Chromium:

```sh
node --test tests/*.test.cjs
node --check github-stars-tweaks.user.js
```

To run only the fast unit tests without browser dependencies:

```sh
node --test tests/stars.test.cjs tests/filter-and-order.test.cjs
```

For requirements and intent, see [`docs/intent/github-stars.md`](docs/intent/github-stars.md).
