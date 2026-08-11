import { beforeEach, describe, expect, it, mock } from 'bun:test';

let rows = [];
const createK8sClient = mock();
const createAkocProvider = mock();
const createOckoProvider = mock();
const discoverVersion = mock();

mock.module('drizzle-orm', () => ({ eq: (field, value) => ({ field, value }) }));
mock.module('../../src/backend/services/crypto.js', () => ({
  encrypt: (value) => `enc:${value}`,
  decrypt: (value) => value?.replace(/^enc:/, ''),
}));
mock.module('../../src/backend/services/k8s/client.js', () => ({
  createK8sClient,
  paths: { namespaces: () => '/api/v1/namespaces', selfSubjectRulesReviews: () => '/apis/auth/rules' },
}));
mock.module('../../src/backend/services/k8s/akoc.js', () => ({ createAkocProvider }));
mock.module('../../src/backend/services/k8s/ocko.js', () => ({ createOckoProvider }));
mock.module('../../src/backend/services/k8s/ockoPaths.js', () => ({
  OCKO_GROUP: 'clickhouse.com', discoverVersion,
}));
mock.module('../../src/backend/services/k8s/errors.js', () => ({ K8S_ERROR: { FORBIDDEN: 'FORBIDDEN' } }));
mock.module('../../src/backend/db/index.js', () => ({
  k8sConnections: { id: 'id' },
  db: {
    select: () => ({ from: () => ({
      all: () => rows,
      where: ({ value }) => ({ get: () => rows.find((row) => row.id === value) }),
    }) }),
    insert: () => ({ values: (value) => ({ run: () => rows.push(value) }) }),
    update: () => ({ set: (values) => ({
      where: ({ value }) => ({ run: () => { rows = rows.map((row) => row.id === value ? { ...row, ...values } : row); } }),
      run: () => { rows = rows.map((row) => ({ ...row, ...values })); },
    }) }),
    delete: () => ({ where: ({ value }) => ({ run: () => { rows = rows.filter((row) => row.id !== value); } }) }),
  },
}));

const {
  checkPermissions, deleteConnection, detectOperators, getConnection, listConnections,
  providerFor, readInstallationHosts, saveConnection, setAffinityResult, testConnection,
} = await import('../../src/backend/services/k8sConnections.js');

beforeEach(() => {
  rows = [{
    id: 'c1', name: 'Production', apiAddress: 'https://k8s.example', caCertificate: 'CA', tokenEnc: 'enc:token',
    namespacesJson: '["prod"]', affinityOk: null, createdAt: 'old', updatedAt: 'old',
  }];
  for (const fn of [createK8sClient, createAkocProvider, createOckoProvider, discoverVersion]) fn.mockReset();
});

describe('Kubernetes connection persistence', () => {
  it('lists safe connection summaries and reveals token only for internal use', () => {
    expect(listConnections()[0]).toEqual(expect.objectContaining({ id: 'c1', namespaces: ['prod'] }));
    expect(listConnections()[0]).not.toHaveProperty('token');
    expect(getConnection('c1', { includeToken: true })).toMatchObject({ token: 'token', caCertificate: 'CA' });
    expect(getConnection('missing')).toBeNull();
  });

  it('creates, updates, deletes, and records affinity without replacing absent secrets', () => {
    expect(() => saveConnection({ name: 'New', apiAddress: 'https://new' })).toThrow(/token is required/i);
    expect(() => saveConnection({ name: 'New', apiAddress: 'https://new', token: 't' })).toThrow(/CA certificate/i);
    const id = saveConnection({ name: 'New', apiAddress: 'https://new///', token: 't', caCertificate: 'CA', namespaces: ['dev'] });
    expect(rows.find((row) => row.id === id)).toMatchObject({ apiAddress: 'https://new', tokenEnc: 'enc:t' });

    saveConnection({ id: 'c1', name: 'Renamed', apiAddress: 'https://changed/', namespaces: [] });
    expect(rows[0]).toMatchObject({ name: 'Renamed', apiAddress: 'https://changed', tokenEnc: 'enc:token', namespacesJson: null });
    setAffinityResult('c1', true);
    expect(rows[0].affinityOk).toBe(true);
    deleteConnection('c1');
    expect(getConnection('c1')).toBeNull();
  });
});

