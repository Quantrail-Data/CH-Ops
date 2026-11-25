// Copyright (C) 2026 Quantrail™ Data Private Limited
// author -> (kathir Moorthy, kathir dhasan, Praveen kumar)
// Displays an audit trail of active database privileges and explicit permission grants for a specific identity.

import { useEffect, useMemo, useState } from 'react';
import Select from "../common/Select.jsx";
import Icon from "../common/Icon.jsx";
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '../../hooks/useQuery.js';
import DataTable from '../layout/DataTable.jsx';
import SettingsView from './SettingsView.jsx';
import TreeGraph from '../common/TreeGraph.jsx';
import { buildUserGrantTree, buildRoleGrantTree } from '../../utils/grantTrees.js';
import { FormField } from "../ui/index.jsx";

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

        <div
          className={`tab-item ${routeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleTabChange('settings')}
        >
          <Icon className="ti ti-adjustments"></Icon>
          Settings
        </div>
      </div>

      {routeTab === 'users' && <UserTree />}
      {routeTab === 'roles' && <RoleTree />}
      {routeTab === 'overview' && <FullOverview />}
      {routeTab === 'settings' && <SettingsView />}
    </div>
  );
}

/* USER TREE */

function UserTree() {
  const usersQ = useQuery();
  const grantsQ = useQuery();
  const roleGrantsQ = useQuery();
  const [selectedUser, setSelectedUser] = useState('');

  // load users
  useEffect(() => {
    usersQ.execute(`
      SELECT name
      FROM system.users
      ORDER BY name
    `);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, []);

  // load ALL grants + ALL role grants
  useEffect(() => {
    if (!selectedUser) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [selectedUser]);

  const tree = useMemo(() => {
    if (!selectedUser || !grantsQ.data || !roleGrantsQ.data) return null;
    return buildUserGrantTree(selectedUser, roleGrantsQ.data, grantsQ.data);
  }, [selectedUser, grantsQ.data, roleGrantsQ.data]);

  return (
    <div>
      <div className="search-form-row">
        <FormField label="User" className="search-field">
          <Select
            className="form-select"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            <option value="">
              -- select --
            </option>
            {usersQ.data?.map(u => (
              <option key={u.name} value={u.name}>
                {u.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <TreeGraph tree={tree} fileName="user-grants.png" emptyMessage="Select a user." />
    </div>
  );
}

/* ROLE TREE */

function RoleTree() {
  const rolesQ = useQuery();
  const grantsQ = useQuery();
  const roleGrantsQ = useQuery();
  const [selectedRole, setSelectedRole] = useState('');

  // load roles
  useEffect(() => {
    rolesQ.execute(`
      SELECT name
      FROM system.roles
      ORDER BY name
    `);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, []);

  // load all grants + role hierarchy
  useEffect(() => {
    if (!selectedRole) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, [selectedRole]);

  const tree = useMemo(() => {
    if (!selectedRole || !grantsQ.data || !roleGrantsQ.data) return null;
    return buildRoleGrantTree(selectedRole, roleGrantsQ.data, grantsQ.data);
  }, [selectedRole, grantsQ.data, roleGrantsQ.data]);

  return (
    <div>
      <div className="search-form-row">
        <FormField label="Role" className="search-field">
          <Select
            className="form-select"
            value={selectedRole}
            onChange={e => setSelectedRole(e.target.value)}
          >
            <option value="">
              -- select --
            </option>
            {rolesQ.data?.map(r => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <TreeGraph tree={tree} fileName="role-grants.png" emptyMessage="Select a role." />
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- The query object is new on each render. Adding it would run the query again and again.
  }, []);

  return (
    <div>
      <h3
        style={{
          fontSize: "0.9375rem",
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
          fontSize: "0.9375rem",
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
          fontSize: "0.9375rem",
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
        fixedWidth = {true}
      />
    </div>
  );
}
