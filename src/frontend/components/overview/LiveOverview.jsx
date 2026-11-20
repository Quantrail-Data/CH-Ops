// Copyright (C) 2026 Quantrail™ Data Private Limited
// The live section of the Cluster Overview page.
// Contributors -> Kathir Moorthy, Praveen Kumar and Kathirdhasan

import Icon from "../common/Icon.jsx";
import Select from "../common/Select.jsx";
import { ChartCard, KpiStrip, HealthStrip, GaugeGroup, Section, MetricDescriptions } from "./OverviewCards.jsx";
import { Button } from "../ui/index.jsx";
import { useLiveOverview, INTERVALS } from "./useLiveOverview.js";

// The hook is in useLiveOverview.js; it is exported here too, for the pages
// that import it from this file.
export { useLiveOverview };

export function LiveControlBar({ nodeName, live: s }) {
  const { live, setLive, interval, setIntervalSeconds, lastAt, error, restarted } = s;
  const ageSeconds = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;

  return (
      <div
        className="card"
        style={{
          padding: "10px 16px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.125rem", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon className="ti ti-heartbeat" />
          {nodeName || "Live overview"}
        </h2>

        <Button
          variant={live ? "primary" : "secondary"}
          size="sm"
          aria-pressed={live}
          onClick={() => setLive((v) => !v)}
        >
          <Icon className={`ti ti-player-${live ? "pause" : "play"}`} />
          {live ? "Live" : "Paused"}
        </Button>

        <Select
          value={interval}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          style={{ width: "7.5rem" }}
          title="Refresh interval"
        >
          {INTERVALS.map((s) => (
            <option key={s} value={s}>
              every {s}s
            </option>
          ))}
        </Select>

        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          {ageSeconds === null ? "no reading yet" : `updated ${ageSeconds}s ago`}
        </span>

        {error && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-danger)",display:"flex",justifyContent:"center",alignItems:"center" , gap:"4px" }}>
            <Icon style={{marginBottom:"2px"}} className="ti ti-alert-circle" /> {error}
          </span>
        )}

        {restarted && (
          <span style={{ fontSize: "0.75rem", color: "var(--color-warning)" }}>
            <Icon className="ti ti-alert-triangle" /> Server restarted, rates resuming
          </span>
        )}

        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginLeft: "auto" }}>
          Readings are current; rates cover the last {interval}s
        </span>
      </div>
  );
}

// The machine gauges, on their own so the page can put them directly under the
// stat cards.
 
export function MachineGauges({ live: s }) {
  const { loaded, gauges, descriptions } = s;
  if (!loaded) return null;
  return (
    <MetricDescriptions value={descriptions}>
      <Section id="machine" icon="ti-cpu" title="Machine and server">
        <GaugeGroup items={gauges.machine} />
      </Section>
    </MetricDescriptions>
  );
}

