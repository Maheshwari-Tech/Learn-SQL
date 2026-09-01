window.SQL_PATTERNS = [
  { id: "select-case", name: "Filtering & CASE", symbol: "?", summary: "Predicates, conditional projection, NULL logic, and bucketing." },
  { id: "joins", name: "Joins & Self-Joins", symbol: "⋈", summary: "Model relationships while controlling cardinality and duplication." },
  { id: "aggregation", name: "Aggregation & HAVING", symbol: "Σ", summary: "Collapse rows to the required grain, then filter groups." },
  { id: "subqueries", name: "Subqueries & CTEs", symbol: "↳", summary: "Stage reasoning, compare sets, and isolate intermediate grains." },
  { id: "ranking", name: "Ranking & Top-N", symbol: "#", summary: "Choose winners, runners-up, and top values with explicit ties." },
  { id: "windows", name: "Window Analytics", symbol: "⌁", summary: "Compare rows without losing detail: lag, lead, totals, and frames." },
  { id: "sequences", name: "Gaps, Islands & Sequences", symbol: "…", summary: "Detect consecutive runs, missing values, and state changes." },
  { id: "dates", name: "Dates, Cohorts & Retention", symbol: "◷", summary: "Align time grains, calculate intervals, cohorts, and active periods." },
  { id: "set-logic", name: "Anti-Joins & Set Logic", symbol: "∄", summary: "Express none, all, overlap, and relational-division questions." },
  { id: "pivot", name: "Pivoting & Reshaping", symbol: "⊞", summary: "Turn row values into columns and normalize wide data." },
  { id: "hierarchies", name: "Hierarchies & Recursion", symbol: "⌘", summary: "Walk trees, organizations, graphs, and dependency chains." },
  { id: "dml", name: "DML & Data Cleanup", symbol: "✎", summary: "Delete duplicates, swap values, update safely, and preserve invariants." },
  { id: "strings", name: "Strings & Regular Expressions", symbol: "Aa", summary: "Parse, validate, tokenize, normalize, and aggregate text." },
  { id: "geometry", name: "Pairing & Geometry", symbol: "△", summary: "Generate pairs, compute distances, and avoid mirrored duplicates." },
  { id: "simulation", name: "Advanced Reporting & Simulation", symbol: "◇", summary: "Running state, recursive events, allocation, and multi-stage reports." }
];

