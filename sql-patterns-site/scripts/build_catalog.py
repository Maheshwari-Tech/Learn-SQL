#!/usr/bin/env python3
"""Build the browser catalog from the CC BY-SA Doocs LeetCode SQL index.

The generated website stores titles, links, difficulty, and SQL solution code.
It intentionally does not reproduce LeetCode problem statements or examples.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "data" / "doocs-database-index.md"
TARGET_PATH = ROOT / "data" / "leetcode-unlocked-98.json"
OUTPUT_PATH = ROOT / "data" / "problems.js"
RAW_ROOT = "https://raw.githubusercontent.com/doocs/leetcode/main"


PATTERNS = {
    "select-case": ("Filtering & CASE", "predicate and conditional-expression"),
    "joins": ("Joins & Self-Joins", "relationship and cardinality"),
    "aggregation": ("Aggregation & HAVING", "grouping and aggregate-filter"),
    "subqueries": ("Subqueries & CTEs", "staged-set"),
    "ranking": ("Ranking & Top-N", "partitioned-ranking"),
    "windows": ("Window Analytics", "ordered-window"),
    "sequences": ("Gaps, Islands & Sequences", "gaps-and-islands"),
    "dates": ("Dates, Cohorts & Retention", "time-grain"),
    "set-logic": ("Anti-Joins & Set Logic", "existence and set-comparison"),
    "pivot": ("Pivoting & Reshaping", "reshape"),
    "hierarchies": ("Hierarchies & Recursion", "hierarchy"),
    "dml": ("DML & Data Cleanup", "state-changing"),
    "strings": ("Strings & Regular Expressions", "text-processing"),
    "geometry": ("Pairing & Geometry", "pair-generation"),
    "simulation": ("Advanced Reporting & Simulation", "multi-stage reporting"),
}


MYSQL_OVERRIDES = {
    3374: """WITH RECURSIVE converted AS (
  SELECT
    content_id,
    content_text,
    1 AS pos,
    CASE
      WHEN SUBSTRING(content_text, 1, 1) REGEXP '[A-Za-z]'
        THEN UPPER(SUBSTRING(content_text, 1, 1))
      ELSE SUBSTRING(content_text, 1, 1)
    END AS converted_text
  FROM user_content

  UNION ALL

  SELECT
    content_id,
    content_text,
    pos + 1,
    CONCAT(
      converted_text,
      CASE
        WHEN SUBSTRING(content_text, pos + 1, 1) REGEXP '[A-Za-z]'
          THEN CASE
            WHEN SUBSTRING(content_text, pos, 1) IN (' ', '-')
              THEN UPPER(SUBSTRING(content_text, pos + 1, 1))
            ELSE LOWER(SUBSTRING(content_text, pos + 1, 1))
          END
        ELSE SUBSTRING(content_text, pos + 1, 1)
      END
    )
  FROM converted
  WHERE pos < CHAR_LENGTH(content_text)
)
SELECT content_id, content_text AS original_text, converted_text
FROM converted
WHERE pos = CHAR_LENGTH(content_text)
ORDER BY content_id;""",
    3521: """WITH pairs AS (
  SELECT
    a.product_id AS product1_id,
    b.product_id AS product2_id,
    COUNT(DISTINCT a.user_id) AS customer_count
  FROM ProductPurchases AS a
  JOIN ProductPurchases AS b
    ON b.user_id = a.user_id
   AND b.product_id > a.product_id
  GROUP BY a.product_id, b.product_id
  HAVING COUNT(DISTINCT a.user_id) >= 3
)
SELECT
  p.product1_id,
  p.product2_id,
  i1.category AS product1_category,
  i2.category AS product2_category,
  p.customer_count
FROM pairs AS p
JOIN ProductInfo AS i1 ON i1.product_id = p.product1_id
JOIN ProductInfo AS i2 ON i2.product_id = p.product2_id
ORDER BY p.customer_count DESC, p.product1_id, p.product2_id;""",
}


POSTGRES_OVERRIDES = {
    262: """SELECT
  t.request_at AS \"Day\",
  ROUND(AVG((t.status <> 'completed')::int), 2) AS \"Cancellation Rate\"
