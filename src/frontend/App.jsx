// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Main application entry point managing global state, theme providers, and top-level routing layouts.

import React, { useState, useEffect, createContext, useContext } from "react";
import { setGlobalConnection, getActiveApiKey, logoutRequest } from "./utils/api.js";
import useIdleTimeout from "./hooks/useIdleTimeout.js";
import LoginPage from "./components/layout/LoginPage.jsx";
import MainLayout from "./components/layout/MainLayout.jsx";

export const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

export const ThemeContext = createContext(null);
export function useTheme() {
  return useContext(ThemeContext);
}

export const ConnectionContext = createContext(null);
export function useConnection() {
  return useContext(ConnectionContext);
}

export const QuriozChatContext = createContext(null);
export function useQuriozChatContext() {
  return useContext(QuriozChatContext);
}

const ContextChatKey = import.meta.env.VITE_QURIOZ_KEY;
export default function App() {
  // Auth
  const [auth, setAuth] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chops_session") || "null");
    } catch {
      return null;
    }
  });

  // chat storage context
  // Always resolve stored chat to an array: a legacy or corrupted value that
  // parses to a non-array (object/null) otherwise makes .map/.filter throw
  // ("quriozMessage.map is not a function").
  const readStoredChat = () => {
    try {
      const v = JSON.parse(localStorage.getItem(ContextChatKey) || "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const [quriozMessage, setQuriozMessage] = useState(readStoredChat);

  function QURIOZLENGTH() {
    return quriozMessage?.length;
  }

  const isNewChat = () => quriozMessage?.length === 0;

  const insertMessage = (message) => {
    if (message) {
      const messages = [...readStoredChat(), message];
      setQuriozMessage(messages);
      localStorage.setItem(ContextChatKey, JSON.stringify(messages));
    }
  };

  const deleteAllChatMessage = () => {
    setQuriozMessage([]);
    localStorage.setItem(ContextChatKey, JSON.stringify([]));
  };

  const replaceChat = (message) => {
    if (message) {
      const messages = readStoredChat().map((msg) =>
        msg?.id === message?.id ? message : msg,
      );
      setQuriozMessage(messages);
      localStorage.setItem(ContextChatKey, JSON.stringify(messages));
    }
  };

  useEffect(() => {
    const chat = localStorage.getItem(ContextChatKey);
    if (!chat) {
      localStorage.setItem(ContextChatKey, JSON.stringify([]));
    } else {
      setQuriozMessage(readStoredChat());
    }
  }, [auth]);

  async function loadActiveApiKey() {
    try {
      const activeKey = await getActiveApiKey();
      if (activeKey) {
        setGlobalConnection({
          apiKey: activeKey.key,
          apiKeyName: activeKey.name,
        });
      }
    } catch (err) {
      console.error("No active API key found");
    }
  }

  useEffect(() => {
    if (auth) {
      loadActiveApiKey();
    }
  }, [auth]);

  function login(data) {
    setAuth(data);
    localStorage.setItem("chops_session", JSON.stringify(data));
  }
  async function logout() {
    // Revoke server-side while the JWT is still present (apiFetch injects it),
    // which clears this login's encrypted ClickHouse credential sessions. Then
    // drop the token and navigate.
    await logoutRequest();
    localStorage.removeItem("chops_session");
    setAuth(null);
    window.location.href = "/";
  }

  // Sliding inactivity logout (default 15 min). Only armed while logged in; any
  // user activity resets the window. This sits on top of the server's absolute
  // 2-hour token expiry, it does not replace it.
  useIdleTimeout({ enabled: !!auth, onIdle: logout });

  // Theme
  const [themeMode, setThemeMode] = useState(
    () => localStorage.getItem("chops_theme") || "dark",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeMode);
    localStorage.setItem("chops_theme", themeMode);
  }, [themeMode]);
  function toggleTheme() {
    setThemeMode((t) => (t === "dark" ? "light" : "dark"));
  }

  // Connection (multi-cluster)
  const [connection, setConnectionState] = useState({
    clusters: [],
    selectedClusterId: "",
    nodes: [],
    selectedNode: "",
    nodeName: "",
    user: "",
    password: "",
    port: 8123,
    connected: false,
    error: null,
    clusterName: "",
  });



  // Keep global connection store in sync
  function setConnection(updater) {
    setConnectionState((prev) => {
      const next =
        typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      setGlobalConnection({
        node: next.selectedNode,
        nodeName: next.nodeName,
        user: next.user,
        password: next.password,
        port: next.port,
        clusterId: next.selectedClusterId,
        connected:true
      });
      return next;
    });
  }

  // Load all clusters from backend
  function loadConfig(token) {
    fetch("/api/config/connection", {
      headers: { Authorization: `Bearer ${token || auth?.token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const clusters = data.clusters || [];
        setConnection((prev) => {
          // Pick the saved cluster or fall back to first
          const savedClusterId = localStorage.getItem("chops_cluster") || "";
          const savedNodename = localStorage.getItem("chops_nodename") || "";

          const cluster =
            clusters.find((c) => c.id === savedClusterId) || clusters[0];
          const nodes = cluster?.nodes || [];

          const first =
            nodes?.filter((n) => n?.name === savedNodename).at(0) ||
            nodes[0] ||
            {};

          // Keep current node selection if it still exists in the selected cluster
          const currentHost = prev.selectedNode;
          const stillExists = nodes.find((n) => n.host === currentHost);
  
          return {
            ...prev,
            connected: nodes?.length > 0 ? true : false,
            clusters,
            selectedClusterId: cluster?.id || "",
            nodeName: first.name,
            clusterName: cluster?.name || "",
            nodes,
            ...(stillExists
              ? {}
              : {
                  selectedNode: first.host || "",
                  user: first.user || "default",
                  password: first.password || "",
                  port: first.port || 8123,
                }),
          };
        });

        const savedNodename = localStorage.getItem("chops_nodename") || "";

        // Auto-connect on initial load
        const cluster =
          clusters.find(
            (c) => c.id === (localStorage.getItem("chops_cluster") || ""),
          ) || clusters[0];

        const first =
          cluster?.nodes?.filter((n) => n?.name === savedNodename).at(0) ||
          nodes[0] ||
          {};


        if (!connection.connected && first?.host) {
          testConn(
            first.host,
            first.user,
            first.password,
            first.port,
            token,
            cluster?.id,
          );
        }
      })
      .catch(() => {
        return {
          clusters: [],
          selectedClusterId: "",
          nodes: [],
          selectedNode: "",
          nodeName: "",
          user: "",
          password: "",
          port: 8123,
          connected: false,
          error: null,
          clusterName: "",
        };
      });
  }

  useEffect(() => {
    if (!auth) return;
    loadConfig(auth.token);
  }, [auth]);

  // Switch active cluster
  function switchCluster(clusterId) {
    setConnection((prev) => {
      const cluster = prev.clusters.find((c) => c.id === clusterId);

      if (!cluster) return prev;

      const nodes = cluster.nodes || [];

      const first = nodes[0] || {};

      localStorage.setItem("chops_cluster", clusterId);
      localStorage.setItem("chops_nodename", first?.name);
      return {
        ...prev,
        selectedClusterId: clusterId,
        clusterName: cluster.name || "",
        nodeName: first.name,
        nodes,
        selectedNode: first.host || "",
        user: first.user || "default",
        password: first.password || "",
        port: first.port || 8123,
        connected: Object?.keys(first)?.length > 0 ? true : false,
        error: null,
      };
    });
  }

  async function testConn(host, user, password, port, token, clusterId) {
    try {
      const cid = clusterId || connection.selectedClusterId;
      const res = await fetch("/api/query/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || auth?.token}`,
        },
        body: JSON.stringify({
          node: host,
          user,
          password,
          port,
          clusterId: cid,
        }),
      });
      const data = await res.json();
      setConnection((prev) => ({
        ...prev,
        connected: data.ok,
        error: data.ok ? null : data.message,
      }));
      return data;
    } catch (err) {
      setConnection((prev) => ({
        ...prev,
        connected: false,
        error: err.message,
      }));
      return { ok: false, message: err.message };
    }
  }

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      <QuriozChatContext.Provider
        value={{
          replaceChat,
          quriozMessage,
          insertMessage,
          deleteAllChatMessage,
          isNewChat,
          QURIOZLENGTH,
        }}
      >
        <ThemeContext.Provider value={{ theme: themeMode, toggleTheme }}>
          <ConnectionContext.Provider
            value={{
              ...connection,
              setConnection,
              testConnection: testConn,
              reloadConfig: () => loadConfig(),
              switchCluster,
            }}
          >
            {auth ? <MainLayout /> : <LoginPage />}
          </ConnectionContext.Provider>
        </ThemeContext.Provider>
      </QuriozChatContext.Provider>
    </AuthContext.Provider>
  );
}
