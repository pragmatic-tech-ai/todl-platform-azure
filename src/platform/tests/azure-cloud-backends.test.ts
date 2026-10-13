import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SecretClient } from '@azure/keyvault-secrets'
import type { BlobServiceClient } from '@azure/storage-blob'
import { PgSession } from '@pragmatic-tech-ai/todl-platform-cloud'
import { newDb } from 'pg-mem'
import type pg from 'pg'
import { AzureCloudBackends } from '../azure-cloud-backends.js'
import type { IAzureCloudBackendsConfig, IAzureCloudBackendsFactories } from '../azure-cloud-backends.js'
import type { IFlexiblePoolHandle } from '../../sql/flexible-pool-factory.js'
import { SecretRefEncoding } from '../../secrets/secret-ref-encoding.js'

/** Minimal SecretClient double: getSecret answers from a map, 404 otherwise. */
class FakeSecretClient
{
    private static readonly NotFoundStatus = 404
    private static readonly NotFoundMessage = 'not found'

    public readonly Secrets = new Map<string, string>()

    public async getSecret(name: string): Promise<{ value: string }>
    {
        const v = this.Secrets.get(name)
        if (v === undefined)
        {
            throw Object.assign(new Error(FakeSecretClient.NotFoundMessage), { statusCode: FakeSecretClient.NotFoundStatus })
        }
        return { value: v }
    }
}

class BackendsFixture
{
    public static readonly Ref = 'secret-ref-xyz'
    public static readonly PasswordValue = 'pw-value-123'
    public static readonly Unset = 'unset'

    public readonly Secrets = new FakeSecretClient()
    public DisposeCalls = 0
    public PoolCalls = 0
    public PasswordArg: string | undefined = BackendsFixture.Unset

    public static Config(extra: Partial<IAzureCloudBackendsConfig> = {}): IAzureCloudBackendsConfig
    {
        return {
            blobAccount: 'acct',
            blobContainer: 'c',
            keyVaultUrl: 'https://vault.example',
            azpgHost: 'h',
            azpgUser: 'u',
            azpgDatabase: 'd',
            ...extra
        }
    }

    public Factories(): IAzureCloudBackendsFactories
    {
        return {
            CreateBlobService: () => ({}) as unknown as BlobServiceClient,
            CreateSecretClient: () => this.Secrets as unknown as SecretClient,
            CreatePool: async (_config, password) =>
            {
                this.PoolCalls++
                this.PasswordArg = password
                const { Pool } = newDb().adapters.createPg()
                const handle: IFlexiblePoolHandle = {
                    Pool: new Pool() as pg.Pool,
                    Dispose: async () =>
                    {
                        this.DisposeCalls++
                    }
                }
                return handle
            }
        }
    }
}

test('ENTRA auth builds backends with no password', async () =>
{
    for (const azpgAuth of [undefined, 'entra'])
    {
        const f = new BackendsFixture()
        const b = await AzureCloudBackends.Create(BackendsFixture.Config({ azpgAuth }), f.Factories())
        assert.ok(b.Storage)
        assert.ok(b.SecretManager)
        assert.ok(b.Session instanceof PgSession)
        assert.equal(f.PasswordArg, undefined)
    }
})

test('Dispose ends the pool exactly once', async () =>
{
    const f = new BackendsFixture()
    const b = await AzureCloudBackends.Create(BackendsFixture.Config(), f.Factories())
    await b.Dispose()
    assert.equal(f.DisposeCalls, 1)
})

test('PASSWORD auth resolves the password from the secret store', async () =>
{
    const f = new BackendsFixture()
    f.Secrets.Secrets.set(SecretRefEncoding.ToSecretId(BackendsFixture.Ref), BackendsFixture.PasswordValue)
    await AzureCloudBackends.Create(
        BackendsFixture.Config({ azpgAuth: 'password', azpgPasswordRef: BackendsFixture.Ref }), f.Factories())
    assert.equal(f.PasswordArg, BackendsFixture.PasswordValue)
})

test('PASSWORD auth without a ref rejects generically', async () =>
{
    const f = new BackendsFixture()
    await assert.rejects(
        AzureCloudBackends.Create(BackendsFixture.Config({ azpgAuth: 'password' }), f.Factories()),
        (e: Error) => !e.message.includes(BackendsFixture.Ref) && !e.message.includes(BackendsFixture.PasswordValue))
    assert.equal(f.PoolCalls, 0)
})

test('PASSWORD auth with an absent secret rejects generically', async () =>
{
    const f = new BackendsFixture()
    await assert.rejects(
        AzureCloudBackends.Create(
            BackendsFixture.Config({ azpgAuth: 'password', azpgPasswordRef: BackendsFixture.Ref }), f.Factories()),
        (e: Error) => e.message.length > 0 && !e.message.includes(BackendsFixture.Ref))
    assert.equal(f.PoolCalls, 0)
})

test('unknown azpgAuth rejects', async () =>
{
    const f = new BackendsFixture()
    await assert.rejects(
        AzureCloudBackends.Create(BackendsFixture.Config({ azpgAuth: 'bogus' }), f.Factories()),
        /Invalid azpgAuth/)
    assert.equal(f.PoolCalls, 0)
})

test('azpgAuth mapping is case-insensitive', async () =>
{
    const f = new BackendsFixture()
    f.Secrets.Secrets.set(SecretRefEncoding.ToSecretId(BackendsFixture.Ref), BackendsFixture.PasswordValue)
    await AzureCloudBackends.Create(
        BackendsFixture.Config({ azpgAuth: 'PASSWORD', azpgPasswordRef: BackendsFixture.Ref }), f.Factories())
    assert.equal(f.PasswordArg, BackendsFixture.PasswordValue)

    const g = new BackendsFixture()
    await AzureCloudBackends.Create(BackendsFixture.Config({ azpgAuth: 'ENTRA' }), g.Factories())
    assert.equal(g.PasswordArg, undefined)
})
