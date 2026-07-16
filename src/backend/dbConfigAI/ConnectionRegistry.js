// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// ConnectionRegistry: Store and manage database connections using a Map keyed by databaseId
class ConnectionRegistry {
  static connections = new Map();
  static add(databaseId, data) {
    this.connections.set(databaseId, data);
  }
  static get(databaseId) {
    return this.connections.get(databaseId);
  }
  static remove(databaseId) {
    this.connections.delete(databaseId);
  }
  static exists(databaseId) {
    return this.connections.has(databaseId);
  }
}
export default ConnectionRegistry;
