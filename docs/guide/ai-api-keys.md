# AI API Keys

The AI API Keys page is where administrators configure the credentials for the AI providers that power **Qurioz**, the CHOps assistant that turns plain-English questions into ClickHouse&reg; SQL. Without a valid, active credential on this page, Qurioz cannot reach a provider and the AI features stay dormant. Once a credential is saved and made active, anyone with access to Qurioz, and to the SQL Editor's Generate SQL button, can describe what they want in natural language and get back a ready-to-run query.

You reach the page from **Administration > AI API Keys**. It also appears as **Qurioz AI** under Tools in some builds. Only admins and super admins can open it and make changes. A cloud AI provider key is a billable credential tied to your provider account, so to manage it is an administrative action.

---

## What is Qurioz?

Qurioz is CHOps's natural-language-to-SQL assistant. You type a question about your data the way you would ask a colleague, for example "show me the ten slowest queries from yesterday" or "daily insert volume per table for the last week", and Qurioz generates the ClickHouse&reg; SQL. From there the flow mirrors the Chart Builder you already use: the generated SQL drops into an editor, you run it, pick a chart type, and save the result to a dashboard. The same engine also backs the **Generate SQL** button in the [SQL Editor](sql-editor.md).

The goal is to shorten the path from a question to a chart. Instead of a memory of the exact `system` table, the right aggregation, and ClickHouse&reg;-specific functions, you describe the outcome and refine the SQL Qurioz proposes.

Qurioz is part of the free community edition. The only thing it needs is one active AI credential, configured here.

---

## Supported providers

CHOps works with five AI providers. You choose the provider when you add a credential, provide the credential from that provider, and name the model you want to use.

