// Toast - Notification system with context provider and auto-dismiss
//
// A lightweight toast notification system that displays temporary messages
// for user actions (success, error, warning, info). Uses React Context for
// global access via useToast() hook. Each toast auto-dismisses after a set
// duration and can be manually closed. Used throughout the app for feedback
// on saves, deletes, query executions, and API errors.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import Icon from "../common/Icon.jsx";

const ToastContext = createContext(null);
export function useToast() { return useContext(ToastContext); }

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  // Cleanup all timers on unmount
  useEffect(() => () => { timersRef.current.forEach(t => clearTimeout(t)); }, []);

  const addToast = useCallback((message, type = 'info', duration = 10000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    const timer = setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); timersRef.current.delete(id); }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const dismiss = useCallback((id) => {
    if (timersRef.current.has(id)) { clearTimeout(timersRef.current.get(id)); timersRef.current.delete(id); }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success',1500),
    error: (msg) => addToast(msg, 'error',1500),
    info: (msg) => addToast(msg, 'info',1500),
    warning: (msg) => addToast(msg, 'warning',1500),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon className={`ti ${t.type === 'success' ? 'ti-check' : t.type === 'error' ? 'ti-x' : t.type === 'warning' ? 'ti-alert-triangle' : 'ti-info-circle'}`}></Icon>
            <span style={{ flex: 1 }}>{t.message}</span>
            <Icon className="ti ti-x" style={{ fontSize: 16, cursor: 'pointer', opacity: 0.6, flexShrink: 0 }} onClick={() => dismiss(t.id)}></Icon>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