FROM Trips AS t
JOIN Users AS client
  ON client.users_id = t.client_id AND client.banned = 'No'
JOIN Users AS driver
  ON driver.users_id = t.driver_id AND driver.banned = 'No'
WHERE t.request_at BETWEEN DATE '2013-10-01' AND DATE '2013-10-03'
GROUP BY t.request_at;""",
    550: """WITH first_login AS (
  SELECT player_id, MIN(event_date) AS event_date
  FROM Activity
  GROUP BY player_id
)
SELECT ROUND(AVG((next_day.player_id IS NOT NULL)::int), 2) AS fraction
FROM first_login AS first_day
LEFT JOIN Activity AS next_day
  ON next_day.player_id = first_day.player_id
 AND next_day.event_date = first_day.event_date + 1;""",
    570: """SELECT manager.name
FROM Employee AS manager
JOIN (
  SELECT managerId
  FROM Employee
  GROUP BY managerId
  HAVING COUNT(*) >= 5
) AS reports ON reports.managerId = manager.id;""",
    607: """SELECT salesperson.name
FROM SalesPerson AS salesperson
WHERE NOT EXISTS (
  SELECT 1
  FROM Orders AS orders
  JOIN Company AS company ON company.com_id = orders.com_id
  WHERE orders.sales_id = salesperson.sales_id
    AND company.name = 'RED'
);""",
    610: """SELECT
  x,
  y,
  z,
  CASE WHEN x + y > z AND x + z > y AND y + z > x
       THEN 'Yes' ELSE 'No' END AS triangle
FROM Triangle;""",
    627: """UPDATE Salary
SET sex = CASE sex WHEN 'f' THEN 'm' ELSE 'f' END;""",
    1174: """WITH first_orders AS (
  SELECT customer_id, MIN(order_date) AS first_order_date
  FROM Delivery
  GROUP BY customer_id
)
SELECT ROUND(
  100.0 * AVG((d.order_date = d.customer_pref_delivery_date)::int),
  2
) AS immediate_percentage
FROM Delivery AS d
JOIN first_orders AS f
  ON f.customer_id = d.customer_id
 AND f.first_order_date = d.order_date;""",
    1193: """SELECT
  TO_CHAR(trans_date, 'YYYY-MM') AS month,
  country,
  COUNT(*) AS trans_count,
  COUNT(*) FILTER (WHERE state = 'approved') AS approved_count,
  SUM(amount) AS trans_total_amount,
  SUM(amount) FILTER (WHERE state = 'approved') AS approved_total_amount
FROM Transactions
GROUP BY TO_CHAR(trans_date, 'YYYY-MM'), country;""",
    1327: """SELECT p.product_name, SUM(o.unit) AS unit
FROM Orders AS o
JOIN Products AS p ON p.product_id = o.product_id
WHERE o.order_date >= DATE '2020-02-01'
  AND o.order_date < DATE '2020-03-01'
GROUP BY p.product_id, p.product_name
HAVING SUM(o.unit) >= 100;""",
    1341: """(
  SELECT u.name AS results
  FROM Users AS u
  JOIN MovieRating AS r ON r.user_id = u.user_id
  GROUP BY u.user_id, u.name
  ORDER BY COUNT(*) DESC, u.name
  LIMIT 1
)
UNION ALL
(
  SELECT m.title AS results
  FROM Movies AS m
  JOIN MovieRating AS r ON r.movie_id = m.movie_id
  WHERE r.created_at >= DATE '2020-02-01'
    AND r.created_at < DATE '2020-03-01'
  GROUP BY m.movie_id, m.title
  ORDER BY AVG(r.rating) DESC, m.title
  LIMIT 1
);""",
    1393: """SELECT
  stock_name,
  SUM(CASE WHEN operation = 'Buy' THEN -price ELSE price END) AS capital_gain_loss
FROM Stocks
GROUP BY stock_name;""",
    1484: """SELECT
  sell_date,
  COUNT(DISTINCT product) AS num_sold,
  STRING_AGG(DISTINCT product, ',' ORDER BY product) AS products
