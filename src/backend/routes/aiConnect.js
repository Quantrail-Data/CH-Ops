import express from "express";
import {
  resolveTargetNode,
} from "../services/clusterUtils.js";
import { executeQuery } from "../services/clickhouse.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  setCredSession,
  getCredSessionStatus,
  clearCredSession,
  CRED_CONTEXTS,
} from "../services/chCredStore.js";

const router = express.Router();

router.post(
  "/connect",
  rateLimiter(10, 60, (req) => `connect:${req.user?.username || req.ip}`),
  async (req, res) => {
    try {
      const { clusterId, node, user, password } = req.body || {};

      if (!user)
        return res
          .status(400)
          .json({ error: "ClickHouse username is required." });

      const target = resolveTargetNode(clusterId, node);

      // Validate the credentials by running a trivial query as that user.
      await executeQuery({
        host: target.host,
        port: target.port || 8123,
        secure: !!target.secure,
        user,
        password: password ?? "",
        timeoutMs: 10000,
        sql: "SELECT 1",
      });

      setCredSession({
        jti: req.user.jti,
        context: CRED_CONTEXTS.EDITOR,
        appUser: req.user.username,
        clusterId,
        node: target.name,
        port: target.port || 8123,
        chUser: user,
        password: password ?? "",
      });
      res.json(getCredSessionStatus(req.user.jti, CRED_CONTEXTS.EDITOR));
    } catch (e) {
      res.status(e.status || 400).json({ error: e.message });
    }
  },
);

router.get("/connect", (req, res) => {
  res.json(getCredSessionStatus(req.user?.jti, CRED_CONTEXTS.EDITOR));
});

router.delete("/connect", (req, res) => {
  clearCredSession(req.user?.jti, CRED_CONTEXTS.EDITOR);
  res.json({ connected: false });
});

export default router;
