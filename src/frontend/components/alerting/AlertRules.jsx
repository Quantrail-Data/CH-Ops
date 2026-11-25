// Copyright (C) 2026 Quantrail™ Data Private Limited
// Contributors - Kathir Moorthy, Kathirdhasan, Praveen kumar
// Manages and renders the configuration rules for triggering system notification alerts.

import { useEffect, useState, useRef } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { apiFetch } from "../../utils/api.js";
import { useConnection, useAuth } from "../../App.jsx";
import ConfirmModal from "../layout/ConfirmModal.jsx";
import IconAlert from "../common/IconAlert.jsx";
import SqlEditor from "../editor/SqlEditor.jsx";
import DataTable from "../layout/DataTable.jsx";
import ToggleSwitch from "../common/ToggleSwitch.jsx";
import useEmptyContainerHeight from "../../hooks/useEmptyContainerHeight.js";
import { Button, Input, FormField, Notice } from "../ui/index.jsx";
import { Modal } from "../ui/modal.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 3 };
const SEVS = ["info", "warning", "critical"];
const OPS = [
  { k: "gt", l: "greater than" },
  { k: "gte", l: "greater than or equal" },
  { k: "lt", l: "less than" },
  { k: "lte", l: "less than or equal" },
  { k: "eq", l: "equal to" },
  { k: "neq", l: "not equal to" },
];

// Rules choose nodes by name. Nodes of one Kubernetes cluster can share one host.
function nodeName(node) {
  return node.name || node.host;
}

