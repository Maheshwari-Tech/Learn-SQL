const patterns = window.SQL_PATTERNS || [];
const patternLessons = window.SQL_PATTERN_LESSONS || {};
const toolkit = window.SQL_TOOLKIT || [];
const problems = window.SQL_PROBLEMS || [];
const patternMap = new Map(patterns.map((pattern) => [pattern.id, pattern]));
const toolkitMap = new Map(toolkit.map((tool) => [tool.id, tool]));
const state = {
  query: "", difficulty: "all", pattern: "all", status: "all", visible: 40,
  activeProblem: null, dialect: "mysql", solutionRevealed: false
};
const solved = new Set(JSON.parse(localStorage.getItem("sql-atlas-solved") || "[]").map(String));
const practiceNotes = JSON.parse(localStorage.getItem("sql-atlas-notes") || "{}");

const el = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function countsByPattern() {
  return problems.reduce((counts, problem) => {
    counts[problem.pattern] = (counts[problem.pattern] || 0) + 1;
    return counts;
  }, {});
}

function renderToolkit() {
  const requestedTool = new URLSearchParams(window.location.search).get("tool");
  const initialTool = toolkitMap.has(requestedTool) ? requestedTool : toolkit[0]?.id;
  el("toolIndex").innerHTML = toolkit.map((tool) => `
    <button class="tool-button${tool.id === initialTool ? " is-active" : ""}" type="button" role="tab" data-tool="${tool.id}">
      <span>${escapeHtml(tool.name)}</span><small>${escapeHtml(tool.badge)}</small>
    </button>`).join("");
  if (initialTool) renderToolLesson(initialTool);
}

function renderToolLesson(toolId) {
  const tool = toolkitMap.get(toolId);
  if (!tool) return;
  document.querySelectorAll(".tool-button").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === toolId));
  el("toolLesson").innerHTML = `
    <p class="lesson-kicker"><span>${escapeHtml(tool.badge)}</span> SQL tool</p>
    <h3>${escapeHtml(tool.name)}</h3>
    <p class="tool-theory"><strong>What it means.</strong> ${escapeHtml(tool.theory)}</p>
    <div class="lesson-columns">
      <div class="lesson-block"><h4>When to use it</h4><p>${escapeHtml(tool.use)}</p></div>
      <div class="lesson-block"><h4>How to apply it</h4><ol>${tool.method.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div>
      <div class="lesson-block"><h4>Failure modes</h4><p>${escapeHtml(tool.pitfalls)}</p></div>
      <div class="lesson-block"><h4>MySQL vs PostgreSQL</h4><p>${escapeHtml(tool.dialect)}</p></div>
    </div>
    <pre class="lesson-code"><code>${escapeHtml(tool.example)}</code></pre>`;
}

function renderPatterns() {
  const counts = countsByPattern();
  el("patternGrid").innerHTML = patterns.map((pattern, index) => `
    <button class="pattern-card${index === 0 ? " is-active" : ""}" type="button" data-lesson="${pattern.id}">
      <span class="pattern-number"><span>${String(index + 1).padStart(2, "0")}</span><span class="pattern-symbol">${pattern.symbol}</span></span>
      <h3>${escapeHtml(pattern.name)}</h3>
      <p>${escapeHtml(pattern.summary)}</p>
      <span class="sr-only">${counts[pattern.id] || 0} problems</span>
    </button>`).join("");

  el("patternSelect").innerHTML = `<option value="all">All patterns</option>${patterns.map((pattern) => `<option value="${pattern.id}">${escapeHtml(pattern.name)}</option>`).join("")}`;
  el("patternIndex").innerHTML = `<button class="index-button is-active" data-pattern="all" type="button"><span>All patterns</span><span>${problems.length}</span></button>${patterns.map((pattern) => `<button class="index-button" data-pattern="${pattern.id}" type="button"><span>${escapeHtml(pattern.name)}</span><span>${counts[pattern.id] || 0}</span></button>`).join("")}`;
  if (patterns[0]) renderPatternLesson(patterns[0].id);
}