FROM Activities
GROUP BY sell_date
ORDER BY sell_date;""",
    1517: """SELECT user_id, name, mail
FROM Users
WHERE mail ~ '^[A-Za-z][A-Za-z0-9_.-]*@leetcode\\.com$';""",
    1587: """SELECT u.name, SUM(t.amount) AS balance
FROM Users AS u
JOIN Transactions AS t USING (account)
GROUP BY u.account, u.name
HAVING SUM(t.amount) > 10000;""",
    1873: """SELECT
  employee_id,
  CASE WHEN employee_id % 2 = 0 OR LEFT(name, 1) = 'M'
       THEN 0 ELSE salary END AS bonus
FROM employees
ORDER BY employee_id;""",
    1907: """WITH categories(category) AS (
  VALUES ('Low Salary'), ('Average Salary'), ('High Salary')
), counts AS (
  SELECT
    CASE
      WHEN income < 20000 THEN 'Low Salary'
      WHEN income > 50000 THEN 'High Salary'
      ELSE 'Average Salary'
    END AS category,
    COUNT(*) AS accounts_count
  FROM Accounts
  GROUP BY 1
)
SELECT c.category, COALESCE(n.accounts_count, 0) AS accounts_count
FROM categories AS c
LEFT JOIN counts AS n USING (category);""",
    1934: """SELECT
  s.user_id,
  ROUND(
    COALESCE(AVG((c.action = 'confirmed')::int), 0),
    2
  ) AS confirmation_rate
FROM SignUps AS s
LEFT JOIN Confirmations AS c USING (user_id)
GROUP BY s.user_id;""",
    3220: """SELECT
  transaction_date,
  SUM(amount) FILTER (WHERE amount % 2 = 1) AS odd_sum,
  SUM(amount) FILTER (WHERE amount % 2 = 0) AS even_sum
FROM transactions
GROUP BY transaction_date
ORDER BY transaction_date;""",
    3374: """WITH RECURSIVE converted AS (
  SELECT
    content_id,
    content_text,
    1 AS pos,
    CASE
      WHEN SUBSTR(content_text, 1, 1) ~ '[A-Za-z]'
        THEN UPPER(SUBSTR(content_text, 1, 1))
      ELSE SUBSTR(content_text, 1, 1)
    END AS converted_text
  FROM user_content

  UNION ALL

  SELECT
    content_id,
    content_text,
    pos + 1,
    converted_text || CASE
      WHEN SUBSTR(content_text, pos + 1, 1) ~ '[A-Za-z]'
        THEN CASE
          WHEN SUBSTR(content_text, pos, 1) IN (' ', '-')
            THEN UPPER(SUBSTR(content_text, pos + 1, 1))
          ELSE LOWER(SUBSTR(content_text, pos + 1, 1))
        END
      ELSE SUBSTR(content_text, pos + 1, 1)
    END
  FROM converted
  WHERE pos < CHAR_LENGTH(content_text)
)
SELECT content_id, content_text AS original_text, converted_text
FROM converted
WHERE pos = CHAR_LENGTH(content_text)
ORDER BY content_id;""",
    3436: """SELECT user_id, email
FROM Users
WHERE email ~ '^[A-Za-z0-9_]+@[A-Za-z][A-Za-z0-9]*[.]com$'
ORDER BY user_id;""",
    3451: """SELECT ip, COUNT(*) AS invalid_count
FROM logs
WHERE NOT (
  ip ~ '^[0-9]+(\\.[0-9]+){3}$'
  AND NOT EXISTS (
    SELECT 1
    FROM UNNEST(STRING_TO_ARRAY(ip, '.')) AS octet(value)
    WHERE value::int > 255
       OR (LENGTH(value) > 1 AND value LIKE '0%')
  )
)
GROUP BY ip
ORDER BY invalid_count DESC, ip DESC;""",
    3465: """SELECT product_id, product_name, description
