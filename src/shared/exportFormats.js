// exportFormats.js - The catalogue of export formats, compressions and options.
// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> Sanjeev Kumar G

export const FORMATS = [
  { id: "CSVWithNames", label: "CSV", ext: "csv", group: "Common", text: true },
  { id: "TabSeparatedWithNames", label: "TSV", ext: "tsv", group: "Common", text: true },
  { id: "JSONEachRow", label: "JSON (one object per line)", ext: "ndjson", group: "Common", text: true },
  { id: "Parquet", label: "Parquet", ext: "parquet", group: "Common", text: false },

  { id: "CSVWithNamesAndTypes", label: "CSV with type row", ext: "csv", group: "Text", text: true },
  { id: "TabSeparatedWithNamesAndTypes", label: "TSV with type row", ext: "tsv", group: "Text", text: true },
  { id: "TabSeparatedRawWithNames", label: "TSV without escaping", ext: "tsv", group: "Text", text: true },

  { id: "JSON", label: "JSON (single document)", ext: "json", group: "JSON", text: true },
  { id: "PrettyJSONEachRow", label: "JSON (indented rows)", ext: "ndjson", group: "JSON", text: true },
  { id: "JSONCompactEachRowWithNames", label: "JSON (compact arrays)", ext: "ndjson", group: "JSON", text: true },
  { id: "JSONStringsEachRow", label: "JSON (every value a string)", ext: "ndjson", group: "JSON", text: true },

  { id: "ORC", label: "ORC", ext: "orc", group: "Columnar", text: false },
  { id: "Arrow", label: "Arrow", ext: "arrow", group: "Columnar", text: false },
  { id: "ArrowStream", label: "Arrow stream", ext: "arrows", group: "Columnar", text: false },
  { id: "Avro", label: "Avro", ext: "avro", group: "Columnar", text: false },

  { id: "SQLInsert", label: "SQL INSERT statements", ext: "sql", group: "Interchange", text: true },
  { id: "Values", label: "Values", ext: "txt", group: "Interchange", text: true },
  { id: "XML", label: "XML", ext: "xml", group: "Interchange", text: true },
  { id: "Markdown", label: "Markdown table", ext: "md", group: "Interchange", text: true },
  { id: "MsgPack", label: "MessagePack", ext: "msgpack", group: "Interchange", text: false },

  { id: "Native", label: "ClickHouse Native", ext: "native", group: "ClickHouse", text: false },
  { id: "RowBinaryWithNamesAndTypes", label: "RowBinary", ext: "bin", group: "ClickHouse", text: false },
];

export const FORMAT_GROUPS = ["Common", "Text", "JSON", "Columnar", "Interchange", "ClickHouse"];


export const SELF_COMPRESSED = ["Parquet", "ORC", "Avro"];

export const COMPRESSIONS = [
  { id: "none", label: "None", ext: "" },
  { id: "gzip", label: "gzip (.gz)", ext: ".gz" },
  { id: "zstd", label: "zstd (.zst)", ext: ".zst" },
  { id: "zip", label: "zip (.zip)", ext: ".zip" },
  { id: "targz", label: "tar.gz (.tar.gz)", ext: ".tar.gz" },
];

export const OPTIONS = [
  {
    key: "date_time_output_format",
    label: "Date and time style",
    type: "select",
    choices: ["simple", "iso", "unix_timestamp"],
    def: "simple",
    formats: "*",
    help: "How date and time values are written.",
  },
  {
    key: "format_csv_delimiter",
    label: "Column separator",
    type: "select",
    choices: [",", ";", "|"],
    def: ",",
    formats: ["CSVWithNames", "CSVWithNamesAndTypes"],
    help: "Use a semicolon if Excel in your region shows the whole row in one column.",
  },
  {
    key: "output_format_csv_crlf_end_of_line",
    label: "Windows line endings",
    type: "bool",
    def: false,
    formats: ["CSVWithNames", "CSVWithNamesAndTypes"],
    help: "Ends each line with carriage return and line feed.",
  },
  {
    key: "output_format_tsv_crlf_end_of_line",
    label: "Windows line endings",
    type: "bool",
    def: false,
    formats: ["TabSeparatedWithNames", "TabSeparatedWithNamesAndTypes", "TabSeparatedRawWithNames"],
    help: "Ends each line with carriage return and line feed.",
  },
  {
    key: "format_csv_null_representation",
    label: "Empty values written as",
    type: "text",
    def: "",
    formats: ["CSVWithNames", "CSVWithNamesAndTypes"],
    help: "Left blank by default. Set it to tell empty text apart from a missing value.",
  },
  {
    key: "format_tsv_null_representation",
    label: "Empty values written as",
    type: "text",
    def: "\\N",
    formats: ["TabSeparatedWithNames", "TabSeparatedWithNamesAndTypes"],
    help: "The standard marker for a missing value in TSV.",
  },
  {
    key: "output_format_json_quote_64bit_integers",
    label: "Quote very large numbers",
    type: "bool",
    def: true,
    formats: ["JSONEachRow", "JSON", "PrettyJSONEachRow", "JSONCompactEachRowWithNames"],
    help: "Keeps very large numbers exact for programs that read the file.",
  },
  {
    key: "output_format_json_quote_denormals",
    label: "Quote NaN and Infinity",
    type: "bool",
    def: false,
    formats: ["JSONEachRow", "JSON", "PrettyJSONEachRow", "JSONCompactEachRowWithNames"],
    help: "Writes these special numbers as text so the file stays valid JSON.",
  },
  {
    key: "output_format_parquet_compression_method",
    label: "Parquet compression",
    type: "select",
    choices: ["snappy", "zstd", "lz4", "gzip", "brotli", "none"],
    def: "snappy",
    formats: ["Parquet"],
    help: "Compression stored inside the Parquet file itself.",
  },
  {
    key: "output_format_parquet_row_group_size",
    label: "Parquet row group size",
    type: "number",
    def: 1000000,
    formats: ["Parquet"],
    help: "Larger groups compress better and use more memory.",
  },
  {
    key: "output_format_orc_compression_method",
    label: "ORC compression",
    type: "select",
    choices: ["lz4", "snappy", "zlib", "zstd", "none"],
    def: "lz4",
    formats: ["ORC"],
    help: "Compression stored inside the ORC file itself.",
  },
  {
    key: "output_format_avro_codec",
    label: "Avro compression",
    type: "select",
    choices: ["null", "deflate", "snappy", "zstd"],
    def: "snappy",
    formats: ["Avro"],
    help: "Compression stored inside the Avro file itself.",
  },
  {
    key: "output_format_sql_insert_table_name",
    label: "Table name in the INSERT",
    type: "text",
    def: "table",
    formats: ["SQLInsert"],
    help: "The table name written into each generated INSERT statement.",
  },
  {
    key: "output_format_sql_insert_max_batch_size",
    label: "Rows per INSERT statement",
    type: "number",
    def: 65505,
    formats: ["SQLInsert"],
    help: "How many rows are packed into one statement.",
  },
  {
    key: "output_format_sql_insert_include_column_names",
    label: "Include column names",
    type: "bool",
    def: true,
    formats: ["SQLInsert"],
    help: "Writes the column list into each INSERT statement.",
  },
];

export function findFormat(id) {
  return FORMATS.find((f) => f.id === id) || null;
}

export function findCompression(id) {
  return COMPRESSIONS.find((c) => c.id === id) || null;
}

export function optionsForFormat(formatId) {
  return OPTIONS.filter((o) => o.formats === "*" || o.formats.includes(formatId));
}