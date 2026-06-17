# Access Control (RBAC)

## View Grants

- **User Grants**: Left-to-right ECharts tree for users
- **Role Grants**: Same for roles
- **Full Overview**: Users table with `roles` column (via `system.role_grants` JOIN on `granted_role_name`), Roles, All Grants

## Users

Tabs with SQL preview: List, Create (auth method, default db dropdown, default role, valid-until with seconds), Alter (full ALTER USER: rename, reset auth, add/drop host/settings/profiles, valid-until), Grant/Revoke (db/table dropdowns), Drop (type username to confirm).

## Roles

Tabs: List, Create, Alter (full ALTER ROLE: rename, add/drop settings/profiles, drop all), Grant/Revoke (db/table dropdowns), Drop (type name to confirm).

## Settings Profiles

ClickHouse® settings are organized into collapsible groups:

| Group | Settings | Examples |
|-------|----------|----------|
| Query Execution | 16 | max_threads, max_memory_usage, max_execution_time, max_subquery_depth, max_ast_depth, max_query_size, max_concurrent_queries_for_user |
| Read Limits | 11 | max_rows_to_read, max_bytes_to_read, read_overflow_mode, max_rows_to_group_by, group_by_overflow_mode, max_rows_in_set |
| Result Limits | 3 | max_result_rows, max_result_bytes, result_overflow_mode |
| JOIN | 7 | join_algorithm, join_overflow_mode, join_any_take_last_row, join_use_nulls, partial_merge_join_optimizations |
| Permissions & Access | 9 | readonly, allow_ddl, allow_introspection_functions, allow_experimental_object_type, allow_experimental_dynamic_type |
| Logging | 8 | log_queries, log_queries_min_type, log_query_threads, log_query_views, log_comment, opentelemetry_start_trace_probability |
| INSERT | 15 | max_insert_block_size, insert_quorum, async_insert, wait_for_async_insert, insert_deduplicate, insert_distributed_sync |
| Networking & Timeouts | 12 | connect_timeout, receive_timeout, send_timeout, tcp_keep_alive_timeout, http_*_timeout, max_network_bandwidth |
| Distributed Queries | 9 | distributed_ddl_task_timeout, max_parallel_replicas, prefer_localhost_replica, optimize_skip_unused_shards, skip_unavailable_shards |
| Merges & Mutations | 6 | background_pool_size, mutations_sync, background_merges_mutations_concurrency_ratio, max_part_loading_threads |
| Query Optimization | 17 | optimize_read_in_order, compile_expressions, force_primary_key, optimize_move_to_prewhere, max_bytes_before_external_group_by |
| Data Formats | 8 | output_format_json_*, input_format_csv_delimiter, date_time_input_format, date_time_output_format |
| S3 & Cloud Storage | 6 | s3_max_connections, s3_max_single_part_upload_size, s3_truncate_on_insert |
| Advanced & Experimental | 9 | enable_filesystem_cache, kafka_max_wait_ms, flatten_nested, allow_experimental_lightweight_delete, alter_sync |

All labels use exact ClickHouse® setting names. Numeric fields enforce non-negative values. String-type settings (join_algorithm, overflow modes, date formats) are pre-quoted. Free-form additional settings field retained.
