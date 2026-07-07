# Schema Studio

Schema Studio is a guided wizard that helps you design a ClickHouse® table from your own data and create it, without hand-writing the `CREATE TABLE` from scratch. It runs under your own ClickHouse® credentials: on entry it checks your session and, if needed, shows a compact connect panel prefilled from the app's current connection. Your password is sent once on connect and then held only by the server (encrypted); the browser keeps just the app token.

The wizard moves through four steps.

## Step 1: Source

Choose the data you want to model. You can upload a file (the primary path) or point to an object-storage reference. ClickHouse® reads the data so the next step can infer the structure.

## Step 2: Schema

Review the columns ClickHouse® inferred from your data. Each inferred column can be edited, and you can add your own derived columns on top. This is where you refine names and types before any engine details are decided.

## Step 3: Engine

Pick the MergeTree variant for the table, then fill in the table clauses (such as the sorting key and partitioning) that the wizard uses to compose the final DDL.

## Step 4: Generate

The `CREATE TABLE` statement is composed deterministically from everything you chose, so what you see is exactly what will run. On this step you can:

- **Edit** the generated DDL directly if you want manual tweaks.
- **Review with AI** (optional): ask the assistant to assess the DDL and return an assessment, suggestions, and warnings. This requires an AI provider key (see AI API Keys); without a key, review is unavailable but everything else still works. The AI only reviews the DDL, it does not rewrite it.
- **Validate** the DDL, then **Create** the table.

