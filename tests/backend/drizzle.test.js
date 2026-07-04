// import { describe, it, expect, beforeAll } from 'bun:test';
// import { Database } from 'bun:sqlite';
// import { drizzle } from 'drizzle-orm/bun-sqlite';
// import { eq } from 'drizzle-orm';
// import * as schema from '../../src/backend/db/schema.js';

// let db;

// beforeAll(() => {
//   const sqlite = new Database(':memory:');
//   sqlite.exec('PRAGMA foreign_keys = ON');
//   sqlite.exec(`
//     CREATE TABLE app_setting (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT, category TEXT NOT NULL DEFAULT 'general', created_at TEXT, updated_at TEXT);
//     CREATE TABLE alert_rule (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, sql TEXT NOT NULL, threshold REAL NOT NULL DEFAULT 0, operator TEXT NOT NULL DEFAULT 'gt', severity TEXT NOT NULL DEFAULT 'warning', schedule TEXT NOT NULL DEFAULT '*/5 * * * *', enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_value REAL, last_status TEXT, last_error TEXT, is_active INTEGER NOT NULL DEFAULT 0, nodes TEXT, cluster_id TEXT, created_at TEXT, updated_at TEXT);
//     CREATE TABLE alert_channel (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, last_test_at TEXT, last_test_ok INTEGER, last_test_error TEXT, created_at TEXT, updated_at TEXT);
//     CREATE TABLE alert_rule_channel (id INTEGER PRIMARY KEY AUTOINCREMENT, alert_rule_id INTEGER NOT NULL REFERENCES alert_rule(id) ON DELETE CASCADE, alert_channel_id INTEGER NOT NULL REFERENCES alert_channel(id) ON DELETE CASCADE, UNIQUE(alert_rule_id, alert_channel_id));
//   `);
//   db = drizzle(sqlite, { schema });
// });

// describe('AppSetting CRUD', () => {
//   it('inserts and retrieves', () => {
//     db.insert(schema.appSettings).values({ key: 'theme', value: 'dark', category: 'ui' }).run();
//     const row = db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).get();
//     expect(row.value).toBe('dark');
//     expect(row.category).toBe('ui');
//   });

//   it('updates', () => {
//     db.update(schema.appSettings).set({ value: 'light' }).where(eq(schema.appSettings.key, 'theme')).run();
//     expect(db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).get().value).toBe('light');
//   });

//   it('deletes', () => {
//     db.delete(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).run();
//     expect(db.select().from(schema.appSettings).where(eq(schema.appSettings.key, 'theme')).get()).toBeUndefined();
//   });
// });

// describe('AlertRule CRUD', () => {
//   it('creates with defaults', () => {
//     const r = db.insert(schema.alertRules).values({ name: 'HighCPU', sql: 'SELECT avg(cpu) FROM metrics' }).returning().get();
//     expect(r.name).toBe('HighCPU');
//     expect(r.operator).toBe('gt');
//     expect(r.severity).toBe('warning');
//     expect(r.enabled).toBe(true);
//     expect(r.isActive).toBe(false);
//   });

//   it('updates status fields', () => {
//     db.update(schema.alertRules).set({ lastStatus: 'firing', isActive: true, lastValue: 95.5 }).where(eq(schema.alertRules.name, 'HighCPU')).run();
//     const r = db.select().from(schema.alertRules).where(eq(schema.alertRules.name, 'HighCPU')).get();
//     expect(r.lastStatus).toBe('firing');
//     expect(r.lastValue).toBe(95.5);
//   });
// });

// describe('AlertChannel + Junction', () => {
//   let ruleId, channelId;

//   it('creates a channel', () => {
//     const ch = db.insert(schema.alertChannels).values({ name: 'PagerDuty', type: 'pagerduty', config: '{"routing_key":"abc"}' }).returning().get();
//     channelId = ch.id;
//     expect(ch.type).toBe('pagerduty');
//   });

//   it('links rule to channel via junction', () => {
//     ruleId = db.select().from(schema.alertRules).all()[0].id;
//     db.insert(schema.alertRuleChannels).values({ alertRuleId: ruleId, alertChannelId: channelId }).run();
//     const links = db.select().from(schema.alertRuleChannels).where(eq(schema.alertRuleChannels.alertRuleId, ruleId)).all();
//     expect(links.length).toBe(1);
//     expect(links[0].alertChannelId).toBe(channelId);
//   });

//   it('cascades delete when rule is deleted', () => {
//     db.delete(schema.alertRules).where(eq(schema.alertRules.id, ruleId)).run();
//     expect(db.select().from(schema.alertRuleChannels).all().length).toBe(0);
//   });

//   it('preserves channel after junction cascade', () => {
//     const ch = db.select().from(schema.alertChannels).where(eq(schema.alertChannels.id, channelId)).get();
//     expect(ch).toBeDefined();
//     expect(ch.name).toBe('PagerDuty');
//   });
// });