window.SQL_PATTERN_LESSONS = {
  "select-case": {
    recognize: "The output changes according to row-level rules: classify, validate, replace, or keep rows meeting several predicates.",
    steps: ["Write the truth table, including NULL.", "Put row filters in WHERE and output rules in CASE.", "Test every boundary and the ELSE branch."],
    example: "SELECT id,\n  CASE WHEN score >= 90 THEN 'A'\n       WHEN score >= 80 THEN 'B'\n       ELSE 'C' END AS grade\nFROM exams;",
    dialect: "Both dialects share CASE. PostgreSQL supports FILTER for conditional aggregates; MySQL commonly uses SUM(CASE …)."
  },
  "joins": {
    recognize: "The prompt asks you to combine entities, compare a row with a related row, or preserve records even when a match is missing.",
    steps: ["Declare the output grain.", "Write the relationship and expected cardinality above each JOIN.", "Choose INNER, LEFT, or self-join; check multiplication before selecting columns."],
    example: "SELECT e.name, m.name AS manager\nFROM employee AS e\nLEFT JOIN employee AS m\n  ON m.id = e.manager_id;",
    dialect: "JOIN syntax is portable. PostgreSQL is stricter about grouped columns, which often exposes accidental cardinality assumptions."
  },
  "aggregation": {
    recognize: "The result has one row per group and asks for counts, sums, averages, minimums, maximums, or group-level conditions.",
    steps: ["Name the grouping key—the new grain.", "Filter source rows in WHERE.", "Aggregate, then filter aggregate results in HAVING."],
    example: "SELECT department_id, COUNT(*) AS employees\nFROM employee\nGROUP BY department_id\nHAVING COUNT(*) >= 5;",
    dialect: "PostgreSQL requires every non-aggregated selected column in GROUP BY unless functional dependency is provable."
  },
  "subqueries": {
    recognize: "A comparison needs a result computed from another set, or the reasoning becomes clearer as several named stages.",
    steps: ["Give each CTE one grain and one job.", "Reduce rows early without changing meaning.", "Check whether a correlated subquery runs once per outer row."],
    example: "WITH average_pay AS (\n  SELECT AVG(salary) AS value FROM employee\n)\nSELECT e.*\nFROM employee AS e CROSS JOIN average_pay\nWHERE e.salary > average_pay.value;",
    dialect: "Modern MySQL and PostgreSQL support CTEs. PostgreSQL also supports MATERIALIZED / NOT MATERIALIZED control when plan shape matters."
  },
  "ranking": {
    recognize: "Words such as highest, latest, top N, second, winner, or tied point to an ordered rank within one or more groups.",
    steps: ["Choose the partition—the competition group.", "Choose tie semantics: ROW_NUMBER, RANK, or DENSE_RANK.", "Filter the computed rank in an outer query."],
    example: "WITH r AS (\n  SELECT *, DENSE_RANK() OVER (\n    PARTITION BY department_id\n    ORDER BY salary DESC\n  ) AS place\n  FROM employee\n)\nSELECT * FROM r WHERE place <= 3;",
    dialect: "Window ranking is portable in MySQL 8+ and PostgreSQL. Always add a deterministic tiebreaker for ROW_NUMBER."
  },
  "windows": {
    recognize: "You must compare neighboring rows, keep row detail while adding a group metric, or compute a running or rolling value.",
    steps: ["Set PARTITION BY to the independent series.", "Make ORDER BY deterministic.", "Write ROWS/RANGE frame bounds explicitly for cumulative and rolling work."],
    example: "SELECT day, revenue,\n  SUM(revenue) OVER (\n    ORDER BY day\n    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW\n  ) AS seven_row_total\nFROM daily_sales;",
    dialect: "Both support core windows. Date-based RANGE frames and interval syntax differ; ROWS frames are the safest portable choice."
  },
  "sequences": {
    recognize: "The prompt says consecutive, continuous, streak, gap, island, missing, overlapping, or changed state.",
    steps: ["Order the series and use LAG to mark breaks.", "Cumulatively sum break flags to create island ids.", "Aggregate each island and keep those meeting the run rule."],
    example: "WITH marked AS (\n  SELECT *, CASE WHEN day = LAG(day) OVER (\n    PARTITION BY user_id ORDER BY day\n  ) + INTERVAL '1 day' THEN 0 ELSE 1 END AS new_run\n  FROM activity\n)\nSELECT * FROM marked;",
    dialect: "The pattern is identical; MySQL uses DATE_ADD/INTERVAL forms while PostgreSQL permits direct date + interval arithmetic."
  },
  "dates": {
    recognize: "The output is grouped by day/month/year, compares intervals, finds a first event, or measures retention and cohorts.",
    steps: ["Normalize timestamps to the requested timezone and grain.", "Use half-open ranges: start inclusive, next boundary exclusive.", "Build a calendar spine when missing periods must appear."],
    example: "SELECT DATE_TRUNC('month', ordered_at) AS month,\n       SUM(amount) AS revenue\nFROM orders\nWHERE ordered_at >= DATE '2025-01-01'\n  AND ordered_at < DATE '2026-01-01'\nGROUP BY 1;",
    dialect: "PostgreSQL uses DATE_TRUNC/TO_CHAR; MySQL uses DATE_FORMAT. Boundary-range filtering is portable and index-friendly."
  },
  "set-logic": {
    recognize: "The language contains none, never, every, all, only, missing, both, or not C—questions about membership rather than arithmetic.",
    steps: ["Translate the English into EXISTS or NOT EXISTS.", "For 'all', search for a missing required match.", "Avoid NOT IN when the subquery can contain NULL."],
    example: "SELECT c.id\nFROM customer AS c\nWHERE NOT EXISTS (\n  SELECT 1 FROM orders AS o\n  WHERE o.customer_id = c.id\n);",
    dialect: "EXISTS and NOT EXISTS are portable and NULL-safe. PostgreSQL also offers rich set operators, including EXCEPT and INTERSECT."
  },
  "pivot": {
    recognize: "Category values must become columns, columns must become rows, or a report needs one column per month/store/status.",
    steps: ["Create the full row spine first.", "Use conditional aggregation for a fixed set of columns.", "Use generated SQL only when categories are truly dynamic."],
    example: "SELECT id,\n  MAX(CASE WHEN month = 'Jan' THEN revenue END) AS jan,\n  MAX(CASE WHEN month = 'Feb' THEN revenue END) AS feb\nFROM sales\nGROUP BY id;",
    dialect: "Conditional aggregation is portable. PostgreSQL's FILTER can be clearer; dynamic pivots require dialect-specific generated SQL."
  },
  "hierarchies": {
    recognize: "Rows reference parents: employees and managers, folders, categories, dependencies, or arbitrary-depth reporting lines.",
    steps: ["Choose the root rows—the anchor query.", "Join children in the recursive member.", "Carry depth and a visited path to enforce limits and prevent cycles."],
    example: "WITH RECURSIVE org AS (\n  SELECT id, manager_id, 0 AS depth FROM employee WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.id, e.manager_id, o.depth + 1\n  FROM employee AS e JOIN org AS o ON e.manager_id = o.id\n)\nSELECT * FROM org;",
    dialect: "Both targets support recursive CTEs. PostgreSQL has array paths and SEARCH/CYCLE features useful for robust traversal."
  },
  "dml": {
    recognize: "The prompt asks to delete duplicates, swap values, repair data, or change table state rather than return a report.",
    steps: ["Write and review the identifying SELECT first.", "Make the survivor/update rule deterministic.", "Run in a transaction and verify affected-row counts."],
    example: "DELETE FROM person AS duplicate\nUSING person AS keeper\nWHERE duplicate.email = keeper.email\n  AND duplicate.id > keeper.id;",
    dialect: "PostgreSQL uses DELETE … USING; MySQL supports multi-table DELETE. Update-join syntax also differs."
  },
  "strings": {
    recognize: "The task validates, extracts, splits, normalizes, or aggregates text, emails, domains, hashtags, or identifiers.",
    steps: ["Write the accepted language in examples before writing a regex.", "Anchor the whole string when validating.", "Test case, punctuation, whitespace, empty strings, and collation."],
    example: "SELECT email\nFROM users\nWHERE email ~ '^[A-Za-z][A-Za-z0-9_.-]*@example\\.com$';",
    dialect: "PostgreSQL uses ~ / ~*; MySQL uses REGEXP and collation controls. String splitting and aggregation functions differ."
  },
  "geometry": {
    recognize: "The query must form pairs or triplets, compare coordinates, calculate distance/area, or avoid mirrored combinations.",
    steps: ["Self-join on a strict ordering such as a.id < b.id.", "Compute the measure once per unordered pair.", "Handle identical coordinates and equality boundaries explicitly."],
    example: "SELECT a.id, b.id,\n  SQRT(POWER(a.x-b.x, 2) + POWER(a.y-b.y, 2)) AS distance\nFROM point AS a\nJOIN point AS b ON a.id < b.id;",
    dialect: "Core arithmetic is portable. Numeric types, POWER return types, and spatial extensions vary."
  },
  "simulation": {
    recognize: "The answer depends on ordered state changes, allocation, capacity, event pairing, or several dependent reporting stages.",
    steps: ["Write the state transition or invariant in plain language.", "Separate event normalization, state calculation, and final reporting into CTEs.", "Validate each stage using the smallest counterexample."],
    example: "WITH events AS (...),\nordered AS (...),\nstate AS (...)\nSELECT entity_id, final_state\nFROM state\nWHERE is_terminal;",
    dialect: "Prefer window functions before recursion. When recursion is necessary, termination and recursion limits differ between MySQL and PostgreSQL."
  }
};
