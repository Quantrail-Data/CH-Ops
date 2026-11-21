"""Fill the fake ClickHouse with generated data.

Two data sets:
  normal  - data like a small, healthy production cluster.
  stress  - many hosts, many series, long names and many points, to find chart
            and layout problems.

Each table is filled from its real column list. A column gets a value from its
name and its type. A few columns have their own rule in COLUMN_RULES.
All values come from a hash of the row number, so the same data set always gives
the same data.
"""

import re

# Names used in the data.

QUERIES = [
    ("Select", "SELECT count() FROM analytics.events WHERE event_date = today()"),
    ("Select", "SELECT toStartOfHour(event_time) AS hour, uniqExact(user_id) FROM analytics.events GROUP BY hour ORDER BY hour"),
    ("Select", "SELECT user_id, uniqExact(session_id) FROM analytics.events WHERE event_date >= today() - 30 GROUP BY user_id ORDER BY 2 DESC LIMIT 100"),
    ("Insert", "INSERT INTO analytics.events FORMAT Native"),
    ("Insert", "INSERT INTO billing.payments FORMAT JSONEachRow"),
    ("Select", "SELECT * FROM billing.invoices AS i JOIN billing.payments AS p ON i.id = p.invoice_id WHERE i.created >= now() - INTERVAL 7 DAY"),
    ("Select", "SELECT name, value FROM system.settings WHERE changed"),
    ("Alter", "ALTER TABLE analytics.sessions DELETE WHERE session_start < now() - INTERVAL 90 DAY"),
    ("Create", "CREATE TABLE IF NOT EXISTS analytics.daily_users (day Date, users UInt64) ENGINE = MergeTree ORDER BY day"),
    ("Optimize", "OPTIMIZE TABLE analytics.sessions FINAL"),
    ("System", "SYSTEM FLUSH LOGS"),
    ("Select", "SELECT quantiles(0.5, 0.9, 0.99)(latency_ms) FROM analytics.requests WHERE event_date = today()"),
]

ERRORS = [
    (241, "Code: 241. DB::Exception: Memory limit (for query) exceeded: would use 10.02 GiB, maximum: 10.00 GiB. (MEMORY_LIMIT_EXCEEDED)"),
    (60, "Code: 60. DB::Exception: Table analytics.event does not exist. (UNKNOWN_TABLE)"),
    (62, "Code: 62. DB::Exception: Syntax error: failed at position 8 ('FORM'). (SYNTAX_ERROR)"),
    (159, "Code: 159. DB::Exception: Timeout exceeded: elapsed 30.00 seconds, maximum: 30. (TIMEOUT_EXCEEDED)"),
    (516, "Code: 516. DB::Exception: analyst: Authentication failed: password is incorrect. (AUTHENTICATION_FAILED)"),
]

LOGGERS = ["executeQuery", "MergeTreeBackgroundExecutor", "StorageReplicatedMergeTree", "HTTPHandler",
           "TCPHandler", "DDLWorker", "ZooKeeperClient", "MergeTreeDataMergerMutator", "SystemLog", "Application"]

MESSAGES = [
    "Read 18234 rows, 1.42 MiB in 0.012 sec., 1519500 rows/sec., 118.33 MiB/sec.",
    "Merged 6 parts: from 202611_1_6_1 to 202611_7_7_0",
    "Removing 4 old parts from analytics.events",
    "Peak memory usage (for query): 412.33 MiB.",
    "Connection reset by peer, while reading from socket (10.0.0.12:9000)",
    "Too many parts (312). Merges are processing significantly slower than inserts.",
    "Table is in readonly mode: replica path /clickhouse/tables/01/analytics/events",
    "Code: 241. DB::Exception: Memory limit (for query) exceeded: would use 10.02 GiB.",
]

STACK_FRAMES = [
    "DB::executeQuery", "DB::InterpreterSelectQuery::execute", "DB::PipelineExecutor::execute",
    "DB::MergeTreeRangeReader::read", "DB::Aggregator::executeOnBlock", "DB::HashJoin::joinBlock",
    "DB::CompressedReadBuffer::nextImpl", "DB::ReadBufferFromFileDescriptor::nextImpl", "LZ4_decompress_fast",
    "DB::ColumnString::insertFrom", "DB::ExpressionActions::execute", "DB::FilterTransform::transform",
]

