# Custom Dashboards

Beyond the built-in monitoring pages, CHOps lets you build your own charts from any SQL query and arrange them into dashboards that suit how your team works. This section has three parts: the Chart Builder where you create a chart, your Dashboards where you arrange them, and All Charts where you manage everything in one list.

## Chart Builder

The Chart Builder is your workspace for turning a query into a chart. It is laid out as four panels you can collapse as needed: you write your SQL and see its results up top, then configure the chart and watch a live preview below.

> Not sure how to write the SQL? Qurioz, the built-in AI assistant, turns a plain-English question into ClickHouse® SQL that drops straight into this workspace. An administrator enables it by adding a provider key on the [AI API Keys](ai-api-keys.md) page.

You start by writing a query, then pick how to visualize it. CHOps offers a wide range of chart types, and for several of them a subtype that refines the look, such as a stacked or grouped variation of a bar chart, and it checks that the columns you are mapping make sense for the type you chose, so you are less likely to end up with a broken chart. As you work, the axis labels fill in automatically based on the chart type, a legend appears on its own when your chart has multiple series, and gauge charts give you fields to set their minimum and maximum. Every chart includes a small toolbar for zooming, resetting the view, and saving the chart as an image, and you can expand any chart to fullscreen while you fine-tune it.

When you are happy with a chart, you can save it on its own or place it onto a dashboard. If you save it to a dashboard, CHOps drops it into the next open slot automatically, filling left to right and then onto the next row, so you do not have to think about positioning.

To change a chart later, open it from the All Charts list and click Edit. The Chart Builder reopens with everything exactly as you left it, the SQL, the chart type, the column mapping, the name, and the dashboard, ready for you to adjust and save again.

## Dashboards

A dashboard is a grid of your charts. When you create one, you choose how many columns it should have, from one up to four, depending on how much you want to fit across the screen.

Arranging charts is as simple as dragging them around the grid to swap their positions. Your changes stay on screen as you experiment, and nothing is saved until you click Save Layout, at which point the arrangement is stored so it looks the same next time you open it.

Each chart sits in its own tile with its title, a button to view it fullscreen, and a button to remove it. The charts run their queries against whichever ClickHouse® connection you currently have selected, so a dashboard always reflects the cluster you are looking at.

## All Charts

All Charts is a single list of every chart you have created, shown in a table with its name, its type, and which dashboard it belongs to. Click any row to preview the chart, or use the Edit button to jump back into the Chart Builder with all of its settings already filled in. This is the easiest place to find and manage charts once you have built up a collection.
