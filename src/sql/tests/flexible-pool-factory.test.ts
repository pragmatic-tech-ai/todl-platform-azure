import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FlexibleAuthMode, FlexiblePoolFactory } from '../flexible-pool-factory.js'
import type { IEntraCredential, IFlexiblePool, IFlexiblePoolOptions } from '../flexible-pool-factory.js'

class PoolFixture
{
    public static readonly Host = 'pg.example.test'
    public static readonly Port = 5432
    public static readonly User = 'app-identity'
    public static readonly Database = 'appdb'
    public static readonly Scope = 'https://ossrdbms-aad.database.windows.net/.default'
    public static readonly DummyToken = 'dummy-entra-token'
    public static readonly DummyPassword = 'dummy-password'
    public static readonly CustomScope = 'custom/.default'

    public cfg: Record<string, unknown> = {}
    public getTokenCalls = 0
    public scopes: string[] = []
    public endCalls = 0

    public Options(extra: Partial<IFlexiblePoolOptions> = {}): IFlexiblePoolOptions
    {
        return { host: PoolFixture.Host, port: PoolFixture.Port, user: PoolFixture.User, database: PoolFixture.Database, ...extra }
    }

    public Factory(options: IFlexiblePoolOptions): FlexiblePoolFactory
    {
        const credential: IEntraCredential = {
            getToken: async (scope: string) =>
            {
                this.getTokenCalls++
                this.scopes.push(scope)
                return { token: PoolFixture.DummyToken }
            }
        }
        const pool: IFlexiblePool = {
            end: async () =>
            {
                this.endCalls++
            }
        }
        return new FlexiblePoolFactory(options, () => credential, cfg =>
        {
            this.cfg = cfg
            return pool
        })
    }
}

test('Entra mode: password is a function minting a fresh token per call with the Flexible Server scope', async () =>
{
    const f = new PoolFixture()
    await f.Factory(f.Options()).Create()
    assert.ok(f.cfg.ssl)
    assert.equal(typeof f.cfg.password, 'function')
    const password = f.cfg.password as () => Promise<string>
    assert.equal(await password(), PoolFixture.DummyToken)
    assert.equal(f.getTokenCalls, 1)
    assert.deepEqual(f.scopes, [PoolFixture.Scope])
    await password()
    assert.equal(f.getTokenCalls, 2)
})

test('Entra mode honours a custom scope', async () =>
{
    const f = new PoolFixture()
    await f.Factory(f.Options({ entraScope: PoolFixture.CustomScope })).Create()
    await (f.cfg.password as () => Promise<string>)()
    assert.deepEqual(f.scopes, [PoolFixture.CustomScope])
})

test('Password mode uses the provided string and never calls the credential', async () =>
{
    const f = new PoolFixture()
    await f.Factory(f.Options({ authMode: FlexibleAuthMode.Password, password: PoolFixture.DummyPassword })).Create()
    assert.equal(f.cfg.password, PoolFixture.DummyPassword)
    assert.equal(f.getTokenCalls, 0)
})

test('Dispose ends the pool exactly once', async () =>
{
    const f = new PoolFixture()
    const handle = await f.Factory(f.Options()).Create()
    await handle.Dispose()
    assert.equal(f.endCalls, 1)
})

test('cfg threads connection fields, max and strict TLS', async () =>
{
    const f = new PoolFixture()
    await f.Factory(f.Options()).Create()
    assert.equal(f.cfg.host, PoolFixture.Host)
    assert.equal(f.cfg.port, PoolFixture.Port)
    assert.equal(f.cfg.user, PoolFixture.User)
    assert.equal(f.cfg.database, PoolFixture.Database)
    assert.equal(f.cfg.max, 10)
    assert.deepEqual(f.cfg.ssl, { rejectUnauthorized: true })
})