PROCESSORS = ["MergeTreeSelect(pool: ReadPool, algorithm: Thread)", "ExpressionTransform", "AggregatingTransform",
              "FilterTransform", "LimitsCheckingTransform", "SortingTransform", "JoiningTransform", "LazyOutputFormat"]

TABLES_NORMAL = [
    ("analytics", "events"), ("analytics", "sessions"), ("analytics", "users"), ("analytics", "requests"),
    ("billing", "invoices"), ("billing", "payments"), ("default", "tmp_import"),
]


def long_name(prefix, index, width=60):
    """A long but readable name, for the stress data."""
    name = f"{prefix}_{index:03d}_customer_activity_rollup_by_region_and_hour_v2"
    return name[:width]


def make_names(dataset):
    """The names for one data set."""
    if dataset == "stress":
        hosts = [f"ch-analytics-eu-west-1-shard-{i // 2 + 1:02d}-replica-{i % 2 + 1}.internal.example.com" for i in range(40)]
        users = ["default", "grafana", "etl_writer", "analyst", "chops"] + [f"service_account_reporting_pipeline_{i:02d}" for i in range(55)]
        databases = ["analytics", "billing", "default"] + [long_name("db", i, 40) for i in range(37)]
        tables = TABLES_NORMAL + [(databases[3 + i % 37], long_name("tbl", i)) for i in range(293)]
    else:
        hosts = ["ch-node-01", "ch-node-02", "ch-node-03"]
        users = ["default", "grafana", "etl_writer", "analyst", "chops", "admin"]
        databases = ["analytics", "billing", "default"]
        tables = TABLES_NORMAL
    return {"hosts": hosts, "users": users, "databases": databases, "tables": tables}


# How many rows each table gets, and how its rows spread over time.
#   series: one row per host per step, newest first.
#   events: rows at hashed times inside the window.

def make_table_plans(dataset):
    stress = dataset == "stress"
    day = 86400
    return {
        "metric_log": {"mode": "series", "step": 1 if stress else 15, "window": 3 * 3600 if stress else 2 * day, "hosts": 12 if stress else None},
        "asynchronous_metric_log": {"mode": "metrics", "step": 10 if stress else 60, "window": 6 * 3600 if stress else 2 * day},
        "query_log": {"mode": "events", "rows": 200000 if stress else 20000, "window": 2 * day},
        "query_metric_log": {"mode": "events", "rows": 20000 if stress else 2000, "window": 2 * day},
        "processors_profile_log": {"mode": "events", "rows": 4000 if stress else 400, "window": 2 * day},
        "trace_log": {"mode": "events", "rows": 50000 if stress else 5000, "window": 2 * day},
        "text_log": {"mode": "events", "rows": 100000 if stress else 8000, "window": 2 * day},
        "session_log": {"mode": "events", "rows": 20000 if stress else 1500, "window": 7 * day},
        "crash_log": {"mode": "events", "rows": 300 if stress else 4, "window": 30 * day},
        "error_log": {"mode": "events", "rows": 10000 if stress else 600, "window": 2 * day},
        "part_log": {"mode": "events", "rows": 20000 if stress else 2000, "window": 2 * day},
        "query_views_log": {"mode": "events", "rows": 2000 if stress else 100, "window": 2 * day},
    }


# Virtual system tables get a copy in the database "seed". The fake server reads
# the copy instead (see server.py). Each entry is the number of rows.

SEED_TABLES_NORMAL = {
    "processes": 6, "merges": 8, "mutations": 4, "replicas": 7, "replication_queue": 10, "clusters": 3,
    "distributed_ddl_queue": 12, "distribution_queue": 3, "zookeeper_connection": 3, "detached_parts": 2,
    "replicated_fetches": 2, "view_refreshes": 2, "macros": 3, "users": 6, "roles": 4, "grants": 20,
    "role_grants": 6, "settings_profiles": 3, "settings_profile_elements": 6, "asynchronous_metrics": 0,
}

