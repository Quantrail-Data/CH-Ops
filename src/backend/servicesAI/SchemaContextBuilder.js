// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (Ravivarman, Dhivyadharshini)
// Converts schema metadata into AI-readable context for SQL generation.

class SchemaContextBuilder {
  static build(points) {
    return points
      .map((point) => {
        const schema = point.payload.table_schema;

        const database = point.payload.database_name;

        return `
Database Name:
${database}

${schema}
`;
      })
      .join("\n\n");
  }
}

module.exports = SchemaContextBuilder;
