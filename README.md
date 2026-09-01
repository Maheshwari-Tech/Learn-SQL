# SQL Atlas website

SQL Atlas is a pattern-first learning website for MySQL and PostgreSQL. It combines a staff-level SQL knowledge base with 98 unlocked LeetCode Database practice problems.

## Open locally

```bash
npm run dev
```

Then open [http://127.0.0.1:4106](http://127.0.0.1:4106).

Run `npm test` from this repository root before deploying.

## Production deployment

SQL Atlas is an independently deployed static site. Import this repository into Vercel with these project settings:

- Root Directory: `sql-patterns-site`
- Framework Preset: `Other`
- Build Command: leave empty
- Output Directory: leave empty

Vercel can deploy the generated site directly because `index.html`, the browser assets, and the generated catalogs are committed. The GitHub Actions workflow runs the static-site tests for every pull request and every push to `main`.

After the SQL deployment is available, configure its origin in the production environment of the `tech-lead.in` gateway:

```dotenv
SQL_ORIGIN=https://your-sql-deployment.example
```

Also configure the independently deployed candidate workspace:

```dotenv
CANDIDATE_ORIGIN=https://your-candidate-workspace.example
```

Redeploy `tech-lead.in` after changing either origin because its gateway routes are created from these values. Verify the composed production URL at `https://tech-lead.in/candidate/learn/sql/`.

When composed by tech-lead.in, the gateway exposes the same static deployment at `/candidate/learn/sql/`. All browser assets intentionally use relative URLs so no second SQL build or copy is required.

## Learning flow

1. Learn each SQL tool: NULL logic, joins, GROUP BY/HAVING, CASE, subqueries, CTEs, set logic, windows, dates, strings, DML, and performance.
2. Learn the 15 recurring interview patterns and their recognition clues.
3. Filter the 98 unlocked LeetCode problems by pattern and difficulty.
4. Open a side-by-side workspace: practice on the left, hidden solution on the right.
5. Reveal the solution only after attempting it; compare MySQL/PostgreSQL, methods used, reasoning, NULL handling, and edge cases.

The website source is in [`sql-patterns-site`](./sql-patterns-site/). Catalog attribution and licensing are documented in [`sql-patterns-site/ATTRIBUTION.md`](./sql-patterns-site/ATTRIBUTION.md).
