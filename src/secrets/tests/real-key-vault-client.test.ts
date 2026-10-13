import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SecretClient } from '@azure/keyvault-secrets'
import { RealKeyVaultClient } from '../real-key-vault-client.js'

/** Network-free double of the SecretClient surface RealKeyVaultClient uses. */
class FakeSecretClient
{
    public static readonly NotFoundMessage = 'not found'
    public static readonly NotFoundStatus = 404
    public static readonly ForbiddenStatus = 403
    public static readonly SecretNotFoundCode = 'SecretNotFound'

    public readonly map = new Map<string, string>()
    public missingError: Error = FakeSecretClient.StatusError(FakeSecretClient.NotFoundStatus)
    public failWith: Error | undefined

    public static StatusError(statusCode: number): Error
    {
        return Object.assign(new Error(FakeSecretClient.NotFoundMessage), { statusCode })
    }

    public static CodeError(code: string): Error
    {
        return Object.assign(new Error(FakeSecretClient.NotFoundMessage), { code })
    }

    public async getSecret(name: string): Promise<{ value?: string }>
    {
        this.MaybeFail()
        const value = this.map.get(name)
        if (value === undefined)
        {
            throw this.missingError
        }
        return { value }
    }

    public async setSecret(name: string, value: string): Promise<{ value: string }>
    {
        this.MaybeFail()
        this.map.set(name, value)
        return { value }
    }

    public async beginDeleteSecret(name: string): Promise<{ pollUntilDone: () => Promise<void> }>
    {
        this.MaybeFail()
        if (!this.map.delete(name))
        {
            throw this.missingError
        }
        return { pollUntilDone: async () => {} }
    }

    private MaybeFail(): void
    {
        if (this.failWith !== undefined)
        {
            throw this.failWith
        }
    }
}

class KeyVaultFixture
{
    public static readonly Id = 'abc123'
    public static readonly Other = 'other'
    public static readonly ValueA = 'a'
    public static readonly ValueB = 'b'

    public static Make(): { fake: FakeSecretClient, client: RealKeyVaultClient }
    {
        const fake = new FakeSecretClient()
        return { fake, client: new RealKeyVaultClient(fake as unknown as SecretClient) }
    }
}

test('AccessLatest on a missing secret returns undefined (statusCode 404)', async () =>
{
    const { client } = KeyVaultFixture.Make()
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), undefined)
})

test('AccessLatest on a missing secret returns undefined (SecretNotFound code)', async () =>
{
    const { fake, client } = KeyVaultFixture.Make()
    fake.missingError = FakeSecretClient.CodeError(FakeSecretClient.SecretNotFoundCode)
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), undefined)
})

test('EnsureSecret is a no-op', async () =>
{
    const { fake, client } = KeyVaultFixture.Make()
    await assert.doesNotReject(client.EnsureSecret(KeyVaultFixture.Id))
    assert.equal(fake.map.size, 0)
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), undefined)
})

test('AddVersion then AccessLatest returns the value', async () =>
{
    const { client } = KeyVaultFixture.Make()
    await client.AddVersion(KeyVaultFixture.Id, KeyVaultFixture.ValueA)
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), KeyVaultFixture.ValueA)
})

test('AddVersion overwrite changes the value', async () =>
{
    const { client } = KeyVaultFixture.Make()
    await client.AddVersion(KeyVaultFixture.Id, KeyVaultFixture.ValueA)
    await client.AddVersion(KeyVaultFixture.Id, KeyVaultFixture.ValueB)
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), KeyVaultFixture.ValueB)
})

test('DeleteSecret removes the secret; deleting a missing one is a no-op', async () =>
{
    const { fake, client } = KeyVaultFixture.Make()
    await client.AddVersion(KeyVaultFixture.Id, KeyVaultFixture.ValueA)
    await client.DeleteSecret(KeyVaultFixture.Id)
    assert.equal(await client.AccessLatest(KeyVaultFixture.Id), undefined)
    await assert.doesNotReject(client.DeleteSecret(KeyVaultFixture.Other))
    fake.missingError = FakeSecretClient.CodeError(FakeSecretClient.SecretNotFoundCode)
    await assert.doesNotReject(client.DeleteSecret(KeyVaultFixture.Other))
})

test('a non-404 error propagates from AccessLatest, AddVersion and DeleteSecret', async () =>
{
    const { fake, client } = KeyVaultFixture.Make()
    fake.failWith = FakeSecretClient.StatusError(FakeSecretClient.ForbiddenStatus)
    await assert.rejects(client.AccessLatest(KeyVaultFixture.Id))
    await assert.rejects(client.AddVersion(KeyVaultFixture.Id, KeyVaultFixture.ValueA))
    await assert.rejects(client.DeleteSecret(KeyVaultFixture.Id))
})

test('propagated errors are the identical object the SDK threw', async () =>
{
    const { fake, client } = KeyVaultFixture.Make()
    const thrown = FakeSecretClient.StatusError(FakeSecretClient.ForbiddenStatus)
    fake.failWith = thrown
    let caught: unknown
    try
    {
        await client.AccessLatest(KeyVaultFixture.Id)
    }
    catch (e)
    {
        caught = e
    }
    assert.equal(caught, thrown)
    caught = undefined
    try
    {
        await client.DeleteSecret(KeyVaultFixture.Id)
    }
    catch (e)
    {
        caught = e
    }
    assert.equal(caught, thrown)
})