FROM products
WHERE description ~ '\\mSN[0-9]{4}-[0-9]{4}\\M'
ORDER BY product_id;""",
    3521: """WITH pairs AS (
  SELECT
    a.product_id AS product1_id,
    b.product_id AS product2_id,
    COUNT(DISTINCT a.user_id) AS customer_count
  FROM ProductPurchases AS a
  JOIN ProductPurchases AS b
    ON b.user_id = a.user_id
   AND b.product_id > a.product_id
  GROUP BY a.product_id, b.product_id
  HAVING COUNT(DISTINCT a.user_id) >= 3
)
SELECT
  p.product1_id,
  p.product2_id,
  i1.category AS product1_category,
  i2.category AS product2_category,
  p.customer_count
FROM pairs AS p
JOIN ProductInfo AS i1 ON i1.product_id = p.product1_id
JOIN ProductInfo AS i2 ON i2.product_id = p.product2_id
ORDER BY p.customer_count DESC, p.product1_id, p.product2_id;""",
    3554: """WITH user_category AS (
  SELECT DISTINCT pp.user_id, pi.category
  FROM ProductPurchases AS pp
  JOIN ProductInfo AS pi USING (product_id)
), pairs AS (
  SELECT a.user_id, a.category AS category1, b.category AS category2
  FROM user_category AS a
  JOIN user_category AS b
    ON b.user_id = a.user_id AND b.category > a.category
)
SELECT category1, category2, COUNT(DISTINCT user_id) AS customer_count
FROM pairs
GROUP BY category1, category2
HAVING COUNT(DISTINCT user_id) >= 3
ORDER BY customer_count DESC, category1, category2;""",
    3617: """WITH ordered AS (
  SELECT
    ss.*,
    LAG(session_date) OVER (
      PARTITION BY student_id ORDER BY session_date, session_id
    ) AS previous_date
  FROM study_sessions AS ss
), islands AS (
  SELECT
    ordered.*,
    SUM((previous_date IS NULL OR session_date - previous_date > 2)::int)
      OVER (PARTITION BY student_id ORDER BY session_date, session_id) AS island_id
  FROM ordered
), segments AS (
  SELECT
    student_id,
    island_id,
    ARRAY_AGG(subject ORDER BY session_date, session_id) AS subjects,
    COUNT(*)::int AS session_count,
    SUM(hours_studied) AS total_study_hours
  FROM islands
  GROUP BY student_id, island_id
  HAVING COUNT(*) >= 6
), candidates AS (
  SELECT segment.*, cycle_length
  FROM segments AS segment
  CROSS JOIN LATERAL GENERATE_SERIES(3, segment.session_count / 2) AS cycle_length
  WHERE segment.session_count % cycle_length = 0
    AND (
      SELECT COUNT(DISTINCT segment.subjects[position])
      FROM GENERATE_SERIES(1, cycle_length) AS position
    ) = cycle_length
    AND NOT EXISTS (
      SELECT 1
      FROM GENERATE_SERIES(1, segment.session_count) AS position
      WHERE segment.subjects[position]
         <> segment.subjects[((position - 1) % cycle_length) + 1]
    )
), valid AS (
  SELECT student_id, island_id, MIN(cycle_length) AS cycle_length,
         MAX(total_study_hours) AS total_study_hours
  FROM candidates
  GROUP BY student_id, island_id
)
SELECT s.student_id, s.student_name, s.major,
       v.cycle_length, v.total_study_hours
FROM valid AS v
JOIN students AS s USING (student_id)
ORDER BY v.cycle_length DESC, v.total_study_hours DESC;""",
    3642: """SELECT
  b.book_id,
  b.title,
  b.author,
  b.genre,
  b.pages,
  MAX(r.session_rating) - MIN(r.session_rating) AS rating_spread,
  ROUND(
    COUNT(*) FILTER (WHERE r.session_rating <= 2 OR r.session_rating >= 4)::numeric
      / COUNT(*),
    2
  ) AS polarization_score
