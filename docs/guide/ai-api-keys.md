# AI API Keys

The AI API Keys page is where administrators configure the credentials for the external AI providers that power **Qurioz**, the CHOps assistant that turns plain-English questions into ClickHouse® SQL. Without a valid, active key on this page, Qurioz cannot reach a provider and the AI features stay dormant. Once a key is saved and made active, anyone with access to Qurioz (and to the SQL Editor's Generate SQL button) can describe what they want in natural language and get back a ready-to-run query.

You reach the page from **Administration > AI API Keys** (it also appears as **Qurioz AI** under Tools in some builds). Only admins and super admins can open it and make changes. An AI provider key is a billable credential tied to your provider account, so managing it is an administrative action.

---

## What is Qurioz?

Qurioz is CHOps's natural-language-to-SQL assistant. You type a question about your data the way you would ask a colleague, for example "show me the ten slowest queries from yesterday" or "daily insert volume per table for the last week", and Qurioz generates the corresponding ClickHouse® SQL. From there the flow mirrors the Chart Builder you already use: the generated SQL drops into an editor, you run it, pick a chart type, and save the result to a dashboard. The same engine also backs the **Generate SQL** button in the [SQL Editor](sql-editor.md).

The goal is to shorten the path from a question to a chart. Instead of remembering the exact `system` table, the right aggregation, and ClickHouse®-specific functions, you describe the outcome and refine the SQL Qurioz proposes.

Qurioz is part of the free community edition. The only thing it needs to work is one active AI provider key, configured here.

---

## Supported providers

CHOps now works with four AI providers. You choose the provider when you add a key, paste the credential from that provider, and name the model you want to use. All four are first-class: pick whichever your organization already has an account with, or whichever offers the price and capability you prefer.

| Provider | What to select | Where to get a key | Typical key format |
|----------|----------------|--------------------|--------------------|
| Google Gemini | GEMINI | [Google AI Studio](https://aistudio.google.com/) | `AIza...` |
| OpenAI | OPEN AI | [OpenAI Platform](https://platform.openai.com/api-keys) | `sk-...` |
| Anthropic Claude | CLAUDE | [Anthropic Console](https://console.anthropic.com/) | `sk-ant-...` |
| Mistral | MISTRAL | [Mistral Console](https://console.mistral.ai/) | provider-specific |

Each key is used with a **model name** that you supply as free text, because providers release and retire models frequently and CHOps does not hard-code a fixed list. Enter a current model string from your provider. The page shows example placeholders per provider to guide you:

| Provider | Example model names (illustrative only) |
|----------|------------------------------------------|
| Gemini | `gemini-2.5-flash`, `gemini-3.5-flash` |
| OpenAI | a current GPT model, for example a `mini` or `nano` variant |
| Claude | `claude-haiku-4-5`, `claude-sonnet-4-6` |
| Mistral | `mistral-large-latest`, `mistral-medium-latest` |

Always confirm the exact model string against your provider's documentation. A model name that the provider does not recognize is the most common reason a key that is otherwise valid fails to generate SQL.

---

## How keys are organized

A few rules shape how the page behaves. They are worth knowing before you start.

- **Each key has three parts:** a provider, a model name, and the secret key value. A friendly name is derived from the provider you pick, and that name must be unique, so you cannot save two entries under the same provider name. (If you need two OpenAI keys, that is not supported here; keep one entry per provider.)
- **You can store up to 4 keys.** This lets you keep one entry per provider ready to switch between.
- **Only one key is active at a time.** The active key is the single credential Qurioz and the SQL Editor use for every request. The others sit ready but idle until you activate them.
- **The first key you add becomes active automatically.** After that, activating a different key is a deliberate click.
- **Deleting the active key promotes another.** If you delete whichever key is currently active, CHOps automatically makes one of the remaining keys active so Qurioz keeps working.

Switching providers is therefore just a matter of activating a different saved key. There is no restart and no config file to edit.

---

## Adding a key

1. Go to **Administration > AI API Keys**.
2. Click to add a new key (the add form appears when you have fewer than the maximum number of keys).
3. **Select the provider** from the dropdown: GEMINI, OPEN AI, CLAUDE, or MISTRAL.
4. **Enter the model name** for that provider (see the examples above). This field is required.
5. **Paste the API key value** from the provider.
6. **Click Test** to verify the credential actually works (see the next section). This is strongly recommended before saving.
7. **Save.** If this is your first key, it becomes active immediately; otherwise it is saved as an inactive option you can activate later.

The provider, model, and key value are all required. Saving a key with a blank model or an empty value is rejected.

---

## Testing an API key

CHOps can verify a key against its provider before you commit to it, so you find out immediately whether the credential and model actually work rather than discovering it the first time someone asks Qurioz a question.

**What the Test button does.** When you click Test, CHOps takes the provider, model, and key value currently in the form and makes a real, minimal request to that provider (it sends a tiny prompt and waits for any reply). If the provider responds, the test reports the key as active. If the provider rejects the request or the model is unrecognized, the test reports a failure. Testing does not save the key and does not change which key is active; it only checks reachability.

**Test before you save.** Because the check runs against the live provider using exactly the provider, model, and value you entered, a passing test confirms three things at once: the key is valid, the model name is spelled correctly and available to your account, and your provider account is in good standing (not rate-limited or blocked). A save without a successful test can appear to succeed and still leave Qurioz unable to generate SQL, so make the test a habit.

**What a failed test usually means.** A failure almost always comes down to one of: a wrong or revoked key, a model name the provider does not recognize for your account, a provider account without active billing, or a temporary rate limit. The [troubleshooting](#troubleshooting) table maps the symptoms to fixes.

---

## Switching the active provider

With more than one key saved, the page lists each one and marks which is active. To change which provider Qurioz uses, activate a different key. That key immediately becomes the one behind every Qurioz request and every SQL Editor Generate SQL action. Nothing else needs to change, and users do not need to reconnect or reload.

This makes it easy to, for example, keep a fast and inexpensive model active for everyday use and switch to a more capable model only when you are working through harder questions, or to fail over to a second provider if your primary one is having an outage.

---

## Editing and deleting keys

- **Edit** a saved key to change its model name or replace its key value (for example, after rotating the credential at the provider). Re-test after editing so you know the new value works.
- **Delete** a key you no longer use. If it was the active key, another saved key is promoted to active automatically. If it was your only key, Qurioz goes dormant until you add a new one.

---

## How the key is stored

CHOps encrypts every AI provider key with AES-256-GCM before writing it to its SQLite database, the same encryption it applies to ClickHouse® connection passwords. The encryption key is derived from your `SESSION_SECRET`, so the database file on its own is not enough to read a stored key. If you rotate `SESSION_SECRET`, the previously stored AI keys can no longer be decrypted and you will need to re-enter them, exactly as you would re-enter ClickHouse® credentials.

For day-to-day use, the secret value never leaves the server: Qurioz calls the provider from the CHOps backend, and ordinary status checks (such as showing which provider is active) return only the provider name and model, never the key. The decrypted value is available only to admin-level users through the explicit "reveal" endpoints the page uses to pre-fill an edit form. Treat the ability to open this page as equivalent to holding the keys.

---

## The Qurioz workflow

Once an active key is configured, the end-to-end flow looks like this:

1. Open Qurioz (or use Generate SQL in the SQL Editor) and type a question in plain language.
2. Qurioz sends your question, along with the relevant schema context, to the active provider and receives a ClickHouse® SQL statement.
3. The generated SQL appears in an editor. You can read it, edit it, and run it.
4. Run the query to see the results.
5. Choose a chart type and mapping, then save the chart to a dashboard.

Because the generated SQL is always shown before it runs, you stay in control. Qurioz proposes; you decide whether to run, tweak, or discard.

---

## Good practices

- **Treat every key as a secret.** All four providers bill for usage. Anyone who extracts an active key could run up charges on your account.
- **Use a dedicated provider project.** Create the key under a project or workspace you use only for CHOps, so its usage and billing are easy to track and cap.
- **Set spending limits at the provider.** Configure quotas or budget alerts with your provider so an unexpected spike in Qurioz usage cannot produce a surprise bill.
- **Test after every change.** Re-run the Test after adding, editing, or rotating a key, and after switching the active provider.
- **Always review generated SQL before running it.** Qurioz proposes queries, but you are responsible for what executes against your cluster. Read the SQL, especially for anything beyond a `SELECT`.
- **Rotate keys periodically**, and immediately if you suspect a leak. Generate a new key at the provider, update it here, test it, and revoke the old one at the provider.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Qurioz says AI is not configured | No key saved, or no key is active | Add a key on this page, activate it, and confirm the test passes. |
| Test fails with an authentication error | The key is wrong, revoked, or does not match the selected provider | Generate a fresh key at the provider's console, make sure the provider dropdown matches, and re-enter it. |
| Test passes but generation fails on a real question | The model name is not recognized by your account | Correct the model string to a current model your provider account can use, then re-test. |
| Test or generation fails with a rate-limit or quota error | The provider account hit a usage limit | Wait and retry, or raise quotas and check billing at the provider. |
| Provider reports "service unavailable" | Temporary provider outage or high demand | Retry later, or switch the active key to a different provider. |
| "Unsupported AI provider" | The saved provider is not one of the four supported options | Recreate the key using GEMINI, OPEN AI, CLAUDE, or MISTRAL. |
| A key worked before but stopped after maintenance | `SESSION_SECRET` was changed, so stored keys can no longer be decrypted | Re-enter each AI key on this page and re-test. |
| Generated SQL references missing tables or looks wrong | The model lacked enough schema context or misread the request | Rephrase the question more specifically, or edit the SQL by hand before running. |
