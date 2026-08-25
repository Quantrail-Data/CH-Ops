# SQL Editor

The SQL Editor is where you write queries and run them against your ClickHouse&reg; cluster, from the browser. If you have used the `clickhouse-client` command line or ClickHouse&reg; Play, it feels familiar. It adds the things those tools make you do by hand. You get a schema explorer you can click through, autocomplete that knows your tables and documents your functions, several queries open at once in tabs, reusable parameters, a one-click cost estimate before you run anything expensive, visual diagrams of how a query runs, an optional AI helper that turns a plain-English question into SQL, and clear statistics after every run.

This page walks through every part of the editor. It starts with the first thing you must do, which is to connect, and goes on to the tools that power users reach for every day. If you are new to ClickHouse&reg;, read it top to bottom. If you are experienced, the section headings and the [keyboard shortcuts](#keyboard-shortcuts) table will get you where you need to go.

---

## First: connect with your ClickHouse® credentials

Before you can browse schemas or run anything, the editor asks you to connect with **your own ClickHouse&reg; username and password**. This is a deliberate design choice. It is worth understanding, because it shapes how everything else behaves.

Look at the toolbar just above the editor. Until you connect, you see a small **user** box, a **password** box, and a **Connect** button. The schema explorer on the left shows a padlock with "Connect to browse databases", and the run buttons are disabled.

Type the ClickHouse&reg; user you want to work as, enter that user's password, and click **Connect** (or press Enter in either box). CHOps validates the credentials at once. It runs a trivial `SELECT 1` as that user. The editor unlocks only if that succeeds. If the credentials are wrong, or the node is unreachable, the error appears in the toolbar so you can fix it.

**Why a separate login when I already logged in to CHOps?** Because the SQL Editor runs every query as *you*, the ClickHouse&reg; user, not as a shared service account. Whatever that ClickHouse&reg; account may do is exactly what you may do in the editor. If your account is read-only, ClickHouse&reg; refuses writes. If it has full privileges, you have full privileges. This keeps the audit trail honest. CHOps never quietly gives you more access than your database account grants.

**What happens to my password?** The browser sends it exactly once, to connect. After that, CHOps encrypts it (AES-256-GCM) and holds it on the server, tied to your current login session. The browser does not keep it. CHOps runs every later query with that stored credential, so you never retype the password. A few practical points follow:

- **The connection survives a page reload.** If you refresh, CHOps restores the connected state, so you do not reconnect every time.
- **The session lasts about two hours**, the same as your CHOps login. After that, or if you log out, CHOps clears the stored credential and the editor asks you to reconnect. If a query returns a "session expired, please reconnect" message, this is why. Enter your password again.
- **Disconnecting is one click.** Once connected, the toolbar shows a green plug icon with your username and node (for example `analyst @ ch-node-1:8123`) and a **logout** button. Click it to clear the stored credential and the loaded schema, so nothing stale is left.

If you switch nodes or clusters from the navbar, you stay connected. Your credentials carry across the switch, and the explorer reloads the schema for the new target.

---

## The layout at a glance

The editor has four areas:

- **Left: the Schema Explorer.** Browse databases and tables, look at a table's definition, or drop a table name into your query.
- **Top of the center: the tab strip.** One tab per open query, with an add button and a reminder of the two main shortcuts.
- **Center: the editor and its toolbar.** Here you write SQL, choose how to run it, and reach the history, bookmarks, share, export, full-screen, and AI controls.
- **Bottom: the results panel.** Here your rows, success messages, cost estimates, execution diagrams, and errors appear, with a statistics bar and quick links into the profiling tools.

The editor pane and the results pane each scroll on their own, so a large result never pushes the editor off the screen. You can drag the divider between them to give either one more room, resize the explorer, collapse the editor, or go full screen. More on each below.

---

## Working with tabs

Tabs let you keep several queries open at once, the way you keep several tabs open in a browser. Each tab is independent. It has its own SQL, its own results, its own undo history, its own parameter values, and its own choice of how to run.

This matters more than it sounds. Before tabs, to compare two versions of a query meant a text file, or a run, a copy of the numbers, and a paste of the other version over the top. Now you write one in each tab and switch between them.

### The basics

- **Add a tab** with the **+** button at the right of the strip. It opens empty and focused, ready to type into.
- **Switch tabs** with a click, or with **Ctrl+1** through **Ctrl+9** for the first nine.
- **Close a tab** with the small x that appears when you hover it. If the tab has text you have never run, CHOps asks first, because that text is not in your history and would be gone. If you have run it, the tab closes at once, because you can get it back from History.
- **Rename a tab** with a double-click on its name. Press Enter to keep the new name, or Escape to cancel. Rename tabs the moment you have more than two open. "Query 1, Query 2, Query 3" tells you nothing. "slow join", "before fix", "after fix" tells you everything.
- **Close the last tab** and you get one empty tab, not an empty screen.

You can have up to ten tabs open. Past that, the **+** button greys out and tells you why.

### What survives, and what does not

Your browser remembers the tabs. If you reload the page, close the browser, or come back tomorrow, your tabs are still there, with their names, their SQL, and their parameter values.

**Results are not remembered.** When you come back, each tab holds its query but shows no rows. This is deliberate, for two reasons. To re-run is one keystroke. And query output can hold data that should not sit in browser storage, where every other page on the same site could read it.

CHOps stores tabs per browser, on the device you use, the same as History. They do not follow you to another computer. For queries you want to keep, use **Bookmarks**.

### Running queries in more than one tab

A query keeps running when you switch away from it. If a report takes two minutes, start it, switch to another tab, and carry on. The busy tab shows a small spinner in the strip, so you can see which one still runs. Its results appear in that tab when it finishes, not in the tab you happen to look at.

If you press **Go** while another tab still runs, CHOps asks whether you meant to. The dialog names the busy tab and offers to run anyway. Two things are worth knowing:

- It asks, it does not refuse. To run several queries at once is normal. If that is what you want, say yes.
- If you say yes, CHOps does not check again whether the first query still runs. By the time you read the question, it may have finished, and to refuse on old information would waste the pause the question bought you.

### Undo works per tab

Each tab keeps its own undo history. Type in one tab, switch away, switch back, and **Ctrl+Z** still walks back through what you typed there, not through something you did somewhere else. This includes an accepted autocomplete suggestion. One Ctrl+Z removes only the completion, not everything before it.

---

## Schema Explorer

The panel on the left lets you look through your databases and tables without you leaving the editor, so you never have to remember an exact name.

Choose a database and it expands to list its tables. Click a table's **name** and its full `database.table` name drops into the editor at your cursor. This is a fast way to build a query without you typing, or misspelling, identifiers.

**Drag instead of click.** You can also drag a table from the explorer and drop it where you want it in your query. A click inserts at the cursor. A drag lets you choose the spot with the pointer, which is easier when you add a second table to a join halfway through a line. Watch for the drop cursor that follows your pointer inside the editor. It shows where the text will land. One **Ctrl+Z** removes the whole insertion.

**Read a table at a glance.** Next to every table is a small icon that hints at its engine, so you can tell types apart without you opening anything. A table icon means MergeTree and log families. An eye means a view (regular, materialized, and window views). Stacked layers mean data-lake formats (Iceberg, Hudi, Delta Lake, Hive). A broadcast icon means a streaming queue (Kafka, RabbitMQ, NATS). A cloud means object storage (S3, GCS, Azure Blob, HDFS). An import icon means an external database (MySQL, PostgreSQL, MongoDB, Redis, SQLite, ODBC/JDBC). A ring means a Distributed table. A book means a dictionary. Hover over a table to see its exact engine in a tooltip.

**See the full definition (DDL).** Beside each table is a small code icon. Click it and CHOps runs `SHOW CREATE TABLE` and opens the complete `CREATE TABLE` statement in a pop-up, with a **Copy** button. This is the quickest way to check a column's type, confirm the sorting key, or copy a schema to reuse.

**Adjust the panel.** Drag the panel's right edge to make it wider or narrower. Or click **Collapse** to tuck it away when you want the most space to write. When collapsed, a narrow strip stays, with a folder icon at the top. Click it to bring the explorer back. The **refresh** icon in the explorer header reloads the database list, which helps after someone creates or drops a database.

**The sparkles icon (AI database).** You also see a small sparkles icon to the left of each database. That is part of the AI SQL feature, explained under [Generating SQL with AI](#generating-sql-with-ai). Ignore it if you do not use AI.

---

## Writing a query

The center of the screen is the editor. As you type, CHOps highlights your SQL, line numbers run down the left, and the editor keeps a comfortable height that you can adjust.

### Reading the colors

The highlighting uses a different color for each kind of thing in your query. This makes a long statement much easier to scan:

- **Keywords** such as `SELECT`, `FROM`, `GROUP BY`, and `JOIN`.
- **Functions** such as `count()`, `toStartOfHour()`, and `groupArray()`. A name is colored as a function when your connected server actually has it, because the list comes from that server's own `system.functions`. If a function is not colored, that server does not have it, which is useful to know before you run anything.
- **Tables and columns**, in a color of their own.
- **Database names** in a qualified name such as `system.query_log`, slightly different from the table beside them.
- **Column types** such as `UInt64` and `DateTime`.
- **Text in quotes**, **numbers**, and **comments**, each distinct.

The light and dark themes each have their own colors, and the editor follows the theme you use.

### Autocomplete

Start typing (two characters is enough) and a suggestion menu appears. The suggestions come live from *your own* cluster the moment you connect, so they reflect what actually exists:

- **Keywords** and **functions** straight from ClickHouse&reg;'s own `system.keywords` and `system.functions`.
- **Table and database names**, including full `database.table` forms, from `system.tables`.

Each kind has its own icon in the list, so you can tell a function from a table at a glance. Move with the **Up/Down** arrows, accept with **Enter** or **Tab**, and dismiss with **Escape**. When you accept a function, CHOps inserts it with its brackets and puts your cursor between them, ready for the arguments.

**Function documentation.** Highlight a function in the list and a panel appears beside it with the function's signature and a description, taken from your server. The category shows next to each function name too, so `groupArray` reads as "Aggregate", not just "function". This is the fastest way to check what an unfamiliar function expects, without you leaving the editor to search the ClickHouse&reg; documentation.

Nothing about autocomplete goes back to the server as you type. CHOps fetches the whole list once when you connect and filters it in your browser, so the network never slows your typing.

### Find and replace

Press **Ctrl+F** with your cursor in the editor, and a find bar opens inside the editor, with replace, whole-word, and regular-expression options. Matches highlight as you type. Your cursor must be in the editor first. Otherwise the browser's own page search opens, which cannot see inside the editor.

### Resize and hide

- **Drag the divider** directly under the editor to make it taller or shorter. The results pane takes what is left. Double-click the divider to reset it. CHOps remembers the height you choose.
- **Collapse SQL** hides the editor, so you can give the whole screen to your results. Expand it again when you want to edit.
- **Full screen** gives you a full-window editor for larger work. Press **Escape** to leave full screen.

### Other editing behavior

- **Ctrl+Enter** (or **Cmd+Enter** on a Mac) runs your query from anywhere in the editor.
- **Tab** indents.
- Brackets and quotes close themselves as you type.
- The editor follows the application text size, so if you made the interface larger or smaller, the SQL follows.

> **Size limit.** One query is capped at 100 KB of SQL. That is enormous for hand-written queries. You reach it only with machine-generated statements, and if you do, the editor tells you clearly instead of a silent failure.

---

## Query parameters

Parameters let you write a query once, with the changing values left as blanks, then fill the blanks without you editing the SQL. If you have ever kept three copies of one query with a different customer name in each, this replaces all three with one.

### Writing a parameter

Write `{name:Type}` anywhere a value would go:

```sql
SELECT count()
FROM system.tables
WHERE database = {db:String}
```

The moment that appears in your SQL, a strip of input boxes appears above the editor, one per parameter. **Go** stays disabled until every required box is filled. Fill in `system`, press Go, and you get the count for that database. Change it to `default` and press Go again. The SQL never changes.

The `Type` part is a real ClickHouse&reg; type. It decides the kind of input box you get:

- `String` gives a plain text box.
- `UInt8`, `Int64`, `Float64`, and other numeric types give a number box.
- `Date`, `DateTime`, and `DateTime64` give a date and time picker.
- `Enum8('a' = 1, 'b' = 2)` gives a dropdown with those exact choices.
- `Array(String)`, `Map(String, UInt8)`, and similar give a text box where you type the value in ClickHouse&reg;'s own notation, such as `['a','b']`.

### Why this is safer than editing the SQL

The value you type **never becomes part of the query text**. CHOps sends your SQL to ClickHouse&reg; with the `{db:String}` placeholder still in it, and sends the value separately. ClickHouse&reg; does the substitution itself, as data, at the point it needs it.

So a value cannot change the meaning of your query, whatever it contains. Type `system' OR 1=1 --` into that box and you get zero rows, because there is no database with that name. ClickHouse&reg; treats it as a name to look for, not as SQL to run. If you have ever worried about a customer-supplied string pasted into a query, this is the mechanism that makes it safe.

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

Fill in `db` and leave `since` empty, and CHOps removes the second line from the query before it sends it. Fill in both and both apply. Leave both empty and you get every table.

A parameter inside one of these blocks is **optional**. It shows without an asterisk, and Go stays enabled whether or not you fill it in. A parameter outside any block is **required**. It shows with an asterisk, and Go waits for it.

To ClickHouse&reg;, these blocks are ordinary comments. So a query with them still runs unchanged if you paste it into `clickhouse-client`. You lose nothing by writing your queries this way.

The editor enforces a few rules, each with a clear message instead of a silent failure:

- Blocks cannot be nested inside each other.
- Every block must contain at least one parameter, or nothing decides whether to include it.
- A block cannot contain a semicolon.
- The same parameter name cannot have two different types.
- A `{name:Type}` inside a quoted string or a comment is left alone, because it is text, not a parameter.

### Seeing exactly what will be sent

Click **Preview** and you get the finished SQL, with the optional blocks resolved and the list of parameter values that travel alongside. This is the quickest way to confirm that a cleared filter really did remove that line, and to satisfy yourself that your values are not written into the query text.

### Values are remembered, per tab

CHOps keeps parameter values per tab, so two tabs can hold different values for the same parameter name. That is what you want when you compare one customer against another.

A new tab starts from the values you used most recently, so a `tenant` you typed once does not have to be typed again. From then on, the two tabs go their own way, and a change of a value in one never changes it in the other.

CHOps also remembers values between sessions, so the query you use every morning already has yesterday's inputs.

### Saving default values with a bookmark

When you save a bookmark, tick **Save current parameter values as defaults**, and CHOps stores those values with it. When you open that bookmark later, CHOps fills the strip in for you. Values you already set in the current session win over the saved defaults, so a bookmark never overwrites something you deliberately typed.

---

## Running a query

The controls sit together at the bottom right of the editor, in the order you tend to think about them: how much, what will it cost, help me write it, what kind of run, and finally do it.

### Go

**Go** runs your query. It is the only control that does. Whatever the mode dropdown beside it says, Go performs that and nothing else performs anything.

**Ctrl+Enter** does the same from anywhere in the editor.

The editor runs under your ClickHouse&reg; credentials, so that account governs what a query may do. ClickHouse&reg; rejects writes from a read-only account. An account with write privileges can create, insert, alter, and drop.

### The mode dropdown

Beside Go is a dropdown that decides what Go will do:

- **Execute SQL** runs your query as written. This is the default.
- The other entries are **EXPLAIN** variants. Instead of a run, they ask ClickHouse&reg; to describe how it *would* run the query. They are covered under [Understanding a query with EXPLAIN](#understanding-a-query-with-explain).

To choose a mode does not run anything. It sets what Go will do, and then you press Go. This is worth a plain statement, because it used to work the other way. To pick an entry ran it at once, which made the dropdown two controls in one and made it easy to launch an expensive EXPLAIN by accident while you browsed the list.

CHOps remembers your choice per tab, so one tab can sit on Execute SQL while another stays on Explain plan.

### Cost

**Cost** analyses a `SELECT` without a run, so you can see how much work it would cause before you commit to it. See [Estimating query cost](#estimating-query-cost).

### Generate

The purple **Generate** button turns a plain-English question into a query with AI. See [Generating SQL with AI](#generating-sql-with-ai).

---

## Controlling how much comes back

Next to the run controls is a **Max rows** stepper. It decides how many rows the editor asks ClickHouse&reg; to send back.

The default is 5,000. Use the minus and plus buttons to move in steps of 100, or click the number and type a value, then press Enter or click away. The range is 100 to 100,000, and CHOps remembers the value.

### Why there is a limit at all

A browser does real work for every row it receives. It parses the row, keeps it in memory, and lays it out on screen. A query that returns a million rows can make the whole page slow to scroll and slow to switch tabs, and none of that work is useful, because nobody reads a million rows in a browser.

CHOps applies the limit as a **setting on the request**, not by an added `LIMIT` in your SQL. Your query reaches ClickHouse&reg; exactly as you wrote it. This matters for two reasons. A query that already ends in `LIMIT`, `FORMAT`, or a settings clause would break if something appended to it. And the query text in ClickHouse&reg;'s own query log stays exactly what you typed.

When more rows were available than you asked for, the status line says so, for example `5,000+ row(s) returned`, with a note that points you at Export for the complete result.

### Raising it

If you genuinely need more rows in the browser, raise the number. Above 25,000, CHOps asks you to confirm. It explains that a large number can make the editor slow, and that Export is a better tool for large results. It is a question, not a refusal. Confirm and you get what you asked for.

### The limit applies everywhere except Export

Max rows applies to every place in CHOps where you write SQL: the SQL Editor, Comparison mode, Chart Builder, and Qurioz. A change in one changes it in all of them, because it is one setting about how you like to work.

**The Export Wizard is not affected.** Export streams the query result to a file on the server and always gives you every row. That is the point of it. It is also why the limit is safe. The editor stays responsive, and the complete result is one button away.

### The administrator's ceiling

There is a second limit, on the total **size** of a result, not the number of rows. It exists because a row count cannot express width. Five thousand rows of a short string is nothing. Five thousand rows, each with a stack trace, is hundreds of megabytes.

It defaults to 128 MB. An administrator changes it under **Administration > App Config**, on the Queries tab, so whoever runs your CHOps server can raise it on a larger machine. The change applies at once, with no restart. Whichever limit is reached first stops the transfer. See [App Config](admin.md#app-config).

---

## Generating SQL with AI

The **Generate** button turns a question in plain English into SQL.

Before it works, an administrator must configure an AI provider for your installation (see [AI API Keys](ai-api-keys.md)). You must also tell CHOps which database the question is about. Click the **sparkles icon** next to that database in the explorer. The icon fills in to show the database is selected. This step matters. CHOps gives the AI that database's table and column names, so it can write a query that refers to things that exist.

Type your question into the editor in ordinary words, for example `top 10 tables by size in the last week`, then click Generate. CHOps sends your question with the schema of the selected database, and replaces the editor contents with the SQL that comes back.

Keep two things in mind. It **replaces what is in the editor**, so if you have something you want to keep, open a new tab first. And always read what it produced before you run it. It is a starting point written by a model that has seen your schema but not your data, and it can be subtly wrong in ways that still run.

---

## Understanding a query with EXPLAIN

The mode dropdown beside Go holds several EXPLAIN variants. Each asks ClickHouse&reg; a different question about how it would run your query, and none of them run it.

- **Explain** and **Explain plan** show the query plan: the steps ClickHouse&reg; would perform, in order.
- **Explain syntax** shows your query after ClickHouse&reg; rewrites it internally, which reveals the optimisations it applied.
- **Explain query tree** shows the analysed form of the query.
- **Explain pipeline** shows the physical execution pipeline: the processors that would do the work.
- **Explain estimate** returns the estimated rows, parts, and marks that would be read.
- **Explain AST (graph)** and **Explain pipeline (graph)** return diagrams instead of text, and CHOps renders them visually.
- **Explain plan (JSON)** returns the plan as structured JSON, which helps when you want to read it carefully or hand it to a tool.

### The option checkboxes

When you select a mode that supports options, a row of checkboxes appears underneath: **Indexes**, **Projections**, **Distributed**, **Pretty**, **Compact**, **Sorting**, **Actions**, and so on, depending on the mode. These map to ClickHouse&reg;'s own EXPLAIN settings and add detail to the output.

To tick one does not re-run the query. Set the options you want, then press Go, the same as the mode dropdown. CHOps remembers your ticks per tab, and carries them over to new tabs.

### Reading a graph

For the two graph modes, CHOps renders the diagram with zoom and pan, and a button for full screen. This is often the fastest way to understand a complex query. To see that one branch of a join is far wider than the other tells you more at a glance than the text plan.

---

## Estimating query cost

Press **Cost** and CHOps analyses a `SELECT` without a run. Use this before any query you are unsure about, and especially on a table you do not know well.

It reports:

- **Estimated rows**, **parts**, and **marks** that ClickHouse&reg; expects to read.
- The **query plan**, so you can see the shape of the work.
- **Existing indexes** on the tables involved, including the primary key and any data-skipping indexes, so you can tell whether your filters can use them.

The estimate comes from ClickHouse&reg; itself, not from a guess by CHOps. So it reflects the real state of your data, including its partitioning.

A large estimated row count is the signal to stop and think. Sometimes it means your filter cannot prune parts, which the indexes section usually explains. Sometimes it means the query really does need to read that much. In that case you at least know before you start, not after.

---

## Reading your results

What you see after a run depends on the kind of query.

- **Queries that return data** (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, and so on) produce a **results table**. Click any cell to copy its value. If a query returns nothing, you get a clear "0 row(s) returned", not a misleading success message.
- **Commands that change things** (`CREATE`, `INSERT`, `ALTER`, `DROP`, `GRANT`, `REVOKE`, `SYSTEM`, `OPTIMIZE`, `TRUNCATE`, `KILL`) produce a **success message written for that action**: "Created successfully", "Insert executed successfully", "Dropped successfully", and so on. When ClickHouse&reg; reports how many rows were written or affected, that count is added too.
- **Errors** appear in a **red banner** with the full text ClickHouse&reg; returned, wrapped so even long messages stay readable. The exact database error is the fastest way to see what went wrong.

### Large results stay fast

The results table draws only the rows on screen and replaces them as you scroll. So a four thousand row result costs the browser about the same as a forty row one, and a very wide table such as `system.query_log`, which has around seventy columns, no longer slows the page.

You can scroll through everything that came back. Nothing is hidden. CHOps draws it as you reach it. The column headers stay in place while you scroll, which matters on a wide table where the tenth column means nothing without its name.

### Table full screen

In the rightmost cell of the header row is a small expand button. Click it and the table fills the window, which is the easiest way to read a wide result. Press **Escape** or click the button again to come back.

The button lives in the header, not floating over the table, so it stays visible while you scroll instead of sliding away with the rows.

### The statistics bar

Alongside the results, a status bar summarises the run:

- **Rows returned** (or rows written, for write statements). A trailing plus sign means more were available than the Max rows setting asked for.
- **Rows scanned** and **data read**: how much work it took.
- **Elapsed time**, in seconds.
- **Peak memory**: looked up from ClickHouse&reg;'s query log a fraction of a second after the query finishes, so it reflects the true high point, not a guess. If a query is very fast, this figure may be left out.

---

## Digging deeper: action buttons after a run

Once a query finishes and ClickHouse&reg; assigns it a query ID, a row of buttons appears in the statistics bar. They take you straight into the profiling tools for *that exact query*:

- **query_id**: copies ClickHouse&reg;'s ID for the query, useful to look it up in system tables or to hand to whoever administers the cluster.
- **Flame Graph**: opens the [Query Profiler](query-profiler.md) with this query loaded, to show where it spent its time. Reach for this first when something is slow.
- **Pipeline**: opens the [Processors Profile](processors-profile.md) with the query loaded, and renders its execution as a diagram, so you can see which step dominated.
- **Metrics**: opens [Query Metrics](query-metrics.md) with the query loaded, to show a second-by-second view of how it used resources.

If the buttons do not appear, the run did not capture a query ID (sometimes the case for very fast queries). You can still find the query in the profiling tools by its text or time range.

---

## Query history

CHOps saves every query you run, so you can always get back to something from earlier. Open the panel from the **History** button in the toolbar. Each entry shows:

- Its **SQL text**.
- The **row count** and **how long it took**.
- A green check or a red X for **success or failure** (with the error text on failures).
- **When** you ran it.

**Click an entry to open it in a new tab**, which leaves what you were writing untouched. This is usually what you want. You look at history to compare something with what you have now, not to replace it.

**Drag an entry** into the editor to insert it as a subquery, wrapped in brackets, at the point you drop it. This is the fast way to build `SELECT count() FROM ( ... )` around a query you ran last week, without you opening it, copying it, and coming back.

CHOps tidies the query as it inserts. It removes a trailing `FORMAT` clause, a trailing semicolon, and anything after the first statement, all of which would be errors inside a subquery.

History keeps your most recent queries and drops the oldest as new ones arrive. The **Clear** button empties it.

> **One thing to know:** history is stored in your browser, on the device you use. It does not follow you to another computer, and clearing your browser data clears it. For queries you want to keep and share, use **Bookmarks**.

---

## Bookmarks

When there is a query you reach for often, bookmark it with a name instead of a rewrite each time.

- **Save one:** write your SQL, type a name in the bookmark panel, and click **Save**. Tick **Save current parameter values as defaults** to have the values filled in next time.
- **Use one:** click it to open it **in a new tab**, named after the bookmark, which leaves what you were writing alone.
- **Drag one:** drag it into the editor to insert it as a subquery at the drop point, the same as a history entry.
- **Remove one:** click the trash icon beside it.
- **Shortcut:** **Ctrl+B** (or **Cmd+B**) toggles the bookmarks panel.

Unlike history, **bookmarks live on the server**. So they stay with you across browsers, devices, and sessions, and they are **shared with everyone on your team**. This is deliberate. A useful query, such as one that lists table sizes or surfaces slow queries, is worth having on hand for the whole team.

### Exporting and importing bookmarks

At the bottom of the bookmarks panel are three download buttons and an Import button.

- **JSON** holds everything, including parameter defaults. It is the only format you can import back. Use it to move queries between CHOps installations, or to keep a backup.
- **Markdown** produces a heading and a fenced SQL block per query, ready to paste into a runbook, a ticket, or a wiki.
- **SQL** produces each query with its name as a comment, for another tool or for version control.

Markdown and SQL are one-way on purpose. They drop the parameter defaults, and to read them back would mean a guess about where one query ends and the next begins.

**Import** takes a JSON export and merges it into your bookmarks. If an incoming query has the same name as one you already have, CHOps shows you the clashes before it changes anything, and asks what to do with each:

- **Keep mine**: the existing query stays and the incoming one is discarded.
- **Take theirs**: the incoming one replaces yours.
- **Keep both**: both survive, with the incoming one renamed, for example `errors by hour (2)`.

Queries identical to what you already have are not shown, because there is nothing to decide. Nothing is written until you press Apply import, and to cancel changes nothing.

Import never runs anything. A query that arrives in a file is only stored.

---

## Sharing a query by link

The **Share** button copies a link that holds the query you are looking at. Send it to a colleague and it opens for them, in a new tab, with your SQL in it.

This is for the common case of "what do you make of this?" about a query you are in the middle of debugging. It works on unsaved SQL, so you do not have to bookmark something just to ask about it.

Three things are worth understanding about how it works.

**The query travels in the part of the URL after the `#`.** Your browser handles that part entirely, and never sends it to any server. So a shared query does not appear in access logs, proxy logs, or anything else in front of CHOps.

**Parameter values are not included unless you ask.** If your query has values filled in, a checkbox appears to offer to include them, and it starts unticked. Parameter values are often the sensitive half of a query, such as a customer identifier or an account name. To send the shape of a question should never accidentally send the specifics. Tick it, and a warning reminds you that anyone the link reaches can read those values.

**A link grants no access.** Whoever follows it signs in to CHOps as themselves, connects with their own ClickHouse&reg; credentials, and sees only what their own grants allow. The link carries the text of a question, not the ability to answer it.

A very long query makes a very long link, and some chat and mail clients break long links. CHOps warns you when that is likely, and to export the query as a file is the better option then.

To edit your query after you share does not change what the link opens. The link holds a copy taken the moment you created it.

---

## Exporting results

The **Export** button in the toolbar opens a short wizard. It walks you through three steps and hands you a finished file.

The work happens on the CHOps server, not in your browser. CHOps runs your query again, asks ClickHouse&reg; to produce the file in the format you picked, compresses it, and gives you a link to download. Two things follow. An export is no longer limited by what a browser tab can hold, so large results are fine. And you always get the full result of your query, not just the rows on screen, and not limited by the Max rows setting.

**Step 1** shows the SQL that will be exported and offers an estimate of how many rows it will produce, so you can catch a mistake before a long job. If your query is very large, CHOps warns you before it continues.

**Step 2** is where you choose the format and compression. More than twenty ClickHouse&reg; formats are available, including CSV, TSV, JSON in several shapes, Parquet, ORC, Arrow, Avro, and SQL insert statements. Compression can be gzip, zstd, zip, or tar.gz, or none.

**Step 3** shows progress while CHOps writes the file, then a download button.

**An export outlives the page.** The job runs on the server, so you can close the tab, shut the laptop, or lose your connection, and it carries on. When you come back and open Export again, CHOps returns you to the progress view for that job. If the export finished while you were away, the download button is waiting.

If you close the wizard while an export runs, CHOps asks whether you want to cancel it or leave it going. To leave it going is a real option. Reopen Export and you are back at it.

> **A note on parameters.** CHOps resolves optional filter blocks before an export runs, exactly as for a normal run. So an export gives you the same rows the editor would.

---

## Regular and Comparison modes

Beside the connect control is a small **mode** dropdown with two options:

- **Regular**: the editor described on this page.
- **Comparison**: a side-by-side view to run two queries and compare their results and performance directly.

A switch between them keeps everything. Your tabs, their SQL, their results, and their undo history are all still there when you switch back, because both views stay loaded rather than thrown away and rebuilt. Comparison mode is documented separately under [Query Comparison](query-comparison.md).

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
| **Escape** | Close autocomplete or the find bar, or exit full screen |

Ctrl+T and Ctrl+W are not used for tabs, because they belong to your browser and cannot be taken.

---

## Common scenarios and troubleshooting

**"The editor is locked and asking me to connect."**
The SQL Editor runs under your own ClickHouse&reg; credentials. Enter your ClickHouse&reg; username and password in the toolbar and click Connect. Nothing unlocks until that trivial `SELECT 1` validation succeeds.

**"My session expired. Please reconnect."**
The stored credential lives for about two hours, the same as your CHOps login, and is cleared on logout. When it lapses, re-enter your password. This is expected, not a bug. CHOps deliberately does not keep your ClickHouse&reg; password around indefinitely.

**"Go is greyed out and I do not know why."**
Either you are not connected, or your query has a required parameter with an empty box. A required parameter shows an asterisk. Fill it in, or wrap that part of the query in `/*[ ... ]*/` to make it optional.

**"ClickHouse&reg; says Substitution 'x' is not set."**
The query reached ClickHouse&reg; with a `{x:Type}` placeholder but no value alongside it. Normally the editor prevents this by a disabled Go. So this usually means the parameter is inside a comment or a string, where the editor does not treat it as a parameter, or it is a parameterised view definition, which is a different feature and is passed through on purpose.

**"My results say 5,000+ rows and I need all of them."**
Raise the Max rows stepper, or use Export, which always gives you the complete result whatever that setting is. For anything above about twenty-five thousand rows, Export is the better tool.

**"Estimated rows is huge, but my WHERE clause should filter most of them."**
Your filter columns are probably not at the front of the table's ORDER BY key, so ClickHouse&reg; cannot prune parts. Check the Existing Indexes section. If the filter column is not in ORDER BY, consider a data-skipping index: `minmax` for ranges, `bloom_filter` for equality on strings, `set` for `IN` lists.

**"Estimated rows is low, but the query is still slow."**
The bottleneck is processing, not scanning. Run the query, then use the **Pipeline** action button to see which step took the most time, usually heavy aggregation, a large join, or complex expressions.

**"The estimate says 0 parts / 0 rows."**
The table may be empty, partition pruning may have removed everything, or the table uses a Distributed engine (estimates are not available for the underlying shards).

**"Explain estimate failed but Explain plan works."**
EXPLAIN ESTIMATE does not support some patterns, in particular table functions such as `url()`, `s3()`, and `remote()`. The plan and index sections still render.

**"Action buttons did not appear after a run."**
They need a query ID from ClickHouse&reg;. If the query was very fast, or the ID was not captured, they may be skipped. Find the query in the profiling tools by text or time range instead.

**"Generate is not doing anything, or errors out."**
Make sure an AI provider is configured (see [AI API Keys](ai-api-keys.md)), and that you selected a database for AI with a click on its sparkles icon in the explorer. Also note that Generate replaces what is in the editor, so open a new tab first if you want to keep it.

**"Ctrl+F opened my browser's search instead of the editor's."**
Click into the SQL first. The editor receives the shortcut only when your cursor is in it.

**"A function is not highlighted or does not autocomplete."**
The lists come from the server you are connected to. If a function is missing, that server does not have it, which is usually more useful to learn now than after the query fails.

**"I lost a tab I had not run yet."**
To close a tab with unrun text asks first, so this normally cannot happen by accident. If it does, unrun text is not in History, which is the argument to bookmark anything you would be annoyed to lose.

---

## Tips

- **Estimate first on unfamiliar tables.** Cost takes a second and tells you whether a query will read a thousand rows or a billion.
- **Use a tab per idea.** Two tabs beat one tab and a text file when you compare approaches, and each keeps its own undo.
- **Rename your tabs.** Three tabs called Query 1, 2, and 3 are useless five minutes later.
- **Parameterise anything you run more than twice.** It removes the risk of an edit to the wrong number in the wrong copy, and it makes the query safe to hand to someone else.
- **Bookmark queries with their defaults.** A bookmark that arrives with sensible values already filled in is much more likely to be used by the rest of the team.
- **Reach for Export sooner than you think.** Anything you will read carefully, chart elsewhere, or send to someone is better as a file than as rows in a browser.
- **Read what the AI wrote.** It has seen your schema, not your data, and it can be confidently wrong in ways that still run.

---

## Related tools

The Tools section includes companion pages that pair naturally with the SQL Editor. After a run, the action buttons take you straight into them for the query you just ran:

- **[Query Profiler](query-profiler.md)**: flame-graph analysis of where a query spent its time.
- **[Query Metrics](query-metrics.md)**: a second-by-second resource timeline for a single query.
- **[Processors Profile](processors-profile.md)**: the execution pipeline of a query as a processor graph.
- **[Query Comparison](query-comparison.md)**: run two queries side by side and compare results and performance.
