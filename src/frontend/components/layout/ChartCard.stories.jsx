// ChartCard wraps ECharts with the shared ChartToolbar (zoom/save/fullscreen)
// in its header - documented together since ChartToolbar isn't used standalone
// anywhere in the app, only inside ChartCard.
import ChartCard from "./ChartCard.jsx";

export default {
  title: "Existing/ChartCard",
  component: ChartCard,
};

const lineOption = {
  xAxis: { type: "category", data: ["10:00", "10:05", "10:10", "10:15", "10:20"] },
  yAxis: { type: "value" },
  series: [{ type: "line", data: [120, 132, 101, 154, 190], smooth: true }],
};

const pieOption = {
  series: [
    {
      type: "pie",
      radius: "60%",
      data: [
        { value: 45, name: "SELECT" },
        { value: 20, name: "INSERT" },
        { value: 10, name: "ALTER" },
      ],
    },
  ],
};

export const LineChart = {
  args: { title: "Queries per second", option: lineOption, height: 280 },
};

export const PieChart = {
  args: { title: "Query mix", option: pieOption, height: 280 },
};

export const Loading = {
  args: { title: "Queries per second", option: lineOption, loading: true },
};
