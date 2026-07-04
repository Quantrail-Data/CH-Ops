# Global Search

CHOps includes a global page finder so you can jump to any screen without
hunting through the sidebar. It searches page names, features, section labels,
sub-tabs, the section headers shown on each page, and the static text on each
page.

## Opening it

There are three ways to open the search panel:

- Click the Search button in the navbar.
- Click the floating search bubble in the bottom-right corner.
- Press Ctrl+K (or Cmd+K on macOS) from anywhere in the app.

## Using it

Start typing and results update immediately, ranked by relevance. The search is
word based, so you can type several words in any order and partial or fuzzy
terms still match. For example "ddl queue block" finds the DDL and Readonly
page, "compare queries" finds the SQL Editor, and "slack notification" finds the
alert Channels page.

Move through results with the Up and Down arrow keys and press Enter to open the
highlighted page, or click any result. When there are more matches than fit, the
list scrolls.

Close the panel with the X button, by clicking outside it, or by pressing
Escape. Before you type anything, the panel shows a short list of suggested
pages.

## How results are found

Each page carries a curated set of keywords and synonyms, and on top of those
the index automatically folds in three constant sources from the app itself:

- The breadcrumb labels for every page, including section names and sub-tabs.
- The constant section headers shown on each page, collected at build time.
- The constant static text on each page (labels, prompts, empty-state messages,
  and so on), collected at build time and weighted lower than the above so it
  widens recall without outranking the curated terms.

Because of this, both a page's on-screen wording and common alternate phrasings
resolve to the right destination. The search covers pages and features, not the
contents of your ClickHouse data.

## For maintainers

The scraped page-header and page-text portions of the index are regenerated
automatically when the dev server or a production build starts. To refresh them
by hand, run:

```
npm run gen:search-headers
```

The curated keywords live in `src/frontend/utils/searchCatalog.js`.
