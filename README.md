# SQL Atlas website

SQL Atlas is a pattern-first learning website for MySQL and PostgreSQL. It combines a staff-level SQL knowledge base with 98 unlocked LeetCode Database practice problems.

## Open locally

```bash
cd sql-patterns-site
python3 -m http.server 4173
```

Then open [http://127.0.0.1:4106](http://127.0.0.1:4106).

Run `npm test` from this repository root before deploying. For Vercel, select `sql-patterns-site` as the Root Directory and use the “Other” framework preset; no build command is required.

When composed by tech-lead.in, the gateway exposes the same static deployment at `/candidate/learn/sql/`. All browser assets intentionally use relative URLs so no second SQL build or copy is required.

## Learning flow

1. Learn each SQL tool: NULL logic, joins, GROUP BY/HAVING, CASE, subqueries, CTEs, set logic, windows, dates, strings, DML, and performance.
2. Learn the 15 recurring interview patterns and their recognition clues.
3. Filter the 98 unlocked LeetCode problems by pattern and difficulty.
4. Open a side-by-side workspace: practice on the left, hidden solution on the right.
5. Reveal the solution only after attempting it; compare MySQL/PostgreSQL, methods used, reasoning, NULL handling, and edge cases.

The website source is in [`sql-patterns-site`](./sql-patterns-site/). Catalog attribution and licensing are documented in [`sql-patterns-site/ATTRIBUTION.md`](./sql-patterns-site/ATTRIBUTION.md).
