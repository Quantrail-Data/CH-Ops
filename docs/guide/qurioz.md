# Qurioz

Qurioz is CHOps's built-in AI assistant. You ask a question about your data in plain language, the way you would ask a colleague. Qurioz writes the ClickHouse&reg; SQL, runs it, and shows you the result as a table or a chart. It lives under **Tools > Qurioz AI** in the sidebar.

In one place it can:

- **Generate a query** from a natural-language question.
- **Show a data table** from that query.
- **Visualize the result** as a chart.
- **Download** the table or add the chart to a dashboard.

The rest of this page walks through each step, from the one thing you must set up first to the finer points that power users will want.

---

## Before you start: an AI provider key

Qurioz talks to an external AI provider, so it needs one active provider key. You can use Google Gemini, OpenAI, Anthropic Claude, Mistral, or Ollama for a local model. This is an administrator task, done once on the [AI API Keys](ai-api-keys.md) page. If there is no active key, Qurioz cannot generate anything and prompts you to set one up. Once a key is active, Qurioz is ready for everyone with access to the page.

You can also switch which provider is active from inside Qurioz. See [Switching the AI provider](#switching-the-ai-provider) below.

---

## Step 1: Choose a database

When you open Qurioz, it shows a welcome screen and a database dropdown. Pick the database you want to ask about. This matters, because Qurioz answers questions about the specific database you select, using that database's schema.

**The first time you select a given database,** Qurioz connects it to the AI service and reads its schema, so it understands the tables and columns available. This takes a moment on the first use. After that, Qurioz remembers your selection per cluster and per node, so you do not reconnect each time you return.

You can switch databases at any time from the same dropdown. If you ever want Qurioz to forget a database's schema, for example after a large schema change, you can remove its AI connection. See [Managing a database's AI connection](#managing-a-databases-ai-connection).

---

## Step 2: Ask a question

Type your question into the input at the bottom, for example "show me the ten slowest queries from yesterday" or "daily insert volume per table for the last week." Press **Enter** to send, or **Shift+Enter** to add a new line without a send.

**Voice input.** Next to the input is a microphone button. Click it and speak, and Qurioz transcribes your words into the box, where you can edit them before you send. Voice input uses your browser's speech recognition. If your browser or device does not support it, the button appears disabled with a note.

---

## Step 3: Read and run the generated SQL

Qurioz sends your question, together with the selected database's schema, to the active AI provider and gets back a ClickHouse&reg; SQL statement. The query appears in its own editor block with three actions:

- **Edit** lets you adjust the SQL by hand before you run it.
- **Copy** copies the query to your clipboard.
- **Run** executes it.

To run the query uses your current cluster connection, which is the node selected in the top bar. The results appear as a table below. Because Qurioz shows the SQL before anything runs, you stay in control: read it, adjust it, or discard it. If your CHOps account is a readonly role, the server restricts execution to read-only queries, which suits the SELECT-style questions Qurioz is built for.

### Working with the table

Once results are back, you can:

- **Copy the table** to your clipboard.
- **Download it** as **JSON** or **CSV**.

---

## Step 4: Visualize as a chart

You can turn any result into a chart without you leaving Qurioz. Choose a chart type and subtype and map your columns to the axes. The available types are the same ones the [Chart Builder](dashboards.md) offers, including bar, line, pie, scatter, and box plot, each with several subtypes (for example simple, grouped, stacked, and horizontal bars, or pie, donut, and rose).

To keep a chart, you can **add it to a dashboard**. This needs an editor-level role or above, and at least one dashboard to add it to. If you have no dashboards yet, create one first in the Dashboards section. The chart then behaves like any other dashboard chart.

---

## Refining an answer

Two kinds of refinement are built in:

- **Edit your question.** You can edit each question in place. To change it and resubmit regenerates the SQL from the new wording, which is the quickest way to steer Qurioz when the first attempt was close but not quite right.
- **Edit the SQL.** If you would rather adjust the query directly, use the Edit action on the SQL block, change it, and run it again.

To rephrase more specifically, by naming the table, the time range, or the exact metric, usually produces a better query than a vague prompt.

---

## Switching the AI provider

If more than one provider key is configured, Qurioz shows a provider selector. To choose a different provider activates that key for the whole application, so it affects both Qurioz and the SQL Editor's Generate SQL button, not just this page. You manage the keys themselves (add, test, edit) on the [AI API Keys](ai-api-keys.md) page.

---

## Chat history and limits

CHOps keeps your conversation in your browser between visits, so you can scroll back through earlier questions and answers. A **clear chat** control empties the history when you want a fresh start. There is a limit on how long one conversation can grow. If you reach it, Qurioz asks you to clear the older chat before you continue. Because the history lives in the browser, it is per-device and does not follow you to another computer.

---

## Managing a database's AI connection

To select a database for the first time creates an AI connection that holds its ingested schema. If you need Qurioz to drop that schema, for example after significant DDL changes, or to free it up, you can remove the database's AI connection. To reconnect later re-reads the current schema, so Qurioz always works from an up-to-date picture.

---

## How it works, briefly

When you ask a question, Qurioz does not send your whole database to the provider. It ingests each selected database's schema once, indexes it, and at query time retrieves only the relevant parts of that schema to send with your question. The provider uses that context to produce ClickHouse&reg;-specific SQL. This is why the right database matters, and why a schema change is worth a re-ingest.

---

## Good practices

- **Always review the SQL before you run it.** Qurioz proposes queries. You are responsible for what runs against your cluster. Read anything beyond a straightforward SELECT with extra care.
- **Be specific.** Name the table, the time window, and the exact measure you want. Specific questions produce more accurate queries.
- **Pick the matching database.** Qurioz answers about the database you selected. If a query references tables that are not there, check that the right database is chosen.
- **Re-ingest after big schema changes**, so Qurioz reflects the current tables and columns.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Qurioz says AI is not configured | No active provider key | Ask an administrator to add and activate a key on the [AI API Keys](ai-api-keys.md) page. |
| "Select a database and generate the ID" | No database chosen yet | Pick a database from the dropdown before you ask a question. |
| Generation fails or errors out | The provider rejected the request, or the model name is wrong | Check the active key and model on the AI API Keys page and test it there. |
| The microphone button is disabled | Your browser does not support speech recognition, or the mic is unavailable | Type your question instead, or try a browser that supports voice input. |
| "Chat limit exceeded" | The conversation grew past its size limit | Clear the old chat and continue. |
| Cannot add a chart to a dashboard | You lack the required role, or no dashboard exists | You need an editor-level role or above. Create a dashboard first if you have none. |
| Generated SQL references missing tables | The wrong database is selected, or the schema is stale | Select the correct database, or remove and reconnect its AI connection to re-ingest the schema. |

---

## Related

- [AI API Keys](ai-api-keys.md) to configure and test the AI providers that power Qurioz.
- [SQL Editor](sql-editor.md), whose Generate SQL button uses the same engine.
- [Dashboards](dashboards.md) for the chart types and for saving Qurioz charts.
