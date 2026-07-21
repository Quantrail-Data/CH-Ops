// ErrorBoundary - Catching rendering errors
//
// Wraps route components and page sections to prevent the entire app from
// crashing when a component fails to render. Displays a user-friendly error
// message with a "Try Again" button.
// Used throughout the app to isolate failures to individual features.
//
// Author: Kathir Moorthy
// Copyright (C) 2026 Quantrail™ Data Private Limited
import React from 'react';
import Icon from "../common/Icon.jsx";

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[CHOps Error]', error.stack, info); }

  // Optional resetKeys: when any entry changes, clear the error so the wrapped
  // section can render again (e.g. after the user fixes a bad chart mapping).
  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;
    const a = prevProps.resetKeys || [];
    const b = this.props.resetKeys || [];
    if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      // Optional compact fallback: fallback(error, reset) => node.
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, () => this.setState({ hasError: false, error: null }));
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', gap: '16px' }}>
          <Icon className="ti ti-alert-triangle" style={{ fontSize: '48px', color: 'var(--color-danger)' }}></Icon>
          <h2 style={{ fontSize: '19px' }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', maxWidth: '500px' }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button className="btn btn-primary" onClick={() => { this.setState({ hasError: false, error: null }); }}>
            <Icon className="ti ti-refresh"></Icon> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
