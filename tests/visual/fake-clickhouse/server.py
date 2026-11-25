"""A fake ClickHouse server for the CHOps visual check.

It answers the ClickHouse HTTP protocol with chdb (ClickHouse as a library),
filled with generated data (see seed.py). Use it only to record test data.

Run:
  pip install chdb
  python3 server.py --dataset normal --ports 8123,8124,8125

Each port acts as one node of the cluster. All nodes share the same data, but
hostName() gives each port its own node name.

Each start fills the data again, with the current time as its anchor.
"""

import argparse
import json
import os
import re
import shutil
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# chdb takes its time zone from TZ, not from clickhouse.xml. A real server
# usually runs on UTC, and the data must not depend on the machine.
os.environ["TZ"] = "UTC"
time.tzset()

import chdb  # noqa: E402  (must load after TZ is set)

import seed  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

# chdb runs one query at a time.
query_lock = threading.Lock()


def remove_cluster_functions(sql):
    """clusterAllReplicas('x', system.parts) becomes system.parts.

    chdb has no other nodes, so the cluster functions read the local table.
    """
    pattern = re.compile(r"\b(clusterAllReplicas|cluster)\s*\(", re.IGNORECASE)
    while True:
        match = pattern.search(sql)
        if not match:
            return sql
        start = match.start()
        position = match.end()
        depth = 1
        arguments = []
        current = ""
        in_quote = False
        while position < len(sql) and depth > 0:
            char = sql[position]
            if char == "'" and sql[position - 1] != "\\":
                in_quote = not in_quote
            if not in_quote:
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
                    if depth == 0:
                        break
                elif char == "," and depth == 1:
                    arguments.append(current.strip())
                    current = ""
                    position += 1
                    continue
            current += char
            position += 1
        arguments.append(current.strip())
        if len(arguments) >= 3 and "." not in arguments[1]:
            table = f"{arguments[1].strip(chr(39))}.{arguments[2].strip(chr(39))}"
        elif len(arguments) >= 2:
            table = arguments[1]
        else:
            table = "system.one"
        sql = sql[:start] + table + sql[position + 1:]


def rewrite(sql, seeded_tables, node_name):
    """Change the SQL so it runs on chdb with the generated data."""
    sql = remove_cluster_functions(sql)
    for table in seeded_tables:
        sql = re.sub(rf"\bsystem\.{table}\b", f"seed.{table}", sql)
    sql = re.sub(r"\bhostName\(\)", f"'{node_name}'", sql, flags=re.IGNORECASE)
    sql = re.sub(r"\bhostname\(\)", f"'{node_name}'", sql)
    return sql


class FakeClickHouse:
    def __init__(self, data_dir, dataset, hosts):
        config = os.path.join(HERE, "clickhouse.xml")
        path = os.path.join(data_dir, dataset)
        # chdb does not keep the system log tables between starts, so each
        # start begins with an empty folder and fills all data again.
        shutil.rmtree(path, ignore_errors=True)
        self.connection = chdb.connect(f"file:{path}?config-file={config}")
        self.dataset = dataset
        self.hosts = hosts
        self.seeded_tables = seed.seeded_table_names(dataset)
        # chdb creates the log tables on the first flush.
        self.connection.query("SYSTEM FLUSH LOGS")
        # Do not log the recording's own queries, so the data stays as seeded.
        self.connection.query("SET log_queries = 0, log_processors_profiles = 0, log_query_views = 0, "
                              "query_profiler_real_time_period_ns = 0, query_profiler_cpu_time_period_ns = 0")
        anchor = int(time.time()) // 60 * 60
        print(f"Filling the {dataset} data set. Anchor time: {anchor}")
        seed.seed(self.connection, dataset, anchor)
        print("Data ready.")

    def run(self, sql, params, node_name):
        sql = rewrite(sql, self.seeded_tables, node_name)
        with query_lock:
            result = self.connection.query(sql, "TabSeparated", params=params or None)
        return result


def make_handler(fake, node_name):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def send_text(self, status, text, headers=None):
            body = text.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=UTF-8")
            self.send_header("Content-Length", str(len(body)))
            for name, value in (headers or {}).items():
                self.send_header(name, value)
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            url = urlparse(self.path)
            if url.path in ("/ping", "/"):
                query = parse_qs(url.query).get("query")
                if not query:
                    self.send_text(200, "Ok.\n")
                    return
            self.handle_query("")

        def do_POST(self):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length).decode("utf-8") if length else ""
            self.handle_query(body)

        def handle_query(self, body):
            url = urlparse(self.path)
            arguments = {key: values[-1] for key, values in parse_qs(url.query).items()}
            sql = arguments.get("query", "")
            if body:
                sql = f"{sql}\n{body}" if sql else body
            params = {key[len("param_"):]: value for key, value in arguments.items() if key.startswith("param_")}
            query_id = str(uuid.uuid4())
            started = time.time()
            try:
                result = fake.run(sql, params, node_name)
            except Exception as error:
                message = str(error)
                # Keep only the ClickHouse message, like a real server.
                message = message[message.find("Code:"):] if "Code:" in message else message
                self.send_text(500, message + "\n", {"X-ClickHouse-Query-Id": query_id})
                print(f"[{node_name}] ERROR {message[:160]} | SQL: {sql[:200]!r}")
                return
            summary = {
                "read_rows": str(result.rows_read()),
                "read_bytes": str(result.bytes_read()),
                "written_rows": "0", "written_bytes": "0",
                "total_rows_to_read": str(result.rows_read()),
                "result_rows": "0", "result_bytes": "0",
                "elapsed_ns": str(int((time.time() - started) * 1e9)),
            }
            self.send_text(200, result.data(), {
                "X-ClickHouse-Query-Id": query_id,
                "X-ClickHouse-Summary": json.dumps(summary),
                "X-ClickHouse-Server-Display-Name": node_name,
            })

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Fake ClickHouse for the CHOps visual check")
    parser.add_argument("--dataset", choices=["normal", "stress"], default="normal")
    parser.add_argument("--ports", default="8123,8124,8125", help="One port for each node")
    parser.add_argument("--data-dir", default=os.path.join(HERE, ".data"))
    arguments = parser.parse_args()

    ports = [int(port) for port in arguments.ports.split(",")]
    hosts = seed.make_names(arguments.dataset)["hosts"]
    os.makedirs(arguments.data_dir, exist_ok=True)
    fake = FakeClickHouse(arguments.data_dir, arguments.dataset, hosts)

    servers = []
    for index, port in enumerate(ports):
        node_name = hosts[index % len(hosts)]
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(fake, node_name))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        servers.append(server)
        print(f"Node {node_name} listens on http://127.0.0.1:{port}")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        for server in servers:
            server.shutdown()


if __name__ == "__main__":
    main()
