import React, { useState, useEffect } from "react";
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import {
  apiFetch,
  setGlobalConnection,
  getActiveApiKey,
} from "../../utils/api.js";
import { useToast } from "../layout/Toast.jsx";
import { useAuth } from "../../App.jsx";

const ROLE_LEVEL = { readonly: 0, editor: 1, admin: 2, superadmin: 4 };
const AI_PROVIDERS = ["GEMINI", "OPEN AI", "MISTRAL", "CLAUDE", "OLLAMA"];

export default function ApiManagement() {
  const toast = useToast();
  const { auth } = useAuth();
  const myRole = auth?.role || "readonly";
  const myLevel = ROLE_LEVEL[myRole] || 0;
  const isAdmin = myLevel >= ROLE_LEVEL.admin;
  const [apiKeys, setApiKeys] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formAPIName, setFormAPIName] = useState("");
  const [formAIProvider, setFormAIProvider] = useState("");
  const [formKeyValue, setFormKeyValue] = useState("");
  const [formModelValue, setFormModelValue] = useState("");
  const [ollamaModels, setOllamaModels] = useState([]);
  const [isFetchingOllamaModels, setIsFetchingOllamaModels] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({
    show: false,
    keyId: null,
    keyName: "",
  });
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [isValidKey, setISvalidKey] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  const [keyValidationMessage, setKeyValidationMessage] = useState("");
  const [keyValidationStatus, setKeyValidationStatus] = useState(null); // 'success' | 'error' | null

  const isOllama = formAIProvider === "OLLAMA";

  useEffect(() => {
    loadApiKeys();

    const handleEscape = (e) => {
      if (e.key === "Escape" && deleteConfirm.show) {
        cancelDelete();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [deleteConfirm.show]);

  useEffect(() => {
    const detectDarkMode = () => {
      if (typeof document !== "undefined") {
        const html = document.documentElement;
        const body = document.body;
        const htmlTheme =
          html && html.getAttribute && html.getAttribute("data-theme");
        const bodyTheme =
          body && body.getAttribute && body.getAttribute("data-theme");
        if (htmlTheme === "dark" || bodyTheme === "dark") return true;
        if (htmlTheme === "light" || bodyTheme === "light") return false;
        if (html && html.classList && html.classList.contains("dark"))
          return true;
        if (body && body.classList && body.classList.contains("dark"))
          return true;
        if (html && html.classList && html.classList.contains("light"))
          return false;
        if (body && body.classList && body.classList.contains("light"))
          return false;
        try {
          const stored = window.localStorage
            ? window.localStorage.getItem("theme")
            : null;
          if (stored === "dark") return true;
          if (stored === "light") return false;
        } catch (e) {}
      }
      if (typeof window !== "undefined" && window.matchMedia) {
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
      }
      return false;
    };

    setIsDarkMode(detectDarkMode());

    let mq;
    const mqHandler = () => setIsDarkMode(detectDarkMode());

    if (typeof window !== "undefined" && window.matchMedia) {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) {
        mq.addEventListener("change", mqHandler);
      } else if (mq.addListener) {
        mq.addListener(mqHandler);
      }
    }

    const observer =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => setIsDarkMode(detectDarkMode()))
        : null;
    if (observer && typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
      if (document.body)
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ["class", "data-theme"],
        });
    }

    return () => {
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener("change", mqHandler);
        else if (mq.removeListener) mq.removeListener(mqHandler);
      }
      if (observer) observer.disconnect();
    };
  }, []);

  async function loadApiKeys() {
    try {
      setLoading(true);
      const response = await apiFetch("/api/qurioz/api-keys");
      if (response && response.apiKeys) {
        setApiKeys(response.apiKeys);
        setSelectedKeyId(response.selectedKeyId);
      }
    } catch (err) {
      if (err.message !== "Not found") {
        toast.error("Failed to load API keys: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function fetchKeyValue(keyId) {
    try {
      const response = await apiFetch(`/api/qurioz/api-keys/${keyId}/value`);
      return response.keyValue;
    } catch (err) {
      toast.error("Failed to load key value: " + err.message);
      return "";
    }
  }

  async function updateGlobalActiveKey() {
    try {
      const activeKey = await getActiveApiKey();
      if (activeKey) {
        setGlobalConnection({
          apiKey: activeKey.key,
          apiKeyName: activeKey.name,
        });
      } else {
        setGlobalConnection({
          apiKey: null,
          apiKeyName: null,
        });
      }
    } catch (err) {
      console.log("Failed to update global API key");
    }
  }

  function validateApiKey(keyValue) {
    if (isOllama) {
      try {
        const url = new URL(keyValue.trim());
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    } else if (keyValue.startsWith("sk-")) {
      return keyValue.length >= 20 && keyValue.length <= 500;
    } else if (keyValue.startsWith("AIza")) {
      return keyValue.length >= 35 && keyValue.length <= 200;
    } else if (keyValue.startsWith("xai-")) {
      return keyValue.length >= 20 && keyValue.length <= 500;
    } else if (keyValue.startsWith("hf_")) {
      return keyValue.length >= 20 && keyValue.length <= 500;
    } else {
      return keyValue.length >= 20 && keyValue.length <= 500;
    }
  }

  function getApiTypeMessage(keyValue) {
    if (isOllama) return "Ollama base URL";
    if (keyValue.startsWith("sk-")) return "OpenAI API key";
    if (keyValue.startsWith("AIza")) return "Google Gemini API key";
    if (keyValue.startsWith("xai-")) return "X.AI API key";
    if (keyValue.startsWith("hf_")) return "Hugging Face API key";
    return "Generic API key";
  }

  function isDuplicateName(name, excludeId = null) {
    return apiKeys.some(
      (key) =>
        key.name.toLowerCase() === name.trim().toLowerCase() &&
        key.id !== excludeId,
    );
  }

  async function checkDuplicateValue(value, excludeId = null) {
    try {
      const response = await apiFetch("/api/qurioz/api-keys/with-values");
      if (response && response.apiKeys) {
        const duplicate = response.apiKeys.some(
          (key) => key.key === value.trim() && key.id !== excludeId,
        );
        return duplicate;
      }
    } catch (err) {
      console.log("Failed to check duplicate values");
    }
    return false;
  }

  async function saveApiKey(e) {
    e.preventDefault();
    if (!formAPIName.trim()) {
      toast.warning("Please enter an API key name");
      return;
    }
    if (formAPIName.length > 100) {
      toast.warning("API key name must not exceed 100 characters");
      return;
    }
    if (!formKeyValue.trim()) {
      toast.warning("Please enter an API key");
      return;
    }
    if (formKeyValue.length > 500) {
      toast.warning("API key must not exceed 500 characters");
      return;
    }


    const isDuplicateNameCheck = isDuplicateName(
      formAPIName.trim(),
      editingKey?.id,
    );
    if (isDuplicateNameCheck) {
      if (editingKey) {
        toast.warning(
          `Cannot update: API key name "${formAPIName.trim()}" already exists`,
        );
      } else {
        toast.warning(
          `Cannot create: API key name "${formAPIName.trim()}" already exists`,
        );
      }
      return;
    }

    // const isDuplicateValueCheck = await checkDuplicateValue(
    //   formKeyValue.trim(),
    //   editingKey?.id,
    // );
    // if (isDuplicateValueCheck) {
    //   if (editingKey) {
    //     toast.warning(
    //       `Cannot update: This API key value already exists for another key`,
    //     );
    //   } else {
    //     toast.warning(`Cannot create: This API key value already exists`);
    //   }
    //   return;
    // }

    try {
      if (editingKey) {
        await apiFetch(`/api/qurioz/api-keys/${editingKey.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name:formAPIName.trim(),
            provider: formAIProvider.trim(),
            apiKey: formKeyValue.trim(),
            model: formModelValue.trim(),
          }),
        });

        toast.success("API key updated successfully");
      } else {
        await apiFetch("/api/qurioz/api-keys", {
          method: "POST",
          body: JSON.stringify({
            name:formAPIName.trim(),
            provider: formAIProvider.trim(),
            apiKey: formKeyValue.trim(),
            model: formModelValue.trim(),
          }),
        });

        toast.success("API key added successfully");
      }
      setFormAPIName("")
      setFormAIProvider("");
      setFormKeyValue("");
      setFormModelValue("");
      setIsEditing(false);
      setEditingKey(null);
      setShowAddForm(false);
      setShowKey(false);
      await loadApiKeys();
      await updateGlobalActiveKey();
    } catch (err) {
      toast.error("Failed to save API key: " + err.message);
    } finally {
      setISvalidKey(false);
      setKeyValidationMessage("");
      setKeyValidationStatus(null);
      setOllamaModels([]);
    }
  }

  async function selectActiveKey(keyId) {
    try {
      await apiFetch("/api/qurioz/api-keys/select", {
        method: "POST",
        body: JSON.stringify({ keyId }),
      });

      toast.success("Active API key changed");
      await loadApiKeys();
      await updateGlobalActiveKey();
    } catch (err) {
      toast.error("Failed to select API key: " + err.message);
    }
  }

  function confirmDelete(keyId, keyName) {
    setDeleteConfirm({ show: true, keyId, keyName });
  }

  async function handleDeleteConfirm() {
    try {
      await apiFetch(`/api/qurioz/api-keys/${deleteConfirm.keyId}`, {
        method: "DELETE",
      });

      toast.success(`API key "${deleteConfirm.keyName}" removed successfully`);
      setDeleteConfirm({ show: false, keyId: null, keyName: "" });
      await loadApiKeys();
      await updateGlobalActiveKey();
    } catch (err) {
      toast.error("Failed to remove API key: " + err.message);
      setDeleteConfirm({ show: false, keyId: null, keyName: "" });
    }
  }

  function cancelDelete() {
    setDeleteConfirm({ show: false, keyId: null, keyName: "" });
  }

  async function editKey(key) {
    setEditingKey(key);
    setFormAIProvider(key.name);
    setFormModelValue(key?.model);
    setFormKeyValue("");
    setIsEditing(true);
    setShowAddForm(true);
    setShowKey(false);
    setKeyValidationMessage("");
    setKeyValidationStatus(null);
    setOllamaModels([]);
    const keyValue = await fetchKeyValue(key.id);
    setFormKeyValue(keyValue);
  }

  function cancelEdit() {
    setIsEditing(false);
    setEditingKey(null);
    setFormAIProvider("");
    setFormKeyValue("");
    setFormModelValue("");
    setShowAddForm(false);
    setShowKey(false);
    setKeyValidationMessage("");
    setKeyValidationStatus(null);
    setOllamaModels([]);
  }

  function startAddNew() {
    if (apiKeys.length >= 5) {
      toast.warning("Maximum 4 API keys allowed");
      return;
    }
    setShowAddForm(true);
    setIsEditing(false);
    setEditingKey(null);
    setFormAIProvider("");
    setFormKeyValue("");
    setFormModelValue("");
    setOllamaModels([]);
    setShowKey(false);
    setKeyValidationMessage("");
    setKeyValidationStatus(null);
  }

  function maskApiKey(key) {
    if (!key) return "";
    if (key.startsWith("AIza")) {
      if (key.length <= 40) {
        return (
          key.substring(0, 10) +
          "••••••••••••••••••••" +
          key.substring(key.length - 6)
        );
      }
      return (
        key.substring(0, 10) +
        "•••••••••••••••••••••••••••" +
        key.substring(key.length - 6)
      );
    }
    if (key.startsWith("sk-")) {
      return (
        key.substring(0, 8) +
        "•••••••••••••••••••••••••••" +
        key.substring(key.length - 4)
      );
    }
    if (key.length <= 30) {
      return "•".repeat(20);
    }
    return "•".repeat(30);
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="empty-state" style={{ padding: 40 }}>
          <div className="loading-spinner"></div> Loading...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-content">
        <div className="section-header">
          <h2 className="section-title">
            <Icon className="ti ti-ai"></Icon>
            API Key Management
          </h2>
        </div>
        <div className="alert-banner info" style={{ marginBottom: 14 }}>
          <Icon className="ti ti-lock"></Icon>
          <span>API key management is only available for administrators.</span>
        </div>
        <div className="empty-state">
          <Icon className="ti ti-lock"></Icon>
          <p>API key management is only available for administrators.</p>
        </div>
      </div>
    );
  }

  const themeStyles = {
    light: {
      overlay: "rgba(0, 0, 0, 0.25)",
      modalBg: "#ffffff",
      modalBorder: "1px solid #e5e7eb",
      modalText: "#111827",
      titleText: "#111827",
      paragraphText: "#374151",
      cancelBtnBg: undefined,
      cancelBtnColor: undefined,
      cancelBtnBorder: undefined,
      modalBoxShadow:
        "0 12px 18px -8px rgba(2,6,23,0.08), 0 8px 12px -8px rgba(2,6,23,0.06)",
    },
    dark: {
      overlay: "rgba(2,6,23,0.6)",
      modalBg: "#0b1220",
      modalBorder: "1px solid rgba(255,255,255,0.04)",
      modalText: "#E6EEF8",
      titleText: "#F9FAFB",
      paragraphText: "#D1D5DB",
      cancelBtnBg: "rgba(255,255,255,0.03)",
      cancelBtnColor: "#E6EEF8",
      cancelBtnBorder: "1px solid rgba(255,255,255,0.06)",
      modalBoxShadow:
        "0 20px 25px -5px rgba(2,6,23,0.6), 0 10px 10px -5px rgba(2,6,23,0.5)",
    },
  };

  const current = isDarkMode ? themeStyles.dark : themeStyles.light;

  const modalInnerStyle = {
    backgroundColor: current.modalBg,
    borderRadius: "12px",
    padding: "24px",
    maxWidth: "600px",
    width: "90%",
    boxShadow: current.modalBoxShadow,
    border: current.modalBorder,
    color: current.modalText,
  };

  const modalTitleStyle = {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "12px",
    color: current.titleText,
  };

  const modalParagraphStyle = {
    fontSize: "15px",
    color: current.paragraphText,
    marginBottom: "24px",
  };

  const cancelButtonStyle = {
    padding: "8px 16px",
    backgroundColor: current.cancelBtnBg,
    color: current.cancelBtnColor,
    border: current.cancelBtnBorder,
    borderRadius: "8px",
  };

  function ModelExamplesPlaceholder(proName) {
    switch (proName) {
      case "GEMINI":
        return "e.g., Model name  gemini-2.5-flash, gemini-3.5-flash";
      case "OPEN AI":
        return "e.g., Model name  GPT-5.4 mini, GPT-5.4-nano";
      case "CLAUDE":
        return "e.g., Model name  claude-haiku-4-5, claude-sonnet-4-6,...";
      case "MISTRAL":
        return "e.g., Model name  mistral-large-latest, mistral-medium-latest,...";
      case "OLLAMA":
        return "e.g., Model name  llama3.2:latest, mistral:latest,...";
      default:
        return "Enter the model name!";
    }
  }

  async function fetchOllamaModels(e) {
    e.preventDefault();
    if (!formKeyValue.trim()) {
      toast.warning("Enter the Ollama base URL first");
      return;
    }
    setIsFetchingOllamaModels(true);
    setOllamaModels([]);
    try {
      const response = await apiFetch("/api/qurioz/api-keys/ollama/models", {
        method: "POST",
        body: JSON.stringify({ baseUrl: formKeyValue.trim() }),
      });
      if (response?.success && Array.isArray(response.models)) {
        setOllamaModels(response.models);
        if (response.models.length === 0) {
          toast.warning(
            "No models found on this Ollama server. Pull a model first (e.g. `ollama pull llama3.2`).",
          );
        } else {
          toast.success(`Found ${response.models.length} model(s).`);
        }
      } else {
        toast.error(response?.message || "Failed to fetch models from Ollama.");
      }
    } catch (err) {
      toast.error(err?.message || "Failed to fetch models from Ollama.");
    } finally {
      setIsFetchingOllamaModels(false);
    }
  }

  async function verifyAPIKeyHandler(e) {
    e.preventDefault();
    setISvalidKey(false)
    setKeyValidationMessage("");
    setKeyValidationStatus(null);
    if (formAIProvider.trim() && formKeyValue.trim() && formModelValue.trim()) {
      const apiKeys = {
        name: formAIProvider.trim(),
        apiKey: formKeyValue?.trim(),
        model: formModelValue?.trim(),
      };
      setIsLoadingKey(true);
      try {
        const response = await apiFetch("/api/qurioz/api-keys/check", {
          method: "POST",
          body: JSON.stringify({ apiKeys }),
        });

        if (!response?.success) {
          setISvalidKey(false);
          const reason =
            response?.message && response.message !== "failed"
              ? response.message
              : "API key validation failed. Please verify your API key and try again.";
          setKeyValidationStatus("error");
          setKeyValidationMessage(reason);
          toast?.error(reason);
          return;
        }
        setISvalidKey(true);
        const successMessage = `API key verified successfully. You can now ${editingKey ? 'update' : 'add'} it.`;
        setKeyValidationStatus("success");
        setKeyValidationMessage(successMessage);
        toast?.success(successMessage)
        return;
      } catch (err) {
        setISvalidKey(false);
        const reason = err?.message || "API key validation failed. Please verify your API key and try again.";
        setKeyValidationStatus("error");
        setKeyValidationMessage(reason);
        toast?.error(reason);
        return;
      } finally {
        setIsLoadingKey(false);
      }
    } else {
      toast?.warning(`Some required fields are missing.`);
    }
  }

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-ai"></Icon>
          API Key Management
        </h2>
      </div>

      <div className="card" style={{ maxWidth: 720, padding: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: 8,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon
              className="ti ti-brand-openai"
              style={{ color: "var(--accent)" }}
            ></Icon>
            Qurioz API Key Manager
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              marginBottom: 0,
            }}
          >
            Configure up to 4 API keys for AI-powered query assistance and
            insights. Supports OpenAI, Google Gemini, Mistral, Claude
          </p>
        </div>

        {apiKeys.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <label className="form-label" style={{ marginBottom: 12 }}>
              Saved API Keys ({apiKeys.length}/3)
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px",
                    backgroundColor: "var(--bg-secondary)",
                    borderRadius: "8px",
                    border:
                      selectedKeyId === key.id
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                        flexWrap: "wrap",
                      }}
                    >
                      {selectedKeyId === key.id && (
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 6px",
                            backgroundColor: "var(--accent)",
                            color: "white",
                            borderRadius: "4px",
                          }}
                        >
                          Active
                        </span>
                      )}
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {key.name}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-code)",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginLeft: "4px",
                        }}
                      >
                        (••••••••••••••••)
                      </span>
                    </div>
                    <div
                      style={{ fontSize: "11px", color: "var(--text-muted)" }}
                    >
                      Added: {new Date(key.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginLeft: 12 }}>
                    {selectedKeyId !== key.id && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => selectActiveKey(key.id)}
                        title="Set as active"
                      >
                        <Icon className="ti ti-check"></Icon>
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => editKey(key)}
                      title="Edit key"
                    >
                      <Icon className="ti ti-edit"></Icon>
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => confirmDelete(key.id, key.name)}
                      title="Delete key"
                    >
                      <Icon className="ti ti-trash"></Icon>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAddForm ? (
          <form>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">
                Name{" "}
                <span style={{ color: "var(--danger)" }}>*</span>
              </label>
                <input
                  className="form-input"
                  type="text"
                  value={formAPIName}
                  onChange={(e) => setFormAPIName(e.target.value)}
                  placeholder="Enter the Name"
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    fontSize: "14px",
                  }}
                />
            </div>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">
                AI Provider <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <Select
                className="form-input"
                onChange={(e) => setFormAIProvider(e?.target?.value)}
                value={formAIProvider || ""}
                style={{
                  width: "100%",
                  maxWidth: 520,
                  fontSize: "14px",
                }}
              >
                <option value={""} selected>
                  Select AI Provider
                </option>
                {AI_PROVIDERS.map((name, index) => {
                  return (
                    <option value={name} key={index}>
                      {name}
                    </option>
                  );
                })}
              </Select>
            </div>


            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">
                {formAIProvider} Model Name{" "}
                <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              {isOllama ? (
                <Select
                  className="form-input"
                  value={formModelValue || ""}
                  onChange={(e) => setFormModelValue(e?.target?.value)}
                  placeholder="Fetch models to choose one"
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    fontSize: "14px",
                  }}
                >
                  <option value="">Select a model</option>
                  {ollamaModels.map((m, index) => (
                    <option value={m} key={index}>
                      {m}
                    </option>
                  ))}
                </Select>
              ) : (
                <input
                  className="form-input"
                  type="text"
                  value={formModelValue}
                  onChange={(e) => setFormModelValue(e.target.value)}
                  placeholder={`${ModelExamplesPlaceholder(formAIProvider)}`}
                  required
                  autoFocus
                  style={{
                    width: "100%",
                    maxWidth: 520,
                    fontSize: "14px",
                  }}
                />
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">
                {isOllama
                  ? "Ollama Base URL"
                  : editingKey
                    ? "Edit API Key Value"
                    : "API Key Value"}{" "}
                <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  maxWidth: "520px",
                  gap: "10px",
                }}
              >
                <div
                  style={{ position: "relative", width: "100%", maxWidth: 520 }}
                >
                  <input
                    className="form-input"
                    type={isOllama ? "text" : showKey ? "text" : "password"}
                    value={formKeyValue}
                    onChange={(e) => setFormKeyValue(e.target.value)}
                    placeholder={
                      isOllama
                        ? "http://localhost:11434"
                        : "Enter your API key (OpenAI: sk-..., Gemini: AIza..., X.AI: xai-..., HF: hf_...)"
                    }
                    required
                    style={{
                      width: "100%",
                      fontFamily: "var(--font-code)",
                      fontSize: "14px",
                      paddingRight: isOllama ? "12px" : "46px",
                    }}
                  />
                  {!isOllama && (
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? "Hide" : "Show"}
                      style={{
                        position: "absolute",
                        right: "14px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        margin: 0,
                        lineHeight: 1,
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2,
                      }}
                    >
                      {showKey ? (
                        <Icon
                          className="ti ti-eye-off"
                          style={{ fontSize: 20 }}
                        />
                      ) : (
                        <Icon className="ti ti-eye" style={{ fontSize: 20 }} />
                      )}
                    </button>
                  )}
                </div>
                {isOllama && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{
                      padding: "7px 10px",
                      borderRadius: "5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      alignSelf: "flex-start",
                    }}
                    onClick={fetchOllamaModels}
                    disabled={isFetchingOllamaModels}
                  >
                    {isFetchingOllamaModels ? (
                      <div className="loading-spinner"></div>
                    ) : (
                      <>
                        <Icon className="ti ti-refresh"></Icon>
                        <span style={{ fontSize: "13px" }}>Fetch Models</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{
                    padding: "7px 10px",
                    borderRadius: "5px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title={keyValidationMessage || "Test the API key"}
                  onClick={verifyAPIKeyHandler}
                >
                  {isLoadingKey ? (

                     <div className="loading-spinner"></div>

                  ) : (
                    <>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        class="icon icon-tabler icons-tabler-outline icon-tabler-rotate-rectangle"
                      >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M10.09 4.01l.496 -.495a2 2 0 0 1 2.828 0l7.071 7.07a2 2 0 0 1 0 2.83l-7.07 7.07a2 2 0 0 1 -2.83 0l-7.07 -7.07a2 2 0 0 1 0 -2.83l3.535 -3.535h-3.988" />
                        <path d="M7.05 11.038v-3.988" />
                      </svg>
                      <p style={{ fontSize: "13px" }}>Verify AI API Key</p>
                    </>
                  )}
                </button>
              </div>
              {keyValidationMessage && (
                <p
                  title={keyValidationMessage}
                  style={{
                    fontSize: "0.75rem",
                    color:
                      keyValidationStatus === "success"
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                    marginTop: 6,
                  }}
                >
                  {keyValidationMessage}
                </p>
              )}
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Supports OpenAI (sk-...), Google Gemini (AIza...), X.AI (xai-...), Claude, and Mistral keys. Keys are encrypted before storage. {apiKeys.length}/4
                keys used.
                <br />
                Verify the API key successfully before proceeding to add it
              </p>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="btn btn-primary"
                onClick={saveApiKey}
                disabled={!isValidKey}
              >
                <Icon className="ti ti-device-floppy"></Icon>{" "}
                {editingKey ? "Update Key" : "Save Key"}
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={cancelEdit}
              >
                <Icon className="ti ti-x"></Icon> Cancel
              </button>
            </div>
          </form>
        ) : (
          apiKeys.length < 4 && (
            <div style={{ marginTop: apiKeys.length > 0 ? 16 : 0 }}>
              <button className="btn btn-primary" onClick={startAddNew}>
                <Icon className="ti ti-plus"></Icon> Add API Key
              </button>
            </div>
          )
        )}

        {apiKeys.length === 0 && !showAddForm && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: 16,
                fontSize: "14px",
              }}
            >
              No API keys configured yet.
            </p>
          </div>
        )}
      </div>

      {deleteConfirm.show && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: current.overlay,
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={cancelDelete}
        >
          <div style={modalInnerStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalTitleStyle}>Confirm Delete</h3>
            <p style={modalParagraphStyle}>
              Are you sure you want to delete API key{" "}
              <strong style={{ color: "#6366f1" }}>
                "{deleteConfirm.keyName}"
              </strong>
              ?
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={cancelDelete}
                style={cancelButtonStyle}
              >
                No, Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                style={{ padding: "8px 16px", borderRadius: "8px" }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

