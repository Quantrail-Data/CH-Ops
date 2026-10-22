// diskForecast.js - Days until a disk is full, from usage samples.
// Copyright (C) 2026 Quantrail Data Private Limited
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_SAMPLE_SPAN_MS = 60 * 60 * 1000;
// Takes usage samples and system.disks rows. Returns a map keyed
// "host|diskName" with growthBytesPerDay and daysUntilFull.
export function buildDiskForecast(samples, disks) {
const forecast = {};
for (const row of samples || []) {
if (!row || !row.metric) continue;
const diskName = String(row.metric).replace("DiskUsed_", "");
const spanMs = new Date(row.newest_time) - new Date(row.oldest_time);
// Less than one hour of history gives a meaningless rate.
if (!(spanMs >= MIN_SAMPLE_SPAN_MS)) continue;
const growthBytes = Number(row.newest_value) -
Number(row.oldest_value);
const growthBytesPerDay = growthBytes / (spanMs / MS_PER_DAY);
forecast[`${row.host}|${diskName}`] = {
growthBytesPerDay,
daysUntilFull: null,
};
}
for (const disk of disks || []) {
const entry = forecast[`${disk.host}|${disk.name}`];
if (!entry) continue;
if (entry.growthBytesPerDay > 0) {
entry.daysUntilFull = Math.floor(
Number(disk.free_space) / entry.growthBytesPerDay,
);
}
}
return forecast;
}