SEED_TABLES_STRESS = {
    "processes": 200, "merges": 300, "mutations": 100, "replicas": 300, "replication_queue": 400, "clusters": 40,
    "distributed_ddl_queue": 200, "distribution_queue": 50, "zookeeper_connection": 40, "detached_parts": 50,
    "replicated_fetches": 30, "view_refreshes": 30, "macros": 3, "users": 60, "roles": 40, "grants": 400,
    "role_grants": 80, "settings_profiles": 20, "settings_profile_elements": 60, "asynchronous_metrics": 0,
}

# These system tables do not exist in chdb at all, so their schema is written here.
EXTRA_SEED_SCHEMAS = {
    "asynchronous_metrics": "metric String, value Float64, description String",
    "zookeeper_connection": "name String, host String, port UInt16, `index` Nullable(UInt8), connected_time DateTime, "
                            "session_uptime_elapsed_seconds UInt64, is_expired UInt8, keeper_api_version UInt8, client_id Int64, "
                            "xid Int64, enabled_feature_flags Array(String), availability_zone String",
}


def sql_string(text):
    return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"


def sql_array(values):
    return "[" + ", ".join(sql_string(v) for v in values) + "]"


def pick(values, salt):
    """SQL that picks one of the values for each row."""
    return f"arrayElement({sql_array(values)}, 1 + cityHash64(n, {sql_string(salt)}) % {len(values)})"


def hashed(salt, modulo):
    return f"(cityHash64(n, {sql_string(salt)}) % {modulo})"


def query_id_for(number_expression):
    """The same number always gives the same query id, so tables can be joined."""
    return (f"lower(hex(reinterpretAsFixedString(cityHash64({number_expression}, 'qid-a')))) || "
            f"lower(hex(reinterpretAsFixedString(cityHash64({number_expression}, 'qid-b'))))")


def numeric_base(column_name):
    """A typical size for a numeric column, from its name."""
    name = column_name.lower()
    if "memory" in name or "bytes" in name:
        return 50_000_000
    if "microseconds" in name:
        return 400_000
    if name.endswith("_ms") or "milliseconds" in name:
        return 300
    if "rows" in name:
        return 200_000
    if "percent" in name or "ratio" in name:
        return 40
    return 50


def enum_values(column_type):
    return re.findall(r"'((?:[^'\\]|\\.)*)'\s*=\s*-?\d+", column_type)


def strip_wrappers(column_type):
    """LowCardinality(Nullable(String)) becomes String."""
    inner = column_type
    for wrapper in ("LowCardinality(", "Nullable("):
        while inner.startswith(wrapper):
            inner = inner[len(wrapper):-1]
    return inner


def default_expression(column_name, column_type, names):
    """SQL for one column, from its name and type. None means: use the default."""
    base_type = strip_wrappers(column_type)
    name = column_name.lower()

    if base_type.startswith("Enum"):
        return f"CAST({pick(enum_values(base_type), column_name)} AS {column_type})"
    if base_type == "Date" or base_type == "Date32":
        return "toDate(t)"
    if base_type.startswith("DateTime64"):
        return f"CAST(addMicroseconds(toDateTime64(t, 6), n % 1000000) AS {column_type})"
    if base_type.startswith("DateTime"):
        return f"CAST(t AS {column_type})"
    if base_type == "IPv6":
        return "toIPv6('::ffff:10.0.0.' || toString(10 + h % 200))"
    if base_type == "IPv4":
        return "toIPv4('10.0.0.' || toString(10 + h % 200))"
    if base_type == "UUID":
        return "reinterpretAsUUID(concat(reinterpretAsFixedString(cityHash64(n, 'u1')), reinterpretAsFixedString(cityHash64(n, 'u2'))))"
    if base_type == "String":
        if name in ("hostname", "host_name", "host"):
            return "host"
        if name in ("user", "initial_user", "user_name", "name") and "user" in name:
            return pick(names["users"], column_name)
        if name in ("database", "current_database"):
            return pick(names["databases"], column_name)
        if name == "table":
            return pick([t for _, t in names["tables"]], column_name)
        if name in ("query_id", "initial_query_id"):
            return query_id_for("n")
        if name in ("query", "formatted_query"):
            return pick([q for _, q in QUERIES], "query")
        if name in ("message", "exception", "last_exception"):
            return pick(MESSAGES, column_name)
        if name in ("version", "clickhouse_version"):
            return "'26.9.2.1'"
        return f"concat({sql_string(column_name)}, '_', toString({hashed(column_name, 20)}))"
    if base_type.startswith(("UInt", "Int")):
        size = numeric_base(column_name)
        return (f"CAST(abs(round({size} * (1.2 + 0.6 * sin(tick / 37 + h) "
                f"+ {hashed(column_name, 100)} / 400))) AS {base_type})")
    if base_type.startswith("Float"):
        size = numeric_base(column_name)
        return f"CAST({size} * (1.2 + 0.6 * sin(tick / 41 + h)) AS {base_type})"
    if base_type == "Bool":
        return f"{hashed(column_name, 2)} = 1"
    return None