function renderPatternLesson(patternId) {
  const pattern = patternMap.get(patternId);
  const lesson = patternLessons[patternId];
  if (!pattern || !lesson) return;
  document.querySelectorAll(".pattern-card").forEach((card) => card.classList.toggle("is-active", card.dataset.lesson === patternId));
  el("patternLesson").innerHTML = `
    <div class="pattern-lesson-head">
      <div><p class="lesson-kicker"><span>${escapeHtml(pattern.symbol)}</span> problem pattern</p><h3>${escapeHtml(pattern.name)}</h3></div>
      <button class="practice-pattern" data-practice-pattern="${patternId}" type="button">Practice this pattern →</button>
    </div>
    <p class="tool-theory"><strong>Recognition clues.</strong> ${escapeHtml(lesson.recognize)}</p>
    <div class="lesson-columns">
      <div class="lesson-block"><h4>Method</h4><ol>${lesson.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div>
      <div class="lesson-block"><h4>MySQL vs PostgreSQL</h4><p>${escapeHtml(lesson.dialect)}</p></div>
    </div>
    <pre class="lesson-code"><code>${escapeHtml(lesson.example)}</code></pre>`;
}

function detectTools(problem) {
  const sql = `${problem.mysql}\n${problem.postgres}`;
  const tests = [
    ["CTE / WITH", /^\s*WITH\b/im], ["Recursive CTE", /WITH\s+RECURSIVE/i],
    ["LEFT JOIN", /\bLEFT\s+JOIN\b/i], ["Self-join", /JOIN\s+\w+\s+AS\s+\w+[\s\S]*JOIN\s+\w+\s+AS/i],
    ["JOIN", /\bJOIN\b/i], ["Row collapse / grain", /\bGROUP\s+BY\b/i], ["GROUP BY", /\bGROUP\s+BY\b/i], ["HAVING", /\bHAVING\b/i],
    ["Subquery", /\(\s*SELECT\b/i], ["EXISTS / NOT EXISTS", /\b(?:NOT\s+)?EXISTS\b/i],
    ["Ranking function", /\b(?:ROW_NUMBER|RANK|DENSE_RANK)\s*\(/i], ["OVER clause", /\bOVER\s*\(/i], ["Window function", /\bOVER\s*\(/i], ["CASE", /\bCASE\b/i],
    ["Conditional aggregate", /(?:SUM|COUNT|AVG)\s*\([\s\S]{0,100}(?:CASE|FILTER)/i],
    ["DISTINCT", /\bDISTINCT\b/i], ["Set operator", /\b(?:UNION|INTERSECT|EXCEPT)\b/i],
    ["Date / interval", /\b(?:DATE|INTERVAL|TO_CHAR|DATE_FORMAT|DATEDIFF|EXTRACT)\b/i],
    ["String / regex", /(?:REGEXP|\s~\s|LIKE|SUBSTR|CONCAT|STRING_AGG|GROUP_CONCAT)/i],
    ["DML", /^\s*(?:UPDATE|DELETE|INSERT)\b/im], ["Aggregate", /\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i]
  ];
  return tests.filter(([, regex]) => regex.test(sql)).map(([name]) => name);
}

function solutionSteps(problem) {
  const sql = `${problem.mysql}\n${problem.postgres}`;
  const pattern = patternMap.get(problem.pattern);
  const steps = [`Translate “${problem.title}” into the ${pattern?.name || "SQL"} shape and declare the output grain.`];
  if (/^\s*WITH\b/im.test(sql)) steps.push("Stage the intermediate grains in CTEs so each transformation can be checked independently.");
  if (/\bLEFT\s+JOIN\b/i.test(sql)) steps.push("Use a LEFT JOIN to preserve the driving rows; unmatched right-side values remain NULL.");
  else if (/\bJOIN\b/i.test(sql)) steps.push("Join the related rows on their complete key, then verify the join does not multiply the intended grain.");
  if (/\b(?:NOT\s+)?EXISTS\b/i.test(sql)) steps.push("Express membership with EXISTS / NOT EXISTS so the condition is direct and safe when nullable values exist.");
  if (/\bGROUP\s+BY\b/i.test(sql)) steps.push("Collapse the source rows to the requested entity or time grain with GROUP BY.");
  if (/\bHAVING\b/i.test(sql)) steps.push("Apply the aggregate threshold in HAVING, after each group has been computed.");
  if (/DENSE_RANK\s*\(/i.test(sql)) steps.push("Use DENSE_RANK so tied values share a rank and the next distinct value has no gap.");
  else if (/RANK\s*\(/i.test(sql)) steps.push("Use RANK so ties share a rank while later ranks reflect the number of preceding rows.");
  else if (/ROW_NUMBER\s*\(/i.test(sql)) steps.push("Use ROW_NUMBER to select a deterministic row from each ordered partition.");
  if (/\b(?:LAG|LEAD)\s*\(/i.test(sql)) steps.push("Use LAG / LEAD to compare neighboring events without collapsing row detail.");
  if (/\bOVER\s*\(/i.test(sql) && !/(?:DENSE_RANK|RANK|ROW_NUMBER|LAG|LEAD)\s*\(/i.test(sql)) steps.push("Use a window aggregate to calculate across related rows while retaining the original row grain.");
  if (/\b(?:CASE|IF)\s*(?:\(|\b)/i.test(sql)) steps.push("Encode the prompt's branch rules with conditional expressions, including an explicit fallback path.");
  if (/\bDISTINCT\b/i.test(sql)) steps.push("Deduplicate only at the semantic boundary where the prompt asks for distinct values or entities.");
  if (/\b(?:DATE|INTERVAL|TO_CHAR|DATE_FORMAT|DATEDIFF|EXTRACT)\b/i.test(sql)) steps.push("Normalize dates to the requested grain and use explicit boundaries for interval comparisons.");
  if (/(?:REGEXP|\s~\s|LIKE|SUBSTR|CONCAT|STRING_AGG|GROUP_CONCAT)/i.test(sql)) steps.push("Apply the string rule with anchored matching or deterministic aggregation, preserving the required case and order.");
  if (/^\s*(?:UPDATE|DELETE|INSERT)\b/im.test(sql)) steps.push("Identify the exact target rows first, then perform the mutation with a deterministic survivor or replacement rule.");
  if (steps.length < 3) steps.push("Project only the required columns and apply the prompt's final ordering and tie breakers.");
  return steps.slice(0, 6);
}

function nullHandling(problem) {
  const sql = `${problem.mysql}\n${problem.postgres}`;
  if (/\bLEFT\s+JOIN\b/i.test(sql) && /\b(?:COALESCE|IFNULL)\s*\(/i.test(sql)) return "The LEFT JOIN retains unmatched rows; COALESCE/IFNULL converts only the requested missing measure to its defined default.";
  if (/\bLEFT\s+JOIN\b/i.test(sql)) return "Unmatched right-side rows become NULL. Keep right-side filters in ON when those unmatched rows must remain in the result.";
  if (/\bNOT\s+EXISTS\b/i.test(sql)) return "NOT EXISTS is intentionally NULL-safe here: it checks whether a matching row exists instead of comparing against a nullable list.";
  if (/\bNOT\s+IN\b/i.test(sql)) return "Verify the NOT IN subquery cannot return NULL; one NULL would make every comparison UNKNOWN. NOT EXISTS is safer when that guarantee is absent.";
  if (/\b(?:COALESCE|IFNULL)\s*\(/i.test(sql)) return "COALESCE/IFNULL supplies the prompt's default only after the missing value is produced; it does not make NULL equal to ordinary values.";
  if (/\bCOUNT\s*\([^*]/i.test(sql)) return "COUNT(column) ignores NULL while COUNT(*) counts rows. This query must use the form that matches the entity being counted.";
  if (/\b(?:SUM|AVG|MIN|MAX)\s*\(/i.test(sql)) return "Aggregates ignore NULL inputs. If the prompt requires NULL to act like zero, apply COALESCE to the input or final result deliberately.";
  if (/\bCASE\b/i.test(sql)) return "A CASE branch whose predicate is UNKNOWN does not match. The ELSE branch defines what happens for NULL and every unhandled value.";
  return "Do not compare with = NULL. Test nullable keys and measures explicitly with IS NULL / IS NOT NULL, and confirm whether missing rows should be preserved.";
}

function toolkitIdForMethod(method) {
  if (/CTE/.test(method)) return "ctes";
  if (/JOIN/.test(method)) return "joins";
  if (/Row collapse/.test(method)) return "grain";
  if (/GROUP|HAVING|Aggregate|DISTINCT/.test(method)) return "grouping";
  if (/Subquery/.test(method)) return "subqueries";
  if (/EXISTS|Set operator/.test(method)) return "exists";
  if (/Ranking/.test(method)) return "ranking-functions";
  if (/OVER/.test(method)) return "over-clause";
  if (/Window/.test(method)) return "windows";
  if (/CASE|Conditional/.test(method)) return "case";
  if (/Date/.test(method)) return "dates";
  if (/String/.test(method)) return "strings";
  if (/DML/.test(method)) return "dml";
  return "execution-order";
}

function filteredProblems() {
  const query = state.query.trim().toLowerCase();
  return problems.filter((problem) => {
    const pattern = patternMap.get(problem.pattern);
    const matchesQuery = !query || `${problem.id} ${problem.title} ${pattern?.name || ""} ${detectTools(problem).join(" ")}`.toLowerCase().includes(query);
    const matchesDifficulty = state.difficulty === "all" || problem.difficulty === state.difficulty;
    const matchesPattern = state.pattern === "all" || problem.pattern === state.pattern;
    const isSolved = solved.has(String(problem.id));
    const matchesStatus = state.status === "all" || (state.status === "solved" ? isSolved : !isSolved);
    return matchesQuery && matchesDifficulty && matchesPattern && matchesStatus;
  });
}

function renderProblems() {
  const filtered = filteredProblems();
  const visible = filtered.slice(0, state.visible);
  el("catalogSummary").textContent = `${filtered.length} of ${problems.length} unlocked problems · attempt and solution stay side by side`;
  el("problemList").innerHTML = visible.length ? visible.map((problem) => {
    const pattern = patternMap.get(problem.pattern);
    const isSolved = solved.has(String(problem.id));
    return `<div class="problem-row${isSolved ? " is-solved" : ""}">
      <button class="status-check" type="button" data-toggle-solved="${problem.id}" aria-label="${isSolved ? "Mark not solved" : "Mark solved"}">${isSolved ? "✓" : ""}</button>
      <button class="problem-name" type="button" data-problem="${problem.id}"><span class="problem-id">#${problem.id}</span><span class="problem-title">${escapeHtml(problem.title)}</span></button>
      <span class="pattern-tag">${escapeHtml(pattern?.name || "Unclassified")}</span>
      <span class="difficulty ${problem.difficulty.toLowerCase()}">${problem.difficulty}</span>
      <a class="practice-link" href="https://leetcode.com/problems/${problem.slug}/" target="_blank" rel="noreferrer">Practice ↗</a>
    </div>`;
  }).join("") : `<div class="empty-state"><strong>No problems match.</strong><br>Try a broader search or clear a filter.</div>`;
  el("loadMoreButton").hidden = visible.length >= filtered.length;
  el("problemCount").textContent = problems.length;
  el("solutionCount").textContent = problems.filter((problem) => problem.mysql && problem.postgres).length;
  el("patternCount").textContent = patterns.length;
  updateProgress();
}

function updateProgress() {
  const count = [...solved].filter((id) => problems.some((problem) => String(problem.id) === id)).length;
  el("progressLabel").textContent = `${count} solved`;
}

function setPattern(patternId) {
  state.pattern = patternId;
  state.visible = 40;
  el("patternSelect").value = patternId;
  document.querySelectorAll(".index-button").forEach((button) => button.classList.toggle("is-active", button.dataset.pattern === patternId));
  renderProblems();
}

function openProblem(problemId) {
  const problem = problems.find((candidate) => String(candidate.id) === String(problemId));
  if (!problem) return;
  state.activeProblem = problem;
  state.dialect = "mysql";
  state.solutionRevealed = false;
  renderDialog();
  el("problemDialog").showModal();
}

function renderDialog() {
  const problem = state.activeProblem;
  if (!problem) return;
  const pattern = patternMap.get(problem.pattern);
  const lesson = patternLessons[problem.pattern];
  const isSolved = solved.has(String(problem.id));
  const code = state.dialect === "mysql" ? problem.mysql : problem.postgres;
  const tools = detectTools(problem);
  const solutionContent = state.solutionRevealed ? `
    <div class="pane-label"><strong>Solution</strong><span>revealed</span></div>
    <div class="solution-tabs" role="tablist" aria-label="SQL dialect">
      <button class="solution-tab${state.dialect === "mysql" ? " is-active" : ""}" data-dialect="mysql" type="button">MySQL 8+</button>
      <button class="solution-tab${state.dialect === "postgres" ? " is-active" : ""}" data-dialect="postgres" type="button">PostgreSQL 15+</button>
    </div>
    <p class="pane-label"><strong>Methods used</strong></p>
    <div class="tool-chips">${tools.map((tool) => `<button class="tool-chip" type="button" data-tool-jump="${toolkitIdForMethod(tool)}">${escapeHtml(tool)}</button>`).join("")}</div>
    <div class="solution-reasoning"><h3>How this query is solved</h3><ol>${solutionSteps(problem).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></div>
    <pre class="solution-code"><code>${escapeHtml(code)}</code></pre>
    <div class="dialog-grid">
      <div class="note-card"><h3>Why this works</h3><p>${escapeHtml(problem.why)}</p></div>
      <div class="note-card"><h3>NULL handling</h3><p>${escapeHtml(nullHandling(problem))}</p></div>
      <div class="note-card"><h3>Edge case to test</h3><p>${escapeHtml(problem.edge)}</p></div>
    </div>` : `
    <div class="pane-label"><strong>Solution</strong><span>hidden</span></div>
    <div class="solution-locked">
      <div class="solution-locked-inner">
        <h3>Keep the answer closed while you work.</h3>
        <p>Attempt the query on LeetCode or in your editor. Reveal only when you want to compare methods, NULL handling, and dialects.</p>
        <button class="reveal-solution" data-reveal-solution type="button">Reveal solution</button>
      </div>
    </div>`;

  el("dialogContent").innerHTML = `
    <div class="dialog-eyebrow"><span>#${problem.id}</span><span>·</span><span>${escapeHtml(pattern?.name || "SQL")}</span><span class="difficulty ${problem.difficulty.toLowerCase()}">${problem.difficulty}</span><span>unlocked</span></div>
    <h2>${escapeHtml(problem.title)}</h2>
    <p class="dialog-summary">Attempt first. Your notes and the hidden solution remain together in this workspace.</p>
    <div class="workspace-grid">
      <section class="practice-pane" aria-label="Practice">
        <div class="pane-label"><strong>Practice</strong><span>attempt first</span></div>
        <p>${escapeHtml(problem.summary)}</p>
        <a class="practice-cta" href="https://leetcode.com/problems/${problem.slug}/" target="_blank" rel="noreferrer">Open problem on LeetCode ↗</a>
        <ol class="attempt-list">
          <li>Write: one output row represents what?</li>
          <li>List the keys, cardinalities, NULL rules, and tie rules.</li>
          <li>Choose the pattern, draft, and test a counterexample.</li>
        </ol>
        <label class="notes-label" for="practiceNotes">Your scratch notes</label>
        <textarea class="practice-notes" id="practiceNotes" data-notes-for="${problem.id}" placeholder="Grain, joins, edge cases, first attempt…">${escapeHtml(practiceNotes[problem.id] || "")}</textarea>
        <div class="practice-actions"><button type="button" data-toggle-solved="${problem.id}">${isSolved ? "Mark not solved" : "Mark solved"}</button></div>
      </section>
      <section class="solution-pane" aria-label="Solution">${solutionContent}</section>
    </div>`;
}

document.addEventListener("click", (event) => {
  const toolButton = event.target.closest("[data-tool]");
  if (toolButton) renderToolLesson(toolButton.dataset.tool);

  const toolJump = event.target.closest("[data-tool-jump]");
  if (toolJump) {
    renderToolLesson(toolJump.dataset.toolJump);
    el("problemDialog").close();
    document.querySelector("#toolkit").scrollIntoView({ behavior: "smooth" });
  }

  const lessonButton = event.target.closest("[data-lesson]");
  if (lessonButton) renderPatternLesson(lessonButton.dataset.lesson);

  const patternButton = event.target.closest("[data-pattern]");
  if (patternButton) setPattern(patternButton.dataset.pattern);

  const practicePatternButton = event.target.closest("[data-practice-pattern]");
  if (practicePatternButton) {
    setPattern(practicePatternButton.dataset.practicePattern);
    document.querySelector("#problems").scrollIntoView({ behavior: "smooth" });
  }

  const problemButton = event.target.closest("[data-problem]");
  if (problemButton) openProblem(problemButton.dataset.problem);

  const dialectButton = event.target.closest("[data-dialect]");
  if (dialectButton) { state.dialect = dialectButton.dataset.dialect; renderDialog(); }

  if (event.target.closest("[data-reveal-solution]")) { state.solutionRevealed = true; renderDialog(); }

  const solvedButton = event.target.closest("[data-toggle-solved]");
  if (solvedButton) {
    const id = solvedButton.dataset.toggleSolved;
    solved.has(id) ? solved.delete(id) : solved.add(id);
    localStorage.setItem("sql-atlas-solved", JSON.stringify([...solved]));
    if (state.activeProblem && String(state.activeProblem.id) === id && el("problemDialog").open) renderDialog();
    renderProblems();
  }
});

document.addEventListener("input", (event) => {
  const notes = event.target.closest("[data-notes-for]");
  if (!notes) return;
  practiceNotes[notes.dataset.notesFor] = notes.value;
  localStorage.setItem("sql-atlas-notes", JSON.stringify(practiceNotes));
});

el("searchInput").addEventListener("input", (event) => { state.query = event.target.value; state.visible = 40; renderProblems(); });
el("patternSelect").addEventListener("change", (event) => setPattern(event.target.value));
el("statusSelect").addEventListener("change", (event) => { state.status = event.target.value; state.visible = 40; renderProblems(); });
el("difficultyFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-difficulty]"); if (!button) return;
  state.difficulty = button.dataset.difficulty; state.visible = 40;
  document.querySelectorAll("[data-difficulty]").forEach((chip) => chip.classList.toggle("is-active", chip === button));
  renderProblems();
});
el("loadMoreButton").addEventListener("click", () => { state.visible += 40; renderProblems(); });
el("dialogClose").addEventListener("click", () => el("problemDialog").close());
el("problemDialog").addEventListener("click", (event) => { if (event.target === el("problemDialog")) el("problemDialog").close(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); el("searchInput").focus(); }
});

renderToolkit();
renderPatterns();
renderProblems();
