import { describe, beforeEach, beforeAll, it, expect, mock } from "bun:test";

const mockAsk = mock(()=>{});
const mockEmbed = mock(()=>{});
const mockSearch = mock();
const mockBuild = mock();

const mockGet = mock();
const mockWhere = mock(() => ({
  get: mockGet,
}));

const mockFrom = mock(() => ({
  where: mockWhere,
}));

const mockSelect = mock(() => ({
  from: mockFrom,
}));

mock.module("../../../src/backend/db/index.js", () => ({
  db: {
    select: mockSelect,
  },
}));

mock.module("../../../src/backend/servicesAI/AIService.js", () => ({
  default: class {
    constructor() {
      return {
        ask: mockAsk,
      };
    }
  },
}));

mock.module("../../../src/backend/servicesAI/EmbeddingService.js", () => ({
  default: class {
    constructor() {
      return {
        embed: mockEmbed,
      };
    }
  },
}));

mock.module("../../../src/backend/servicesAI/QdrantService.js", () => ({
  default: class {
    constructor() {
      return {
        search: mockSearch,
      };
    }
  },
}));

mock.module("../../../src/backend/servicesAI/SchemaContextBuilder.js", () => ({
  default: {
    build: mockBuild,
  },
}));

let SQLGenerationService;

beforeAll(async () => {
  SQLGenerationService = (
    await import("../../../src/backend/servicesAI/SQLGenerationService.js")
  ).default;
});

describe("SQLGenerationService", () => {
  const currentService = {
    name: "openai",
    model: "gpt-4",
    encryptedKey: "key",
  };

  let service;

  beforeEach(() => {
    mockAsk.mockClear();
    mockEmbed.mockClear();
    mockSearch.mockClear();
    mockBuild.mockClear();

    mockGet.mockClear();
    mockWhere.mockClear();
    mockFrom.mockClear();
    mockSelect.mockClear();

    service = new SQLGenerationService(currentService);
  });

  it("should generate valid SQL successfully", async () => {
    mockGet.mockReturnValue({
      id: 1,
    });

    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);

    mockSearch.mockResolvedValue([
      {
        id: "point1",
      },
    ]);

    mockBuild.mockReturnValue("mocked schema context");
    mockAsk.mockResolvedValue("SELECT * FROM test_table");
    const result = await service.generateSQL("db1", "get users");
    expect(result.success).toBe(true);
    expect(result.database_id).toBe("db1");
    expect(result.generated_sql).toBe("SELECT * FROM test_table");
    expect(mockAsk).toHaveBeenCalled();
  });

  it("should return fallback when AI cannot generate SQL", async () => {
    mockGet.mockReturnValue({
      id: 1,
    });

    mockEmbed.mockResolvedValue([0.1]);

    mockSearch.mockResolvedValue([]);

    mockBuild.mockReturnValue("schema");

    mockAsk.mockResolvedValue("CANNOT_GENERATE_SQL");

    const result = await service.generateSQL("db1", "invalid request");

    expect(result.success).toBe(true);

    expect(result.generated_sql).toContain("Unable to generate SQL");
  });

  it("should handle trimmed CANNOT_GENERATE_SQL response", async () => {
    mockGet.mockReturnValue({
      id: 1,
    });
    mockEmbed.mockResolvedValue([0.5]);
    mockSearch.mockResolvedValue([]);
    mockBuild.mockReturnValue("schema context");
    mockAsk.mockResolvedValue("   CANNOT_GENERATE_SQL   ");
    const result = await service.generateSQL("db1", "test query");
    expect(result.generated_sql).toContain("Unable to generate SQL");
  });

  it("should throw error when database connection not found", async () => {
    mockGet.mockReturnValue(null);

    await expect(service.generateSQL("missing-db", "get data")).rejects.toThrow(
      "Unable to generate SQL",
    );

    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
