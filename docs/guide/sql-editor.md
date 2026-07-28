# SQL Editor

The SQL Editor is where you write queries and run them against your ClickHouse® cluster, right from the browser. If you have used the `clickhouse-client` command line or ClickHouse® Play, it will feel familiar, but it adds the things those tools make you do by hand: a schema explorer you can click through, autocomplete that knows your tables and documents your functions, several queries open at once in tabs, reusable parameters, a one-click cost estimate before you run anything expensive, visual diagrams of how a query executes, an optional AI helper that turns a plain-English question into SQL, and clear statistics after every run.

This page walks through every part of the editor, from the very first thing you have to do (connect) to the more advanced tools power users reach for daily. If you are new to ClickHouse®, read it top to bottom. If you are experienced, the section headings and the [keyboard shortcuts](#keyboard-shortcuts) table will get you where you need to go.

---

## First: connect with your ClickHouse® credentials

Before you can browse schemas or run anything, the editor asks you to connect using **your own ClickHouse® username and password**. This is a deliberate design choice, and it is worth understanding because it shapes how everything else behaves.

Look at the toolbar just above the editor. Until you connect, you will see a small **user** and **password** box with a **Connect** button, the schema explorer on the left shows a padlock with "Connect to browse databases," and the run buttons are disabled.

Type the ClickHouse® user you want to work as, enter that user's password, and click **Connect** (or press Enter in either box). CHOps validates the credentials immediately by running a trivial `SELECT 1` as that user. Only if that succeeds does it unlock the editor. If the credentials are wrong or the node is unreachable, the error appears right there in the toolbar so you can fix it.

**Why a separate login when I already logged in to CHOps?** Because the SQL Editor runs every query as *you*, the ClickHouse® user, not as some shared service account. Whatever that ClickHouse® account is allowed to do is exactly what you can do in the editor: if your account is read-only, writes will be refused by ClickHouse® itself; if it has full privileges, you have full privileges. This keeps the audit trail honest and means CHOps never quietly hands you more access than your database account grants.

**What happens to my password?** The browser sends it exactly once, to connect. From then on it is encrypted (AES-256-GCM) and held on the CHOps server, tied to your current login session, and the browser never keeps it. Every later query is executed using that stored credential, so you never re-type the password. A few practical consequences:

- **The connection survives a page reload.** If you refresh, CHOps restores the connected state automatically, so you do not have to reconnect every time.
- **The session lasts about two hours**, matching your CHOps login. After that (or if you log out), the stored credential is cleared, and the editor will ask you to reconnect. If a query suddenly returns a "session expired, please reconnect" message, this is why: just enter your password again.
- **Disconnecting is one click.** Once connected, the toolbar shows a green plug icon with your username and node (for example `analyst @ ch-node-1:8123`) and a **logout** button beside it. Clicking it clears the stored credential and the loaded schema so nothing stale is left behind.

Switching nodes or clusters from the navbar keeps you connected: your credentials carry across the switch, and the explorer simply reloads the schema for the new target.

---

## The layout at a glance

The editor is split into four areas:

- **Left: the Schema Explorer.** Browse databases and tables, peek at a table's definition, or drop a table name straight into your query.
- **Top of the center: the tab strip.** One tab per query you have open, with an add button and a reminder of the two main shortcuts.
- **Center: the editor and its toolbar.** Where you write SQL, choose how to run it, and reach the history, bookmarks, share, export, fullscreen, and AI controls.
- **Bottom: the results panel.** Where your rows, success messages, cost estimates, execution diagrams, and errors appear, along with a statistics bar and quick links into the profiling tools.

The editor pane and the results pane each scroll on their own, so a large result never pushes the editor off the screen. You can drag the divider between them to give either one more room, resize the explorer, collapse the editor entirely, or put the whole thing in fullscreen. More on each below.

---

## Working with tabs

Tabs let you keep several queries open at once, the way you keep several tabs open in a browser. Each tab is completely independent: its own SQL, its own results, its own undo history, its own parameter values, and its own choice of how to run.

This matters more than it sounds. Before tabs, comparing two versions of a query meant keeping one in a text file, or running one, copying the numbers somewhere, and pasting the other over the top. Now you write one in each tab and switch between them.

### The basics

- **Add a tab** with the **+** button at the right of the strip. It opens empty and focused, ready to type into.
- **Switch tabs** by clicking one, or with **Ctrl+1** through **Ctrl+9** for the first nine.
- **Close a tab** with the small x that appears when you hover it. If the tab has text you have never run, CHOps asks first, because that text is not in your history and would be gone. If you have run it, it closes straight away, since you can get it back from History.
- **Rename a tab** by double-clicking its name. Press Enter to keep the new name or Escape to abandon the change. Renaming is worth doing the moment you have more than two open: "Query 1, Query 2, Query 3" tells you nothing, while "slow join", "before fix", "after fix" tells you everything.
- **Closing the last tab** leaves you with one empty tab rather than an empty screen.

You can have up to ten tabs open. Past that the **+** button greys out and tells you why.

### What survives, and what does not

Tabs are remembered in your browser. If you reload the page, close the browser, or come back tomorrow, your tabs are still there with their names, their SQL, and their parameter values.

**Results are not remembered.** When you come back, each tab holds its query but shows no rows. That is deliberate for two reasons. Re-running is one keystroke, and query output can contain data that has no business sitting in browser storage where every other page on the same site could read it.

Tabs are stored per browser, on the device you are using, in the same way as History. They do not follow you to another computer. For queries you want to keep properly, use **Bookmarks**.

### Running queries in more than one tab

A query keeps running when you switch away from it. If a report takes two minutes, start it, switch to another tab, and carry on working. The busy tab shows a small spinner in the strip so you can see at a glance which one is still going, and its results appear in that tab when it finishes, not in whichever tab you happen to be looking at.

If you press **Go** while another tab is still running, CHOps asks whether you meant to. The dialog names the busy tab and offers to run anyway. Two things worth knowing about it:

- It is asking, not refusing. Running several queries at once is a perfectly normal thing to do, and if that is what you want, say yes.
- If you say yes, CHOps does not check again whether the first query is still going. By the time you have read the question it may well have finished, and refusing on out-of-date information would waste the pause the question bought you.

### Undo works per tab

Each tab keeps its own undo history. Type in one tab, switch away, switch back, and **Ctrl+Z** still walks back through what you typed there, not through something you did somewhere else. This includes accepting an autocomplete suggestion: one Ctrl+Z removes just the completion, not everything before it.

---

## Schema Explorer

The panel on the left lets you look through your databases and tables without leaving the editor, so you never have to remember an exact name.

Choose a database and it expands to list its tables underneath. Click a table's **name** and its fully qualified `database.table` name is dropped into the editor at your cursor, a fast way to build a query without typing (or misspelling) identifiers.

**Dragging instead of clicking.** You can also drag a table from the explorer and drop it exactly where you want it in your query. Clicking inserts at the cursor; dragging lets you choose the spot with the pointer, which is easier when you are adding a second table to a join half way through a line you have already written. Watch for the drop cursor that follows your pointer inside the editor, showing where the text will land. One **Ctrl+Z** removes the whole insertion.

**Reading a table at a glance.** Next to every table is a small icon that hints at its engine, so you can tell types apart without opening anything: a table icon for MergeTree and log families, an eye for views (regular, materialized, and window views), stacked layers for data-lake formats (Iceberg, Hudi, Delta Lake, Hive), a broadcast icon for streaming queues (Kafka, RabbitMQ, NATS), a cloud for object storage (S3, GCS, Azure Blob, HDFS), an import icon for external databases (MySQL, PostgreSQL, MongoDB, Redis, SQLite, ODBC/JDBC), a ring for Distributed tables, a book for dictionaries, and more. Hovering a table shows its exact engine in a tooltip.

**Seeing the full definition (DDL).** Beside each table is a small code icon. Click it and CHOps runs `SHOW CREATE TABLE` for you and opens the complete `CREATE TABLE` statement in a pop-up, with a **Copy** button. This is the quickest way to check a column's type, confirm the sorting key, or copy a schema to reuse elsewhere.

**Adjusting the panel.** Drag the panel's right edge to make it wider or narrower (it remembers a comfortable range), or click **Collapse** to tuck it away when you want the maximum space for writing. When collapsed, a narrow strip remains with a folder icon at the top: click it to bring the explorer back. The **refresh** icon in the explorer header reloads the database list, which is handy after someone creates or drops a database.

**The sparkles icon (AI database).** You will also see a small sparkles icon to the left of each database. That is part of the AI SQL feature and is explained under [Generating SQL with AI](#generating-sql-with-ai). You can ignore it entirely if you are not using AI.

---

## Writing a query

The center of the screen is the editor. As you type, your SQL is syntax-highlighted, line numbers run down the left, and the editor keeps a comfortable working height that you can adjust.

### Reading the colours

The highlighting uses a different colour for each kind of thing in your query, which makes a long statement much easier to scan:

- **Keywords** such as `SELECT`, `FROM`, `GROUP BY` and `JOIN`.
- **Functions** such as `count()`, `toStartOfHour()` and `groupArray()`. A name is coloured as a function when your connected server actually has it, because the list comes from that server's own `system.functions`. If a function is not coloured, that server does not have it, which is useful to know before you run anything.
- **Tables and columns**, in a colour of their own.
- **Database names** in a qualified name such as `system.query_log`, slightly distinct from the table beside them.
- **Column types** such as `UInt64` and `DateTime`.
- **Text in quotes**, **numbers**, and **comments**, each distinct again.

Both the light and dark themes have their own set of colours, and the editor follows whichever theme you are using.

### Autocomplete

Start typing (two characters is enough) and a suggestion menu appears. The suggestions are pulled live from *your own* cluster the moment you connect, so they reflect what actually exists:

- **Keywords** and **functions** straight from ClickHouse®'s own `system.keywords` and `system.functions`.
- **Table and database names**, including fully qualified `database.table` forms, from `system.tables`.

Each kind has its own icon in the list, so you can tell a function from a table at a glance. Navigate with the **Up/Down** arrows, accept with **Enter** or **Tab**, and dismiss with **Escape**. Accepting a function inserts it with its brackets and puts your cursor between them, ready for the arguments.

**Function documentation.** Highlight a function in the suggestion list and a panel appears beside it with the function's signature and a description of what it does, taken from your server. The category is shown next to each function name in the list too, so `groupArray` reads as "Aggregate" rather than just "function". This is the fastest way to check what an unfamiliar function expects without leaving the editor to search the ClickHouse® documentation.

Nothing about autocomplete goes back to the server as you type. The whole list is fetched once when you connect and filtered in your browser, so typing is never slowed down by the network.

### Finding and replacing

Press **Ctrl+F** with your cursor in the editor and a find bar opens inside the editor itself, with replace, whole-word and regular-expression options. Matches are highlighted as you type. Note that your cursor has to be in the editor first, otherwise the browser's own page search opens instead, which cannot see inside the editor.

### Resizing and hiding

- **Drag the divider** directly under the editor to make the editor taller or shorter. The results pane takes whatever is left. Double-click the divider to reset it. The height you choose is remembered.
- **Collapse SQL** hides the editor entirely so you can give the whole screen to your results, then expand it again when you want to edit.
- **Fullscreen** gives you a distraction-free, full-window editor for larger work. Press **Escape** to exit fullscreen.

### Other editing behaviours

- **Ctrl+Enter** (or **Cmd+Enter** on a Mac) runs your query from anywhere in the editor.
- **Tab** indents.
- Brackets and quotes close themselves as you type.
- The editor follows the application's text size setting, so if you have made the interface larger or smaller, the SQL follows.

> **Size limit.** A single query is capped at 100 KB of SQL. That is enormous for hand-written queries; you will only ever hit it with machine-generated statements, and if you do, the editor tells you clearly rather than failing silently.

---

## Query parameters

Parameters let you write a query once with the changing values left as blanks, then fill those blanks in without editing the SQL. If you have ever kept three copies of the same query with a different customer name in each, this replaces all three with one.

### Writing a parameter

Write `{name:Type}` anywhere a value would go:

```sql
SELECT count()
FROM system.tables
WHERE database = {db:String}
```

The moment that appears in your SQL, a strip of input boxes appears above the editor, one per parameter, and **Go** stays disabled until every required one is filled in. Fill in `system`, press Go, and you get the count for that database. Change it to `default` and press Go again. The SQL never changes.

The `Type` part is a real ClickHouse® type and it decides what kind of input box you get:

- `String` gives a plain text box.
- `UInt8`, `Int64`, `Float64` and other numeric types give a number box.
- `Date`, `DateTime` and `DateTime64` give a date and time picker.
- `Enum8('a' = 1, 'b' = 2)` gives a dropdown with those exact choices.
- `Array(String)`, `Map(String, UInt8)` and similar give a text box where you type the value in ClickHouse®'s own notation, such as `['a','b']`.

### Why this is safer than editing the SQL

The value you type **never becomes part of the query text**. CHOps sends your SQL to ClickHouse® with the `{db:String}` placeholder still in it, and sends the value separately alongside. ClickHouse® does the substitution itself, as data, at the point it needs it.

That means a value cannot change the meaning of your query, no matter what it contains. Type `system' OR 1=1 --` into that box and you will get zero rows, because there is genuinely no database with that name. It is treated as a name to look for, not as SQL to run. If you have ever worried about pasting a customer-supplied string into a query, this is the mechanism that makes it safe.

### Optional filters

Sometimes you want a filter to apply only when you have a value for it. Wrap that part of the query in `/*[ ... ]*/`:

```sql
SELECT database, table, sum(rows) AS rows
FROM system.parts
WHERE active
  /*[ AND database = {db:String} ]*/
  /*[ AND modification_time >= {since:DateTime} ]*/
GROUP BY database, table
```

Fill in `db` and leave `since` empty, and the second line is removed from the query entirely before it is sent. Fill in both and both apply. Leave both empty and you get every table.

A parameter inside one of these blocks is **optional**, shown without an asterisk, and Go stays enabled whether or not you fill it in. A parameter outside any block is **required**, shown with an asterisk, and Go waits for it.

To ClickHouse® these blocks are ordinary comments, so a query with them still runs unchanged if you paste it into `clickhouse-client`. Nothing is lost by writing your queries this way.

A few rules the editor enforces, each with a clear message rather than a silent failure:

- Blocks cannot be nested inside each other.
- Every block must contain at least one parameter, since otherwise nothing decides whether to include it.
- A block cannot contain a semicolon.
- The same parameter name cannot have two different types.
- A `{name:Type}` inside a quoted string or a comment is left alone, because it is text, not a parameter.

### Seeing exactly what will be sent

Click **Preview** and you get the finished SQL: optional blocks resolved, and the list of parameter values that will travel alongside. This is the quickest way to confirm that clearing a filter really did remove that line, and to satisfy yourself that your values are not being written into the query text.

### Values are remembered, per tab

Parameter values are kept per tab, so two tabs can hold different values for the same parameter name. That is exactly what you want when comparing one customer against another.

A new tab starts from the values you used most recently, so a `tenant` you typed once does not have to be typed again. From then on the two tabs go their own way, and changing a value in one never changes it in the other.

Values are also remembered between sessions, so the query you use every morning already has yesterday's inputs in it.

### Saving default values with a bookmark

When you save a bookmark, tick **Save current parameter values as defaults** and those values are stored with it. Opening that bookmark later fills the strip in for you. Values you have already set in the current session win over the saved defaults, so a bookmark never overwrites something you deliberately typed.

---

## Running a query

The controls sit together at the bottom right of the editor, in the order you tend to think about them: how much, what will it cost, help me write it, what kind of run, and finally do it.

### Go

**Go** runs your query. It is the only thing that does. Whatever the mode dropdown beside it says, Go performs that and nothing else performs anything.

**Ctrl+Enter** does the same thing from anywhere in the editor.

Because the editor executes under your ClickHouse® credentials, what a query is allowed to do is governed entirely by that account. A read-only account will have writes rejected by ClickHouse®; an account with write privileges can create, insert, alter, and drop.

### The mode dropdown

Beside Go is a dropdown that decides what Go will do:

- **Execute SQL** simply runs your query as written. This is the default.
- The other entries are **EXPLAIN** variants: instead of executing your query, they ask ClickHouse® to describe how it *would* run it. They are covered under [Understanding a query with EXPLAIN](#understanding-a-query-with-explain).

Choosing a mode does not run anything. It sets what Go will do, and then you press Go. This is worth stating plainly because it used to work the other way: picking an entry ran it immediately, which made the dropdown two controls in one and made it easy to launch an expensive EXPLAIN by accident while browsing the list.

Your choice is remembered per tab, so one tab can sit on Execute SQL while another stays on Explain plan.

### Cost

**Cost** analyses a `SELECT` without running it, so you can see how much work it would cause before you commit to it. See [Estimating query cost](#estimating-query-cost).

### Generate

The purple **Generate** button turns a plain-English question into a query using AI. See [Generating SQL with AI](#generating-sql-with-ai).

---

## Controlling how much comes back

Next to the run controls is a **Max rows** stepper. It decides how many rows the editor asks ClickHouse® to send back.

The default is 5,000. Use the minus and plus buttons to move in steps of 100, or click the number and type a value directly, then press Enter or click away. The range is 100 to 100,000, and the value is remembered.

### Why there is a limit at all

A browser has to do real work for every row it receives: parse it, keep it in memory, and lay it out on screen. A query returning a million rows can make the whole page slow to scroll and slow to switch tabs, and none of that work is useful, because nobody reads a million rows in a browser.

The limit is applied as a **setting on the request**, not by adding `LIMIT` to your SQL. Your query reaches ClickHouse® exactly as you wrote it, which matters for two reasons: a query that already ends in `LIMIT`, `FORMAT` or a settings clause would break if something appended to it, and the query text in ClickHouse®'s own query log stays exactly what you typed.

When more rows were available than you asked for, the status line says so, for example `5,000+ row(s) returned`, with a note pointing you at Export for the complete result.

### Raising it

If you genuinely need more rows in the browser, raise the number. Above 25,000 CHOps asks you to confirm, explaining that it can make the editor slow and that Export is a better tool for large results. It is a question, not a refusal: confirm and you get what you asked for.

### The limit applies everywhere except Export

Max rows applies to every place in CHOps where you write SQL: the SQL Editor, Comparison mode, Chart Builder and Qurioz. Changing it in one changes it in all of them, because it is one setting about how you like to work.

**The Export Wizard is not affected.** Export streams the query result to a file on the server and always gives you every row. That is the point of it, and it is why the limit is safe: the editor stays responsive, and the complete result is one button away.

### The administrator's ceiling

There is a second limit that you cannot change, on the total **size** of a result rather than the number of rows. It exists because a row count cannot express width: five thousand rows of a short string is nothing, and five thousand rows each carrying a stack trace is hundreds of megabytes.

It defaults to 128 MB and is set with `MAX_RESULT_BYTES` in the CHOps environment, so whoever runs your CHOps server can raise it on a larger machine. Whichever limit is reached first stops the transfer. See [Configuration](../getting-started/configuration.md).

---

## Generating SQL with AI

The **Generate** button turns a question in plain English into SQL.

Before it will work, an AI provider has to be configured for your installation (see [AI API Keys](ai-api-keys.md)), and you have to tell CHOps which database the question is about by clicking the **sparkles icon** next to that database in the explorer. The icon fills in to show the database is selected. This step matters: the AI is given that database's table and column names so it can write a query that refers to things that actually exist.

Type your question into the editor in ordinary words, for example `top 10 tables by size in the last week`, then click Generate. CHOps sends your question along with the schema of the selected database, and replaces the editor contents with the SQL that comes back.

Two things to keep in mind. It **replaces what is in the editor**, so if you have something you want to keep, open a new tab first. And you should always read what it produced before running it: it is a starting point written by a model that has seen your schema but not your data, and it can be subtly wrong in ways that still run.

---

## Understanding a query with EXPLAIN

The mode dropdown beside Go holds several EXPLAIN variants. Each asks ClickHouse® a different question about how it would run your query, and none of them execute it.

- **Explain** and **Explain plan** show the query plan: the steps ClickHouse® would perform, in order.
- **Explain syntax** shows your query after ClickHouse® has rewritten it internally, which reveals optimisations it applied.
- **Explain query tree** shows the analysed form of the query.
- **Explain pipeline** shows the physical execution pipeline: the processors that would do the work.
- **Explain estimate** returns the estimated rows, parts and marks that would be read.
- **Explain AST (graph)** and **Explain pipeline (graph)** return diagrams rather than text, and CHOps renders them visually.
- **Explain plan (JSON)** returns the plan as structured JSON, useful when you want to read it carefully or hand it to a tool.

### The option checkboxes

When you select a mode that supports options, a row of checkboxes appears underneath: **Indexes**, **Projections**, **Distributed**, **Pretty**, **Compact**, **Sorting**, **Actions**, and so on, depending on which mode you picked. These map to ClickHouse®'s own EXPLAIN settings and add detail to the output.

Ticking one does not re-run the query. Set the options you want and then press Go, in the same way as the mode dropdown. Your ticks are remembered per tab and carry over to new tabs you open.

### Reading a graph

For the two graph modes, CHOps renders the diagram directly with zoom and pan, and a button to view it fullscreen. This is often the fastest way to understand a complicated query: seeing that one branch of a join is far wider than the other tells you more at a glance than reading the text plan.

---

## Estimating query cost

Press **Cost** and CHOps analyses a `SELECT` without running it. Use this before any query you are unsure about, particularly on a table you do not know well.

It reports:

- **Estimated rows**, **parts** and **marks** that ClickHouse® expects to read.
- The **query plan**, so you can see the shape of the work.
- **Existing indexes** on the tables involved, including the primary key and any data-skipping indexes, so you can tell whether your filters can actually use them.

The estimate comes from ClickHouse® itself, not from a guess by CHOps, so it reflects the real state of your data including its partitioning.

A large estimated row count is the signal to stop and think. Sometimes it means your filter cannot prune parts, which the indexes section will usually explain. Sometimes it means the query really does need to read that much, in which case you at least know before you start rather than after.

---

## Reading your results

What you see after a run depends on the kind of query.

- **Queries that return data** (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and so on) produce a **results table**. Click any cell to copy its value to your clipboard. If a query returns nothing, you get a clear "0 row(s) returned" rather than a misleading success message.
- **Commands that change things** (`CREATE`, `INSERT`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `SYSTEM`, `OPTIMIZE`, `TRUNCATE`, `KILL`) produce a **success message written for that specific action**: "Created successfully," "Insert executed successfully," "Dropped successfully," and so on. When ClickHouse® reports how many rows were written or affected, that count is appended too.
- **Errors** appear in a **red banner** showing the full text ClickHouse® returned, wrapped so even long messages stay readable. The exact database error is the fastest way to see what went wrong.

### Large results stay fast

The results table draws only the rows that are actually on screen and replaces them as you scroll. This means a four thousand row result costs the browser about the same as a forty row one, and a very wide table such as `system.query_log`, which has around seventy columns, no longer slows the page down.

You can scroll through everything that was returned. Nothing is hidden from you; it is simply drawn as you reach it. The column headers stay in place while you scroll, which matters on a wide table where the tenth column is meaningless without its name.

### Table fullscreen

In the rightmost cell of the header row is a small expand button. Click it and the table fills the window, which is the easiest way to read a wide result without squinting at a third of the screen. Press **Escape** or click the button again to come back.

The button lives in the header rather than floating over the table, so it stays visible while you scroll instead of sliding away with the rows.

### The statistics bar

Alongside the results, a status bar summarises the run:

- **Rows returned** (or rows written, for write statements). A trailing plus sign means more were available than the Max rows setting asked for.
- **Rows scanned** and **data read**: how much work it actually took.
- **Elapsed time**, in seconds.
- **Peak memory**: looked up from ClickHouse®'s query log a fraction of a second after the query finishes, so it reflects the true high-water mark rather than a guess. If a query is extremely fast the figure may be omitted.

---

## Digging deeper: action buttons after a run

Once a query finishes and ClickHouse® has assigned it a query ID, a row of buttons appears in the statistics bar to take you straight into the profiling tools for *that exact query*:

- **query_id**: copies ClickHouse®'s ID for the query to your clipboard, useful for looking it up in system tables or handing to whoever administers the cluster.
- **Flame Graph**: opens the [Query Profiler](query-profiler.md) with this query loaded, showing where it spent its time. Reach for this first when something is slow.
- **Pipeline**: opens the [Processors Profile](processors-profile.md) with the query loaded, rendering its execution as a diagram so you can see which step dominated.
- **Metrics**: opens [Query Metrics](query-metrics.md) with the query loaded, showing a second-by-second view of how it used resources while it ran.

If the buttons do not appear, the run did not capture a query ID (occasionally the case for very fast queries); you can still find the query in the profiling tools by its text or time range.

---

## Query history

Every query you run is saved automatically, so you can always get back to something from earlier. Open the panel from the **History** button in the toolbar. Each entry shows:

- Its **SQL text**.
- The **row count** and **how long it took**.
- A green check or red X for **success or failure** (with the error text on failures).
- **When** you ran it.

**Clicking an entry opens it in a new tab**, leaving whatever you were writing untouched. This is usually what you want: you are looking at history because you want to compare something with what you have now, not replace it.

**Dragging an entry** into the editor inserts it as a subquery, wrapped in brackets, at the point you drop it. This is the fast way to build `SELECT count() FROM ( ... )` around a query you ran last week without opening it, copying it, and coming back.

CHOps tidies the query up as it inserts: a trailing `FORMAT` clause, a trailing semicolon and anything after the first statement are removed, all of which would be errors inside a subquery.

History keeps your most recent queries and drops the oldest as new ones arrive. The **Clear** button empties it.

> **One thing to know:** history is stored in your browser, on the device you are using. It does not follow you to another computer, and clearing your browser data clears it. For queries you want to keep and share, use **Bookmarks** instead.

---

## Bookmarks

When there is a query you reach for often, bookmark it with a name instead of rewriting it each time.

- **Save one:** write your SQL, type a name in the bookmark panel, and click **Save**. Tick **Save current parameter values as defaults** if you want the values filled in for you next time.
- **Use one:** click it and it opens **in a new tab**, named after the bookmark, leaving what you were writing alone.
- **Drag one:** drag it into the editor to insert it as a subquery at the drop point, the same as a history entry.
- **Remove one:** click the trash icon beside it.
- **Shortcut:** **Ctrl+B** (or **Cmd+B**) toggles the bookmarks panel.

Unlike history, **bookmarks live on the server**, so they stay with you across browsers, devices, and sessions, and they are **shared with everyone on your team**. That is deliberate: a genuinely useful query, like one that lists table sizes or surfaces slow queries, is worth having on hand for the whole team.

### Exporting and importing bookmarks

At the bottom of the bookmarks panel are three download buttons and an Import button.

- **JSON** contains everything, including parameter defaults, and is the only format that can be imported back. Use it to move queries between CHOps installations, or to keep a backup of your own.
- **Markdown** produces a heading and a fenced SQL block per query, ready to paste into a runbook, a ticket or a wiki.
- **SQL** produces each query with its name as a comment, for another tool or for version control.

Markdown and SQL are one-way on purpose. They drop the parameter defaults, and reading them back would mean guessing where one query ends and the next begins.

**Import** takes a JSON export and merges it into your bookmarks. If any incoming query has the same name as one you already have, CHOps shows you the clashes before changing anything, and asks what to do with each:

- **Keep mine**: the existing query stays and the incoming one is discarded.
- **Take theirs**: the incoming one replaces yours.
- **Keep both**: both survive, with the incoming one renamed, for example `errors by hour (2)`.

Queries that are identical to what you already have are not shown, because there is nothing to decide. Nothing is written until you press Apply import, and cancelling changes nothing.

Importing never runs anything. A query that arrives in a file is only stored.

---

## Sharing a query by link

The **Share** button copies a link that contains the query you are looking at. Send it to a colleague and it opens for them, in a new tab, with your SQL in it.

This is for the common case of "what do you make of this?" about a query you are in the middle of debugging. It works on unsaved SQL, so you do not have to bookmark something just to ask about it.

Three things are worth understanding about how it works.

**The query travels in the part of the URL after the `#`.** That part is handled entirely by your browser and is never sent to any server, so a shared query does not appear in access logs, proxy logs or anything else sitting in front of CHOps.

**Parameter values are not included unless you ask.** If your query has values filled in, a checkbox appears offering to include them, and it starts unticked. Parameter values are frequently the sensitive half of a query, a customer identifier or an account name, and sending the shape of a question should never accidentally send the specifics. Tick it and a warning reminds you that anyone the link reaches can read those values.

**A link grants no access.** Whoever follows it signs in to CHOps as themselves, connects with their own ClickHouse® credentials, and sees only what their own grants allow. The link carries the text of a question, not the ability to answer it.

A very long query makes a very long link, and some chat and mail clients break long links. CHOps warns you when that is likely, and exporting the query as a file is the better option in that case.

Editing your query after sharing does not change what the link opens. The link holds a copy taken at the moment you created it.

---

## Exporting results

The **Export** button in the toolbar opens a short wizard that walks you through three steps and hands you a finished file.

The work happens on the CHOps server rather than in your browser. CHOps runs your query again, asks ClickHouse® to produce the file in the format you picked, compresses it, and gives you a link to download. Two things follow from that. An export is no longer limited by what a browser tab can hold, so large results are fine. And you always get the full result of your query, not just the rows currently on screen, and not limited by the Max rows setting.

**Step 1** shows the SQL that will be exported and offers an estimate of how many rows it will produce, so you can catch a mistake before starting a long job. If your query is very large, CHOps warns you before continuing.

**Step 2** is where you choose the format and compression. More than twenty ClickHouse® formats are available, including CSV, TSV, JSON in several shapes, Parquet, ORC, Arrow, Avro, and SQL insert statements. Compression can be gzip, zstd, zip or tar.gz, or none at all.

**Step 3** shows progress while the file is written, then a download button.

**An export outlives the page.** The job runs on the server, so you can close the tab, shut the laptop, or lose your connection and it carries on. When you come back and open Export again, CHOps returns you to the progress view for that job. If the export finished while you were away, the download button is waiting.

Closing the wizard while an export is running asks whether you want to cancel it or leave it going. Leaving it going is a real option: reopen Export and you are back at it.

> **A note on parameters.** Optional filter blocks are resolved before an export runs, exactly as they are for a normal run, so an export gives you the same rows the editor would.

---

## Regular and Comparison modes

Beside the connect control is a small **mode** dropdown with two options:

- **Regular**: the editor described on this page.
- **Comparison**: a side-by-side view for running two queries and comparing their results and performance directly.

Switching between them keeps everything. Your tabs, their SQL, their results and their undo history are all still there when you switch back, because both views stay loaded rather than being thrown away and rebuilt. Comparison mode is documented separately under [Query Comparison](query-comparison.md).

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl / Cmd + Enter** | Run the current query |
| **Ctrl / Cmd + B** | Toggle the Bookmarks panel |
| **Ctrl / Cmd + F** | Find and replace, with the cursor in the editor |
| **Ctrl / Cmd + Z** | Undo, within the current tab |
| **Ctrl / Cmd + 1 to 9** | Switch to that tab |
| **Tab** | Indent (when autocomplete is closed) |
| **Up / Down** | Move through autocomplete suggestions |
| **Enter / Tab** | Accept the highlighted suggestion |
| **Escape** | Close autocomplete or the find bar, or exit fullscreen |

Ctrl+T and Ctrl+W are not used for tabs, because they belong to your browser and cannot be taken.

---

## Common scenarios and troubleshooting

**"The editor is locked and asking me to connect."**
The SQL Editor runs under your own ClickHouse® credentials. Enter your ClickHouse® username and password in the toolbar and click Connect. Nothing unlocks until that trivial `SELECT 1` validation succeeds.

**"My session expired / please reconnect."**
The stored credential lives for about two hours (matching your CHOps login) and is cleared on logout. When it lapses, just re-enter your password. This is expected behaviour, not a bug: CHOps intentionally does not keep your ClickHouse® password around indefinitely.

**"Go is greyed out and I do not know why."**
Either you are not connected, or your query has a required parameter with an empty box. A required parameter is shown with an asterisk. Fill it in, or wrap that part of the query in `/*[ ... ]*/` to make it optional.

**"ClickHouse® says Substitution 'x' is not set."**
The query reached ClickHouse® with a `{x:Type}` placeholder but no value alongside it. Normally the editor prevents this by disabling Go, so seeing it usually means the parameter is inside a comment or a string where the editor does not treat it as a parameter, or that it is a parameterised view definition, which is a different feature and is passed through deliberately.

**"My results say 5,000+ rows and I need all of them."**
Raise the Max rows stepper, or use Export, which always gives you the complete result regardless of that setting. For anything above about twenty-five thousand rows, Export is the better tool.

**"Estimated rows is huge, but my WHERE clause should filter most of them."**
Your filter columns are probably not at the front of the table's ORDER BY key, so ClickHouse® cannot prune parts. Check the Existing Indexes section. If the filter column is not in ORDER BY, consider a data-skipping index: `minmax` for ranges, `bloom_filter` for equality on strings, `set` for `IN` lists.

**"Estimated rows is low, but the query is still slow."**
The bottleneck is processing, not scanning. Run the query, then use the **Pipeline** action button to see which step took the most time, usually heavy aggregation, a large join, or complex expressions.

**"The estimate says 0 parts / 0 rows."**
The table may be empty, partition pruning may have eliminated everything, or the table uses a Distributed engine (estimates are not available for the underlying shards).

**"Explain estimate failed but Explain plan works."**
Some patterns are not supported by EXPLAIN ESTIMATE, notably table functions like `url()`, `s3()`, and `remote()`. The plan and index sections still render.

**"Action buttons did not appear after a run."**
They need a query ID from ClickHouse®. If the query was very fast or the ID was not captured, they may be skipped. Find the query in the profiling tools by text or time range instead.

**"Generate is not doing anything, or errors out."**
Make sure an AI provider is configured (see [AI API Keys](ai-api-keys.md)) and that you have selected a database for AI by clicking its sparkles icon in the explorer. Also note that generating replaces whatever is currently in the editor, so open a new tab first if you want to keep it.

**"Ctrl+F opened my browser's search instead of the editor's."**
Click into the SQL first. The editor only receives the shortcut when your cursor is in it.

**"A function is not highlighted or does not autocomplete."**
The lists come from the server you are connected to. If a function is missing, that server does not have it, which is usually more useful to learn now than after the query fails.

**"I lost a tab I had not run yet."**
Closing a tab with unrun text asks first, so this normally cannot happen by accident. If it does, unrun text is not in History, which is the argument for bookmarking anything you would be annoyed to lose.

---

## Tips

- **Estimate first on unfamiliar tables.** Cost takes a second and tells you whether a query is going to read a thousand rows or a billion.
- **Use a tab per idea.** Two tabs beat one tab and a text file when you are comparing approaches, and each keeps its own undo.
- **Rename your tabs.** Three tabs called Query 1, 2 and 3 are useless five minutes later.
- **Parameterise anything you run more than twice.** It removes the risk of editing the wrong number in the wrong copy, and makes the query safe to hand to someone else.
- **Bookmark queries with their defaults.** A bookmark that arrives with sensible values already filled in is much more likely to be used by the rest of the team.
- **Reach for Export sooner than you think.** Anything you are going to read carefully, chart elsewhere, or send to someone is better as a file than as rows in a browser.
- **Read what the AI wrote.** It has seen your schema, not your data, and it can be confidently wrong in ways that still run.

---

## Related tools

The Tools section includes companion pages that pair naturally with the SQL Editor. After running a query, the action buttons take you straight into them for the query you just ran:

- **[Query Profiler](query-profiler.md)**: flame-graph analysis of where a query spent its time.
- **[Query Metrics](query-metrics.md)**: a second-by-second resource timeline for a single query.
- **[Processors Profile](processors-profile.md)**: the execution pipeline of a query as a processor graph.
- **[Query Comparison](query-comparison.md)**: run two queries side by side and compare results and performance.
