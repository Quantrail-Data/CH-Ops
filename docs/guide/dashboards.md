# Custom Dashboards

The built-in monitoring pages answer the questions CHOps decided were worth asking. Custom dashboards answer yours.

You write a SQL query, choose how to draw it, and place the result on a grid with other charts. Nothing is limited to system tables. Any query your connection can run can become a chart, including a query against your own data.

This page covers the three parts, in the order you meet them:

- **Chart Builder**, where a query becomes a chart.
- **My Dashboards**, where you arrange charts.
- **All Charts**, where you find and manage them later.

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

You need a working ClickHouse&reg; connection and a query in mind. If you are not sure what to query, the SQL Editor is a better place to experiment. You can see the raw results there without a chart type yet.

**A chart is a saved query plus a drawing instruction.** It stores your SQL, the chart type, which columns map to which part of the chart, and a name. It does not store data. Every time CHOps shows a chart, it runs the query again against the connection you have selected.

Two things follow from this. A chart is always current, never a stale snapshot. And a chart with a slow query is slow to display, every time.

---

## 2. Chart Builder

Find it under **Custom Dashboards**, then **Chart Builder**.

The workspace is four panels, stacked vertically. Each one collapses, so you can give room to the panel you work on.

1. **SQL**, where you write the query.
2. **Results**, the rows it returned.
3. **Configuration**, the chart type and the column mapping.
4. **Preview**, the chart as it will appear.

The usual rhythm is to write a query, run it, look at the results to see your columns, then configure the chart and watch the preview.

### Writing the query

You can run anything your connection allows. Keep the shape in mind. A chart needs columns that map onto its axes. A query that returns one row of forty columns is hard to draw. Forty rows of two columns is easy.

Aggregate in SQL, rather than expect the chart to do it. `GROUP BY` and `ORDER BY` in the query beat any amount of configuration afterward.

### If you are not sure how to write it

**Qurioz**, the built-in AI assistant, turns a plain-English question into ClickHouse&reg; SQL and puts it into the workspace. An administrator enables it by adding a provider key on the [AI API Keys](ai-api-keys.md) page.

It is a starting point, not a final answer. Read what it produces before you save it, the same as you would read a colleague's query.

---

## 3. Chart types

There are fifteen types. Several have subtypes that change the arrangement, not the kind of chart.

| Type | Subtypes | Good for |
|---|---|---|
| Bar | Simple, Grouped, Stacked, Horizontal | Comparing categories |
| Line | Simple, Multi, Area, Stacked Area | Anything over time |
| Pie | Pie, Donut, Rose | Parts of a whole, few categories |
| Scatter | Basic, Bubble | The relationship between two measures |
| Boxplot | Simple, Multi | Distribution and outliers |
| Heatmap | | Density across two dimensions |
| Funnel | | Stages that narrow |
| Gauge | | One number against a range |
| Radar | | Several measures for one subject |
| Candlestick | | Open, high, low, close |
| Sankey | | Flow between nodes |
| Treemap | | Nested proportions |
| Sunburst | Simple, Visual Map | Nested proportions, radial |
| KPI | | A single headline number |
| Table | | Rows, when a chart would hide them |

### Choosing between similar ones

**Pie against bar.** Pie works up to about five categories. Beyond that, the slices are hard to compare, and a horizontal bar chart reads better.

**Stacked against grouped bar.** Stacked answers "what is the total, and what made it up". Grouped answers "how do these compare". The wrong choice makes the chart correct but hard to read.

**KPI against gauge.** KPI is a number on its own. Gauge is a number against a range, so it needs a sensible minimum and maximum to mean anything.

**Table.** A table is not a failure. When someone needs to read exact values, a table is the right answer and a chart is decoration.

### Subtypes need different columns

A change of subtype often changes what the chart needs. A Simple Bar needs a category and a value. A Grouped Bar also needs a series column to group by.

CHOps updates the mapping fields when you change subtype. It also checks that the columns you chose suit the type. This catches the common mistake of a text column mapped to a numeric axis, before you see a broken chart.

---

## 4. Mapping columns

Once you choose a type, you tell CHOps which query column plays which role. The fields are named for the chart, not generically. A bar chart asks for a Category and a Value. A scatter chart asks for an X Measure and a Y Measure.

### Axis labels and legends

Axis labels fill in from the chart type and your column names. You can override them.

A legend appears on its own when a chart has more than one series. It stays away when it would only take up room.

### Gauge minimum and maximum

Gauge charts add fields for the ends of the range. Without them, the gauge has nothing to be a proportion of.

Set them to something meaningful, not to the current value. A disk-usage gauge with a maximum of the current usage always reads full.

### The chart toolbar

Every chart has a small toolbar to zoom into a region, reset the view, and save the chart as an image. Any chart expands to full screen, which helps both while you build and while you present.

---

## 5. Saving a chart

There are two options, and the difference matters.

