# API Reference

All endpoints require JWT authentication via `Authorization: Bearer <token>` header unless marked public.

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth | No | Login, returns JWT |
| GET | /api/health | No | Health check (includes version) |
| GET | /api/version | No | Full version info from version.json |

## ClickHouse® Proxy

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/query | Yes | Execute SQL via ClickHouse® HTTP |
| POST | /api/query/test-connection | Yes | Test connection |
| GET | /api/config/connection | Yes | Get node list |

## Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/settings | Yes | List (optional ?category=) |
| GET | /api/settings/:key | Yes | Get single |
| PUT | /api/settings/:key | Yes | Upsert |
| DELETE | /api/settings/:key | Yes | Delete |

## Alerts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/alerts/rules | Yes | List rules with channels |
| GET | /api/alerts/rules/active | Yes | List firing+enabled rules |
| POST | /api/alerts/rules | Yes | Create rule |
| PUT | /api/alerts/rules/:id | Yes | Update rule |
| DELETE | /api/alerts/rules/:id | Yes | Delete rule |
| GET | /api/alerts/channels | Yes | List channels |
| POST | /api/alerts/channels | Yes | Create channel |
| PUT | /api/alerts/channels/:id | Yes | Update channel |
| DELETE | /api/alerts/channels/:id | Yes | Delete channel |
| POST | /api/alerts/channels/:id/test | Yes | Send test notification |

## Custom Dashboards (v4)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/dashboards | Yes | List dashboards |
| POST | /api/dashboards | Yes | Create dashboard |
| PUT | /api/dashboards/:id | Yes | Update dashboard |
| DELETE | /api/dashboards/:id | Yes | Delete dashboard (charts unlinked) |
| GET | /api/dashboards/:id/charts | Yes | Get charts in dashboard |
| GET | /api/dashboards/charts | Yes | List all charts |
| POST | /api/dashboards/charts | Yes | Create chart |
| PUT | /api/dashboards/charts/:id | Yes | Update chart |
| DELETE | /api/dashboards/charts/:id | Yes | Delete chart |

### Backup Schedules

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/backups | Yes | List all schedules |
| GET | /api/backups/:id | Yes | Get single schedule |
| POST | /api/backups | Yes | Create schedule |
| PUT | /api/backups/:id | Yes | Update schedule |
| PATCH | /api/backups/:id/toggle | Yes | Pause/resume schedule |
| DELETE | /api/backups/:id | Yes | Delete schedule |

## Rate Limits

- Auth endpoint: 10 requests/min per IP
- Query endpoint: 120 requests/min per IP
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`
