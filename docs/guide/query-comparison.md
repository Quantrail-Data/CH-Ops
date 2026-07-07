# Query Comparison

Query Comparison lets you put two SELECT queries side by side to see which performs better before you commit to a rewrite. The left pane holds your current query and the right pane an experimental version. It runs under its own per-user ClickHouse® credentials (a compact connect step), independent of the main SQL Editor, and has a fullscreen mode.

Only SELECT queries are allowed here, because the Execute action really runs on the cluster.

## Working with each side

Each pane runs on its own:

- **Estimate** shows that one query's cost estimate, with no comparison.
- **Execute** actually runs that query on the cluster and shows its results. The result table keeps only the first N rows in view and tells you when output was truncated from a larger total.

## Comparing both

The **Compare** action estimates both queries together and shows a side-by-side metric comparison, so you can judge the rewrite against the original on the same footing.