**Save the chart on its own.** It goes into All Charts and belongs to no dashboard. This suits a chart you reach for now and then, rather than one to display.

**Save it to a dashboard.** CHOps puts it in the next free slot, left to right, then onto the next row. So you do not think about position while you build. You can rearrange it later.

### Editing a chart afterward

Open it from All Charts and choose **Edit**. The Chart Builder reopens with everything as you left it: the SQL, the type, the subtype, the column mapping, the name, and the dashboard.

A save updates the chart everywhere it appears. A chart on three dashboards is one chart, not three copies. So a fix in one place is a fix everywhere.

---

## 6. My Dashboards

A dashboard is a named grid of charts.

### Creating one

Give it a name and choose a column count from one to four. That sets how many charts sit side by side. The default is two.

**One column** suits charts that need width, such as long time series. **Two** is the usual choice. **Three or four** suit small charts and KPI tiles, and get cramped on a laptop screen.

The column count is a property of the dashboard. It appears beside the name in the list.

### What a tile shows

Each chart sits in a tile with its title, a button to view it full screen, and a button to remove it from the dashboard.

To remove a chart from a dashboard does not delete the chart. It stays in All Charts and on any other dashboard that uses it.

### Which connection charts run against

Charts run against the connection you selected in the navbar. A dashboard is not tied to a cluster. So you can point the same dashboard at production, then at staging, by a change of connection.

Remember this when a dashboard looks wrong. Check which cluster you are looking at before you investigate the query.

---

## 7. Arranging the grid

Drag a chart to swap it with another. The layout updates on screen as you experiment.

**Nothing is stored until you choose Save Layout.** That button appears once you move something. The arrangement is kept when you press it. If you navigate away without a save, the previous arrangement stays.

This is deliberate. You can try three arrangements and keep the one you like, with no need for an undo.

### Ordering that helps

Put the chart that answers "is anything wrong" at the top left, because that is where eyes land first. Detail charts go below. Anything you need only during an investigation goes at the bottom, or on a separate dashboard.

---

## 8. All Charts

This is one table of every chart, with its name, type, and the dashboard it belongs to.

**Click a row** to preview the chart without you leaving the list. This is the fastest way to find out what a vaguely named chart shows.

**Edit** opens it in the Chart Builder with everything filled in.

The dashboard column is the useful one when you tidy up. Charts with no dashboard are either deliberate standalone tools or leftovers from experiments.

### Naming

The list is only as good as the names. `Queries` tells you nothing in a list of thirty. `Query count by hour, last 7d` tells you whether to open it. The name is what you scan later, so spend the extra seconds.

---

## 9. Making charts interactive

A chart with fixed values shows one thing. A chart with parameters lets the viewer choose.

Replace a literal with a typed placeholder:

```sql
WHERE event_date >= today() - {days:UInt16}
```

Put that chart on a dashboard, and a control appears above it. Change the value, press Apply, and every chart that uses `days` runs again. Charts that do not use it are left alone.

This turns a dashboard from a fixed report into something people use. One dashboard serves the last-day and the last-quarter question, instead of two.

The syntax, the optional blocks that let a filter disappear when empty, the default values, and how to arrange the controls are covered in [Dashboard Filters](dashboard-filters.md).

---

## 10. When something does not work

### The preview is empty but the query returned rows

This is almost always the column mapping. Check that the columns you selected for each role still exist in the results. This is the usual casualty of a change to the SQL after you map.

### The chart looks wrong after a change of subtype

Subtypes need different columns. A move from Simple Bar to Grouped Bar adds a series field that starts empty. Re-check the mapping after any subtype change.

### A gauge always reads full or empty

Its minimum and maximum are unset or wrong. They define the range the value sits in, so they need to be the bounds you care about, not the value itself.

### A dashboard is slow

Each chart runs its own query when it displays. So a dashboard is as slow as the sum of its charts.

Open the slow one in the Chart Builder and run it there to see the time. The usual causes are no date filter, a wide scan, or an aggregation that could happen in ClickHouse&reg; instead of over many returned rows.

The [Query Profiler](query-profiler.md) shows where the time went.

### My layout changes did not persist

You did not press **Save Layout**. To drag alone changes the screen, not the stored arrangement.

### A chart shows different numbers than a colleague sees

You have a different connection selected, or different filter values. Check the cluster in the navbar first, then the filter bar.

### I removed a chart from a dashboard and it is still in All Charts

This is correct. To remove from a dashboard unplaces the chart. It does not delete it. Delete it from All Charts if you want it gone everywhere.

---

## Related pages

- [Dashboard Filters](dashboard-filters.md) for interactive dashboards
- [SQL Editor](sql-editor.md) to develop a query before it becomes a chart
- [Qurioz AI](qurioz.md) to generate SQL from a question
- [Query Profiler](query-profiler.md) when a chart's query is slow
- [System Dashboards](monitoring.md#dashboards) for the built-in ones
