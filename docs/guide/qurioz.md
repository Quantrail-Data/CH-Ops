# Qurioz

Qurioz is CHOps's built-in AI assistant. You ask a question about your data in plain language, the way you would ask a colleague. Qurioz writes the ClickHouse&reg; SQL, runs it, and shows you the result as a table or a chart. It lives under **SQL Tools > Qurioz AI** in the sidebar.

In one place it can:

- **Generate a query** from a natural-language question.
- **Show a data table** from that query.
- **Visualize the result** as a chart.
- **Save the chart** to a dashboard.

The rest of this page walks through each step, from the setup to the finer points.

---

## Before you start: an AI provider key

Qurioz talks to an external AI provider, so it needs one active provider key. You can use Google Gemini, OpenAI, Anthropic Claude, Mistral, or Ollama for a local model. An administrator adds the key on the [AI API Keys](ai-api-keys.md) page. If there is no key, Qurioz shows a red **NO API KEY** badge in the top bar, which you can click to open the AI API Keys page. If no key is active, generation fails with "No Api key configured yet".

An administrator can also switch which provider is active from inside Qurioz. See [Switching the AI provider](#switching-the-ai-provider) below.

---

## Connect and disconnect

Qurioz reads the table definitions with your own ClickHouse&reg; credentials. Before you ask a question, connect:

1. In the top bar, type your ClickHouse&reg; user in the **user** box.
2. Type the password in the **password** box. The eye icon shows or hides the password.
3. Click **Go**, or press Enter in either box.

CHOps checks the credentials on the node selected in the top bar. If they are correct, the message "DB connected successfully" appears and the top bar shows a green plug icon with your user and node.

To disconnect, click the logout icon next to your user. Its tooltip is "Disconnect and clear credentials". CHOps then deletes the stored credentials.

The SQL Editor and Qurioz use the same stored credentials. When you connect or disconnect in one, the other changes too. The stored credentials last two hours, and CHOps also deletes them when you log out of CHOps.

---

## Step 1: Choose a database

Qurioz answers questions about the tables you choose, and sends the definitions of those tables to the AI provider with your question.

1. Connect, as described above.
2. Click the pencil icon next to the plug icon. The **Database Schema & Estimate Generator** window opens.
3. Under **Databases**, click one or more databases, or click **Select All**.
4. Click **Get Tables**. The tables of those databases appear under **Database & Tables**.
5. Click the tables to use. The window highlights each selected table.
6. Click **Generate DDL & Estimate**. CHOps reads the table definitions and shows the estimate next to **Estimate**.
7. Close the window.

To remove a database and its tables from the selection, click the trash icon next to its name. If you send a question with no tables selected, Qurioz shows "Select Database and generate the ID!".

---

## Step 2: Ask a question

Type your question into the input at the bottom, for example "show me the ten slowest queries from yesterday" or "daily insert volume per table for the last week." Press **Enter** to send, or **Shift+Enter** to add a new line.

**Voice input.** Next to the input is a microphone button. Click it and speak, and Qurioz transcribes your words into the box, where you can edit them before you send. Voice input uses your browser's speech recognition. If your browser or device does not support it, the button is disabled.

---

## Step 3: Read and run the generated SQL

Qurioz sends your question, together with the definitions of the selected tables, to the active AI provider and gets back a ClickHouse&reg; SQL statement. The query appears in its own editor block with three actions:

- **Edit** lets you change the SQL by hand.
- **Copy** copies the query to your clipboard.
- **Run** runs the query.

Run uses the CHOps connection for the node selected in the top bar, not the ClickHouse&reg; user that you connected with. For users who are not administrators, the server accepts only read-only queries (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`, `EXISTS`). The results appear as a table below the query. If the query fails, Qurioz shows the error and a **Retry** button.

### Working with the table

Once results are back, you can:

- **Copy the table** to your clipboard with the copy icon.
- **Open the chart** with **Chart View**.

---

## Step 4: Visualize as a chart

Click **Chart View** to turn a result into a chart. Choose a **Chart Type** and a **Subtype**, give a **Chart Name**, and map your columns to the axes. The available types are the same ones the [Chart Builder](dashboards.md) offers: bar, line, pie, scatter, and box plot, each with several subtypes (for example simple, grouped, stacked, and horizontal bars, or pie, donut, and rose).

To keep a chart, select a dashboard in the **Dashboard** list and click **Save**. CHOps saves the chart to that dashboard. This needs an editor role or above, and at least one dashboard. If you have no dashboards yet, create one first in **Custom Dashboards > My Dashboards**.

Qurioz cannot change a chart after you save it. To change a saved chart, open **Custom Dashboards > All Charts** and click the edit icon on the chart to open it in the Chart Builder.

---

## Refining an answer

Two kinds of refinement are built in:

- **Edit your question.** Move the pointer over a question, click the pencil icon, and change the text. When you send it again, Qurioz generates new SQL from the new text.
- **Edit the SQL.** Click **Edit** on the SQL block, change the query, and run it again.

A specific question, with the table, the time range, and the exact metric, usually gives a better query than a vague one.

---

## Switching the AI provider

If an administrator has configured one or more provider keys, Qurioz shows a provider selector in the top bar. Only an administrator can change the active provider. The change applies to the whole application, so it affects Qurioz, the SQL Editor's **Generate SQL** button, and Schema Studio. You manage the keys themselves (add, test, edit) on the [AI API Keys](ai-api-keys.md) page.

---

## Chat history and limits

CHOps saves your conversations on the server, and each one belongs to your CHOps user, so other users do not see them.

To see your conversations, click the history icon at the top left. In the list:

- Click a conversation to open it.
- Click **New Chat** to start a new conversation.
- Click the three dots next to a conversation, then **Edit** to rename it or **Delete** to delete it.

Qurioz names a new conversation after your first question, up to 80 characters.

---

## Managing a database's AI connection

CHOps keeps your selection of databases and tables in your browser. To change it, open the **Database Schema & Estimate Generator** window again. To remove a database, click the trash icon next to its name. To read the current table definitions again, for example after a schema change, click **Generate DDL & Estimate**.

---

## How it works, briefly

When you ask a question, Qurioz does not send your whole database to the provider. It reads the definitions (DDL) of the tables you selected and sends them with your question. The provider uses that context to produce ClickHouse&reg;-specific SQL. This is why the right tables matter, and why you read the definitions again after a schema change.

---

## Good practices

- **Always review the SQL before you run it.** Qurioz proposes queries, but you are responsible for what runs against your cluster.
- **Be specific.** Name the table, the time window, and the exact measure you want. Specific questions produce more accurate queries.
- **Select the matching tables.** Qurioz knows only the tables you selected. If a query refers to tables that do not exist, check your selection.
- **Read the definitions again after big schema changes**, so Qurioz uses the current tables and columns.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| The top bar shows **NO API KEY**, or "No Api key configured yet" | No active provider key | Ask an administrator to add and activate a key on the [AI API Keys](ai-api-keys.md) page. |
| "Authentication service is not connected. Please try again." | You are not connected | Enter your ClickHouse&reg; user and password and click **Go**. |
| "Select Database and generate the ID!" | No tables selected | Select tables in the **Database Schema & Estimate Generator** window. |
| Generation fails or errors out | The provider rejected the request, or the model name is wrong | Check the active key and model on the AI API Keys page and test it there. |
| "Error occurs while executing the query" | The SQL is wrong, or it writes data and you are not an administrator | Edit the SQL and click **Retry**, or ask a better question. |
| The microphone button is disabled | Your browser does not support speech recognition, or the microphone is not available | Type your question instead, or use a browser that supports voice input. |
| You cannot save a chart to a dashboard | You do not have the editor role, or no dashboard exists | You need an editor role or above. Create a dashboard first if you have none. |
| Generated SQL refers to missing tables | The wrong tables are selected, or the definitions are old | Select the correct tables, then click **Generate DDL & Estimate**. |

---

## Related

- [AI API Keys](ai-api-keys.md) to configure and test the AI providers that power Qurioz.
- [SQL Editor](sql-editor.md), whose Generate SQL button uses the same engine.
- [Dashboards](dashboards.md) for the chart types and for editing saved charts.
