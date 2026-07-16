// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Factory for creating ClickHouse client instances

import { createClient } from "@clickhouse/client";

class ClickHouseClientFactory {
  static createClient(credentials) {
    const isCloud =
      credentials.port === 8443 ||
      credentials.host.includes("clickhouse.cloud");

    const protocol = isCloud ? "https" : "http";
    return createClient({
      url: `${protocol}://${credentials.host}:${credentials.port}`,
      username: credentials.username,
      password: credentials.password,
      database: credentials.database,
    });
  }
}

export default ClickHouseClientFactory;
