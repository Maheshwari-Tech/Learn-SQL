window.SQL_TOOLKIT = [
  {
    id: "execution-order", name: "Query execution order", badge: "foundation",
    use: "Use this to explain why an alias is unavailable in WHERE, why HAVING sees aggregates, and where window results can be filtered.",
    theory: "SQL is written SELECT-first but reasoned FROM-first. A useful logical order is FROM/JOIN → WHERE → GROUP BY → HAVING → window functions → SELECT → DISTINCT → ORDER BY → LIMIT.",
    method: ["Build the row source in FROM/JOIN.", "Remove source rows with WHERE.", "Change grain with GROUP BY and HAVING.", "Compute windows, project, sort, and limit."],
    example: "SELECT department_id, COUNT(*) AS headcount\nFROM employee\nWHERE active = true\nGROUP BY department_id\nHAVING COUNT(*) >= 5\nORDER BY headcount DESC;",
    pitfalls: "Do not filter an aggregate in WHERE or a window alias in the same SELECT level. Add an outer query when a later logical phase must become filterable.",
    dialect: "The logical model is shared by MySQL and PostgreSQL, even when optimizers physically reorder work."
  },
  {
    id: "null", name: "NULL & three-valued logic", badge: "essential",
    use: "Use this whenever a column can be missing, an outer join creates NULLs, or a subquery feeds IN / NOT IN.",
    theory: "NULL means unknown, not zero or an empty string. Comparisons with NULL produce UNKNOWN; WHERE keeps only TRUE. Use IS NULL, IS NOT NULL, COALESCE, and NULL-safe set logic.",
    method: ["Decide whether missing is a value, an absence, or invalid data.", "Write the desired behavior for TRUE, FALSE, and UNKNOWN.", "Prefer NOT EXISTS over NOT IN when NULL may enter the subquery."],
    example: "SELECT customer_id\nFROM customer AS c\nWHERE NOT EXISTS (\n  SELECT 1 FROM orders AS o\n  WHERE o.customer_id = c.customer_id\n);",
    pitfalls: "col = NULL is never TRUE. LEFT JOIN followed by WHERE right.col = value often collapses into an inner join. COUNT(column) ignores NULL; COUNT(*) does not.",
    dialect: "PostgreSQL supports IS DISTINCT FROM for NULL-safe equality. MySQL provides the NULL-safe equality operator <=>."
  },
  {
    id: "joins", name: "JOINs & cardinality", badge: "core",
    use: "Use JOIN to combine related entities, compare a row with a parent/peer, or retain unmatched rows from one side.",
    theory: "The important question is not syntax but cardinality: how many output rows can one input row create? INNER keeps matches; LEFT preserves the left side; self-joins compare rows from the same relation.",
    method: ["Declare one output row represents what.", "Mark each relationship 1:1, 1:N, or N:M.", "Join on the full key and measure row counts before and after."],
    example: "SELECT p.name, a.city\nFROM person AS p\nLEFT JOIN address AS a\n  ON a.person_id = p.person_id;",
    pitfalls: "Missing part of a composite key multiplies rows. Filtering the nullable side in WHERE removes unmatched rows. DISTINCT can hide a broken join instead of fixing it.",
    dialect: "Core joins are portable. PostgreSQL supports FULL OUTER JOIN; MySQL usually emulates it with UNION."
  },
  {
    id: "grouping", name: "GROUP BY & HAVING", badge: "core",
    use: "Use grouping when the output grain is one row per entity, day, category, or other key and the prompt asks for group metrics.",
    theory: "GROUP BY changes the grain. WHERE filters rows before the collapse; HAVING filters groups after aggregate values exist.",
    method: ["Write the target grouping key first.", "Choose COUNT(*), COUNT(DISTINCT x), SUM, AVG, MIN, or MAX deliberately.", "Put aggregate predicates in HAVING using the aggregate expression."],
    example: "SELECT email\nFROM person\nGROUP BY email\nHAVING COUNT(*) > 1;",
    pitfalls: "COUNT(DISTINCT) and COUNT(*) answer different questions. AVG ignores NULL. Selecting an ungrouped column produces ambiguous or invalid results.",
    dialect: "PostgreSQL enforces grouping rules strictly. MySQL should use ONLY_FULL_GROUP_BY so incorrect nondeterministic queries fail early."
  },
  {
    id: "grain", name: "Row grain & collapsing", badge: "foundation",
    use: "Use this concept before every query. It tells you whether one output row represents an employee, department, customer-day, order, or another unit.",
    theory: "'Collapse rows' is not a SQL function. It means GROUP BY combines many input rows into one output row per grouping key. That changes the grain. A window function such as RANK does not collapse rows—it keeps every row and adds a calculated value.",
    method: ["Write: one output row represents ____.", "If the output grain is coarser than the input, GROUP BY the new key.", "If every input row must remain, use a window function instead of GROUP BY."],
    example: "-- Collapses 100 employees into one row per department\nSELECT department_id, AVG(salary) AS avg_salary\nFROM employee\nGROUP BY department_id;\n\n-- Keeps all 100 employees and adds their department average\nSELECT employee_id, department_id, salary,\n       AVG(salary) OVER (PARTITION BY department_id) AS avg_salary\nFROM employee;",
    pitfalls: "Grouping too early loses row-level detail. Joining after aggregation may use the wrong grain. Adding DISTINCT is not a principled way to repair an accidental row multiplication.",
    dialect: "Grain is a relational design concept shared by both databases; PostgreSQL's stricter grouping checks often reveal grain mistakes earlier."
  },
  {
    id: "case", name: "CASE & conditional aggregation", badge: "core",
    use: "Use CASE to classify values, express branch logic, calculate conditional counts/sums, and build fixed pivots.",
    theory: "CASE is SQL's if/else expression. A searched CASE tests independent conditions; a simple CASE compares one expression with several values. CASE returns one value, so it can appear in SELECT, ORDER BY, aggregates, and predicates.",
    method: ["Order conditions from specific to general.", "Add an explicit ELSE.", "For counts, return 1/0; for sums, return the measure/0."],
    example: "SELECT department_id,\n  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count\nFROM employee\nGROUP BY department_id;",
    pitfalls: "The first matching WHEN wins. Missing ELSE returns NULL. Overlapping branches can silently misclassify boundary values.",
    dialect: "CASE is portable. PostgreSQL's COUNT(*) FILTER (WHERE …) is often clearer; CASE remains the portable form."
  },
  {
    id: "subqueries", name: "Subqueries", badge: "core",
    use: "Use a subquery when a predicate or value depends on a separately computed set, scalar, or existence test.",
    theory: "A subquery can return one value, one row, a table, or only prove existence. Correlated subqueries refer to the outer row and may be logically evaluated per row.",
    method: ["State the required shape: scalar, list, relation, or existence.", "Guarantee scalar subqueries return at most one row.", "Use EXISTS for membership when payload columns are irrelevant."],
    example: "SELECT e.name\nFROM employee AS e\nWHERE e.salary > (SELECT AVG(salary) FROM employee);",
    pitfalls: "A scalar subquery returning multiple rows fails. NOT IN is poisoned by NULL. Repeated correlation may be slower than a pre-aggregated join.",
    dialect: "Both optimizers can decorrelate many subqueries. PostgreSQL also supports LATERAL; MySQL supports lateral derived tables in modern versions."
  },
  {
    id: "ctes", name: "CTEs & WITH", badge: "core",
    use: "Use WITH to name reasoning stages, reuse a derived relation, or recursively walk a sequence or hierarchy.",
    theory: "A CTE is a named query result scoped to one statement. It is most valuable when every stage has a declared grain and a clear responsibility.",
    method: ["Name CTEs by meaning, not t1/t2.", "Keep one transformation per CTE.", "Check row counts and uniqueness at every boundary."],
    example: "WITH department_pay AS (\n  SELECT department_id, AVG(salary) AS avg_salary\n  FROM employee GROUP BY department_id\n)\nSELECT * FROM department_pay WHERE avg_salary > 100000;",
    pitfalls: "More CTEs do not automatically mean clearer SQL. Reusing a CTE can alter materialization choices. Recursive CTEs need an anchor and guaranteed termination.",
    dialect: "MySQL 8+ and PostgreSQL support CTEs and recursion. PostgreSQL offers MATERIALIZED hints and richer recursion features."
  },
  {
    id: "exists", name: "EXISTS & set operators", badge: "core",
    use: "Use EXISTS/NOT EXISTS for any/none and UNION, INTERSECT, or EXCEPT when combining complete result sets.",
    theory: "EXISTS asks whether at least one matching row exists and can stop at the first match. Relational division—customers who bought every product—is usually a double NOT EXISTS or equal distinct counts.",
    method: ["Translate any → EXISTS and none → NOT EXISTS.", "Translate all → there does not exist a missing requirement.", "Choose UNION ALL unless deduplication is part of the requirement."],
    example: "SELECT c.id\nFROM customer AS c\nWHERE NOT EXISTS (\n  SELECT 1 FROM product AS p\n  WHERE NOT EXISTS (\n    SELECT 1 FROM purchase AS x\n    WHERE x.customer_id = c.id AND x.product_id = p.id\n  )\n);",
    pitfalls: "UNION removes duplicates and costs work. Set operands must have compatible types. Empty required sets make an 'all' condition vacuously true.",
    dialect: "PostgreSQL supports EXCEPT/INTERSECT directly. MySQL 8.0.31+ supports them; EXISTS forms remain broadly portable."
  },
  {
    id: "ranking-functions", name: "ROW_NUMBER, RANK & DENSE_RANK", badge: "advanced",
    use: "Use ranking when the prompt asks for top N, highest/lowest, first/latest, second/third, winners, or ties within a group.",
    theory: "For ordered values 100, 100, 90: ROW_NUMBER gives 1,2,3; RANK gives 1,1,3; DENSE_RANK gives 1,1,2. ROW_NUMBER chooses rows, RANK models competition places with gaps, and DENSE_RANK models distinct value levels without gaps.",
    method: ["PARTITION BY the independent competition group.", "ORDER BY the measure in the requested direction plus a deterministic tiebreaker when needed.", "Compute the rank in a CTE/subquery, then filter rank in the outer query."],
    example: "WITH ranked AS (\n  SELECT employee_id, department_id, salary,\n    DENSE_RANK() OVER (\n      PARTITION BY department_id\n      ORDER BY salary DESC\n    ) AS salary_rank\n  FROM employee\n)\nSELECT *\nFROM ranked\nWHERE salary_rank <= 3;",
    pitfalls: "ROW_NUMBER silently breaks ties, so it is wrong when all tied winners must be kept. RANK skips numbers after ties. A missing tiebreaker makes ROW_NUMBER nondeterministic.",
    dialect: "All three functions and their OVER clause are portable in MySQL 8+ and PostgreSQL."
  },
  {
    id: "over-clause", name: "OVER, PARTITION BY & frames", badge: "advanced",
    use: "Use OVER to turn a ranking, offset, or aggregate function into a window calculation that keeps the current row visible.",
    theory: "OVER defines the rows a window function can see. PARTITION BY resets the calculation per group. ORDER BY defines sequence. A frame such as ROWS BETWEEN 6 PRECEDING AND CURRENT ROW narrows an ordered partition to a moving subset.",
    method: ["Start with the rows that should be visible to one result row.", "Use PARTITION BY for independent groups and ORDER BY for sequence.", "For running/rolling aggregates, write the frame explicitly; for ranking, no frame is needed."],
    example: "SELECT employee_id, department_id, salary,\n  RANK() OVER (\n    PARTITION BY department_id\n    ORDER BY salary DESC\n  ) AS department_rank,\n  SUM(salary) OVER (\n    PARTITION BY department_id\n  ) AS department_payroll\nFROM employee;",
    pitfalls: "OVER without PARTITION BY sees the whole result set. ORDER BY inside OVER does not sort the final output. The default RANGE frame can include tied peer rows unexpectedly.",
    dialect: "Core OVER syntax is portable. PostgreSQL supports more frame modes and exclusions; explicit ROWS frames travel best across both targets."
  },
  {
    id: "windows", name: "Window functions", badge: "advanced",
    use: "Use windows for ranking, previous/next rows, cumulative totals, rolling metrics, percentiles, and group metrics without collapsing detail.",
    theory: "A window computes across related rows while retaining one result per input row. PARTITION BY creates independent groups; ORDER BY and the frame define which peers participate.",
    method: ["Choose the partition and deterministic order.", "Choose ranking, offset, aggregate, or distribution function.", "Specify ROWS frame boundaries; filter the result in an outer query."],
    example: "SELECT user_id, day, amount,\n  LAG(amount) OVER (PARTITION BY user_id ORDER BY day) AS previous_amount,\n  SUM(amount) OVER (PARTITION BY user_id ORDER BY day ROWS UNBOUNDED PRECEDING) AS running_total\nFROM payment;",
    pitfalls: "The default RANGE frame includes tied peers. ROW_NUMBER without a complete order is nondeterministic. Window functions run after WHERE/GROUP BY.",
    dialect: "MySQL 8+ and PostgreSQL share core windows. PostgreSQL has more frame types and ordered-set aggregates."
  },
  {
    id: "dates", name: "Dates, intervals & cohorts", badge: "analytics",
    use: "Use date tools for daily/monthly reports, elapsed time, first events, rolling periods, retention, and consecutive activity.",
    theory: "Time work begins with the correct type, timezone, and grain. Half-open ranges—start inclusive, next boundary exclusive—avoid end-of-day and precision bugs.",
    method: ["Normalize timezone before truncating.", "Filter with a range rather than formatting the indexed column.", "Build a date spine when zero-activity periods must appear."],
    example: "SELECT DATE_TRUNC('month', created_at) AS month, COUNT(*)\nFROM event\nWHERE created_at >= TIMESTAMP '2025-01-01'\n  AND created_at < TIMESTAMP '2026-01-01'\nGROUP BY 1;",
    pitfalls: "LAG compares the previous available row, not necessarily the previous calendar day. Month lengths and daylight-saving transitions invalidate fixed-duration assumptions.",
    dialect: "PostgreSQL: DATE_TRUNC, intervals, generate_series. MySQL: DATE_FORMAT, DATE_ADD/SUB, recursive calendar CTEs."
  },
  {
    id: "strings", name: "Strings & regex", badge: "specialized",
    use: "Use text functions to validate formats, extract tokens, normalize case, split values, or combine rows into strings.",
    theory: "String correctness depends on collation, case rules, delimiter guarantees, and whether a regex validates the whole string or merely finds a substring.",
    method: ["List valid and invalid examples.", "Anchor validation regexes with ^ and $.", "Keep normalization separate from validation and aggregation."],
    example: "SELECT user_id\nFROM users\nWHERE email ~ '^[A-Za-z][A-Za-z0-9_.-]*@example\\.com$';",
    pitfalls: "Regex dialects differ. LIKE wildcards are % and _. Concatenating NULL may produce NULL. String functions can make an indexed predicate non-sargable.",
    dialect: "PostgreSQL: ~, ~*, STRING_AGG, SPLIT_PART. MySQL: REGEXP, GROUP_CONCAT, SUBSTRING_INDEX."
  },
  {
    id: "dml", name: "INSERT, UPDATE, DELETE & transactions", badge: "production",
    use: "Use DML when changing state: deduplicating rows, swapping values, loading derived data, or repairing records.",
    theory: "A correct mutation protects invariants under concurrency. Identify rows, lock or isolate appropriately, mutate, verify, and commit as one transaction.",
    method: ["Run the target SELECT and record expected count.", "Use a transaction with the narrowest safe predicate.", "Check constraints and affected rows before COMMIT."],
    example: "BEGIN;\nDELETE FROM person AS duplicate\nUSING person AS keeper\nWHERE duplicate.email = keeper.email\n  AND duplicate.id > keeper.id;\nCOMMIT;",
    pitfalls: "A missing predicate can alter the whole table. Deduplication must choose a deterministic survivor. Concurrent inserts can re-create duplicates without a unique constraint.",
    dialect: "PostgreSQL uses DELETE … USING and UPDATE … FROM. MySQL supports joined DELETE/UPDATE and different upsert syntax."
  },
  {
    id: "performance", name: "Indexes, EXPLAIN & sargability", badge: "staff-level",
    use: "Use this after correctness when a query scans too many rows, joins in the wrong order, spills, or behaves unpredictably at scale.",
    theory: "Performance follows cardinality. Useful indexes match selective equality keys first, then range/order keys, while preserving the query's access pattern.",
    method: ["Measure with EXPLAIN ANALYZE on representative data.", "Compare estimated and actual rows at each node.", "Reduce the largest unexpected row set; then choose or adjust indexes."],
    example: "CREATE INDEX idx_orders_customer_created\n  ON orders (customer_id, created_at);\n\n-- Supports equality by customer plus a date range.",
    pitfalls: "Wrapping an indexed column in a function often prevents a range scan. Too many indexes slow writes. An index cannot repair a many-to-many join caused by a wrong key.",
    dialect: "PostgreSQL offers EXPLAIN (ANALYZE, BUFFERS), partial/expression indexes. MySQL offers EXPLAIN ANALYZE and generated-column indexes."
  }
];