export default function AlertRules({ mainRef }) {
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [rules, setRules] = useState([]);
  const [channels, setChannels] = useState([]);
  const [clusterNodes, setClusterNodes] = useState([]);
  const { clusters } = useConnection();
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [del, setDel] = useState(null);
  const [result, setResult] = useState(null);
  const [cronError, setCronError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef(null);
  const formRef = useRef(null);
  const [f, setF] = useState({
    name: "",
    description: "",
    sql: "",
    threshold: 0,
    operator: "gt",
    severity: "warning",
    schedule: "*/5 * * * *",
    enabled: true,
    channel_ids: [],
    nodes: [],
    cluster_id: "",
    notifyIntervalMinutes: 0,
    breachRunsRequired: 1,
    noRowsMeansBreach: false,
    templateId: null,
  });
  const [history, setHistory] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  // Template rules disabled on this page: they stay visible until a reload.
  const [rulesKeptVisible, setRulesKeptVisible] = useState(() => new Set());
  const [showTemplateRulesThatAreOff, setShowTemplateRulesThatAreOff] =
    useState(false);
  const [testResults, setTestResults] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const testResultsRef = useRef(null);

  // calculate the Height of application main container app-main
  const { memoHeightAppMain } = useEmptyContainerHeight(900, mainRef);

  function normalizeCron(expr) {
    const parts = expr.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 4) return `0 ${parts.join(" ")}`;
    return expr.trim();
  }

  function validateCron(expr) {
    const parts = expr.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 4 && parts.length !== 5)
      return "Cron must have 4 or 5 fields";
    const normalized = parts.length === 4 ? ["0", ...parts] : parts;
    const ranges = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 6],
    ];
    const names = ["minute", "hour", "day-of-month", "month", "day-of-week"];
    for (let i = 0; i < 5; i++) {
      const p = normalized[i];
      if (p === "*") continue;
      if (p.startsWith("*/")) {
        const n = parseInt(p.slice(2));
        if (isNaN(n) || n < 1) return `Invalid step in ${names[i]}: ${p}`;
        continue;
      }
      for (const value of p.split(",")) {
        const number = Number(value);
        if (
          !Number.isInteger(number) ||
          number < ranges[i][0] ||
          number > ranges[i][1]
        )
          return `${names[i]} must be a number from ${ranges[i][0]} to ${ranges[i][1]}, or a comma list of numbers: ${value}`;
      }
    }
    return "";
  }

  async function load() {
    try {
      const r = await apiFetch("/api/alerts/rules");
      setRules(Array.isArray(r) ? r : []);
    } catch {}
    try {
      const c = await apiFetch("/api/alerts/channels");
      setChannels(Array.isArray(c) ? c : []);
    } catch {}
    setLoaded(true);
  }

  useEffect(() => {
    if (f.cluster_id) {
      const cluster = (clusters || []).find((c) => c.id === f.cluster_id);
      setClusterNodes(cluster ? cluster.nodes.map(nodeName) : []);
    } else {
      setClusterNodes(
        (clusters || []).flatMap((cluster) =>
          (cluster.nodes || []).map(nodeName),
        ),
      );
    }
  }, [f.cluster_id, clusters]);
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch("/api/alerts/templates")
      .then((templateList) =>
        setTemplates(Array.isArray(templateList) ? templateList : []),
      )
      .catch(() => setTemplates([]));
  }, [isAdmin]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        if (showTemplatePicker) {
          setShowTemplatePicker(false);
          setTemplateSearch("");
        } else if (history) {
          setHistory(null);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showTemplatePicker, history]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    load().finally(() => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        setRefreshing(false);
        refreshTimerRef.current = null;
      }, 600);
    });
  }

  function scrollFormToTop() {
    if (
      formRef.current &&
      typeof formRef.current.scrollIntoView === "function"
    ) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function resetForm() {
    setF({
      name: "",
      description: "",
      sql: "",
      threshold: 0,
      operator: "gt",
      severity: "warning",
      schedule: "*/5 * * * *",
      enabled: true,
      channel_ids: [],
      nodes: [],
      cluster_id: "",
      notifyIntervalMinutes: 0,
      breachRunsRequired: 1,
      noRowsMeansBreach: false,
      templateId: null,
    });
    setEditing(null);
    setEditingTemplateId(null);
    setTestResults(null);
    setCronError("");
  }

  function templateFormValues(template) {
    return {
      name: template.name,
      description: template.tuning
        ? `${template.description} Tuning: ${template.tuning}`
        : template.description,
      sql: template.sql,
      threshold: template.threshold,
      operator: template.operator,
      severity: template.severity,
      schedule: template.schedule,
    };
  }

  function startFromTemplate(template) {
    resetForm();
    setF((previous) => ({
      ...previous,
      ...templateFormValues(template),
      templateId: template.id,
    }));
    setEditingTemplateId(template.id);
    setShowTemplatePicker(false);
    setTemplateSearch("");
    setShowForm(true);
    setTimeout(scrollFormToTop, 0);
  }

  function unitOfTemplate(templateId) {
    const template = templates.find((item) => item.id === templateId);
    return template ? template.unit : "";
  }

  function withUnit(value, unit) {
    if (!unit) return String(value);
    if (unit === "%") return `${value}%`;
    return `${value} ${unit}`;
  }

  function resetToTemplate() {
    const template = templates.find((item) => item.id === editingTemplateId);
    if (!template) return;
    setF((previous) => ({ ...previous, ...templateFormValues(template) }));
  }

  function cancelForm() {
    resetForm();
    setShowForm(false);
  }

  async function save() {
    try {
      const selectedCluster = f.cluster_id
        ? (clusters || []).find((c) => c.id === f.cluster_id)
        : null;
      const hasZeroNodes = !!(
        selectedCluster &&
        (!Array.isArray(selectedCluster.nodes) ||
          selectedCluster.nodes.length === 0)
      );
      if (hasZeroNodes) {
        setResult({
          ok: false,
          msg: "Selected cluster has zero nodes. Choose another cluster or use All clusters.",
        });
        return;
      }

      const normalizedSchedule = normalizeCron(f.schedule);
      const cronValidationError = validateCron(normalizedSchedule);
      if (cronValidationError) {
        setCronError(cronValidationError);
        setResult({ ok: false, msg: cronValidationError });
        return;
      }

      // const checkQuery = await runQuery(f.sql, { noRowLimit: true });
      const payload = {
        ...f,
        schedule: normalizedSchedule,
        nodes: f.nodes.length > 0 ? f.nodes : null,
        cluster_id: f.cluster_id || null,
      };
      if (editing) {
        await apiFetch(`/api/alerts/rules/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setResult({ ok: true, msg: `Rule "${f.name}" updated.` });
      } else {
        await apiFetch("/api/alerts/rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setResult({ ok: true, msg: `Rule "${f.name}" created.` });
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (e) {
      setResult({
        ok: false,
        msg: e.message.includes("CRON ERROR")
          ? e.message
          : e.message.slice(0, 200) + ".....",
      });
    }
  }

  async function testQuery() {
    setTestResults(null);
    setIsTesting(true);
    try {
      const response = await apiFetch("/api/alerts/rules/test", {
        method: "POST",
        body: JSON.stringify({
          sql: f.sql,
          operator: f.operator,
          threshold: f.threshold,
          cluster_id: f.cluster_id || null,
          nodes: f.nodes,
          noRowsMeansBreach: f.noRowsMeansBreach,
        }),
      });
      setTestResults(response.results || []);
    } catch (error) {
      setResult({ ok: false, msg: error.message });
    }
    setIsTesting(false);
  }

  // Show the test results: they are below the buttons, often out of view.
  useEffect(() => {
    if (testResults)
      testResultsRef.current?.scrollIntoView?.({
        behavior: "smooth",
        block: "nearest",
      });
  }, [testResults]);

  async function remove(id) {
    try {
      await apiFetch(`/api/alerts/rules/${id}`, { method: "DELETE", body: {} });
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
    setDel(null);
  }
  async function toggleEnabled(r) {
    try {
      await apiFetch(`/api/alerts/rules/${r.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      // A template rule that is off is hidden by default. Keep the one the
      // user just disabled on the page (with its Enable button), so it does
      // not look deleted.
      if (r.templateId && r.enabled) {
        setRulesKeptVisible((ids) => new Set(ids).add(r.id));
        setResult({
          ok: true,
          msg: `"${r.name}" is disabled. After a reload, turn on "Show template rules that are off" to see it.`,
        });
      }
      load();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    }
  }

  async function getHistory(id) {
    try {
      const res = await apiFetch(`/api/alerts/rules/${id}/events`, {
        method: "GET",
      });
      setHistory(res);
    } catch {
      setHistory([]);
    }
  }

  // Rules saved before node names were used hold hosts. Each host becomes the names of its nodes.
  // A value that matches no node stays, so saving the form does not drop it.
  function ruleNodeNames(rule) {
    if (!Array.isArray(rule.nodes)) return [];
    const allClusters = clusters || [];
    const ruleCluster = allClusters.find(
      (cluster) => cluster.id === rule.cluster_id,
    );
    const nodes = rule.cluster_id
      ? ruleCluster?.nodes || []
      : allClusters.flatMap((cluster) => cluster.nodes || []);
    const names = rule.nodes.flatMap((value) => {
      if (nodes.some((node) => nodeName(node) === value)) return [value];
      const namesOfHost = nodes
        .filter((node) => node.host === value)
        .map(nodeName);
      return namesOfHost.length > 0 ? namesOfHost : [value];
    });
    // Two saved values can give the same node name. The Set removes the duplicates.
    return [...new Set(names)];
  }

  function edit(rule) {
    setF({
      name: rule.name,
      description: rule.description || "",
      sql: rule.sql,
      threshold: rule.threshold,
      operator: rule.operator,
      severity: rule.severity,
      schedule: rule.schedule,
      enabled: rule.enabled,
      channel_ids: (rule.channels || []).map((channel) => channel.id),
      nodes: ruleNodeNames(rule),
      cluster_id: rule.cluster_id || "",
      notifyIntervalMinutes: rule.notifyIntervalMinutes,
      breachRunsRequired: rule.breachRunsRequired,
      noRowsMeansBreach: rule.noRowsMeansBreach,
      templateId: rule.templateId || null,
    });
    setEditing(rule.id);
    setEditingTemplateId(rule.templateId || null);
    setTestResults(null);
    setShowForm(true);
    setCronError(validateCron(rule.schedule || ""));
    setTimeout(scrollFormToTop, 0);
  }

  const templateRulesThatAreOff = rules.filter(
    (rule) => rule.templateId && !rule.enabled,
  );
  const visibleRules = showTemplateRulesThatAreOff
    ? rules
    : rules.filter(
        (rule) =>
          !(rule.templateId && !rule.enabled) || rulesKeptVisible.has(rule.id),
      );

  const filteredTemplates = templates.filter((template) =>
    `${template.name} ${template.category} ${template.description}`
      .toLowerCase()
      .includes(templateSearch.toLowerCase()),
  );

  function isChannelSelected(chID) {
    return f?.channel_ids?.some((id) => id === chID);
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-bell-ringing"></Icon> Alert Rules
        </h2>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginLeft: "auto",
            alignItems: "center",
          }}
        >
          {/* removed the alert template eye and toggle button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh"
            style={refreshing ? { opacity: 0.6, cursor: "progress" } : {}}
          >
            <Icon
              className="ti ti-refresh"
              style={
                refreshing
                  ? { display: "inline-block", animation: "spin 0.6s linear" }
                  : {}
              }
            ></Icon>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowTemplatePicker(true)}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className="ti ti-list-check"></Icon> New from template
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            disabled={!isAdmin}
            style={!isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}}
          >
            <Icon className={`ti ${showForm ? "ti-x" : "ti-plus"}`}></Icon>{" "}
            {showForm ? "Cancel" : "New Rule"}
          </Button>
        </div>
      </div>
      {!isAdmin && (
        <Notice tone="info" icon="ti-lock" style={{ marginBottom: 14 }}>
          <span>
            Alert rules management is only available for administrators.
          </span>
        </Notice>
      )}
      {result && (
        <Notice
          tone={result.ok ? "success" : "danger"}
          icon={result.ok ? "ti-check" : "ti-alert-circle"}
          onDismiss={() => setResult(null)}
          style={{ marginBottom: 14 }}
        >
          {result.msg}
        </Notice>
      )}
      {showForm && isAdmin && (
        // Style guide Alert Rules screen: the rule editor is a modal over the
        // list. The backdrop does not close it, so a stray click cannot lose a
        // half-written rule; Escape, the close button and Cancel do.
        <Modal
          onClose={cancelForm}
          closeOnBackdrop={false}
          boxRef={formRef}
          className="modal-form"
          label={editing ? "Edit alert rule" : "New alert rule"}
        >
          <div className="modal-header">
            <div>
              <div className="modal-title">
                {editing ? "Edit alert rule" : "New alert rule"}
              </div>
              <div className="modal-subtitle">
                CHOps runs the SQL on a schedule and compares the value with the
                threshold.
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              iconOnly
              onClick={cancelForm}
              aria-label="Close"
            >
              <Icon className="ti ti-x"></Icon>
            </Button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <FormField label="Name">
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </FormField>
            <FormField label="Severity">
              <Select
                className="form-select"
                value={f.severity}
                onChange={(e) => setF({ ...f, severity: e.target.value })}
                isHigherZindex={99999}
              >
                {SEVS.map((s) => {
                  return (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  );
                })}
              </Select>
              
            </FormField>
            
            <div className="form-group">
              <label className="form-label">Schedule (cron)</label>
              <Input
                value={f.schedule}
                onChange={(e) => {
                  setF({ ...f, schedule: e.target.value });
                  setCronError(validateCron(e.target.value));
                }}
                onBlur={(e) => {
                  const normalized = normalizeCron(e.target.value);
                  setF((p) => ({ ...p, schedule: normalized }));
                  setCronError(validateCron(normalized));
                }}
                style={cronError ? { borderColor: "var(--color-danger)" } : {}}
              />
              {cronError && (
                <span
                  style={{ color: "var(--color-danger)", fontSize: "0.75rem" }}
                >
                  {cronError}
                </span>
              )}
              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                Supported: *, */n, and comma lists. Day of week is 0 to 6, and 0
                is Sunday. Schedules run in the server&apos;s timezone.
              </span>
            </div>
            <FormField label="Operator">
              <Select
                className="form-select"
                value={f.operator}
                onChange={(e) => setF({ ...f, operator: e.target.value })}
                isHigherZindex={99999}
              >
                {OPS.map((o) => (
                  <option key={o.k} value={o.k}>
                    {o.l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label={
                <>
                  Threshold
                  {unitOfTemplate(f.templateId)
                    ? ` (${unitOfTemplate(f.templateId)})`
                    : ""}
                </>
              }
            >
              <Input
                type="number"
                value={f.threshold}
                onChange={(e) =>
                  setF({ ...f, threshold: parseFloat(e.target.value) || 0 })
                }
              />
            </FormField>
            <FormField label="Notify Interval">
              <Input
                type="number"
                value={f.notifyIntervalMinutes}
                onChange={(e) =>
                  setF({
                    ...f,
                    notifyIntervalMinutes: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </FormField>
            <FormField label="Breach Run Required">
              <Input
                type="number"
                value={f.breachRunsRequired}
                onChange={(e) =>
                  setF({
                    ...f,
                    breachRunsRequired: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </FormField>
            <div
              className="form-group"
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "end",
                paddingTop: 20,
                gap: "4rem",
              }}
            >
              <ToggleSwitch
                checked={f.enabled}
                onChange={(e) => setF({ ...f, enabled: e.target.checked })}
                label="Enabled"
              />
              <ToggleSwitch
                checked={f.noRowsMeansBreach}
                onChange={(e) =>
                  setF({ ...f, noRowsMeansBreach: e.target.checked })
                }
                label="noRowsMeansBreach"
              />
            </div>
          </div>
          <FormField label="SQL (single value)" style={{ marginBottom: 14 }}>
            <div
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--input-bg)",
                overflow: "hidden",
              }}
            >
              <SqlEditor
                value={f.sql}
                onChange={(next) => setF({ ...f, sql: next })}
                variant="expression"
                height="auto"
                minHeight="4.5rem"
                maxHeight="50vh"
              />
            </div>
          </FormField>
          <FormField label="Description" style={{ marginBottom: 14 }}>
            <Input
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </FormField>
          {channels.length > 0 && (
            <FormField label="Channels" style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {channels.map((ch) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minWidth: "140px",
                      margin: "0px 5px",
                      padding: "7px 15px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      backgroundColor: !isChannelSelected(ch?.id)
                        ? "#59595910"
                        : "var(--accent)",
                      color: isChannelSelected(ch?.id)
                        ? "white"
                        : "var(--accent)",
                    }}
                    title={
                      isChannelSelected(ch?.id)
                        ? `unselected the ${ch.name} channel`
                        : `Select the ${ch.name} channel`
                    }
                    key={ch.id}
                    onClick={() => {
                      setF((p) => ({
                        ...p,
                        channel_ids: p.channel_ids.includes(ch.id)
                          ? p.channel_ids.filter((i) => i !== ch.id)
                          : [...p.channel_ids, ch.id],
                      }));
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <IconAlert
                        type={ch?.type}
                        color={
                          isChannelSelected(ch?.id) ? "white" : "var(--accent)"
                        }
                        width={20}
                      />
                      <span
                        style={{ fontSize: "0.8125rem", fontWeight: "600" }}
                      >
                        {ch.name}
                      </span>
                    </div>
                    {isChannelSelected(ch?.id) && (
                      <Icon
                        className="ti ti-x"
                        style={{ color: "white", fontSize: "0.9375rem" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </FormField>
          )}
          <FormField label="Cluster" style={{ marginBottom: 14 }}>
            <Select
              className="form-select"
              value={f.cluster_id}
              onChange={(e) =>
                setF((p) => ({ ...p, cluster_id: e.target.value, nodes: [] }))
              }
              isHigherZindex={99999}
              
            >
              <option value="">All clusters (default)</option>
              {(clusters || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          {clusterNodes.length > 0 && (
            <FormField
              label={
                <>
                  Target Nodes{" "}
                  <span
                    style={{
                      fontWeight: 400,
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    (empty = all nodes)
                  </span>
                </>
              }
              style={{ marginBottom: 14 }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {clusterNodes.map((chipNodeName) => (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      minWidth: "140px",
                      margin: "0px 5px",
                      padding: "7px 15px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      backgroundColor: !f.nodes.includes(chipNodeName)
                        ? "#59595910"
                        : "var(--accent)",
                      color: f.nodes.includes(chipNodeName)
                        ? "white"
                        : "var(--accent)",
                    }}
                    title={
                      f.nodes.includes(chipNodeName)
                        ? `Unselect node ${chipNodeName}`
                        : `Select node ${chipNodeName}`
                    }
                    key={chipNodeName}
                    onClick={() =>
                      setF((previousForm) => ({
                        ...previousForm,
                        nodes: previousForm.nodes.includes(chipNodeName)
                          ? previousForm.nodes.filter(
                              (name) => name !== chipNodeName,
                            )
                          : [...previousForm.nodes, chipNodeName],
                      }))
                    }
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                      }}
                    >
                      <IconAlert
                        type="node"
                        color={
                          f.nodes.includes(chipNodeName)
                            ? "white"
                            : "var(--accent)"
                        }
                        width={20}
                      />
                      <span
                        style={{ fontSize: "0.8125rem", fontWeight: "600" }}
                      >
                        {chipNodeName}
                      </span>
                    </div>
                    {f.nodes.includes(chipNodeName) && (
                      <Icon
                        className="ti ti-x"
                        style={{ color: "white", fontSize: "0.9375rem" }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </FormField>
          )}
          <Button
            variant="primary"
            onClick={save}
            disabled={!f.name || !f.sql || !!cronError}
          >
            <Icon className="ti ti-device-floppy"></Icon>{" "}
            {editing ? "Update" : "Create"}
          </Button>
          <Button
            variant="primary"
            onClick={testQuery}
            disabled={!f.name || !f.sql || !!cronError || isTesting}
            style={{ marginLeft: "10px" }}
          >
            <Icon className="ti ti-send"></Icon>{" "}
            {isTesting ? "Testing..." : "Test"}
          </Button>
          {editingTemplateId && (
            <Button
              variant="secondary"
              onClick={resetToTemplate}
              style={{ marginLeft: "10px" }}
            >
              <Icon className="ti ti-refresh"></Icon> Reset to template
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={cancelForm}
            style={{ marginLeft: "10px" }}
          >
            <Icon className="ti ti-x"></Icon> Cancel
          </Button>
          {testResults && (
            <table
              ref={testResultsRef}
              className="data-table"
              style={{ marginTop: 14 }}
            >
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Value</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((nodeResult) => (
                  <tr key={nodeResult.node}>
                    <td>{nodeResult.node}</td>
                    <td>
                      {nodeResult.value === null
                        ? "-"
                        : withUnit(
                            nodeResult.value,
                            unitOfTemplate(f.templateId),
                          )}
                    </td>
                    <td
                      style={{
                        color:
                          nodeResult.error || nodeResult.wouldFire
                            ? "var(--color-danger)"
                            : "var(--text-secondary)",
                      }}
                    >
                      {nodeResult.error
                        ? `Error: ${nodeResult.error}`
                        : nodeResult.wouldFire
                          ? "Would fire"
                          : nodeResult.value === null
                            ? "No rows. Would not fire."
                            : "OK. Would not fire."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
      {!loaded ? (
        <div className="empty-state">
          <p>Loading...</p>
        </div>
      ) : !isAdmin ? (
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>Alert rules management is only available for administrators.</p>
        </div>
      ) : visibleRules.length === 0 ? (
        <div
          className="empty-state"
          style={{ padding: 40, height: `${memoHeightAppMain}px` }}
        >
          <Icon
            className="ti ti-bell-plus"
            style={{ fontSize: "2.25rem" }}
          ></Icon>
          <p>No rules yet. Click New Rule.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))",
            gap: 14,
          }}
        >
          {visibleRules.map((r) => {
            const selectedCluster = r.cluster_id
              ? (clusters || []).find((c) => c.id === r.cluster_id)
              : null;
            const hasZeroNodes = !!(
              r.cluster_id &&
              (!selectedCluster ||
                !Array.isArray(selectedCluster.nodes) ||
                selectedCluster.nodes.length === 0)
            );
            const showMarquee =
              hasZeroNodes || r.isActive || r.lastStatus || r.lastError;
            const marqueeBg = hasZeroNodes
              ? "var(--color-warning-bg)"
              : r.lastError
                ? "var(--color-danger-bg)"
                : r.isActive
                  ? "var(--color-danger-bg)"
                  : "var(--color-info-bg)";
            const marqueeBorder = hasZeroNodes
              ? "var(--color-warning-border)"
              : r.lastError
                ? "var(--color-danger-border)"
                : r.isActive
                  ? "var(--color-danger-border)"
                  : "var(--color-info-border)";
            const marqueeColor = hasZeroNodes
              ? "var(--color-warning)"
              : r.lastError
                ? "var(--color-danger)"
                : r.isActive
                  ? "var(--color-danger)"
                  : "var(--text-secondary)";
            const marqueeText = hasZeroNodes
              ? "Alert warning: selected cluster has zero nodes"
              : r.lastError
                ? `Alert error: ${r.lastError}`
                : r.isActive
                  ? `Alert firing${r.lastValue != null ? ` - Current value: ${withUnit(r.lastValue, unitOfTemplate(r.templateId))}` : ""}`
                  : `Last status: ${r.lastStatus}${r.lastValue != null ? ` (${withUnit(r.lastValue, unitOfTemplate(r.templateId))})` : ""}`;
            return (
              // The card itself does not open the rule: only the Edit button
              // (and the rule name, a button) do.
              <div key={r.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong>
                    <button
                      type="button"
                      className="alert-rule-name"
                      title="Open the rule (shows the SQL)"
                      onClick={() => edit(r)}
                    >
                      {r.name}
                    </button>
                    {r.templateId && (
                      <span
                        className="badge badge-gray"
                        style={{ marginLeft: 8 }}
                        title={
                          r.templateEdited
                            ? "Made from a template, then changed"
                            : "Made from a template"
                        }
                      >
                        template
                      </span>
                    )}
                  </strong>
                  <span
                    className={`badge ${r.severity === "critical" ? "badge-red" : r.severity === "warning" ? "badge-amber" : "badge-blue"}`}
                  >
                    {r.severity}
                  </span>
                </div>
                {r.description ? (
                  <p
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                      marginBottom: 8,
                    }}
                  >
                    {r.description}
                  </p>
                ) : <p style={{
                      color: "var(--text-muted)",
                      fontSize: "0.8125rem",
                      marginBottom: 8,
                    }}>No description available.</p>}
                {showMarquee && (
                  <div
                    style={{
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      marginBottom: 10,
                      borderRadius: "var(--radius-sm)",
                      background: marqueeBg,
                      border: `1px solid ${marqueeBorder}`,
                    }}
                  >
                    {/* behavior and scrollamount are attributes of <marquee>, which the React lint list does not know. */}
                    {/* eslint-disable react/no-unknown-property */}
                    <marquee
                      behavior="scroll"
                      direction="left"
                      scrollamount="4"
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.8125rem",
                        color: marqueeColor,
                      }}
                    >
                      {marqueeText}
                    </marquee>
                    {/* eslint-enable react/no-unknown-property */}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: "0.8125rem",
                    color: "var(--text-secondary)",
                    marginBottom: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Fires when value is{" "}
                    {OPS.find((o) => o.k === r.operator)?.l || r.operator}{" "}
                    {withUnit(r.threshold, unitOfTemplate(r.templateId))}
                  </span>
                  <span>
                    <Icon className="ti ti-clock"></Icon> {r.schedule}
                  </span>
                  <span>
                    {r.enabled ? (
                      <span className="badge badge-green">Enabled</span>
                    ) : (
                      <span className="badge badge-gray">Disabled</span>
                    )}
                  </span>
                  {r.isActive && !hasZeroNodes && (
                    <span className="badge badge-red">FIRING</span>
                  )}
                  {hasZeroNodes && (
                    <span className="badge badge-amber">NO NODES</span>
                  )}
                  {(!r.channels || r.channels.length === 0) && (
                    <span
                      className="badge badge-red"
                      title="This rule will not notify anyone"
                    >
                      NO CHANNELS
                    </span>
                  )}
                  {Array.isArray(r.nodes) && r.nodes.length > 0 && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Icon
                        className="ti ti-server"
                        style={{ fontSize: "0.875rem" }}
                      ></Icon>{" "}
                      {r.nodes.join(", ")}
                    </span>
                  )}
                  <span
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    <Icon
                      className="ti ti-topology-star-ring-3"
                      style={{ fontSize: "0.875rem" }}
                    ></Icon>{" "}
                    {r.cluster_id
                      ? (clusters || []).find((c) => c.id === r.cluster_id)
                          ?.name || r.cluster_id
                      : "All clusters"}
                  </span>
                </div>
                {(r.lastStatus || hasZeroNodes) && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginBottom: 8,
                    }}
                  >
                    {hasZeroNodes
                      ? "Last: warning (selected cluster has zero nodes)"
                      : `Last: ${r.lastStatus} ${r.lastValue != null ? `(${withUnit(r.lastValue, unitOfTemplate(r.templateId))})` : ""}${r.lastRunAt ? ` at ${new Date(r.lastRunAt).toLocaleString()}` : ""}`}
                    {r.lastError ? (
                      <span style={{ color: "var(--color-danger)" }}>
                        {" "}
                        {r.lastError}
                      </span>
                    ) : (
                      ""
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label="Edit rule"
                    title="Edit rule"
                    onClick={() => edit(r)}
                    disabled={!isAdmin}
                    style={
                      !isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}
                    }
                  >
                    <Icon className="ti ti-edit"></Icon>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => toggleEnabled(r)}
                    disabled={!isAdmin}
                    style={
                      !isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}
                    }
                  >
                    <Icon
                      className={`ti ${r.enabled ? "ti-player-pause" : "ti-player-play"}`}
                    ></Icon>{" "}
                    {r.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    aria-label="Delete rule"
                    title="Delete rule"
                    onClick={() => isAdmin && setDel(r.id)}
                    disabled={!isAdmin}
                    style={
                      !isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}
                    }
                  >
                    <Icon className="ti ti-trash"></Icon>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    title="History"
                    aria-label="History"
                    onClick={() => getHistory(r.id)}
                    disabled={!isAdmin}
                    style={
                      !isAdmin ? { opacity: 0.35, cursor: "not-allowed" } : {}
                    }
                  >
                    <Icon className="ti ti-clock"></Icon>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {history && (
        <Modal
          style={{
            maxWidth: 800,
            maxHeight: "min(40rem, 90vh)",
            padding: "2px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              margin: "1rem",
            }}
          >
            <h2 className="section-title" style={{ fontSize: "1.125rem" }}>
              <Icon className="ti ti-clock"></Icon> History
            </h2>
            <div onClick={() => setHistory(null)}>
              <Icon className="ti ti-x" />
            </div>
          </div>

          <DataTable rows={history} allowFullscreen={false} />
        </Modal>
      )}

      {showTemplatePicker && isAdmin && (
        <Modal
          overlayStyle={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "24px 16px",
            overflowY: "auto",
          }}
          style={{
            maxWidth: "min(800px, 100%)",
            width: "100%",
            height: "min(40rem, calc(100vh - 48px))",
            maxHeight: "calc(100vh - 48px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
              flexShrink: 0,
            }}
          >
            <h2 className="section-title" style={{ fontSize: "1.125rem" }}>
              <Icon className="ti ti-list-check"></Icon> New from template
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowTemplatePicker(false);
                setTemplateSearch("");
              }}
            >
              <Icon className="ti ti-x" />
            </Button>
          </div>
          <Input
            placeholder="Search templates"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            style={{ marginBottom: 12, flexShrink: 0 }}
          />
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {filteredTemplates.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  fontSize: "0.875rem",
                  gap: 8,
                }}
              >
                <Icon
                  className="ti ti-list-search"
                  style={{ fontSize: "2.25rem", opacity: 0.4 }}
                />
                <span>No Alert Templates Available</span>
                {templateSearch && (
                  <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
                    No templates match &ldquo;{templateSearch}&rdquo;
                  </span>
                )}
              </div>
            ) : (
              filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="card"
                  onClick={() => startFromTemplate(template)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 12,
                    marginBottom: 8,
                    cursor: "pointer",
                    color: "var(--text-muted)",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <strong>{template.name}</strong>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {template.category}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      marginTop: 4,
                    }}
                  >
                    {template.description}
                  </div>
                  <div style={{ fontSize: "0.75rem", marginTop: 4 }}>
                    Fires when the value is{" "}
                    {template.operator === "gt" ? "above" : "below"}{" "}
                    {withUnit(template.threshold, template.unit)}. Severity:{" "}
                    {template.severity}.
                  </div>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {del && isAdmin && (
        <ConfirmModal
          title="Delete Rule"
          message="Delete this alert rule?"
          onConfirm={() => remove(del)}
          onCancel={() => setDel(null)}
          danger
        />
      )}
    </div>
  );
}