// The rest of the live charts. Controls and machine gauges sit above. 
export default function LiveOverview({ live: s }) {
  const {
    interval, loaded, ev, gauges, charts, kpis, timeBreakdown, healthChips, failingChecks, hasPair,
    descriptions,
  } = s;

  return (
    // Supplied once here rather than threaded through every card: InfoTip reads
    // the server's description from context and shows it beneath ours.
    <MetricDescriptions value={descriptions}>
    <div style={{ marginBottom: 20 }}>
      {!loaded ? (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <span className="loading-spinner" /> Reading system tables...
        </div>
      ) : (
        <>
          <Section
            id="health"
            icon="ti-shield-check"
            title="Health checks"
            defaultOpen={false}
            summary={
              failingChecks > 0
                ? `${failingChecks} failing`
                : `all ${healthChips.length} clear`
            }
          >
            <HealthStrip chips={healthChips} />
          </Section>

          {/* Every percentage on the page, in one place. Comparing them side by
              side is the point: a saturated pool stands out because everything
              around it does not. */}
          <Section
            id="efficiency-gauges"
            icon="ti-chart-arrows"
            title="Efficiency"
            summary={`over the last ${interval}s`}
           defaultOpen={false}>
            <GaugeGroup items={gauges.efficiency} />
          </Section>

          <Section id="pools" icon="ti-stack-2" title="Background pools" summary="in use against limit" defaultOpen={false}>
            <ChartCard
              metricKey="pool_utilization"
              title="Background pools, in use against limit"
              option={charts.pools}
              type="bar"
              format="count"
              height={260}
              emptyMessage="No background pools reported"
            />
          </Section>

          <Section id="throughput" icon="ti-bolt" title="Throughput" summary={`last ${interval}s`} defaultOpen={false}>
          <KpiStrip
            items={[
              { key: "query_rate", value: ev.query_rate },
              { key: "avg_query_latency", value: ev.avg_query_latency },
              { key: "rows_read_rate", value: ev.rows_read_rate },
              { key: "rows_written_rate", value: ev.rows_written_rate },
              { key: "disk_read_rate", value: ev.disk_read_rate },
              { key: "disk_write_rate", value: ev.disk_write_rate },
              { key: "net_in_rate", value: ev.net_in_rate },
              { key: "net_out_rate", value: ev.net_out_rate },
              { key: "ch_cpu_cores", value: ev.ch_cpu_cores },
              { key: "merge_concurrency", value: ev.merge_concurrency },
              { key: "merge_throughput", value: ev.merge_throughput },
              { key: "bytes_per_row", value: ev.bytes_per_row },
            ]}
          />
          </Section>

          <Section id="shape" icon="ti-chart-bar" title="Efficiency and shape" summary={`last ${interval}s`} defaultOpen={false}>
          <KpiStrip
            items={[
              { key: "read_amplification", value: ev.read_amplification },
              { key: "write_amplification", value: ev.write_amplification },
              { key: "rows_per_part", value: ev.rows_per_part },
              { key: "parts_per_merge", value: ev.parts_per_merge },
              { key: "read_compression", value: ev.read_compression },
              { key: "insert_compression", value: ev.insert_compression },
            ]}
          />
          </Section>

          <Section id="time" icon="ti-clock" title="Where the time goes" summary={`last ${interval}s`} defaultOpen={false}>
          <ChartCard
            metricKey="time_breakdown"
            option={timeBreakdown}
            type="bar"
            format="threads"
            height={300}
            emptyMessage={hasPair ? "Nothing measurable in the last interval" : "Waiting for a second reading"}
          />
          </Section>

          <Section id="activity" icon="ti-activity-heartbeat" title="Activity right now" defaultOpen={false}>
          <Grid>
            <ChartCard metricKey="query_activity" option={charts.queryActivity} type="bar" format="count" />
            <ChartCard metricKey="background_activity" option={charts.backgroundActivity} type="bar" format="count" />
            <ChartCard metricKey="io_in_flight" option={charts.io} type="bar" format="count" />
            <ChartCard metricKey="locks" option={charts.locks} type="bar" format="count" />
            <ChartCard metricKey="threads" option={charts.threads} type="bar" format="count" />
            <ChartCard metricKey="memory_breakdown" option={charts.memory} type="bar" format="bytes" />
          </Grid>
          </Section>

          <Section id="storage" icon="ti-database" title="Storage" defaultOpen={false}>
          <Grid>
            <ChartCard metricKey="parts_by_state" option={charts.parts} type="bar" format="count" />
            <ChartCard metricKey="part_format" option={charts.partFormat} type="pie" format="count" />
            {/* charts.caches is null when every cache is empty, so the slice
                override has to be conditional - reaching into .series[0] threw
                and took the whole Storage section down on a fresh server. */}
            <ChartCard metricKey="caches" option={charts.caches && {
                      ...charts.caches,
                      series: [
                        {
                          ...charts.caches.series[0],
                          label: {
                            position: "outside",
                            formatter: "{b}\n{d}%",
                            show: true
                          },
                          labelLayout: {
                            hideOverlap: false, 
                            moveOverlap: "shiftY"
                          }
                        }
                      ]
                    }}
                    type="pie" format="bytes" emptyMessage="All caches are empty"  />
            <ChartCard metricKey="attached_objects" option={charts.objects} type="bar" format="count" />
          </Grid>
          </Section>

          <Section id="data-health" icon="ti-list-check" title="Data health" defaultOpen={false}>
            <KpiStrip items={kpis} />
          </Section>

          {(charts.tempFiles ||
            charts.distributed ||
            charts.asyncInserts ||
            charts.kafka ||
            charts.replication) && (
            <Section id="in-use" icon="ti-plug" title="In use on this node" defaultOpen={false}>
              <Grid>
                {charts.replication && (
                  <ChartCard metricKey="replication_queue" option={charts.replication} type="bar" format="count" />
                )}
                {charts.tempFiles && (
                  <ChartCard metricKey="temp_files" option={charts.tempFiles} type="bar" format="count" />
                )}
                {charts.distributed && (
                  <ChartCard metricKey="distributed_inserts" option={charts.distributed} type="bar" format="count" />
                )}
                {charts.asyncInserts && (
                  <ChartCard metricKey="async_inserts" option={charts.asyncInserts} type="bar" format="count" />
                )}
                {charts.kafka && (
                  <ChartCard metricKey="kafka" option={charts.kafka} type="bar" format="count" />
                )}
              </Grid>
            </Section>
          )}
        </>
      )}
    </div>
    </MetricDescriptions>
  );
}

function Grid({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}