def column_rules(names, dataset):
    """Special rules for columns where the default value makes no sense."""
    query_kinds = [kind for kind, _ in QUERIES]
    query_texts = [text for _, text in QUERIES]
    query_index = f"(cityHash64(n, 'query') % {len(QUERIES)})"
    is_error = "(cityHash64(n, 'type') % 100 >= 85 AND cityHash64(n, 'type') % 100 < 95)"
    error_index = f"(cityHash64(n, 'err') % {len(ERRORS)})"
    long_message = ("'Code: 252. DB::Exception: Too many parts (312) in all partitions in total in table "
                    "analytics.customer_activity_rollup_by_region_and_hour_v2. This indicates wrong choice of "
                    "partition key. The threshold can be modified with max_parts_in_total setting.'")
    message_pool = MESSAGES + ([long_message.strip("'")] if dataset == "stress" else [])
    frames = sql_array(STACK_FRAMES)

    return {
        "query_log": {
            "type": "multiIf(cityHash64(n, 'type') % 100 < 85, 'QueryFinish', cityHash64(n, 'type') % 100 < 93, "
                    "'ExceptionWhileProcessing', cityHash64(n, 'type') % 100 < 95, 'ExceptionBeforeStart', 'QueryStart')",
            "query": f"arrayElement({sql_array(query_texts)}, 1 + {query_index})",
            "formatted_query": f"arrayElement({sql_array(query_texts)}, 1 + {query_index})",
            "query_kind": f"arrayElement({sql_array(query_kinds)}, 1 + {query_index})",
            "normalized_query_hash": f"cityHash64({query_index})",
            "exception": f"if({is_error}, arrayElement({sql_array([e for _, e in ERRORS])}, 1 + {error_index}), '')",
            "exception_code": f"if({is_error}, arrayElement({[c for c, _ in ERRORS]}, 1 + {error_index}), 0)",
            "query_duration_ms": "toUInt64(pow(10, (cityHash64(n, 'dur') % 420) / 100))",
            "is_initial_query": "1",
            "databases": "[arrayElement(['analytics', 'billing'], 1 + n % 2)]",
            "tables": "[arrayElement(['analytics.events', 'billing.payments'], 1 + n % 2)]",
            "ProfileEvents": ("map('SelectedRows', read_rows, 'SelectedBytes', read_bytes, "
                              "'OSCPUVirtualTimeMicroseconds', query_duration_ms * 900, 'RealTimeMicroseconds', query_duration_ms * 1000, "
                              "'UserTimeMicroseconds', query_duration_ms * 700, 'SystemTimeMicroseconds', query_duration_ms * 150, "
                              "'NetworkSendBytes', result_bytes, 'ReadCompressedBytes', intDiv(read_bytes, 4), 'OSReadBytes', intDiv(read_bytes, 8))"),
            "Settings": "map('max_threads', '8', 'max_memory_usage', '10000000000')",
        },
        "text_log": {
            "level": "multiIf(cityHash64(n, 'lvl') % 100 < 70, 'Information', cityHash64(n, 'lvl') % 100 < 85, 'Debug', "
                     "cityHash64(n, 'lvl') % 100 < 94, 'Warning', cityHash64(n, 'lvl') % 100 < 99, 'Error', 'Fatal')",
            "logger_name": pick(LOGGERS, "logger"),
            "message": pick(message_pool, "msg"),
            "query_id": f"if(n % 3 = 0, {query_id_for('n % 500')}, '')",
        },
        "crash_log": {
            "signal": "arrayElement([11, 6, 7], 1 + n % 3)",
            "trace_full": f"arraySlice({frames}, 1 + n % 4, 8)",
            "version": "'ClickHouse 26.9.2.1'",
            "query_id": query_id_for("n"),
        },
        "session_log": {
            "type": "multiIf(cityHash64(n, 'st') % 100 < 70, 'LoginSuccess', cityHash64(n, 'st') % 100 < 85, 'LoginFailure', 'Logout')",
            "user": pick(names["users"], "session-user"),
            "auth_type": "'SHA256_PASSWORD'",
            "failure_reason": "if(cityHash64(n, 'st') % 100 BETWEEN 70 AND 84, 'Authentication failed: password is incorrect', '')",
            "interface": "arrayElement(['HTTP', 'TCP'], 1 + n % 2)",
        },
        "error_log": {
            "error": f"arrayElement({[c for c, _ in ERRORS]}, 1 + {error_index})",
            "value": "1 + cityHash64(n, 'cnt') % 20",
            "remote": "0",
        },
        "trace_log": {
            "trace_type": "arrayElement(['CPU', 'Real', 'Memory'], 1 + n % 3)",
            "query_id": query_id_for("n % 50"),
            "symbols": f"arraySlice({frames}, 1 + cityHash64(n, 'stack') % 6, 3 + cityHash64(n, 'depth') % 6)",
            "trace": "arrayMap(x -> cityHash64(x), range(3 + cityHash64(n, 'depth') % 6))",
            "size": "if(n % 3 = 2, toInt64(cityHash64(n, 'size') % 50000000), 0)",
        },
        "query_metric_log": {"query_id": query_id_for("n % 50")},
        "processors_profile_log": {"query_id": query_id_for("n % 50"), "name": pick(PROCESSORS, "proc")},
        "processes": {"query": pick(query_texts, "pq"), "user": pick(names["users"], "pu"), "query_id": query_id_for("n"),
                      "elapsed": "toFloat64(cityHash64(n, 'el') % 600) / 10"},
        "merges": {"database": "db", "table": "tbl", "progress": "(cityHash64(n, 'pr') % 100) / 100",
                   "elapsed": "toFloat64(cityHash64(n, 'el') % 900) / 10"},
        "mutations": {"database": "db", "table": "tbl", "command": "'DELETE WHERE event_date < today() - 90'", "is_done": "0"},
        "replicas": {"database": "db", "table": "tbl", "is_leader": "n % 3 = 0", "absolute_delay": "toUInt64(if(n % 5 = 0, 42, n % 3))",
                     "is_readonly": "n % 17 = 5", "replica_name": "host"},
        "replication_queue": {"database": "db", "table": "tbl", "type": "arrayElement(['GET_PART', 'MERGE_PARTS', 'MUTATE_PART'], 1 + n % 3)"},
        "clusters": {"cluster": "'default'", "shard_num": "toUInt32(1 + intDiv(n, 2))", "replica_num": "toUInt32(1 + n % 2)",
                     "host_name": "host", "host_address": "'10.0.0.' || toString(10 + n)", "port": "toUInt16(9000)", "is_local": "n = 0"},
        "distributed_ddl_queue": {"cluster": "'default'", "query": pick(query_texts, "ddl"),
                                  "status": "arrayElement(['Finished', 'Active', 'Unknown'], 1 + n % 3)", "host": "host"},
        "macros": {"macro": "arrayElement(['cluster', 'shard', 'replica'], 1 + n % 3)",
                   "substitution": "arrayElement(['default', '01', 'ch-node-01'], 1 + n % 3)"},
        "users": {"name": f"arrayElement({sql_array(names['users'])}, 1 + n % {len(names['users'])})", "storage": "'local_directory'"},
        "roles": {"name": "concat('role_', arrayElement(['readonly', 'analyst', 'etl', 'admin'], 1 + n % 4), if(n >= 4, toString(n), ''))",
                  "storage": "'local_directory'"},
        "grants": {"user_name": pick(names["users"], "gu"), "access_type": "arrayElement(['SELECT', 'INSERT', 'ALTER', 'CREATE TABLE', 'SHOW'], 1 + n % 5)",
                   "database": "db", "table": "tbl"},
        "asynchronous_metrics": {"metric": f"arrayElement({sql_array(ASYNC_METRICS)}, 1 + n)",
                                 "value": f"arrayElement({[float(async_metric_base(m)) for m in ASYNC_METRICS]}, 1 + n) * 1.1",
                                 "description": "''"},
        "zookeeper_connection": {"name": "'default'", "host": "'keeper-0' || toString(1 + n % 3)", "port": "toUInt16(9181)"},
    }