describe('Kubernetes providers and discovery', () => {
  it('builds AKOC and OCKO providers, rejecting a missing connection', () => {
    createK8sClient.mockReturnValue('client');
    createAkocProvider.mockReturnValue('akoc-provider');
    createOckoProvider.mockReturnValue('ocko-provider');
    expect(providerFor('c1')).toMatchObject({ client: 'client', provider: 'akoc-provider', operator: 'akoc' });
    expect(providerFor('c1', 'ocko')).toMatchObject({ provider: 'ocko-provider', operator: 'ocko' });
    expect(() => providerFor('missing')).toThrow('Kubernetes connection not found.');
  });

  it('detects installed operators and handles an absent AKOC resource', async () => {
    discoverVersion.mockResolvedValue('v1alpha1');
    const client = { listPage: mock().mockResolvedValue({}) };
    expect(await detectOperators(client, 'prod')).toEqual(['akoc', 'ocko']);
    client.listPage.mockRejectedValueOnce(new Error('404'));
    discoverVersion.mockResolvedValueOnce(null);
    expect(await detectOperators(client, 'prod')).toEqual([]);
  });
});

describe('Kubernetes permissions and connectivity', () => {
  it('reports missing/degraded permissions and a failed permission review', async () => {
    const client = { post: mock().mockResolvedValue({ status: { resourceRules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }] } }) };
    expect(await checkPermissions(client, 'prod')).toEqual({ checked: true, missing: [], degraded: [] });
    client.post.mockResolvedValueOnce({ status: { resourceRules: [] } });
    const limited = await checkPermissions(client, 'prod');
    expect(limited.missing.length).toBeGreaterThan(0);
    expect(limited.degraded.length).toBeGreaterThan(0);
    client.post.mockRejectedValueOnce(new Error('review forbidden'));
    expect(await checkPermissions(client, 'prod')).toEqual({ checked: false, reason: 'review forbidden', missing: [], degraded: [] });
  });

  it('handles client construction, namespace-scoped credentials, and non-AKOC operators', async () => {
    createK8sClient.mockImplementationOnce(() => { throw new Error('bad certificate'); });
    expect((await testConnection({})).kubernetes.message).toBe('bad certificate');

    const scoped = { listPage: mock().mockRejectedValue(Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' })), post: mock().mockResolvedValue({ status: { resourceRules: [] } }) };
    createK8sClient.mockReturnValueOnce(scoped);
    discoverVersion.mockResolvedValueOnce('v1alpha1');
    const result = await testConnection({ apiAddress: 'https://k8s', caCertificate: 'CA', token: 't', namespace: 'prod' });
    expect(result.kubernetes).toMatchObject({ ok: true, message: expect.stringContaining('cannot list namespaces') });
    expect(result.operator).toMatchObject({ reachable: false, message: expect.stringContaining('OCKO') });

    const rejected = { listPage: mock().mockRejectedValue(Object.assign(new Error('unauthorized'), { code: 'UNAUTHORIZED' })) };
    createK8sClient.mockReturnValueOnce(rejected);
    expect((await testConnection({ apiAddress: 'x', caCertificate: 'CA', token: 't' })).kubernetes).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
  });
});

describe('installation host mapping', () => {
  it('maps addressable provider hosts and excludes hosts without an address', async () => {
    createK8sClient.mockReturnValue('client');
    createAkocProvider.mockReturnValue({ getHosts: mock().mockResolvedValue([
      { cluster: 'main', shard: 0, replica: 1, fqdn: 'node.example', podName: 'pod-1' },
      { cluster: 'main', shard: 0, replica: 2, fqdn: null, podName: 'pod-2' },
      { cluster: 'main', shard: 0, replica: 3, fqdn: null, podName: null },
    ]) });
    expect(await readInstallationHosts('c1', 'prod', 'main')).toEqual([
      { name: 'main-0-1', host: 'node.example', port: 8123, shard: 0, replica: 1, podName: 'pod-1', secure: false },
      { name: 'main-0-2', host: 'pod-2', port: 8123, shard: 0, replica: 2, podName: 'pod-2', secure: false },
    ]);
  });
});
