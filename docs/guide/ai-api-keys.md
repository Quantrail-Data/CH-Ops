# AI API Keys

The AI API Keys page is where administrators configure credentials for the external AI providers that power **Qurioz**, the CHOps assistant that turns plain-English questions into ClickHouse® SQL. Without a valid key on this page, Qurioz cannot reach a provider and the AI features stay dormant. Once a key is saved, anyone with access to Qurioz can describe what they want in natural language and get back a ready-to-run query.

Only super admins and admins can view or edit this page. An AI provider key is a billable credential tied to your provider account, so managing it is an administrative action.

---

## What Is Qurioz?

Qurioz is CHOps's natural-language-to-SQL assistant. You type a question about your data the way you would ask a colleague, for example "show me the ten slowest queries from yesterday" or "daily insert volume per table for the last week", and Qurioz generates the corresponding ClickHouse® SQL. From there the flow mirrors the Chart Builder you already use: the generated SQL drops into the editor, you run it, pick a chart type, and save the result to a dashboard.

The goal is to shorten the path from a question to a chart. Instead of remembering the exact `system` table, the right aggregation, and ClickHouse®-specific functions, you describe the outcome and refine the SQL Qurioz proposes.

Qurioz is part of the free community edition. The only thing it needs to work is an AI provider key, configured here.

---

## Supported Providers

CHOps currently supports **Google Gemini** as the AI provider behind Qurioz. Support for additional providers is planned, and when more are added they will appear on this page as selectable options. For now, configure a Gemini key to enable Qurioz.

| Provider | Status |
|----------|--------|
| Google Gemini | Supported |
| Others | Planned |

---

## Getting a Gemini API Key

You need an API key from Google AI Studio:

1. Go to [Google AI Studio](https://aistudio.google.com/) and sign in with your Google account.
2. Open the API keys section and create a new key.
3. Copy the key. It is shown once, so store it somewhere safe before leaving the page.

The key is associated with your Google Cloud billing account. Review Google's current pricing and free-tier limits before putting Qurioz into heavy use, since query generation consumes provider tokens.

---

## Adding a Key in CHOps

1. Go to **Administration > AI API Keys**.
2. Select the provider (Gemini).
3. Paste your API key into the key field.
4. Optionally choose the model variant if your build exposes one (for example, a faster, cheaper model for routine queries versus a more capable model for complex ones).
5. Click **Test** to verify CHOps can reach the provider with the key.
6. Click **Save**.

Once saved, Qurioz becomes available to users. No restart is needed.

---

## How the Key Is Stored

CHOps encrypts the AI provider key before writing it to its SQLite database, using the same AES-256-GCM encryption it applies to ClickHouse® connection passwords. The key is derived from your `SESSION_SECRET`, so the database file alone is not enough to read the stored key. If you rotate `SESSION_SECRET`, you will need to re-enter the AI key, just as you would re-enter ClickHouse® credentials.

The key is never sent to the browser after it is saved. The UI shows a masked placeholder, and Qurioz calls the provider from the CHOps backend, not from the user's browser.

---

## The Qurioz Workflow

Once a key is configured, the end-to-end flow looks like this:

1. Open Qurioz and type a question in plain language.
2. Qurioz sends your question, along with the relevant schema context, to the configured provider and receives a ClickHouse® SQL statement.
3. The generated SQL appears in an editor, the same way it would in the Chart Builder. You can read it, edit it, and run it.
4. Run the query to see the results.
5. Choose a chart type and mapping, then save the chart to a dashboard.

Because the generated SQL is always shown before it runs, you stay in control. Qurioz proposes; you decide whether to run, tweak, or discard.

---

## Good Practices

- **Treat the key as a secret.** It is billable. Anyone who extracts it could run up charges on your provider account.
- **Use a dedicated provider project.** Create the Gemini key under a project you use only for CHOps, so its usage and billing are easy to track and cap.
- **Set spending limits at the provider.** Configure quotas or budget alerts in Google Cloud so an unexpected spike in Qurioz usage cannot produce a surprise bill.
- **Always review generated SQL before running it.** Qurioz generates queries, but you are responsible for what executes against your cluster. Read the SQL, especially for anything beyond a SELECT.
- **Rotate the key periodically**, and immediately if you suspect it has leaked. Generate a new key in Google AI Studio, update it here, and revoke the old one at the provider.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Qurioz says AI is not configured | No key saved, or the key was cleared | Add a valid Gemini key on this page and click Save. |
| Test fails with an authentication error | The key is wrong, revoked, or for a different provider | Generate a fresh key in Google AI Studio and re-enter it. |
| Test fails with a quota or billing error | The provider account has hit a limit or lacks billing | Check quotas and billing in Google Cloud for the key's project. |
| Generated SQL looks wrong or references missing tables | The model lacked enough schema context, or misread the request | Rephrase the question more specifically, or edit the SQL by hand before running. |
| Key worked before but stopped | `SESSION_SECRET` was changed, making the stored key unreadable | Re-enter the AI key on this page. |
