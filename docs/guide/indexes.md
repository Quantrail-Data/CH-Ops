# Indexes and Projections

Indexes and projections are two of the main tools ClickHouse® gives you for making queries faster. This section lets you see what your tables already have and create, update, or remove these structures through a form, without writing the SQL by hand. CHOps shows you the exact command it will run before anything happens, so you always know what you are about to do.

## Data Skipping Indexes

A data skipping index helps ClickHouse® avoid reading data it does not need. When a query filters on a column, the index lets ClickHouse® skip over chunks of data that cannot possibly match, so it reads less from disk and returns results faster.

This page gives you a read-only view of every data skipping index across all your databases, drawn as a tree you can expand: each database opens to show its tables, and each table opens to show its indexes along with the type and the expression each one covers. It is purely for inspection, so you can quickly see what is already in place before deciding whether you need to add anything.

## Projections

A projection is an alternate copy of a table's data, stored in a different order or pre-aggregated, that ClickHouse® can use automatically when it speeds up a query. Think of it as giving the same data a second arrangement that suits a different kind of question.

The Projections area is organized into tabs, one for each thing you might want to do.

The **View** tab shows all your existing projections as an expandable tree, organized from database to table to projection name, so you can see what is defined where.

The **Add Projection** tab gives you a form to create a new one. You choose the database and table, give the projection a name, and define what it should contain, including its select expression and optional GROUP BY and ORDER BY clauses. There are also options to run the change across a cluster and to skip the operation if the projection already exists. One thing worth knowing: ClickHouse® projections do not support `SELECT DISTINCT`, so if you include DISTINCT in your expression, CHOps quietly removes it from the generated command and the form reminds you of this as you type.

The remaining tabs handle the rest of a projection's life cycle. **Drop Projection** removes one. **Materialize Projection** builds the projection's data for existing rows (newly inserted data is handled automatically, but data already in the table needs this step). **Clear Projection** empties a projection's data without removing its definition. Each of these lets you target a specific database, table, and projection, optionally limit the work to a single partition, and apply the change across a cluster.

## Index Management

This area is where you create and maintain data skipping indexes, again through simple forms with the generated SQL shown before you commit. It has three tabs.

The **Create** tab builds a new data skipping index. You pick the database, table, and column, choose the index type that fits how you query the column, and set its granularity. ClickHouse® offers several index types for different situations, such as minmax for range filters, set for columns with a limited number of distinct values, and bloom filter variants for matching text. The form lists all the available types so you can choose the right one.

Some types reveal extra options once you pick them. Choosing a bloom filter adds a False Positive Rate field, which trades index size against how often the index has to fall back to reading the data. Choosing a text index opens a Text Index Parameters section where you set the tokenizer (how the text is split into searchable terms), a Separator when you split on a custom string, and the dictionary and posting block sizes and codec that control how the index is stored. If a type needs no extra tuning, no extra fields appear, so you only ever see the options that matter for your choice.

The **Materialize** tab builds an index for data that already exists in a table, which you need after adding an index to a table that already holds data. You can limit it to a single partition if you only want to process part of the table.

The **Drop** tab removes an index you no longer need. You choose the database, table, and index, and CHOps takes care of the rest.
