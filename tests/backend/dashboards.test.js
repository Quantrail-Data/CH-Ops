/**
 * dashboards.test.js - Unit tests for dashboard and chart controllers
 *
 * Tests CRUD operations for dashboards and charts using an in-memory
 * mock database. Dashboard tests cover creation with validation, listing,
 * updating, deletion, and fetching charts by dashboard ID. Chart tests
 * cover creation with required fields, listing, updating with config
 * parsing, and deletion. Edge cases like missing fields, invalid config
 * JSON, and DB errors are covered.
 *
 * Author: Kathir Moorthy
 * Copyright (C) 2026 Quantrail™ Data Private Limited
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";

const fakeDB = {
  dashboards: [],
  charts: [],
};

const dashboardsMock = {
  id: "id",
  createdAt: "createdAt",
};

const chartsMock = {
  id: "id",
  dashboardId: "dashboardId",
  createdAt: "createdAt",
};

function createQuery(table) {
  let data = table === dashboardsMock ? fakeDB.dashboards : fakeDB.charts;

  return {
    orderBy: () => ({
      all: () => [...data],
    }),

    where: () => ({
      all: () => [...data],
      get: () => data[0] || null,
    }),

    all: () => [...data],

    get: () => data[0] || null,
  };
}

const dbMock = {
  select: () => ({
    from: (table) => createQuery(table),
  }),

  insert: (table) => ({
    values: (values) => ({
      returning: () => ({
        get: () => {
          const row = {
            id: Date.now(),
            ...values,
          };

          if (table === dashboardsMock) {
            fakeDB.dashboards.push(row);
          } else if (table === chartsMock) {
            fakeDB.charts.push(row);
          }

          return row;
        },
      }),
    }),
  }),

  update: (table) => ({
    set: (updates) => ({
      where: () => ({
        run: () => {
          const collection =
            table === dashboardsMock ? fakeDB.dashboards : fakeDB.charts;

          if (collection.length > 0) {
            Object.assign(collection[0], updates);
          }

          return true;
        },
      }),
    }),
  }),

  delete: (table) => ({
    where: () => ({
      run: () => {
        if (table === dashboardsMock) {
          fakeDB.dashboards.splice(0, 1);
        } else {
          fakeDB.charts.splice(0, 1);
        }

        return true;
      },
    }),
  }),
};

mock.module("../../src/backend/db/index.js", () => ({
  db: dbMock,
  dashboards: dashboardsMock,
  charts: chartsMock,
  alertRules: {},
  alertChannels: {},
  alertRuleChannels: {},
  appSettings: {},
  appUsers: {},
}));



const {
  createDashboard,
  listDashboards,
  updateDashboard,
  deleteDashboard,
  getDashboardCharts,
  createChart,
  updateChart,
  deleteChart,
  listCharts,
} = await import("../../src/backend/controllers/dashboards.js");

function mockReqRes(body = {}, params = {}) {
  const req = {
    body,
    params,
    user: {
      username: "u1",
      role: "admin",
    },
    ip: "127.0.0.1",
  };

  const res = {
    statusCode: 200,
    jsonData: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.jsonData = data;
      return this;
    },
  };

  return { req, res };
}

const originalInsert = dbMock.insert;
const originalUpdate = dbMock.update;
const originalDelete = dbMock.delete;

beforeEach(() => {
  fakeDB.dashboards.length = 0;
  fakeDB.charts.length = 0;

  dbMock.insert = originalInsert;
  dbMock.update = originalUpdate;
  dbMock.delete = originalDelete;
});

describe("Dashboard Controllers", () => {
  it("creates dashboard", () => {
    const { req, res } = mockReqRes({
      name: "Ops Dashboard",
      columns: 3,
    });

    createDashboard(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.name).toBe("Ops Dashboard");
    expect(res.jsonData.columns).toBe(3);
    expect(fakeDB.dashboards.length).toBe(1);
  });

  it("should return 500 internal server error ", () => {
    const { req, res } = mockReqRes({
      name: "Ops Dashboard",
      columns: 3,
    });
    dbMock.insert = mock(() => false);

    createDashboard(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData).toBe(
      "db.insert(dashboards).values is not a function. (In 'db.insert(dashboards).values({ name, columns: columns || 2 })', 'db.insert(dashboards).values' is undefined)",
    );
  });

  it("returns 400 when dashboard name missing", () => {
    const { req, res } = mockReqRes({
      columns: 2,
    });

    createDashboard(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe("Name is required");
  });

  it("lists dashboards", () => {
    fakeDB.dashboards.push({
      id: 1,
      name: "Dashboard 1",
      columns: 2,
    });

    const { req, res } = mockReqRes();

    listDashboards(req, res);

    expect(res.jsonData.length).toBe(1);
    expect(res.jsonData[0].name).toBe("Dashboard 1");
  });

  it("updates dashboard", () => {
    fakeDB.dashboards.push({
      id: 1,
      name: "Old",
      columns: 2,
    });

    const { req, res } = mockReqRes(
      {
        name: "New",
        columns: 4,
      },
      {
        id: "1",
      },
    );

    updateDashboard(req, res);

    expect(res.jsonData.name).toBe("New");
    expect(res.jsonData.columns).toBe(4);
  });

  it("updates dashboard should return 500 internal server error", () => {
    fakeDB.dashboards.push({
      id: 1,
      name: "Old",
      columns: 2,
    });

    const { req, res } = mockReqRes(
      {
        name: "New",
        columns: 4,
      },
      {
        id: "1",
      },
    );

    dbMock.update = mock(() => false);

    updateDashboard(req, res);

    expect(res.statusCode).toBe(500);
  });

  it("deletes dashboard should return 500 internal server error", () => {
    fakeDB.dashboards.push({
      id: 1,
      name: "Dashboard",
    });

    const { req, res } = mockReqRes(
      {},
      {
        id: "1",
      },
    );

    dbMock.delete = mock(() => false);

    deleteDashboard(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("get dashboard charts", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Chart 1",
      config: "{}",
    });
    fakeDB.charts.push({
      id: 2,
      name: "Chart 2",
      config: "kathis",
    });
    const { req, res } = mockReqRes();
    getDashboardCharts(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toEqual([
      {
        id: 1,
        name: "Chart 1",
        config: {},
      },
      {
        config: {},
        id: 2,
        name: "Chart 2",
      },
    ]);
  });
});

describe("Chart Controllers", () => {
  it("creates chart", () => {
    const { req, res } = mockReqRes({
      name: "QPS Chart",
      dashboardId: 1,
      sqlQuery: "SELECT 1",
      chartType: "line",
      chartSubtype: "simple_line",
      config: {},
    });

    createChart(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.name).toBe("QPS Chart");
    expect(res.jsonData.chartType).toBe("line");
    expect(fakeDB.charts.length).toBe(1);
  });

  it("creates chart and check config has any data", () => {
    const { req, res } = mockReqRes({
      name: "QPS Chart",
      dashboardId: 1,
      sqlQuery: "SELECT 1",
      chartType: "line",
      chartSubtype: "simple_line",
      config: {},
    });

    dbMock.insert = mock(() => false);

    createChart(req, res);
    expect(res.statusCode).toBe(500);
  });

  it("returns 400 when chart fields missing", () => {
    const { req, res } = mockReqRes({
      name: "Broken Chart",
    });

    createChart(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toBe("Missing required fields");
  });

  it("lists charts", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Chart 1",
      config: "{}",
    });

    const { req, res } = mockReqRes();

    listCharts(req, res);

    expect(res.jsonData.length).toBe(1);
    expect(res.jsonData[0].name).toBe("Chart 1");
  });

  it("lisst chart and check config has any data", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Chart 1",
      config: "{}",
    });
    fakeDB.charts.push({
      id: 2,
      name: "Chart 2",
      config: "kathis",
    });

    const { req, res } = mockReqRes();

    listCharts(req, res);

    expect(res.jsonData.length).toBe(2);
    expect(res.jsonData[0].name).toBe("Chart 1");
  });

  it("successfully updates a chart", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Old Chart",
      config: '{"theme":"light"}',
    });

    const { req, res } = mockReqRes(
      {
        name: "Updated Chart",
        sqlQuery: "SELECT 2",
        config: { theme: "dark" },
        audit: {},
      },
      { id: "1" },
    );

    const fakeRow = {
      id: 1,
      name: "Updated Chart",
      config: '{"theme":"dark"}',
    };

    dbMock.update = mock(() => ({
      set: () => ({
        where: () => ({
          run: () => true,
        }),
      }),
    }));

    dbMock.select = mock(() => ({
      from: () => ({
        where: () => ({
          get: () => fakeRow,
        }),
      }),
    }));

    updateChart(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.name).toBe("Updated Chart");
    expect(res.jsonData.config).toEqual({ theme: "dark" });
  });

  it("successfully updates a chart and check config has any data", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Old Chart",
      config: '{"theme":"light"}',
    });

    const { req, res } = mockReqRes(
      {
        name: "Updated Chart",
        sqlQuery: "SELECT 2",
        config: { theme: "dark" },
        audit: {},
      },
      { id: "1" },
    );

    const fakeRow = {
      id: 1,
      name: "Updated Chart",
      config: "test",
    };

    dbMock.update = mock(() => ({
      set: () => ({
        where: () => ({
          run: () => true,
        }),
      }),
    }));

    dbMock.select = mock(() => ({
      from: () => ({
        where: () => ({
          get: () => fakeRow,
        }),
      }),
    }));

    updateChart(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.name).toBe("Updated Chart");
    expect(res.jsonData.config).toEqual({});
  });

  it("returns 500 when DB update fails", () => {
    const { req, res } = mockReqRes(
      {
        name: "Fail Chart",
        audit: {},
      },
      { id: "1" },
    );

    dbMock.update = mock(() => ({
      set: () => ({
        where: () => ({
          run: () => {
            throw new Error("DB failure");
          },
        }),
      }),
    }));

    updateChart(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.jsonData).toBe("DB failure");
  });

  it("delete chart", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Old Chart",
      config: '{"theme":"light"}',
    });

    const { req, res} = mockReqRes(
      {},{
        id:1,
      }
    )

    deleteChart(req,res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData).toEqual({
    deleted: true,
  })

  });

  it("should return 500 error", () => {
    fakeDB.charts.push({
      id: 1,
      name: "Old Chart",
      config: '{"theme":"light"}',
    });

    const { req, res} = mockReqRes(
      {},{
        id:1,
      }
    )

    dbMock.delete = mock(() => false);

    deleteChart(req,res);

    expect(res.statusCode).toBe(500);

  });
});