| Provider | What to select | Where to get a key | Typical credential |
|----------|----------------|--------------------|--------------------|
| Google Gemini | GEMINI | [Google AI Studio](https://aistudio.google.com/) | `AIza...` |
| OpenAI | OPEN AI | [OpenAI Platform](https://platform.openai.com/api-keys) | `sk-...` |
| Anthropic Claude | CLAUDE | [Anthropic Console](https://console.anthropic.com/) | `sk-ant-...` |
| Mistral | MISTRAL | [Mistral Console](https://console.mistral.ai/) | provider-specific |
| Ollama | OLLAMA | Runs on your own hardware | A base URL, such as `http://localhost:11434` |

**Ollama is different.** It runs models on your own hardware, so there is no cloud account and no billing. Instead of an API key, you give the base URL of your Ollama server. CHOps can then list the models installed on that server, so you pick one rather than type it.

Each cloud key is used with a **model name** that you supply as free text, because providers release and retire models often and CHOps does not hard-code a fixed list. Enter a current model string from your provider. The page shows example placeholders per provider to guide you:

| Provider | Example model names (illustrative only) |
|----------|------------------------------------------|
| Gemini | `gemini-2.5-flash`, `gemini-3.5-flash` |
| OpenAI | a current GPT model, for example a `mini` or `nano` variant |
| Claude | `claude-haiku-4-5`, `claude-sonnet-4-6` |
| Mistral | `mistral-large-latest`, `mistral-medium-latest` |
| Ollama | the models you have pulled locally, for example `llama3.1` or `qwen2.5`; CHOps lists them from your server |

Always confirm the exact model string against your provider's documentation. A model name that the provider does not recognize is the most common reason a credential that is otherwise valid fails to generate SQL.

---

## How keys are organized

A few rules shape how the page behaves. They are worth knowing before you start.

- **Each entry has three parts:** a provider, a model name, and the secret value (an API key, or a base URL for Ollama). CHOps derives a friendly name from the provider you pick, and that name must be unique, so you cannot save two entries under the same provider. If you need two keys for one provider, that is not supported here. Keep one entry per provider.
- **You can store up to 5 keys.** This lets you keep one entry per provider ready to switch between.
- **Only one credential is active at a time.** The active one is the single credential Qurioz and the SQL Editor use for every request. The others sit ready but idle until you activate them.
- **The first credential you add becomes active automatically.** After that, to activate a different one is a deliberate click.
- **To delete the active credential promotes another.** If you delete whichever one is active, CHOps makes one of the remaining ones active, so Qurioz keeps working.

So to switch providers is just a matter of activation of a different saved credential. There is no restart and no config file to edit.

---

## Adding a key

1. Go to **Administration > AI API Keys**.
2. Click to add a new credential. The add form appears when you have fewer than the maximum number of entries.
3. **Select the provider** from the dropdown: GEMINI, OPEN AI, CLAUDE, MISTRAL, or OLLAMA.
4. **Enter the model name** for that provider (see the examples above). For Ollama, you can pick from the models CHOps reads from your server. This field is required.
5. **Provide the credential.** For a cloud provider, paste the API key. For Ollama, enter the base URL of your Ollama server.
6. **Click Test** to check that the credential works (see the next section). This is strongly recommended before you save.
7. **Save.** If this is your first credential, it becomes active at once. Otherwise CHOps saves it as an inactive option you can activate later.

The provider, model, and value are all required. To save an entry with a blank model or an empty value is rejected.

---

## Testing an API key

CHOps can check a credential against its provider before you commit to it, so you find out at once whether it works, rather than at the first question someone asks Qurioz.

**What the Test button does.** When you click Test, CHOps takes the provider, model, and value in the form and makes a real, minimal request to that provider. It sends a tiny prompt and waits for any reply. If the provider responds, the test reports the credential as active. If the provider rejects the request, or the model is unrecognized, the test reports a failure. To test does not save the credential and does not change which one is active. It only checks reachability.

**Test before you save.** Because the check runs against the live provider with exactly the provider, model, and value you entered, a passing test confirms three things at once: the credential is valid, the model name is spelled correctly and available to your account, and your provider account is in good standing (not rate-limited or blocked). A save with no successful test can appear to succeed and still leave Qurioz unable to generate SQL, so make the test a habit.

**What a failed test usually means.** A failure almost always comes down to one of these: a wrong or revoked key, a model name the provider does not recognize for your account, a provider account with no active billing, or a temporary rate limit. For Ollama, a failure usually means the base URL is wrong or the server is unreachable. The [troubleshooting](#troubleshooting) table maps the symptoms to fixes.

---

## Switching the active provider

With more than one credential saved, the page lists each one and marks which is active. To change which provider Qurioz uses, activate a different one. That credential at once becomes the one behind every Qurioz request and every SQL Editor Generate SQL action. Nothing else needs to change, and users do not reconnect or reload.

This makes it easy, for example, to keep a fast and inexpensive model active for everyday use and switch to a more capable model only for harder questions, or to fail over to a second provider if your primary one has an outage.

---

## Editing and deleting keys

- **Edit** a saved credential to change its model name or replace its value, for example after you rotate the key at the provider. Re-test after an edit so you know the new value works.
- **Delete** a credential you no longer use. If it was the active one, CHOps promotes another automatically. If it was your only one, Qurioz goes dormant until you add a new one.

---

## How the key is stored

CHOps encrypts every AI provider credential with AES-256-GCM before it writes it to its SQLite database, the same encryption it applies to ClickHouse&reg; connection passwords. The encryption key is derived from your `SESSION_SECRET`, so the database file on its own is not enough to read a stored credential. If you rotate `SESSION_SECRET`, the credentials stored before can no longer be decrypted and you must re-enter them, exactly as you would re-enter ClickHouse&reg; credentials.

For day-to-day use, the secret value never leaves the server. Qurioz calls the provider from the CHOps backend, and ordinary status checks (such as which provider is active) return only the provider name and model, never the value. The decrypted value is available only to admin-level users, through the explicit "reveal" endpoints the page uses to pre-fill an edit form. Treat the ability to open this page as equivalent to holding the credentials.

---

## The Qurioz workflow

Once an active credential is configured, the end-to-end flow looks like this:

1. Open Qurioz, or use Generate SQL in the SQL Editor, and type a question in plain language.
2. Qurioz sends your question, with the relevant schema context, to the active provider and receives a ClickHouse&reg; SQL statement.
3. The generated SQL appears in an editor. You can read it, edit it, and run it.
4. Run the query to see the results.
5. Choose a chart type and mapping, then save the chart to a dashboard.

Because CHOps always shows the generated SQL before it runs, you stay in control. Qurioz proposes. You decide whether to run, adjust, or discard.

---

## Good practices

- **Treat every cloud key as a secret.** Gemini, OpenAI, Claude, and Mistral bill for usage. Anyone who extracts an active key could run up charges on your account. Ollama runs locally and does not bill, but still protect its endpoint.
- **Use a dedicated provider project.** Create the key under a project or workspace you use only for CHOps, so its usage and billing are easy to track and cap.
- **Set spending limits at the provider.** Configure quotas or budget alerts with your cloud provider, so an unexpected spike in Qurioz usage cannot produce a surprise bill.
- **Test after every change.** Re-run the Test after you add, edit, or rotate a credential, and after you switch the active one.
- **Always review generated SQL before you run it.** Qurioz proposes queries, but you are responsible for what runs against your cluster. Read the SQL, especially for anything beyond a `SELECT`.
- **Rotate keys sometimes**, and at once if you suspect a leak. Generate a new key at the provider, update it here, test it, and revoke the old one at the provider.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Qurioz says AI is not configured | No credential saved, or none is active | Add a credential on this page, activate it, and confirm the test passes. |
| Test fails with an authentication error | The key is wrong, revoked, or does not match the selected provider | Generate a fresh key at the provider's console, make sure the provider dropdown matches, and re-enter it. |
| Test passes but generation fails on a real question | The model name is not recognized by your account | Correct the model string to a current model your provider account can use, then re-test. |
| Test or generation fails with a rate-limit or quota error | The provider account hit a usage limit | Wait and retry, or raise quotas and check billing at the provider. |
| Ollama test fails to connect | The base URL is wrong, or the Ollama server is not running or not reachable | Check the base URL and that the Ollama server is up and reachable from the CHOps server. |
| Provider reports "service unavailable" | A temporary provider outage or high demand | Retry later, or switch the active credential to a different provider. |
| "Unsupported AI provider" | The saved provider is not one of the five supported options | Recreate the credential using GEMINI, OPEN AI, CLAUDE, MISTRAL, or OLLAMA. |
| A key worked before but stopped after maintenance | `SESSION_SECRET` was changed, so stored credentials can no longer be decrypted | Re-enter each AI credential on this page and re-test. |
| Generated SQL references missing tables or looks wrong | The model lacked enough schema context or misread the request | Rephrase the question more specifically, or edit the SQL by hand before you run it. |