def column_list(connection, database, table):
    result = connection.query(
        f"SELECT name, type FROM system.columns WHERE database = {sql_string(database)} AND table = {sql_string(table)} "
        "AND default_kind = '' ORDER BY position", "TSVRaw")
    columns = []
    for line in str(result).splitlines():
        if line:
            name, column_type = line.split("\t", 1)
            columns.append((name, column_type))
    return columns


def frame_sql(plan, rows, anchor, host_count):
    """The FROM part: one row per number, with host, tick and time."""
    hosts = f"arrayElement(hosts, 1 + h)"
    if plan["mode"] == "series":
        step = plan["step"]
        return (f"(SELECT number AS n, n % {host_count} AS h, intDiv(n, {host_count}) AS tick, "
                f"toDateTime({anchor}) - intDiv(n, {host_count}) * {step} AS t, {hosts} AS host "
                f"FROM numbers({rows}))")
    window = plan["window"]
    return (f"(SELECT number AS n, cityHash64(n, 'host') % {host_count} AS h, n AS tick, "
            f"toDateTime({anchor}) - cityHash64(n, 'time') % {window} AS t, {hosts} AS host "
            f"FROM numbers({rows}))")


def fill_table(connection, target, source_columns, frame, rules, names, extra_aliases=""):
    """INSERT generated rows into one table."""
    names_sql = []
    values_sql = []
    for name, column_type in source_columns:
        expression = rules.get(name) or default_expression(name, column_type, names)
        if expression is None:
            continue
        names_sql.append(f"`{name}`")
        values_sql.append(f"{expression} AS `{name}`")
    hosts_with = f"WITH {sql_array(names['hosts'])} AS hosts"
    sql = (f"INSERT INTO {target} ({', '.join(names_sql)}) {hosts_with} "
           f"SELECT {', '.join(values_sql)} {extra_aliases} FROM {frame}")
    connection.query(sql, "CSV")


