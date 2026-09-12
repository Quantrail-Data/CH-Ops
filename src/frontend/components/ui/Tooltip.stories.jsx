import Tooltip from "./Tooltip.jsx";
import Icon from "../common/Icon.jsx";

export default {
  title: "UI/Tooltip",
  component: Tooltip,
};

export const OnText = {
  render: () => (
    <Tooltip content="Rows per second, averaged over the last minute.">
      <span style={{ borderBottom: "1px dotted var(--text-muted)" }}>Throughput</span>
    </Tooltip>
  ),
};

export const OnIcon = {
  render: () => (
    <Tooltip content="Cluster is reachable and accepting queries.">
      <Icon name="info-circle" />
    </Tooltip>
  ),
};

export const TopPlacement = {
  render: () => (
    <div style={{ marginTop: 200 }}>
      <Tooltip content="Forced above the trigger." placement="top">
        <span>Hover me</span>
      </Tooltip>
    </div>
  ),
};
