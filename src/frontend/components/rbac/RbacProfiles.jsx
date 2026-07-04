// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Configures security policies, row-level filters, and global restriction profiles for RBAC enforcement.

import React, { useEffect, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import { runQuery } from '../../utils/api.js';
import DataTable from '../layout/DataTable.jsx';
import { SqlPreview } from '../layout/SharedComponents.jsx';
import ConfirmModal from '../layout/ConfirmModal.jsx';
import { AnimatePresence, motion } from "motion/react";
import AlertBanner from '../layout/AlertBanner.jsx';

function SettingGroup({ group, settings, toggleSetting }) {
  const [open, setOpen] = useState(false);

  const activeCount = group.settings.filter(s => settings[s.key] !== undefined && settings[s.key] !== '').length;
  return (
    <div style={{ marginBottom: 12, border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', background: 'var(--bg-elevated)', fontSize: '14px', fontWeight: 600 }}>
        <Icon className={`ti ti-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 16 }}></Icon>
        {group.group}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{group.settings.length} settings{activeCount > 0 ? ` (${activeCount} set)` : ''}</span>
      </div>
      {open && (
        <div className='setting-body'>
          {group.settings.map(s => (
            <div key={s.key} className="form-group">
              <label className="form-label" title={s.desc}>{s.label}</label>
              {s.type === 'select' ? (
                <Select className="form-select" value={settings[s.key] || ''} onChange={e => toggleSetting(s.key, e.target.value)}>
                  <option value="">-- default --</option>
                  {s.options.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : s.type === 'text' ? (
                <input className="form-input" placeholder="default" value={settings[s.key] || ''} onChange={e => toggleSetting(s.key, e.target.value)} />
              ) : (
                <input className="form-input" type="number" min={0} placeholder="default" value={settings[s.key] || ''} onChange={e => { const v = e.target.value; if (v === '' || parseInt(v) >= 0) toggleSetting(s.key, v); }} />
              )}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SETTING_GROUPS = [
  { group: 'Query Execution', settings: [
    { key: 'max_threads', label: 'max_threads', type: 'number', desc: 'Max parallel threads per query' },
    { key: 'max_execution_time', label: 'max_execution_time', type: 'number', desc: 'Max query time in seconds' },
    { key: 'max_memory_usage', label: 'max_memory_usage', type: 'number', desc: 'Max RAM bytes per query (0=unlimited)' },
    { key: 'max_memory_usage_for_user', label: 'max_memory_usage_for_user', type: 'number', desc: 'Max RAM for all queries of a user' },
    { key: 'max_memory_usage_for_all_queries', label: 'max_memory_usage_for_all_queries', type: 'number', desc: 'Max RAM for all queries on server' },
    { key: 'max_block_size', label: 'max_block_size', type: 'number', desc: 'Max rows in processing block' },
    { key: 'max_subquery_depth', label: 'max_subquery_depth', type: 'number', desc: 'Max nesting level of subqueries' },
    { key: 'max_ast_depth', label: 'max_ast_depth', type: 'number', desc: 'Max AST tree depth' },
    { key: 'max_ast_elements', label: 'max_ast_elements', type: 'number', desc: 'Max AST elements' },
    { key: 'max_expanded_ast_elements', label: 'max_expanded_ast_elements', type: 'number', desc: 'Max AST elements after expansion' },
    { key: 'max_query_size', label: 'max_query_size', type: 'number', desc: 'Max SQL text size in bytes' },
    { key: 'max_parser_depth', label: 'max_parser_depth', type: 'number', desc: 'Max parser recursion depth' },
    { key: 'max_temporary_columns', label: 'max_temporary_columns', type: 'number', desc: 'Max temporary columns in query' },
    { key: 'max_temporary_non_const_columns', label: 'max_temporary_non_const_columns', type: 'number', desc: 'Max temporary non-const columns' },
    { key: 'timeout_before_checking_execution_speed', label: 'timeout_before_checking_execution_speed', type: 'number', desc: 'Seconds before speed check starts' },
    { key: 'max_concurrent_queries_for_user', label: 'max_concurrent_queries_for_user', type: 'number', desc: 'Max simultaneous queries per user' },
  ]},
  { group: 'Read Limits', settings: [
    { key: 'max_rows_to_read', label: 'max_rows_to_read', type: 'number', desc: 'Max rows to read from table' },
    { key: 'max_bytes_to_read', label: 'max_bytes_to_read', type: 'number', desc: 'Max uncompressed bytes to read' },
    { key: 'read_overflow_mode', label: 'read_overflow_mode', type: 'select', options: ["'throw'","'break'"], desc: 'Action when read limit exceeded' },
    { key: 'max_rows_to_group_by', label: 'max_rows_to_group_by', type: 'number', desc: 'Max unique keys in GROUP BY' },
    { key: 'group_by_overflow_mode', label: 'group_by_overflow_mode', type: 'select', options: ["'throw'","'break'","'any'"], desc: 'Action when GROUP BY limit exceeded' },
    { key: 'max_rows_to_sort', label: 'max_rows_to_sort', type: 'number', desc: 'Max rows to sort' },
    { key: 'max_bytes_to_sort', label: 'max_bytes_to_sort', type: 'number', desc: 'Max bytes to sort' },
    { key: 'max_rows_in_distinct', label: 'max_rows_in_distinct', type: 'number', desc: 'Max rows for DISTINCT' },
    { key: 'max_rows_to_transfer', label: 'max_rows_to_transfer', type: 'number', desc: 'Max rows for GLOBAL IN/JOIN' },
    { key: 'max_rows_in_set', label: 'max_rows_in_set', type: 'number', desc: 'Max rows for IN set' },
    { key: 'max_bytes_in_set', label: 'max_bytes_in_set', type: 'number', desc: 'Max bytes for IN set' },
  ]},
  { group: 'Result Limits', settings: [
    { key: 'max_result_rows', label: 'max_result_rows', type: 'number', desc: 'Max rows in result' },
    { key: 'max_result_bytes', label: 'max_result_bytes', type: 'number', desc: 'Max bytes in result' },
    { key: 'result_overflow_mode', label: 'result_overflow_mode', type: 'select', options: ["'throw'","'break'"], desc: 'Action when result limit exceeded' },
  ]},
  { group: 'JOIN', settings: [
    { key: 'max_rows_in_join', label: 'max_rows_in_join', type: 'number', desc: 'Max rows in JOIN hash table' },
    { key: 'max_bytes_in_join', label: 'max_bytes_in_join', type: 'number', desc: 'Max bytes in JOIN hash table' },
    { key: 'join_overflow_mode', label: 'join_overflow_mode', type: 'select', options: ["'throw'","'break'"], desc: 'Action when JOIN limit exceeded' },
    { key: 'join_algorithm', label: 'join_algorithm', type: 'select', options: ["'auto'","'hash'","'partial_merge'","'parallel_hash'","'direct'","'full_sorting_merge'","'grace_hash'"], desc: 'JOIN algorithm' },
    { key: 'join_any_take_last_row', label: 'join_any_take_last_row', type: 'select', options: ['0','1'], desc: 'ANY JOIN takes last matching row' },
    { key: 'partial_merge_join_optimizations', label: 'partial_merge_join_optimizations', type: 'select', options: ['0','1'], desc: 'Optimizations for partial merge join' },
    { key: 'join_use_nulls', label: 'join_use_nulls', type: 'select', options: ['0','1'], desc: 'Use NULLs for unmatched rows in JOIN' },
  ]},
  { group: 'Permissions & Access', settings: [
    { key: 'readonly', label: 'readonly', type: 'select', options: ['0','1','2'], desc: '0=off, 1=read only, 2=read + settings' },
    { key: 'allow_ddl', label: 'allow_ddl', type: 'select', options: ['0','1'], desc: 'Allow CREATE/ALTER/DROP' },
    { key: 'allow_introspection_functions', label: 'allow_introspection_functions', type: 'select', options: ['0','1'], desc: 'Allow addressToLine etc' },
    { key: 'allow_experimental_object_type', label: 'allow_experimental_object_type', type: 'select', options: ['0','1'], desc: 'Allow Object(JSON) type' },
    { key: 'allow_experimental_dynamic_type', label: 'allow_experimental_dynamic_type', type: 'select', options: ['0','1'], desc: 'Allow Dynamic type' },
    { key: 'allow_experimental_variant_type', label: 'allow_experimental_variant_type', type: 'select', options: ['0','1'], desc: 'Allow Variant type' },
    { key: 'allow_suspicious_low_cardinality_types', label: 'allow_suspicious_low_cardinality_types', type: 'select', options: ['0','1'], desc: 'Allow LowCardinality for non-string types' },
    { key: 'allow_nondeterministic_mutations', label: 'allow_nondeterministic_mutations', type: 'select', options: ['0','1'], desc: 'Allow non-deterministic functions in mutations' },
    { key: 'allow_nondeterministic_optimize_skip_unused_shards', label: 'allow_nondeterministic_optimize_skip_unused_shards', type: 'select', options: ['0','1'], desc: 'Allow non-deterministic shard skipping' },
  ]},
  { group: 'Logging', settings: [
    { key: 'log_queries', label: 'log_queries', type: 'select', options: ['0','1'], desc: 'Log queries to system.query_log' },
    { key: 'log_queries_min_type', label: 'log_queries_min_type', type: 'select', options: ["'QUERY_START'","'QUERY_FINISH'","'EXCEPTION_BEFORE_START'","'EXCEPTION_WHILE_PROCESSING'"], desc: 'Min query log type' },
    { key: 'log_query_threads', label: 'log_query_threads', type: 'select', options: ['0','1'], desc: 'Log query thread info' },
    { key: 'log_query_views', label: 'log_query_views', type: 'select', options: ['0','1'], desc: 'Log views accessed by query' },
    { key: 'log_query_settings', label: 'log_query_settings', type: 'select', options: ['0','1'], desc: 'Log settings in query_log' },
    { key: 'log_comment', label: 'log_comment', type: 'text', desc: 'Comment added to query_log entries' },
    { key: 'log_profile_events', label: 'log_profile_events', type: 'select', options: ['0','1'], desc: 'Log profile events' },
    { key: 'opentelemetry_start_trace_probability', label: 'opentelemetry_start_trace_probability', type: 'number', desc: 'Probability to start OTel trace (0..1)' },
  ]},
  { group: 'INSERT', settings: [
    { key: 'max_insert_block_size', label: 'max_insert_block_size', type: 'number', desc: 'Max rows per INSERT block' },
    { key: 'min_insert_block_size_rows', label: 'min_insert_block_size_rows', type: 'number', desc: 'Min rows to squash before INSERT' },
    { key: 'min_insert_block_size_bytes', label: 'min_insert_block_size_bytes', type: 'number', desc: 'Min bytes to squash' },
    { key: 'max_insert_threads', label: 'max_insert_threads', type: 'number', desc: 'Threads for INSERT SELECT' },
    { key: 'max_partitions_per_insert_block', label: 'max_partitions_per_insert_block', type: 'number', desc: 'Max partitions per INSERT' },
    { key: 'insert_quorum', label: 'insert_quorum', type: 'number', desc: 'Replicas to confirm (0=off)' },
    { key: 'insert_quorum_timeout', label: 'insert_quorum_timeout', type: 'number', desc: 'Quorum timeout in ms' },
    { key: 'insert_quorum_parallel', label: 'insert_quorum_parallel', type: 'select', options: ['0','1'], desc: 'Allow parallel quorum inserts' },
    { key: 'async_insert', label: 'async_insert', type: 'select', options: ['0','1'], desc: 'Enable async inserts' },
    { key: 'wait_for_async_insert', label: 'wait_for_async_insert', type: 'select', options: ['0','1'], desc: 'Wait for async insert to flush' },
    { key: 'async_insert_max_data_size', label: 'async_insert_max_data_size', type: 'number', desc: 'Max bytes before async flush' },
    { key: 'input_format_allow_errors_num', label: 'input_format_allow_errors_num', type: 'number', desc: 'Max errors allowed during input parsing' },
    { key: 'input_format_allow_errors_ratio', label: 'input_format_allow_errors_ratio', type: 'number', desc: 'Max error ratio during input parsing' },
    { key: 'insert_deduplicate', label: 'insert_deduplicate', type: 'select', options: ['0','1'], desc: 'Enable INSERT deduplication on replicas' },
    { key: 'insert_distributed_sync', label: 'insert_distributed_sync', type: 'select', options: ['0','1'], desc: 'Sync mode for distributed INSERT' },
  ]},
  { group: 'Networking & Timeouts', settings: [
    { key: 'connect_timeout', label: 'connect_timeout', type: 'number', desc: 'Connection timeout in seconds' },
    { key: 'connect_timeout_with_failover_ms', label: 'connect_timeout_with_failover_ms', type: 'number', desc: 'Failover connection timeout (ms)' },
    { key: 'receive_timeout', label: 'receive_timeout', type: 'number', desc: 'Receive timeout in seconds' },
    { key: 'send_timeout', label: 'send_timeout', type: 'number', desc: 'Send timeout in seconds' },
    { key: 'tcp_keep_alive_timeout', label: 'tcp_keep_alive_timeout', type: 'number', desc: 'TCP keep-alive timeout (s)' },
    { key: 'http_connection_timeout', label: 'http_connection_timeout', type: 'number', desc: 'HTTP connection timeout (s)' },
    { key: 'http_receive_timeout', label: 'http_receive_timeout', type: 'number', desc: 'HTTP receive timeout (s)' },
    { key: 'http_send_timeout', label: 'http_send_timeout', type: 'number', desc: 'HTTP send timeout (s)' },
    { key: 'max_network_bandwidth', label: 'max_network_bandwidth', type: 'number', desc: 'Max bytes/sec for queries' },
    { key: 'max_network_bandwidth_for_user', label: 'max_network_bandwidth_for_user', type: 'number', desc: 'Max bytes/sec per user' },
    { key: 'max_network_bytes', label: 'max_network_bytes', type: 'number', desc: 'Max total network bytes per query' },
    { key: 'max_download_threads', label: 'max_download_threads', type: 'number', desc: 'Threads for URL/S3 downloads' },
  ]},
  { group: 'Distributed Queries', settings: [
    { key: 'distributed_ddl_task_timeout', label: 'distributed_ddl_task_timeout', type: 'number', desc: 'DDL task timeout (s)' },
    { key: 'distributed_connections_pool_size', label: 'distributed_connections_pool_size', type: 'number', desc: 'Max connections for distributed' },
    { key: 'max_parallel_replicas', label: 'max_parallel_replicas', type: 'number', desc: 'Replicas to use per shard' },
    { key: 'prefer_localhost_replica', label: 'prefer_localhost_replica', type: 'select', options: ['0','1'], desc: 'Prefer local replica' },
    { key: 'distributed_group_by_no_merge', label: 'distributed_group_by_no_merge', type: 'select', options: ['0','1','2'], desc: 'Skip GROUP BY merge on initiator' },
    { key: 'optimize_skip_unused_shards', label: 'optimize_skip_unused_shards', type: 'select', options: ['0','1'], desc: 'Skip shards with no matching data' },
    { key: 'allow_experimental_parallel_reading_from_replicas', label: 'allow_experimental_parallel_reading_from_replicas', type: 'select', options: ['0','1','2'], desc: 'Parallel reading from replicas' },
    { key: 'skip_unavailable_shards', label: 'skip_unavailable_shards', type: 'select', options: ['0','1'], desc: 'Skip unavailable shards' },
    { key: 'distributed_product_mode', label: 'distributed_product_mode', type: 'select', options: ["'deny'","'local'","'global'","'allow'"], desc: 'Distributed subquery mode' },
  ]},
  { group: 'Merges & Mutations', settings: [
    { key: 'background_pool_size', label: 'background_pool_size', type: 'number', desc: 'Threads for background merges' },
    { key: 'background_merges_mutations_concurrency_ratio', label: 'background_merges_mutations_concurrency_ratio', type: 'number', desc: 'Ratio of concurrent merges/mutations' },
    { key: 'mutations_sync', label: 'mutations_sync', type: 'select', options: ['0','1','2'], desc: '0=async, 1=this replica, 2=all' },
  ]},
  { group: 'Query Optimization', settings: [
    { key: 'optimize_read_in_order', label: 'optimize_read_in_order', type: 'select', options: ['0','1'], desc: 'ORDER BY optimization' },
    { key: 'optimize_aggregation_in_order', label: 'optimize_aggregation_in_order', type: 'select', options: ['0','1'], desc: 'GROUP BY with sorted keys' },
    { key: 'use_uncompressed_cache', label: 'use_uncompressed_cache', type: 'select', options: ['0','1'], desc: 'Cache uncompressed blocks' },
    { key: 'compile_expressions', label: 'compile_expressions', type: 'select', options: ['0','1'], desc: 'JIT compile expressions' },
    { key: 'min_count_to_compile_expression', label: 'min_count_to_compile_expression', type: 'number', desc: 'Executions before JIT compile' },
    { key: 'compile_aggregate_expressions', label: 'compile_aggregate_expressions', type: 'select', options: ['0','1'], desc: 'JIT compile aggregate functions' },
    { key: 'force_index_by_date', label: 'force_index_by_date', type: 'select', options: ['0','1'], desc: 'Require date index usage' },
    { key: 'force_primary_key', label: 'force_primary_key', type: 'select', options: ['0','1'], desc: 'Require primary key usage' },
    { key: 'merge_tree_min_rows_for_concurrent_read', label: 'merge_tree_min_rows_for_concurrent_read', type: 'number', desc: 'Min rows for parallel part reads' },
    { key: 'merge_tree_min_bytes_for_concurrent_read', label: 'merge_tree_min_bytes_for_concurrent_read', type: 'number', desc: 'Min bytes for parallel part reads' },
    { key: 'optimize_move_to_prewhere', label: 'optimize_move_to_prewhere', type: 'select', options: ['0','1'], desc: 'Auto move conditions to PREWHERE' },
    { key: 'optimize_trivial_count_query', label: 'optimize_trivial_count_query', type: 'select', options: ['0','1'], desc: 'Optimize count() queries from metadata' },
    { key: 'optimize_functions_to_subcolumns', label: 'optimize_functions_to_subcolumns', type: 'select', options: ['0','1'], desc: 'Optimize Nullable functions to subcolumns' },
    { key: 'enable_optimize_predicate_expression', label: 'enable_optimize_predicate_expression', type: 'select', options: ['0','1'], desc: 'Predicate pushdown into subqueries' },
    { key: 'optimize_if_chain_to_multiif', label: 'optimize_if_chain_to_multiif', type: 'select', options: ['0','1'], desc: 'Optimize chained IF to multiIf' },
    { key: 'max_bytes_before_external_group_by', label: 'max_bytes_before_external_group_by', type: 'number', desc: 'Bytes before external GROUP BY to disk' },
    { key: 'max_bytes_before_external_sort', label: 'max_bytes_before_external_sort', type: 'number', desc: 'Bytes before external sort to disk' },
  ]},
  { group: 'Data Formats', settings: [
    { key: 'output_format_json_quote_64bit_integers', label: 'output_format_json_quote_64bit_integers', type: 'select', options: ['0','1'], desc: 'Quote 64-bit ints in JSON' },
    { key: 'output_format_json_quote_denormals', label: 'output_format_json_quote_denormals', type: 'select', options: ['0','1'], desc: 'Quote NaN/Inf in JSON' },
    { key: 'output_format_pretty_max_rows', label: 'output_format_pretty_max_rows', type: 'number', desc: 'Max rows in Pretty format' },
    { key: 'output_format_pretty_max_column_pad_width', label: 'output_format_pretty_max_column_pad_width', type: 'number', desc: 'Max column padding in Pretty' },
    { key: 'input_format_tsv_empty_as_default', label: 'input_format_tsv_empty_as_default', type: 'select', options: ['0','1'], desc: 'Treat empty TSV as default value' },
    { key: 'date_time_input_format', label: 'date_time_input_format', type: 'select', options: ["'basic'","'best_effort'","'best_effort_us'"], desc: 'DateTime input parsing mode' },
    { key: 'date_time_output_format', label: 'date_time_output_format', type: 'select', options: ["'simple'","'iso'","'unix_timestamp'"], desc: 'DateTime output format' },
  ]},
  { group: 'S3 & Cloud Storage', settings: [
    { key: 's3_max_connections', label: 's3_max_connections', type: 'number', desc: 'Max S3 connections' },
    { key: 's3_max_single_part_upload_size', label: 's3_max_single_part_upload_size', type: 'number', desc: 'Max single part upload size' },
    { key: 's3_min_upload_part_size', label: 's3_min_upload_part_size', type: 'number', desc: 'Min multipart upload part size' },
    { key: 's3_max_redirects', label: 's3_max_redirects', type: 'number', desc: 'Max S3 redirects' },
    { key: 's3_truncate_on_insert', label: 's3_truncate_on_insert', type: 'select', options: ['0','1'], desc: 'Truncate S3 file before insert' },
    { key: 's3_create_new_file_on_insert', label: 's3_create_new_file_on_insert', type: 'select', options: ['0','1'], desc: 'Create new S3 file per insert' },
  ]},
  { group: 'Advanced & Experimental', settings: [
    { key: 'enable_filesystem_cache', label: 'enable_filesystem_cache', type: 'select', options: ['0','1'], desc: 'Enable filesystem cache' },
    { key: 'kafka_max_wait_ms', label: 'kafka_max_wait_ms', type: 'number', desc: 'Kafka max wait for messages (ms)' },
    { key: 'kafka_disable_num_consumers_limit', label: 'kafka_disable_num_consumers_limit', type: 'select', options: ['0','1'], desc: 'Disable Kafka consumer limit' },
    { key: 'flatten_nested', label: 'flatten_nested', type: 'select', options: ['0','1'], desc: 'Flatten Nested columns into arrays' },
    { key: 'allow_experimental_lightweight_delete', label: 'allow_experimental_lightweight_delete', type: 'select', options: ['0','1'], desc: 'Allow lightweight DELETE' },
    { key: 'lightweight_deletes_sync', label: 'lightweight_deletes_sync', type: 'select', options: ['0','1','2'], desc: 'Sync mode for lightweight deletes' },
    { key: 'alter_sync', label: 'alter_sync', type: 'select', options: ['0','1','2'], desc: 'Sync mode for ALTER on replicas' },
  ]},
];
export default function RbacProfiles() {
  const { tab: routeTab = 'list' } = useParams();
  const navigate = useNavigate();

  const handleTabChange = (newTab) => {
    navigate(`/rbac/profiles/${newTab}`, { replace: true });
  };

  const profilesQ = useQuery(), detailsQ = useQuery();
  const [result, setResult] = useState(null);

  function load() {
    profilesQ.execute('SELECT name FROM system.settings_profiles ORDER BY name');
    detailsQ.execute('SELECT profile_name, setting_name, value, min, max, readonly, inherit_profile FROM system.settings_profile_elements ORDER BY profile_name, setting_name');
  }
  useEffect(load, []);

  const tabs = [{ id: 'list', l: 'Profiles', i: 'ti-list' }, { id: 'create', l: 'Create', i: 'ti-plus' }, { id: 'alter', l: 'Alter', i: 'ti-edit' }, { id: 'drop', l: 'Drop', i: 'ti-trash' }];

  return (
    <div className="page-content">
      <div className="section-header"><h2 className="section-title"><Icon className="ti ti-settings"></Icon> Settings Profiles</h2></div>
      <AlertBanner result={result} setResult={setResult} />
      {/* {result && <div className={`alert-banner ${result.ok ? 'success' : 'danger'}`} style={{ marginBottom: 14 }}><Icon className={`ti ${result.ok ? 'ti-check' : 'ti-alert-circle'}`}></Icon> {result.msg}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setResult(null)}><Icon className="ti ti-x"></Icon></button></div>} */}
      <div className="tab-bar">{tabs.map(t => <div key={t.id} className={`tab-item ${routeTab === t.id ? 'active' : ''}`} onClick={() => handleTabChange(t.id)}><Icon className={`ti ${t.i}`}></Icon> {t.l}</div>)}</div>
      {routeTab === 'list' && <ProfileList profilesQ={profilesQ} detailsQ={detailsQ} />}
      {routeTab === 'create' && <ProfileForm action="create" setResult={setResult} onSuccess={load} />}
      {routeTab === 'alter' && <ProfileForm action="alter" profiles={profilesQ.data || []} setResult={setResult} onSuccess={load} />}
      {routeTab === 'drop' && <DropProfile profiles={profilesQ.data || []} setResult={setResult} onSuccess={load} navigate={navigate} />}
    </div>
  );
}

function ProfileList({ profilesQ, detailsQ }) {
  return (
    <div>
      <h3 style={{ fontSize: '15px', margin: '8px 0' }}>Profiles</h3>
      <DataTable rows={profilesQ.data || []} emptyMessage="No profiles." variant="fixed" />
      {detailsQ.data?.length > 0 && <>
        <h3 style={{ fontSize: '15px', margin: '16px 0 8px' }}>Profile Settings</h3>
        <DataTable rows={detailsQ.data} columns={['profile_name', 'setting_name', 'value', 'min', 'max', 'readonly', 'inherit_profile']} variant="fixed" />
      </>}
    </div>
  );
}

function ProfileForm({ action, profiles, setResult, onSuccess }) {
  const [name, setName] = useState('');
  const [sel, setSel] = useState('');
  const [settings, setSettings] = useState({});
  const [customSettings, setCustomSettings] = useState('');
  const [onCluster, setOnCluster] = useState('');
  const [rename, setRename] = useState('');
  const [dropAllSettings, setDropAllSettings] = useState(false);
  const [dropAllProfiles, setDropAllProfiles] = useState(false);
  const [addProfiles, setAddProfiles] = useState('');
  const [dropProfiles, setDropProfiles] = useState('');
  const [dropSettings, setDropSettings] = useState('');
  const [open, setOpen] = useState(true);
  const clustersQ = useQuery();
  useEffect(() => { clustersQ.execute("SELECT DISTINCT cluster FROM system.clusters WHERE cluster!='' ORDER BY cluster"); }, []);

  const isAlter = action === 'alter';
  const profileName = isAlter ? sel : name.trim();

  function toggleSetting(key, value) {
    setSettings(prev => {
      const n = { ...prev };
      if (value === '' || value === undefined) delete n[key];
      else n[key] = value;
      return n;
    });
  }

  function buildSql() {
    if (!profileName) return '';
    const p = [isAlter ? 'ALTER SETTINGS PROFILE' : 'CREATE SETTINGS PROFILE IF NOT EXISTS', profileName];
    if (onCluster) p.push(`ON CLUSTER '${onCluster}'`);
    if (isAlter && rename.trim()) p.push(`RENAME TO ${rename.trim()}`);
    if (isAlter && dropAllProfiles) p.push('DROP ALL PROFILES');
    if (isAlter && dropAllSettings) p.push('DROP ALL SETTINGS');
    if (isAlter && dropSettings.trim()) p.push(`DROP SETTINGS ${dropSettings.trim()}`);
    if (isAlter && dropProfiles.trim()) p.push(`DROP PROFILES '${dropProfiles.trim()}'`);
    const allSettings = [];
    Object.entries(settings).forEach(([k, v]) => { if (v !== '' && v !== undefined) {
      if (k === 'log_comment') {
        allSettings.push(`${k} = '${v}'`);
      }
      else {
        allSettings.push(`${k} = ${v}`);
      }
    } });
    if (customSettings.trim()) allSettings.push(customSettings.trim());
    if (allSettings.length) p.push(`SETTINGS ${allSettings.join(', ')}`);
    if (addProfiles.trim()) p.push(`ADD PROFILES '${addProfiles.trim()}'`);
    return p.join(' ');
  }

  async function submit(e) {
    e.preventDefault();
    try {
      await runQuery(buildSql());
      setResult({ ok: true, msg: `Profile ${isAlter ? 'altered' : 'created'}.` });
      setName('');
      setSettings({});
      setCustomSettings('');
      setRename('')
      onSuccess();
    }
    catch (err) { setResult({ ok: false, msg: err.message }); }
    finally {
      setTimeout(() => {
        setResult(null)
      }, 5000)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        {isAlter ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
            <div className="form-group"><label className="form-label">Profile *</label><Select className="form-select" value={sel} onChange={e => setSel(e.target.value)} required><option value="">--</option>{profiles?.map(p => <option key={p.name}>{p.name}</option>)}</Select></div>
            <div className="form-group"><label className="form-label">Rename To</label><input className="form-input" value={rename} onChange={e => setRename(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={onCluster} onChange={e => setOnCluster(e.target.value)}><option value="">--</option>{clustersQ.data?.map(r => <option key={r.cluster}>{r.cluster}</option>)}</Select></div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="form-group"><label className="form-label">Profile Name *</label><input className="form-input" required value={name} onChange={e => setName(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">ON CLUSTER</label><Select className="form-select" value={onCluster} onChange={e => setOnCluster(e.target.value)}><option value="">--</option>{clustersQ.data?.map(r => <option key={r.cluster}>{r.cluster}</option>)}</Select></div>
          </div>
        )}

        {isAlter && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div className="form-group"><label className="form-label">DROP SETTINGS</label><input className="form-input" value={dropSettings} onChange={e => setDropSettings(e.target.value)} placeholder="var1, var2" style={{ fontFamily: 'var(--font-code)' }} /></div>
            <div className="form-group"><label className="form-label">DROP PROFILES</label><input className="form-input" value={dropProfiles} onChange={e => setDropProfiles(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">ADD PROFILES</label><input className="form-input" value={addProfiles} onChange={e => setAddProfiles(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingTop: 22 }}>
              <label style={{ display: 'flex', gap: 6, cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" checked={dropAllSettings} onChange={e => setDropAllSettings(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> DROP ALL SETTINGS</label>
              <label style={{ display: 'flex', gap: 6, cursor: 'pointer', fontSize: '14px' }}><input type="checkbox" checked={dropAllProfiles} onChange={e => setDropAllProfiles(e.target.checked)} style={{ accentColor: 'var(--accent)' }} /> DROP ALL PROFILES</label>
            </div>
          </div>
        )}

        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: ".5px solid rgba(255,255,255,0.1)",
          marginBottom: "20px"
        }}>
          <h4 style={{ fontSize: '14px', marginBottom: 12, display: "flex", alignItems: "center", gap: "10px" }}><Icon className="ti ti-settings"></Icon> Settings</h4>
          <div onClick={() => setOpen(!open)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              cursor: 'pointer',
              // background: 'lightgray', 
              fontSize: '0.75rem',
              color: "gray",
              fontWeight: 600
            }}

          >
            <Icon className={`ti ti-chevron-${open ? 'down' : 'right'}`} style={{ fontSize: 16 }}></Icon>
            Collapse Settings
          </div>
        </div>

        <AnimatePresence>
          {open && <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {SETTING_GROUPS.map(g => (
              <SettingGroup key={g.group} group={g} settings={settings} toggleSetting={toggleSetting} />
            ))}
          </motion.div>
          }
        </AnimatePresence>

        <div className="form-group" style={{ marginBottom: 16 }}>
          <label className="form-label"><Icon className="ti ti-code"></Icon> Additional Settings (key=value, comma-separated)</label>
          <input className="form-input" value={customSettings} onChange={e => setCustomSettings(e.target.value)} placeholder="distributed_ddl_task_timeout=300, insert_quorum=2" />
        </div>

        <SqlPreview sql={buildSql()} />
        <div style={{ marginTop: 16 }}><button className="btn btn-primary" type="submit" disabled={!profileName}><Icon className="ti ti-device-floppy"></Icon> {isAlter ? 'Alter' : 'Create'}</button></div>
      </div>
    </form>
  );
}

function DropProfile({ profiles, setResult, onSuccess, navigate }) {
  const [sel, setSel] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const sql = sel ? `DROP SETTINGS PROFILE IF EXISTS ${sel}` : '';

  async function drop() {
    try {
      await runQuery(sql);
      setResult({ ok: true, msg: 'Profile dropped.' });
      onSuccess();
      setSel('');
      setConfirmName('');
      setConfirm(false)
      navigate('/rbac/profiles/list', { replace: true });
    }
    catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    finally {
      setConfirm(false);
      setConfirmName('');
      setTimeout(()=>{
        setResult(null)
      },5000)
    }
  }

  return (<div className="card" style={{ padding: 20,height:confirm ? '700px' : 'auto' }}><div className="form-group" style={{ marginBottom: 14 }}><label className="form-label">Profile</label><Select className="form-select" value={sel} onChange={e => setSel(e.target.value)}><option value="">--</option>{profiles.map(p => <option key={p.name}>{p.name}</option>)}</Select></div><SqlPreview sql={sql} /><div style={{ marginTop: 16 }}><button className="btn btn-danger" disabled={!sel} onClick={() => setConfirm(true)}><Icon className="ti ti-trash"></Icon> Drop</button></div>
    {confirm && <ConfirmModal title="Drop Profile" message={<div><p>Type the profile name <strong>{sel}</strong> to confirm:</p><input className="form-input" style={{ marginTop: 8 }} value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={sel} autoFocus /></div>} confirmText="Drop Profile" onConfirm={drop} onCancel={() => { setConfirm(false); setConfirmName(''); }} danger confirmDisabled={confirmName !== sel} />}
  </div>);
}
