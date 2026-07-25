//tests/backend/ai_backend/deleteDatabaseService.test.js
import { mock, beforeAll, describe, beforeEach, it, expect } from "bun:test";
const mockDeleteDatabaseVectors = mock(()=>{});

mock.module("../../../src/backend/dbConfigAI/ConnectionRegistry.js", () => ({
  default: {
    exists: mock(()=>{}),
    remove: mock(()=>{}),
  },
}));

mock.module("../../../src/backend/servicesAI/QdrantService.js", () => ({
  default: mock(()=>{}).mockImplementation(() => ({
    deleteDatabaseVectors: mockDeleteDatabaseVectors,
  })),
}));

describe("DeleteDatabaseService", () => {
  let service;
  let ConnectionRegistry;
  let DeleteDatabaseService;

  beforeAll(async () => {
    ConnectionRegistry = (
      await import("../../../src/backend/dbConfigAI/ConnectionRegistry.js")
    ).default;

    DeleteDatabaseService = (
      await import("../../../src/backend/servicesAI/DeleteDatabaseService.js")
    ).default;
  });

  beforeEach(() => {
    mock.clearAllMocks();
    ConnectionRegistry.exists.mockReset();
    ConnectionRegistry.remove.mockReset();
    mockDeleteDatabaseVectors.mockReset();
    service = new DeleteDatabaseService();
  });

  it("should delete database successfully when database exists", async () => {
    const databaseId = "1234567812345678";
    ConnectionRegistry.exists.mockReturnValue(true);
    mockDeleteDatabaseVectors.mockResolvedValue();
    const result = await service.deleteDatabase(databaseId);
    console.log("result:",result)
    expect(ConnectionRegistry.exists).toHaveBeenCalledWith(databaseId);
    expect(mockDeleteDatabaseVectors).toHaveBeenCalledWith(databaseId);
    expect(ConnectionRegistry.remove).toHaveBeenCalledWith(databaseId);

    expect(result).toEqual({
      success: true,
      database_id: databaseId,
      message: "Database deleted successfully",
    });
  });

  it("should throw error when database does not exist", async () => {
    const databaseId = "1234567812345678";
    mockDeleteDatabaseVectors.mockClear();
    ConnectionRegistry.exists.mockReturnValue(false);
    await expect(service.deleteDatabase(databaseId)).rejects.toThrow(
      `Database connection not found: ${databaseId}`,
    );

    expect(mockDeleteDatabaseVectors.mock.calls.length).toBe(0);
    expect(ConnectionRegistry.remove).not.toHaveBeenCalled();
  });

  // it("should throw error when Qdrant deletion fails", async () => {
  //   const databaseId = "1234567812345678";

  //   ConnectionRegistry.exists.mockReturnValue(true);
  //   mockDeleteDatabaseVectors.mockRejectedValue(new Error("Qdrant failed"));

  //   await expect(service.deleteDatabase(databaseId)).rejects.toThrow(
  //     "Qdrant failed",
  //   );

  //   expect(mockDeleteDatabaseVectors).toHaveBeenCalledWith(databaseId);
  //   expect(ConnectionRegistry.remove).not.toHaveBeenCalled();
  // });
});