def create_user_tables(connection, names):
    """Real databases and tables, so system.parts, system.columns and the indexes have data."""
    for database in names["databases"]:
        connection.query(f"CREATE DATABASE IF NOT EXISTS `{database}`")
    for index, (database, table) in enumerate(names["tables"]):
        connection.query(
            f"CREATE TABLE IF NOT EXISTS `{database}`.`{table}` ("
            "event_date Date, event_time DateTime, user_id UInt64, session_id String, latency_ms UInt32, "
            "INDEX idx_session session_id TYPE bloom_filter GRANULARITY 4, "
            "PROJECTION by_user (SELECT user_id, count() GROUP BY user_id)"
            ") ENGINE = MergeTree PARTITION BY toYYYYMM(event_date) ORDER BY (event_date, user_id)")
        # Several inserts make several parts, like a real table.
        for batch in range(3 if index < 7 else 1):
            connection.query(
                f"INSERT INTO `{database}`.`{table}` SELECT today() - number % 40, now() - number * 7, "
                f"cityHash64(number, {batch}) % 50000, toString(cityHash64(number, 's')), number % 900 "
                f"FROM numbers({20000 if index < 7 else 200})")


def seed(connection, dataset, anchor):
    """Fill all tables. anchor is the 'now' of the data, in Unix seconds."""
    names = make_names(dataset)
    plans = make_table_plans(dataset)
    rules = column_rules(names, dataset)

    # metric_log has more than 2000 columns, so its INSERT is a very long query.
    connection.query("SET max_query_size = 100000000")
    connection.query("SET max_ast_elements = 10000000")
    connection.query("SET max_expanded_ast_elements = 10000000")
    create_user_tables(connection, names)

    # Log tables: chdb creates them on the first flush.
    connection.query("SYSTEM FLUSH LOGS")
    connection.query("TRUNCATE TABLE IF EXISTS system.query_log")
    for table, plan in plans.items():
        columns = column_list(connection, "system", table)
        if not columns:
            continue
        host_count = plan.get("hosts") or len(names["hosts"])
        host_count = min(host_count, len(names["hosts"]))
        if plan["mode"] == "series":
            rows = host_count * (plan["window"] // plan["step"])
            frame = frame_sql(plan, rows, anchor, host_count)
        elif plan["mode"] == "metrics":
            fill_async_metrics(connection, plan, names, anchor, host_count)
            continue
        else:
            frame = frame_sql(plan, plan["rows"], anchor, host_count)
        fill_table(connection, f"system.{table}", columns, frame, rules.get(table, {}), names)

    seed_virtual_tables(connection, dataset, names, rules, anchor)

    # system.metrics and system.events are live values in chdb, so they change
    # on every call. A fixed copy keeps the recorded answers the same.
    for table in SNAPSHOT_TABLES:
        connection.query(f"CREATE TABLE IF NOT EXISTS seed.{table} ENGINE = MergeTree ORDER BY tuple() "
                         f"AS SELECT * FROM system.{table}")

    # The recorder reads the anchor time, to set the browser clock to it.
    connection.query("CREATE TABLE IF NOT EXISTS seed.meta (anchor DateTime, dataset String) ENGINE = MergeTree ORDER BY tuple()")
    connection.query(f"INSERT INTO seed.meta VALUES ({anchor}, {sql_string(dataset)})")


# chdb has no system.asynchronous_metrics, so the metric names are listed here.
# They are the names CHOps reads, plus the usual per-disk and per-network names.
ASYNC_METRICS = [
    "CGroupMemoryTotal", "DiskUsed_default", "DiskAvailable_default", "DiskTotal_default",
    "FilesystemLogsPathAvailableBytes", "FilesystemLogsPathTotalBytes", "FilesystemMainPathAvailableBytes",
    "FilesystemMainPathAvailableINodes", "FilesystemMainPathTotalBytes", "FilesystemMainPathTotalINodes",
    "Jitter", "LoadAverage1", "LoadAverage5", "LoadAverage15", "MaxPartCountForPartition", "MemoryResident",
    "MemoryTracking", "NetworkReceiveBytes_eth0", "NetworkReceiveDrop_eth0", "NetworkReceiveErrors_eth0",
    "NetworkSendBytes_eth0", "NetworkSendDrop_eth0", "NetworkSendErrors_eth0", "NumberOfDatabases",
    "NumberOfPhysicalCores", "NumberOfTables", "OSIOWaitTimeNormalized", "OSIdleTimeNormalized",
    "OSMemoryAvailable", "OSMemoryTotal", "OSSystemTimeNormalized", "OSUserTimeNormalized",
    "ReplicasMaxAbsoluteDelay", "ReplicasMaxInsertsInQueue", "ReplicasMaxMergesInQueue", "ReplicasMaxQueueSize",
    "ReplicasMaxRelativeDelay", "ReplicasSumQueueSize", "TotalBytesOfMergeTreeTables", "Uptime",
    "VMMaxMapCount", "VMNumMaps", "BlockReadBytes_sda", "BlockWriteBytes_sda", "MarkCacheBytes",
    "UncompressedCacheBytes", "PrimaryIndexBytesInMemory", "HTTPThreads", "TCPThreads",
]


def async_metric_base(metric):
    """A typical value for one asynchronous metric, from its name."""
    if "Normalized" in metric:
        return 0.3
    if "Total" in metric and "Bytes" in metric or metric in ("OSMemoryTotal", "CGroupMemoryTotal"):
        return 64_000_000_000
    if "Available" in metric and "Bytes" in metric or metric == "OSMemoryAvailable":
        return 22_000_000_000
    if "Bytes" in metric or "Memory" in metric or metric.startswith("Disk"):
        return 40_000_000_000
    if "INodes" in metric:
        return 5_000_000
    if metric == "Uptime":
        return 1_500_000
    if metric.startswith("LoadAverage"):
        return 4
    return 30


def fill_async_metrics(connection, plan, names, anchor, host_count):
    """asynchronous_metric_log has one row per metric, so it needs its own loop."""
    metrics = ASYNC_METRICS
    # Floats, so ClickHouse does not read the big values as a small integer type.
    bases = [float(async_metric_base(metric)) for metric in metrics]
    # Totals and counts do not move over time.
    swings = [0.0 if ("Total" in metric or metric.startswith("NumberOf")) else 0.3 for metric in metrics]
    metric_count = len(metrics)
    ticks = plan["window"] // plan["step"]
    rows = host_count * metric_count * ticks
    connection.query(
        f"INSERT INTO system.asynchronous_metric_log (hostname, event_date, event_time, metric, value) "
        f"WITH {sql_array(names['hosts'])} AS hosts, {sql_array(metrics)} AS metrics, {bases} AS bases, {swings} AS swings "
        f"SELECT arrayElement(hosts, 1 + n % {host_count}), toDate(t), t, arrayElement(metrics, 1 + m), "
        f"arrayElement(bases, 1 + m) * (1 + arrayElement(swings, 1 + m) * sin(tick / 37 + n % {host_count})) "
        f"FROM (SELECT number AS n, intDiv(n, {host_count}) % {metric_count} AS m, "
        f"intDiv(n, {host_count * metric_count}) AS tick, "
        f"toDateTime({anchor}) - tick * {plan['step']} AS t FROM numbers({rows}))", "CSV")


def seed_virtual_tables(connection, dataset, names, rules, anchor):
    """Copies of virtual system tables, with generated rows."""
    counts = SEED_TABLES_STRESS if dataset == "stress" else SEED_TABLES_NORMAL
    connection.query("CREATE DATABASE IF NOT EXISTS seed")
    for table, rows in counts.items():
        if table == "asynchronous_metrics":
            rows = len(ASYNC_METRICS)
        if table in EXTRA_SEED_SCHEMAS:
            connection.query(f"CREATE TABLE IF NOT EXISTS seed.{table} ({EXTRA_SEED_SCHEMAS[table]}) "
                             "ENGINE = MergeTree ORDER BY tuple()")
        else:
            # Copy only the structure. Some of these tables need ZooKeeper to be read.
            connection.query(f"CREATE TABLE IF NOT EXISTS seed.{table} AS system.{table} "
                             "ENGINE = MergeTree ORDER BY tuple()")
        columns = column_list(connection, "seed", table)
        tables = names["tables"]
        frame = (f"(SELECT number AS n, n % {len(names['hosts'])} AS h, n AS tick, "
                 f"toDateTime({anchor}) - n * 37 AS t, arrayElement(hosts, 1 + h) AS host, "
                 f"arrayElement({sql_array([d for d, _ in tables])}, 1 + n % {len(tables)}) AS db, "
                 f"arrayElement({sql_array([t for _, t in tables])}, 1 + n % {len(tables)}) AS tbl "
                 f"FROM numbers({rows}))")
        fill_table(connection, f"seed.{table}", columns, frame, rules.get(table, {}), names)


SNAPSHOT_TABLES = ["metrics", "events"]


def seeded_table_names(dataset):
    counts = SEED_TABLES_STRESS if dataset == "stress" else SEED_TABLES_NORMAL
    return list(counts.keys()) + SNAPSHOT_TABLES