FROM books AS b
JOIN reading_sessions AS r USING (book_id)
GROUP BY b.book_id, b.title, b.author, b.genre, b.pages
HAVING COUNT(*) >= 5
   AND MAX(r.session_rating) >= 4
   AND MIN(r.session_rating) <= 2
   AND COUNT(*) FILTER (WHERE r.session_rating <= 2 OR r.session_rating >= 4)::numeric
         / COUNT(*) >= 0.6
ORDER BY polarization_score DESC, b.title DESC;""",
    3657: """SELECT customer_id
FROM customer_transactions
GROUP BY customer_id
HAVING COUNT(*) >= 3
   AND COUNT(*) FILTER (WHERE transaction_type = 'refund')::numeric / COUNT(*) < 0.2
   AND MAX(transaction_date) - MIN(transaction_date) >= 30
ORDER BY customer_id;""",
}


def classify(problem_id: int, title: str) -> str:
    text = title.lower()

    exact = {
        176: "ranking", 177: "ranking", 178: "ranking", 180: "sequences",
        184: "ranking", 185: "ranking", 262: "windows", 569: "ranking",
        571: "ranking", 574: "ranking", 579: "windows", 601: "sequences",
        608: "hierarchies", 626: "dml", 627: "dml", 1097: "dates",
        1127: "pivot", 1159: "ranking", 1179: "pivot", 1194: "simulation",
        1204: "windows", 1225: "sequences", 1285: "sequences",
        1308: "windows", 1321: "windows", 1336: "simulation", 1369: "ranking",
        1384: "dates", 1412: "ranking", 1435: "pivot", 1440: "joins",
        1454: "sequences", 1459: "geometry", 1479: "pivot", 1596: "ranking",
        1613: "sequences", 1635: "simulation", 1645: "simulation",
        1651: "windows", 1699: "geometry", 1709: "windows", 1747: "set-logic",
        1767: "sequences", 1777: "pivot", 1783: "pivot", 1811: "simulation",
        1831: "ranking", 1841: "simulation", 1892: "set-logic",
        1917: "set-logic", 1919: "set-logic", 1949: "set-logic", 1951: "geometry",
        1972: "windows", 2004: "simulation", 2010: "simulation",
        2066: "windows", 2084: "select-case", 2112: "simulation",
        2118: "strings", 2142: "simulation", 2153: "simulation",
        2159: "ranking", 2173: "sequences", 2175: "windows",
        2199: "strings", 2228: "dates", 2238: "geometry", 2252: "pivot",
        2253: "pivot", 2292: "sequences", 2308: "windows", 2339: "geometry",
        2346: "ranking", 2362: "simulation", 2388: "windows",
        2474: "sequences", 2480: "geometry", 2494: "sequences",
        2701: "sequences", 2720: "set-logic", 2738: "strings",
        2752: "sequences", 2783: "simulation", 2793: "simulation",
        2820: "simulation", 2854: "windows", 2893: "dates",
        2978: "geometry", 2991: "ranking", 2993: "dates", 2994: "dates",
        2995: "sequences", 3050: "geometry", 3052: "simulation",
        3053: "geometry", 3054: "hierarchies", 3055: "ranking",
        3056: "aggregation", 3057: "simulation", 3058: "set-logic",
        3060: "sequences", 3061: "simulation", 3087: "strings",
        3089: "windows", 3103: "strings", 3118: "dates", 3126: "simulation",
        3140: "sequences", 3156: "simulation", 3166: "dates",
        3182: "set-logic", 3188: "set-logic", 3204: "select-case",
        3214: "windows", 3230: "simulation", 3236: "hierarchies",
        3246: "ranking", 3252: "ranking", 3262: "sequences",
        3268: "sequences", 3293: "dates", 3384: "windows",
        3390: "sequences", 3401: "hierarchies", 3421: "windows",
    }
    if problem_id in exact:
        return exact[problem_id]

    keyword_groups = [
        ("dml", ("delete", "swap sex", "exchange seats", "update ")),
        ("strings", ("email", "tweet", "hashtag", "text", "domain", "ip address", "name format", "fix names", "concatenate", "topic of", "valid phone")),
        ("pivot", ("pivot", "unpivot", "reformat", "rearrange", "by day of the week", "each store", "geography")),
        ("hierarchies", ("subordinate", "hierarchy", "tree node", "binary tree", "all people report")),
        ("sequences", ("consecutive", "continuous", "contiguous", "streak", "overlapping", "missing id", "available seats", "strictly increasing", "bursty")),
        ("dates", ("daily", "monthly", "year", "date", "day", "week", "activity", "delivery", "login", "visit", "retention", "cohort", "time spent", "duration")),
        ("ranking", ("highest", "lowest", "largest", "maximum", "minimum", "top ", "rank", "winner", "most recent", "latest", "most frequent", "second ", "third ", "quiet students", "peak ")),
        ("set-logic", ("never", "no sales", "did not", "not make", "missing information", "bought all", "all products", "but not", "without", "no mutual", "all unique", "eligible")),
        ("windows", ("running", "cumulative", "rolling", "previous value", "global ranking", "account balance", "growth rate", "window between")),
        ("geometry", ("rectangle", "triangle", "distance", "coordinate", "pairs", "triplets", "chemical bond")),
        ("aggregation", ("count", "average", "number of", "total", "summary", "percentage", "rate", "categories", "group ", "quality", "performance")),
        ("joins", ("manager", "employee", "students and examinations", "replace employee id", "npv", "product sales", "actors and directors", "trusted contacts")),
        ("select-case", ("valid", "invalid", "find customer referee", "big countries", "not boring", "special bonus", "condition", "low fat", "odd and even", "loan types")),
    ]
    for pattern, keywords in keyword_groups:
        if any(keyword in text for keyword in keywords):
            return pattern
    if any(word in text for word in ("customer", "orders", "sales", "friend", "users", "products")):
        return "joins"
    return "subqueries"


def parse_index(markdown: str) -> list[dict]:
    row_pattern = re.compile(
        r"^\|\s*(\d{4})\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*)\|\s*(Easy|Medium|Hard)\s*\|\s*([^|]*)\|?\s*$",
        re.MULTILINE,
    )
    rows = []
    for match in row_pattern.finditer(markdown):
        frontend_id, title, path, _tag, difficulty, tail = match.groups()
        rows.append({
            "id": int(frontend_id),
            "title": title.replace("\\|", "|").strip(),
            "path": path,
            "difficulty": difficulty,
            "premium": "🔒" in tail,
        })
    if not rows:
        raise RuntimeError("No Database rows were parsed from the source index.")
    return rows


def fetch_text(url: str, attempts: int = 4) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "SQL-Atlas-Catalog-Builder/1.0"})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(0.5 * (attempt + 1))
    raise AssertionError("unreachable")


def solution_url(path: str) -> str:
    clean_path = path.split("#", 1)[0]
    if clean_path.startswith("/"):
        return f"{RAW_ROOT}{clean_path}"
    return f"{RAW_ROOT}/{clean_path}"


def extract_mysql(markdown: str) -> str | None:
    matches = re.findall(r"####\s+MySQL\s*\n+```sql\s*\n(.*?)```", markdown, re.DOTALL | re.IGNORECASE)
    if not matches:
        matches = re.findall(r"####\s+MySQL\s*```sql\s*(.*?)```", markdown, re.DOTALL | re.IGNORECASE)
    if not matches:
        return None
    query = matches[0].strip()
    query = re.sub(r"^#\s*Write your MySQL query statement below\s*\n?", "", query, flags=re.IGNORECASE)
    return query.strip()


def postgres_adaptation(mysql: str) -> tuple[str, str]:
    query = mysql
    status = "portable"
    mysql_tokens = re.compile(
        r"\b(IFNULL|DATE_FORMAT|DATE_ADD|DATE_SUB|DATEDIFF|TIMESTAMPDIFF|GROUP_CONCAT|FIND_IN_SET|DAYOFWEEK|WEEKDAY|STR_TO_DATE|REGEXP|RLIKE|DIV)\b|`|@[A-Za-z_]",
        re.IGNORECASE,
    )
    if mysql_tokens.search(query):
        status = "adapted"

    query = query.replace("`rank`", "rank").replace("`", '"')
    query = re.sub(r"\bIFNULL\s*\(", "COALESCE(", query, flags=re.IGNORECASE)
    query = re.sub(r"\bCURDATE\s*\(\s*\)", "CURRENT_DATE", query, flags=re.IGNORECASE)
    query = re.sub(r"\bNOW\s*\(\s*\)", "CURRENT_TIMESTAMP", query, flags=re.IGNORECASE)
    query = re.sub(r"\bYEAR\s*\(([^()]+)\)", r"EXTRACT(YEAR FROM \1)", query, flags=re.IGNORECASE)
    query = re.sub(r"\bMONTH\s*\(([^()]+)\)", r"EXTRACT(MONTH FROM \1)", query, flags=re.IGNORECASE)
    query = re.sub(r"\bDATE_ADD\s*\(([^,]+),\s*INTERVAL\s+([0-9]+)\s+DAY\s*\)", r"(\1 + INTERVAL '\2 day')", query, flags=re.IGNORECASE)
    query = re.sub(r"\bDATE_SUB\s*\(([^,]+),\s*INTERVAL\s+([0-9]+)\s+DAY\s*\)", r"(\1 - INTERVAL '\2 day')", query, flags=re.IGNORECASE)
    query = re.sub(r"\bDATEDIFF\s*\(([^,]+),\s*([^)]+)\)", r"(\1::date - \2::date)", query, flags=re.IGNORECASE)
    query = re.sub(r"\s+RLIKE\s+", " ~ ", query, flags=re.IGNORECASE)
    query = re.sub(r"\s+REGEXP\s+", " ~ ", query, flags=re.IGNORECASE)
    query = re.sub(r"\bDATE_FORMAT\s*\(([^,]+),\s*'%Y-%m'\s*\)", r"TO_CHAR(\1, 'YYYY-MM')", query, flags=re.IGNORECASE)
    query = re.sub(r"\bDATE_FORMAT\s*\(([^,]+),\s*'%Y-%m-%d'\s*\)", r"TO_CHAR(\1, 'YYYY-MM-DD')", query, flags=re.IGNORECASE)
    query = re.sub(r"\bLIMIT\s+(\d+)\s*,\s*(\d+)", r"LIMIT \2 OFFSET \1", query, flags=re.IGNORECASE)

    unresolved = mysql_tokens.search(query)
    if unresolved:
        status = "needs-review"
        query = "-- PostgreSQL adaptation: replace the remaining MySQL-specific function noted below.\n" + query
    elif status == "adapted":
        query = "-- PostgreSQL adaptation of the MySQL reference solution.\n" + query
    return query, status


def notes(pattern_id: str, title: str) -> tuple[str, str, str]:
    pattern_name, idea = PATTERNS[pattern_id]
    summary = f"Solve {title} with the {pattern_name.lower()} pattern."
    why = f"The query makes the required output grain explicit, then applies {idea} logic before the final projection and ordering."
    edge_by_pattern = {
        "select-case": "Test NULL under three-valued logic and values exactly on every predicate boundary.",
        "joins": "Check unmatched rows and one-to-many matches so the join neither drops nor multiplies the intended grain.",
        "aggregation": "Test empty groups, duplicate inputs, NULL measures, and whether filtering belongs in WHERE or HAVING.",
        "subqueries": "Confirm every intermediate relation has one declared grain and that correlated predicates cannot multiply rows.",
        "ranking": "Test ties explicitly; choose ROW_NUMBER, RANK, or DENSE_RANK according to the prompt's rank semantics.",
        "windows": "Declare the window frame and deterministic ORDER BY; the default RANGE frame can surprise you on ties.",
        "sequences": "Test duplicate dates or ids, broken runs, single-row islands, and whether adjacency is logical or calendar-based.",
        "dates": "Test timezone assumptions, inclusive endpoints, missing dates, leap days, and month-boundary behavior.",
        "set-logic": "Prefer EXISTS/NOT EXISTS when NULLs are possible, and test both empty and duplicate sets.",
        "pivot": "Start from a complete dimension spine so missing categories appear with zero or NULL as the prompt requires.",
        "hierarchies": "Protect recursion from cycles and define whether the root and every depth are included.",
        "dml": "Run the identifying SELECT first and make the survivor or update invariant deterministic.",
        "strings": "Test case, whitespace, punctuation, empty strings, collation, and regex anchoring.",
        "geometry": "Generate each unordered pair once and test duplicate coordinates plus boundary equality.",
        "simulation": "Validate each stage independently and keep state transitions ordered and deterministic.",
    }
    return summary, why, edge_by_pattern[pattern_id]


def slug_from_path(path: str) -> str:
    match = re.search(r"\]\(https://leetcode\.com/problems/([^/)]+)", path)
    return match.group(1) if match else ""


def build() -> None:
    target_data = json.loads(TARGET_PATH.read_text(encoding="utf-8"))
    target_items = target_data["problems"]
    target_by_id = {int(item["id"]): item for item in target_items}
    rows = [row for row in parse_index(INDEX_PATH.read_text(encoding="utf-8")) if row["id"] in target_by_id]
    rows.sort(key=lambda row: target_items.index(target_by_id[row["id"]]))
    if len(rows) != len(target_items):
        missing = sorted(set(target_by_id) - {row["id"] for row in rows})
        raise RuntimeError(f"The source index is missing target problem ids: {missing}")

    fetched: dict[int, tuple[str | None, str | None]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        future_map = {pool.submit(fetch_text, solution_url(row["path"])): row for row in rows}
        completed = 0
        for future in as_completed(future_map):
            row = future_map[future]
            try:
                markdown = future.result()
                fetched[row["id"]] = (markdown, None)
            except Exception as exc:
                fetched[row["id"]] = (None, str(exc))
            completed += 1
            if completed % 20 == 0:
                print(f"Fetched {completed}/{len(rows)}", flush=True)

    problems = []
    failures = []

    for row in rows:
        official = target_by_id[row["id"]]
        markdown, error = fetched[row["id"]]
        mysql = extract_mysql(markdown) if markdown else None
        if error:
            failures.append((row["id"], error))

        slug = official["slug"]
        title = official["title"]
        pattern_id = classify(row["id"], title)
        summary, why, edge = notes(pattern_id, title)
        mysql_query = MYSQL_OVERRIDES.get(
            row["id"],
            mysql or f"-- Source solution unavailable.\n-- Apply the {PATTERNS[pattern_id][0]} playbook to the linked schema.",
        )
        postgres, postgres_status = postgres_adaptation(mysql_query)
        if row["id"] in POSTGRES_OVERRIDES:
            postgres = POSTGRES_OVERRIDES[row["id"]]
            postgres_status = "verified-adaptation"
        problems.append({
            "id": row["id"],
            "title": title,
            "slug": slug,
            "difficulty": official["difficulty"],
            "premium": False,
            "pattern": pattern_id,
            "summary": summary,
            "mysql": mysql_query,
            "postgres": postgres,
            "postgresStatus": postgres_status,
            "why": why,
            "edge": edge,
            "source": "doocs/leetcode",
        })
    payload = json.dumps(problems, ensure_ascii=False, indent=2)
    OUTPUT_PATH.write_text(
        "// Generated by scripts/build_catalog.py. See ATTRIBUTION.md.\n"
        f"window.SQL_PROBLEMS = {payload};\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(problems)} problems to {OUTPUT_PATH}")
    print(f"Exact MySQL solutions: {sum(not p['mysql'].startswith('-- Source') for p in problems)}")
    print(f"Portable PostgreSQL: {sum(p['postgresStatus'] == 'portable' for p in problems)}")
    print(f"Adapted PostgreSQL: {sum(p['postgresStatus'] == 'adapted' for p in problems)}")
    print(f"PostgreSQL needs review: {sum(p['postgresStatus'] == 'needs-review' for p in problems)}")
    if failures:
        print(f"Fetch failures: {len(failures)}", file=sys.stderr)
        for problem_id, error in failures[:20]:
            print(f"  {problem_id}: {error}", file=sys.stderr)


if __name__ == "__main__":
    build()
