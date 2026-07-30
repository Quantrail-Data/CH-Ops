# Custom Dashboards

The built-in monitoring pages answer questions CHOps decided were worth asking.
Custom dashboards answer yours.

You write a SQL query, choose how to draw it, and place the result on a grid
alongside other charts. Nothing is limited to system tables: any query your
connection can run can become a chart, including queries against your own data.

This page covers the three parts, in the order you meet them:

- **Chart Builder**, where a query becomes a chart
- **My Dashboards**, where charts are arranged
- **All Charts**, where you find and manage them afterwards

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Chart Builder](#2-chart-builder)
3. [Chart types](#3-chart-types)
4. [Mapping columns](#4-mapping-columns)
5. [Saving a chart](#5-saving-a-chart)
6. [My Dashboards](#6-my-dashboards)
7. [Arranging the grid](#7-arranging-the-grid)
8. [All Charts](#8-all-charts)
9. [Making charts interactive](#9-making-charts-interactive)
10. [When something does not work](#10-when-something-does-not-work)

---

## 1. Before you start

You need a working ClickHouse® connection and a query in mind. If you are not
sure what to query, the SQL Editor is a better place to experiment, because you
can see raw results without thinking about chart types yet.

**A chart is a saved query plus a drawing instruction.** It stores your SQL, the
chart type, which columns map to which part of the chart, and a name. It does
not store data. Every time a chart is displayed it re-runs its query against
whichever connection you have selected.

Two consequences worth knowing up front. A chart is always current, never a
stale snapshot. And a chart that is slow to query is slow to display, every
time.

---

## 2. Chart Builder

Find it under **Custom Dashboards**, then **Chart Builder**.

The workspace is four panels stacked vertically, each collapsible so you can
give room to whichever you are working on:

1. **SQL**, where you write the query
2. **Results**, the rows it returned
3. **Configuration**, the chart type and column mapping
4. **Preview**, the chart as it will appear

The usual rhythm is to write a query, run it, glance at the results to see what
columns you have, then configure the chart and watch the preview.

### Writing the query

Anything your connection can run. The one thing to keep in mind is shape: a
chart needs columns that map onto its axes, so a query returning one row of
forty columns is awkward to draw, while forty rows of two columns is
straightforward.

Aggregate in SQL rather than expecting the chart to do it. `GROUP BY` and
`ORDER BY` in the query beat any amount of configuration afterwards.

### If you are not sure how to write it

**Qurioz**, the built-in AI assistant, turns a plain English question into
ClickHouse® SQL and drops it into the workspace. An administrator enables it by
adding a provider key on the [AI API Keys](ai-api-keys.md) page.

It is a starting point rather than an oracle. Read what it produces before
saving it, the same as you would a colleague's query.

---

## 3. Chart types

Fifteen types, several with subtypes that change the arrangement rather than the
kind of chart.

| Type | Subtypes | Good for |
|---|---|---|
| Bar | Simple, Grouped, Stacked, Horizontal | Comparing categories |
| Line | Simple, Multi, Area, Stacked Area | Anything over time |
| Pie | Pie, Donut, Rose | Parts of a whole, few categories |
| Scatter | Basic, Bubble | Relationship between two measures |
| Boxplot | | Distribution and outliers |
| Heatmap | | Density across two dimensions |
| Funnel | | Stages that narrow |
| Gauge | | One number against a range |
| Radar | | Several measures for one subject |
| Candlestick | | Open, high, low, close |
| Sankey | | Flow between nodes |
| Treemap | | Nested proportions |
| Sunburst | | Nested proportions, radial |
| KPI | | A single headline number |
| Table | | Rows, when a chart would obscure them |

### Choosing between similar ones

**Pie against bar.** Pie works up to about five categories. Beyond that the
slices become hard to compare and a horizontal bar chart reads better.

**Stacked against grouped bar.** Stacked answers "what is the total, and what
made it up". Grouped answers "how do these compare to each other". Picking the
wrong one makes the chart technically correct and hard to read.

**KPI against gauge.** KPI is a number on its own. Gauge is a number against a
range, so it needs a sensible minimum and maximum to mean anything.

**Table.** Not a defeat. When somebody needs to read exact values, a table is
the right answer and a chart is decoration.

### Subtypes need different columns

Changing subtype often changes what the chart needs. A Simple Bar needs a
category and a value; a Grouped Bar also needs a series column to group by.

CHOps updates the mapping fields when you change subtype, and checks that the
columns you have chosen suit the type. That catches the common mistake of
mapping a text column to a numeric axis before you see a broken chart.

---

## 4. Mapping columns

Once a type is chosen, you tell CHOps which query column plays which role. The
fields are named for the chart rather than generically: a bar chart asks for a
Category and a Value, a scatter chart asks for an X Measure and a Y Measure.

### Axis labels and legends

Axis labels fill in from the chart type and your column names, and you can
override them.

A legend appears on its own when a chart has more than one series, and stays
away when it would only take up room.

### Gauge minimum and maximum

Gauge charts add fields for the ends of the range. Without them the gauge has
nothing to be a proportion of.

Set them to something meaningful rather than to the current value. A disk usage
gauge with a maximum of the current usage always reads full.

### The chart toolbar

Every chart carries a small toolbar for zooming into a region, resetting the
view, and saving the chart as an image. Any chart can be expanded to fullscreen,
which is useful both while building and when presenting.

---

## 5. Saving a chart

Two options, and the difference matters.

**Save the chart on its own.** It goes into All Charts and belongs to no
dashboard. Useful when the chart is a tool you reach for occasionally rather
than something to display.

**Save it to a dashboard.** CHOps places it in the next free slot, filling left
to right and then onto the next row, so you do not think about position while
building. You can rearrange later.

### Editing a chart afterwards

Open it from All Charts and choose **Edit**. The Chart Builder reopens with
everything as you left it: the SQL, the type, the subtype, the column mapping,
the name and the dashboard.

Saving updates the chart everywhere it appears. A chart placed on three
dashboards is one chart, not three copies, so fixing it once fixes it
everywhere.

---

## 6. My Dashboards

A dashboard is a named grid of charts.

### Creating one

Give it a name and choose a column count from one to four. That decides how many
charts sit side by side.

**One column** suits charts that need width, such as long time series.
**Two** is the usual choice. **Three or four** suit small charts and KPI tiles,
and get cramped on a laptop screen.

The column count is a property of the dashboard and is shown beside its name in
the list.

### What a tile shows

Each chart sits in a tile with its title, a button to view it fullscreen, and a
button to remove it from the dashboard.

Removing a chart from a dashboard does not delete the chart. It remains in All
Charts and on any other dashboard using it.

### Which connection charts run against

Whichever you have selected in the navbar. A dashboard is not tied to a cluster,
so the same dashboard can be pointed at production and then at staging by
switching connection.

Worth remembering when a dashboard looks wrong: check which cluster you are
looking at before investigating the query.

---

## 7. Arranging the grid

Drag a chart to swap it with another. The layout updates on screen as you
experiment.

**Nothing is stored until you choose Save Layout.** That button appears once you
have moved something, and the arrangement is kept when you press it. Navigating
away without saving leaves the previous arrangement intact.

That is deliberate: you can try three arrangements and keep the one you like,
without needing an undo.

### Ordering that helps

Put the chart that answers "is anything wrong" at the top left, because that is
where eyes land first. Detail charts go below. Anything needed only during an
investigation goes at the bottom, or on a separate dashboard.

---

## 8. All Charts

A single table of every chart, with its name, type and the dashboard it belongs
to.

**Click a row** to preview the chart without leaving the list, which is the
quickest way to work out what a vaguely named chart actually shows.

**Edit** opens it in the Chart Builder with everything filled in.

The dashboard column is the useful one when tidying up: charts with no dashboard
are either deliberate standalone tools or leftovers from experiments.

### Naming, since the list is only as good as the names

`Queries` tells you nothing in a list of thirty. `Query count by hour, last 7d`
tells you whether to open it. The name is what you will be scanning later, so
spend the extra seconds.

---

## 9. Making charts interactive

A chart with hardcoded values shows one thing. A chart with parameters lets the
viewer choose.

Replace a literal with a typed placeholder:

```sql
WHERE event_date >= today() - {days:UInt16}
```

Put that chart on a dashboard and a control appears above it. Change the value,
press Apply, and every chart that uses `days` re-runs. Charts that do not
mention it are left alone.

This is what turns a dashboard from a fixed report into something people
actually use, because one dashboard serves last-day and last-quarter questions
instead of needing two.

The syntax, the optional blocks that let a filter disappear when empty, default
values, and how to arrange the controls are covered in
[Dashboard Filters](dashboard-filters.md).

---

## 10. When something does not work

### The preview is empty but the query returned rows

Almost always the column mapping. Check that the columns selected for each role
still exist in the results, which is the usual casualty of editing the SQL after
mapping.

### The chart looks wrong after changing subtype

Subtypes need different columns. Moving from Simple Bar to Grouped Bar adds a
series field that starts empty. Re-check the mapping after any subtype change.

### A gauge always reads full or empty

Its minimum and maximum are unset or wrong. They define the range the value sits
within, so they need to be the bounds you care about rather than the value
itself.

### A dashboard is slow

Each chart runs its own query on display, so a dashboard is as slow as the sum
of its charts.

Open the slow one in the Chart Builder and run it there to see the time. Usual
causes are no date filter, a wide scan, or an aggregation that could happen in
ClickHouse® rather than over many returned rows.

The [Query Profiler](query-profiler.md) explains where the time went.

### My layout changes did not persist

**Save Layout** was not pressed. Dragging alone changes the screen and not the
stored arrangement.

### A chart shows different numbers than a colleague sees

Different connection selected, or different filter values applied. Check the
cluster in the navbar first, then the filter bar.

### I removed a chart from a dashboard and it is still in All Charts

Correct. Removing from a dashboard unplaces the chart; it does not delete it.
Delete it from All Charts if you want it gone everywhere.

---

## Related pages

- [Dashboard Filters](dashboard-filters.md) for interactive dashboards
- [SQL Editor](sql-editor.md) for developing a query before it becomes a chart
- [Qurioz AI](qurioz.md) for generating SQL from a question
- [Query Profiler](query-profiler.md) when a chart's query is slow
- [System Dashboards](monitoring.md#dashboards) for the built-in ones
