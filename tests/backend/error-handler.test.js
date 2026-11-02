// error-handler.test.js - A server error must not send its details to the client.
// Copyright (C) 2026 Quantrail Data Private Limited

import { describe, it, expect } from "bun:test";
import { handleRequestError } from "../../src/backend/middleware/errorHandler.js";

function fakeResponse() {
  const response = { statusCode: null, body: null };
  response.status = (code) => {
    response.statusCode = code;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
}

const REQUEST = { path: "/api/test", method: "GET" };

describe("handleRequestError", () => {
  it("hides the message of a server error", () => {
    const response = fakeResponse();
    handleRequestError(new Error("SQLITE_ERROR: no such table: secret_table"), REQUEST, response, () => {});
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error" });
  });

  it("keeps the message of a client error", () => {
    const response = fakeResponse();
    const badJson = Object.assign(new Error("Unexpected token } in JSON"), {
      status: 400,
      expose: true,
    });
    handleRequestError(badJson, REQUEST, response, () => {});
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: "Unexpected token } in JSON" });
  });
});
