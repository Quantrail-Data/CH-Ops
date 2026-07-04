// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Displays an audit trail of active database privileges and explicit permission grants for a specific identity.


import React, { useEffect, useRef, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import { initChart, disposeChart } from '../../utils/echarts.js';
import { treeSize, treeSeries } from '../../utils/treeChart.js';
import DataTable from '../layout/DataTable.jsx';

export default function RbacViewGrants() {
  const { tab: routeTab = 'users' } = useParams();
  const navigate = useNavigate();
  
  const handleTabChange = (newTab) => {
    navigate(`/rbac/view/${newTab}`, { replace: true });
  };

  return (
    <div className="page-content">
      <div className="section-header">
        <h2 className="section-title">
          <Icon className="ti ti-hierarchy"></Icon>
          View Grants
        </h2>
      </div>

      <div className="tab-bar">
        <div
          className={`tab-item ${routeTab === 'users' ? 'active' : ''}`}
          onClick={() => handleTabChange('users')}
        >
          <Icon className="ti ti-user"></Icon>
          User Grants
        </div>

        <div
          className={`tab-item ${routeTab === 'roles' ? 'active' : ''}`}
          onClick={() => handleTabChange('roles')}
        >
          <Icon className="ti ti-shield"></Icon>
          Role Grants
        </div>

        <div
          className={`tab-item ${routeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          <Icon className="ti ti-list"></Icon>
          Full Overview
        </div>
      </div>

      {routeTab === 'users' && <UserTree />}
      {routeTab === 'roles' && <RoleTree />}
      {routeTab === 'overview' && <FullOverview />}
    </div>
  );
}

/* Recursive role tree builder */

function buildRoleTree(
  roleName,
  roleGrants,
  grantsMap,
  visited = new Set()
) {
  if (visited.has(roleName)) {
    return {
      name: `${roleName} (circular)`,
      itemStyle: { color: '#ef4444' },
      children: [],
    };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(roleName);

  // find child roles
  const childRoles = roleGrants
    .filter(r => r.role_name === roleName)
    .map(r => r.granted_role_name);

  // ONLY recurse roles first (important fix)
  const roleChildren = childRoles.map(child =>
    buildRoleTree(child, roleGrants, grantsMap, nextVisited)
  );

  // attach grants ONLY if this is a leaf OR also show them separately
  const grants = grantsMap
    .filter(g => g.role_name === roleName)
    .map(g => ({
      name: `${g.access_type}.${g.database}.${g.table}`,
      itemStyle: {
        color: g.is_partial_revoke ? '#f87171' : '#34d399',
      },
      children: [],
    }));

  return {
    name: roleName,
    itemStyle: { color: '#f59e0b' },

    children: [
      ...roleChildren,
      ...(grants.length
        ? [{
            name: 'grants',
            itemStyle: { color: '#22c55e' },
            children: grants,
          }]
        : []),
    ],
  };
}

/* USER TREE */

function UserTree() {
  const usersQ = useQuery();
  const grantsQ = useQuery();
  const roleGrantsQ = useQuery();

  const [sel, setSel] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [themeKey, setThemeKey] = useState(0);
  const [zoom, setZoom] = useState(1);

  const chartRef = useRef(null);
  const chartInst = useRef(null);

  // load users
  useEffect(() => {
    usersQ.execute(`
      SELECT name
      FROM system.users
      ORDER BY name
    `);
  }, []);

  // load ALL grants + ALL role grants
  useEffect(() => {
    if (!sel) return;

    grantsQ.execute(`
      SELECT
        user_name,
        role_name,
        access_type,
        database,
        table,
        column,
        is_partial_revoke
      FROM system.grants
    `);

    roleGrantsQ.execute(`
      SELECT
        user_name,
        role_name,
        granted_role_name
      FROM system.role_grants
    `);
  }, [sel]);

  // render chart
  useEffect(() => {
    if (
      !sel ||
      !grantsQ.data ||
      !roleGrantsQ.data ||
      !chartRef.current
    ) return;

    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark';

    // direct roles assigned to user
    const directRoles = roleGrantsQ.data
      .filter(r => r.user_name === sel)
      .map(r => r.granted_role_name);

    // direct grants assigned to user
    const directUserGrants = grantsQ.data
      .filter(g => g.user_name === sel)
      .map(g => ({
        name:
          [
            g.access_type,
            g.database,
            g.table,
            g.column,
          ]
            .filter(Boolean)
            .join('.') + ' (direct)',

        itemStyle: {
          color: g.is_partial_revoke
            ? '#f87171'
            : '#34d399',
        },

        children: [],
      }));

    const tree = {
      name: sel,
      itemStyle: { color: '#6366f1' },

      children: [
        ...(directRoles.length
          ? [
              {
                name: 'Roles',
                itemStyle: { color: '#f59e0b' },

                children: directRoles.map(role =>
                  buildRoleTree(
                    role,
                    roleGrantsQ.data,
                    grantsQ.data
                  )
                ),
              },
            ]
          : []),

        ...(directUserGrants.length
          ? [
              {
                name: 'Direct Grants',
                itemStyle: { color: '#34d399' },
                children: directUserGrants,
              },
            ]
          : []),
      ],
    };

    const size = treeSize(tree);

    if (chartInst.current) {
      disposeChart(chartRef.current);
      chartInst.current = null;
    }

    chartRef.current.style.width =
      Math.round(size.width * zoom) + 'px';

    chartRef.current.style.height =
      Math.round(size.height * zoom) + 'px';

    chartInst.current = initChart(chartRef.current);

    const series = treeSeries(tree, isDark);

    series.symbolSize = Math.round(12 * zoom);

    chartInst.current.setOption(
      {
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove',
        },

        series: [series],
      },
      true
    );

    chartInst.current.resize();

  }, [
    sel,
    grantsQ.data,
    roleGrantsQ.data,
    themeKey,
    zoom,
  ]);

  // theme watcher
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setThemeKey(k => k + 1)
    );

    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => obs.disconnect();
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        disposeChart(chartRef.current);
      }
    };
  }, []);

  function doZoom(f) {
    setZoom(z =>
      Math.max(0.3, Math.min(3, +(z * f).toFixed(2)))
    );
  }

  function downloadChart() {
    if (!chartInst.current) return;

    const url = chartInst.current.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: 'transparent',
    });

    const a = document.createElement('a');

    a.href = url;
    a.download = 'user-grants.png';

    a.click();
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          alignItems: 'flex-end',
        }}
      >
        <div className="form-group">
          <label className="form-label">
            User
          </label>

          <Select
            className="form-select"
            value={sel}
            onChange={e => setSel(e.target.value)}
          >
            <option value="">
              -- select --
            </option>

            {usersQ.data?.map(u => (
              <option
                key={u.name}
                value={u.name}
              >
                {u.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div
        className="card"
        style={
          fullscreen
            ? {
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'var(--bg-page)',
                borderRadius: 0,
                display: 'flex',
                flexDirection: 'column',
              }
            : {}
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 4,
            padding: '8px 12px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginRight: 4,
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => doZoom(1.25)}
          >
            <Icon className="ti ti-zoom-in"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => doZoom(0.8)}
          >
            <Icon className="ti ti-zoom-out"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom(1)}
          >
            <Icon className="ti ti-zoom-reset"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={downloadChart}
          >
            <Icon className="ti ti-download"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setFullscreen(!fullscreen)
            }
          >
            <Icon
              className={`ti ${
                fullscreen
                  ? 'ti-arrows-minimize'
                  : 'ti-arrows-maximize'
              }`}
            ></Icon>
          </button>
        </div>

        <div
          style={
            fullscreen
              ? {
                  overflow: 'auto',
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                }
              : {
                  overflowX: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                }
          }
        >
          <div ref={chartRef}>
            {!sel && (
              <div className="empty-state">
                <p>Select a user.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ROLE TREE */

function RoleTree() {
  const rolesQ = useQuery();
  const grantsQ = useQuery();
  const roleGrantsQ = useQuery();

  const [sel, setSel] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [themeKey, setThemeKey] = useState(0);
  const [zoom, setZoom] = useState(1);

  const chartRef = useRef(null);
  const chartInst = useRef(null);

  // load roles
  useEffect(() => {
    rolesQ.execute(`
      SELECT name
      FROM system.roles
      ORDER BY name
    `);
  }, []);

  // load all grants + role hierarchy
  useEffect(() => {
    if (!sel) return;

    grantsQ.execute(`
      SELECT
        role_name,
        access_type,
        database,
        table,
        column,
        is_partial_revoke
      FROM system.grants
    `);

    roleGrantsQ.execute(`
      SELECT
        role_name,
        granted_role_name
      FROM system.role_grants
    `);

  }, [sel]);

  // render chart
  useEffect(() => {
    if (
      !sel ||
      !grantsQ.data ||
      !roleGrantsQ.data ||
      !chartRef.current
    ) return;

    const isDark =
      document.documentElement.getAttribute('data-theme') === 'dark';

    const tree = buildRoleTree(
      sel,
      roleGrantsQ.data,
      grantsQ.data
    );

    const size = treeSize(tree);

    if (chartInst.current) {
      disposeChart(chartRef.current);
      chartInst.current = null;
    }

    chartRef.current.style.width =
      Math.round(size.width * zoom) + 'px';

    chartRef.current.style.height =
      Math.round(size.height * zoom) + 'px';

    chartInst.current = initChart(chartRef.current);

    const series = treeSeries(tree, isDark);

    series.symbolSize = Math.round(12 * zoom);

    chartInst.current.setOption(
      {
        tooltip: {
          trigger: 'item',
          triggerOn: 'mousemove',
        },

        series: [series],
      },
      true
    );

    chartInst.current.resize();

  }, [
    sel,
    grantsQ.data,
    roleGrantsQ.data,
    themeKey,
    zoom,
  ]);

  // theme watcher
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setThemeKey(k => k + 1)
    );

    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => obs.disconnect();
  }, []);

  // cleanup
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        disposeChart(chartRef.current);
      }
    };
  }, []);

  function doZoom(f) {
    setZoom(z =>
      Math.max(0.3, Math.min(3, +(z * f).toFixed(2)))
    );
  }

  function downloadChart() {
    if (!chartInst.current) return;

    const url = chartInst.current.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: 'transparent',
    });

    const a = document.createElement('a');

    a.href = url;
    a.download = 'role-grants.png';

    a.click();
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          alignItems: 'flex-end',
        }}
      >
        <div className="form-group">
          <label className="form-label">
            Role
          </label>

          <Select
            className="form-select"
            value={sel}
            onChange={e => setSel(e.target.value)}
          >
            <option value="">
              -- select --
            </option>

            {rolesQ.data?.map(r => (
              <option
                key={r.name}
                value={r.name}
              >
                {r.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div
        className="card"
        style={
          fullscreen
            ? {
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: 'var(--bg-page)',
                borderRadius: 0,
                display: 'flex',
                flexDirection: 'column',
              }
            : {}
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 4,
            padding: '8px 12px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginRight: 4,
            }}
          >
            {Math.round(zoom * 100)}%
          </span>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => doZoom(1.25)}
          >
            <Icon className="ti ti-zoom-in"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => doZoom(0.8)}
          >
            <Icon className="ti ti-zoom-out"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setZoom(1)}
          >
            <Icon className="ti ti-zoom-reset"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={downloadChart}
          >
            <Icon className="ti ti-download"></Icon>
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setFullscreen(!fullscreen)
            }
          >
            <Icon
              className={`ti ${
                fullscreen
                  ? 'ti-arrows-minimize'
                  : 'ti-arrows-maximize'
              }`}
            ></Icon>
          </button>
        </div>

        <div
          style={
            fullscreen
              ? {
                  overflow: 'auto',
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                }
              : {
                  overflowX: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                }
          }
        >
          <div ref={chartRef}>
            {!sel && (
              <div className="empty-state">
                <p>Select a role.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* FULL OVERVIEW */

function FullOverview() {
  const uq = useQuery();
  const rq = useQuery();
  const gq = useQuery();

  useEffect(() => {
    uq.execute(`
      SELECT
        u.name,
        u.auth_type,
        u.host_ip,
        groupArray(g.granted_role_name) AS roles
      FROM system.users u
      LEFT JOIN system.role_grants g
        ON u.name = g.user_name
      GROUP BY
        u.name,
        u.auth_type,
        u.host_ip
      ORDER BY u.name
    `);

    rq.execute(`
      SELECT name
      FROM system.roles
      ORDER BY name
    `);

    gq.execute(`
      SELECT
        user_name,
        role_name,
        access_type,
        database,
        table
      FROM system.grants
      ORDER BY user_name, role_name
    `);

  }, []);

  return (
    <div>
      <h3
        style={{
          fontSize: '15px',
          margin: '16px 0 8px',
        }}
      >
        Users
      </h3>

      <DataTable
        rows={uq.data || []}
        columns={[
          'name',
          'auth_type',
          'host_ip',
          'roles',
        ]}
        emptyMessage="No users."
        variant="fixed"
      />

      <h3
        style={{
          fontSize: '15px',
          margin: '16px 0 8px',
        }}
      >
        Roles
      </h3>

      <DataTable
        rows={rq.data || []}
        emptyMessage="No roles."
        variant="fixed"
      />

      <h3
        style={{
          fontSize: '15px',
          margin: '16px 0 8px',
        }}
      >
        All Grants
      </h3>

      <DataTable
        rows={gq.data || []}
        columns={[
          'user_name',
          'role_name',
          'access_type',
          'database',
          'table',
        ]}
        emptyMessage="No grants."
        variant="fixed"
      />
    </div>
  );
}
