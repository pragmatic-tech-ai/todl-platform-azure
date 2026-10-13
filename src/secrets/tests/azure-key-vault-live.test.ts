import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { test } from 'node:test'
import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import type { ISecretStore } from '@pragmatic-tech-ai/todl-identity'
import { AzureKeyVaultSecretStore } from '../azure-key-vault-secret-store.js'
import { RealKeyVaultClient } from '../real-key-vault-client.js'

/** Gated: runs store-level conformance against a live Key Vault via the real SDK + RealKeyVaultClient.
 *  Skips unless PRAGMATIC_TEST_KEYVAULT_ENDPOINT is set. Logs nothing (no endpoint, credential or value). */
class LiveKeyVaultConformance
{
    private static readonly EndpointVar = 'PRAGMATIC_TEST_KEYVAULT_ENDPOINT'
    private static readonly SkipReason = 'set PRAGMATIC_TEST_KEYVAULT_ENDPOINT to run'
    private static readonly RunPrefix = 'run-'
    private static readonly Separator = '/'
    private static readonly AbsentName = 'absent'
    private static readonly RoundTripName = 'roundtrip'
    private static readonly OverwriteName = 'overwrite'
    private static readonly DeleteName = 'delete'
    private static readonly DeleteMissingName = 'delete-missing'
    private static readonly ValueA = 'value-a'
    private static readonly ValueB = 'value-b'

    private readonly endpoint: string | undefined = process.env[LiveKeyVaultConformance.EndpointVar]
    private readonly runId: string = LiveKeyVaultConformance.RunPrefix + randomBytes(8).toString('hex')
    private readonly created: string[] = []
    private store: ISecretStore | undefined

    public Register(): void
    {
        const cases: Array<[string, () => Promise<void>]> = [
            ['Get of an absent reference returns null', () => this.Absent()],
            ['Put then Get round-trips', () => this.RoundTrip()],
            ['a second Put overwrites the value', () => this.Overwrite()],
            ['Delete then Get returns null', () => this.DeleteThenGet()],
            ['Delete of a missing reference is a no-op', () => this.DeleteMissing()]
        ]
        const skip = this.endpoint === undefined ? LiveKeyVaultConformance.SkipReason : false
        for (const [name, body] of cases)
        {
            test(name, { skip }, async () =>
            {
                let bodyError: unknown
                try
                {
                    await body()
                }
                catch (error)
                {
                    bodyError = error
                }
                try
                {
                    await this.CleanUp()
                }
                catch (cleanupError)
                {
                    // Never mask a real assertion error with a cleanup failure.
                    bodyError ??= cleanupError
                }
                if (bodyError !== undefined)
                {
                    throw bodyError
                }
            })
        }
    }

    private async Absent(): Promise<void>
    {
        assert.equal(await this.Store().Get(this.Ref(LiveKeyVaultConformance.AbsentName)), null)
    }

    private async RoundTrip(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveKeyVaultConformance.RoundTripName)
        await store.Put(ref, LiveKeyVaultConformance.ValueA)
        assert.equal(await store.Get(ref), LiveKeyVaultConformance.ValueA)
    }

    private async Overwrite(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveKeyVaultConformance.OverwriteName)
        await store.Put(ref, LiveKeyVaultConformance.ValueA)
        await store.Put(ref, LiveKeyVaultConformance.ValueB)
        assert.equal(await store.Get(ref), LiveKeyVaultConformance.ValueB)
    }

    private async DeleteThenGet(): Promise<void>
    {
        const store = this.Store()
        const ref = this.Ref(LiveKeyVaultConformance.DeleteName)
        await store.Put(ref, LiveKeyVaultConformance.ValueA)
        await store.Delete(ref)
        assert.equal(await store.Get(ref), null)
    }

    private async DeleteMissing(): Promise<void>
    {
        await this.Store().Delete(this.Ref(LiveKeyVaultConformance.DeleteMissingName))
    }

    /** Unique per run so a shared vault cannot collide; recorded for cleanup. */
    private Ref(name: string): string
    {
        const ref = this.runId + LiveKeyVaultConformance.Separator + name
        this.created.push(ref)
        return ref
    }

    /** Lazily built so a skipped run never constructs the SDK client. */
    private Store(): ISecretStore
    {
        if (this.store === undefined)
        {
            const credential = new DefaultAzureCredential()
            const client = new SecretClient(this.endpoint!, credential)
            this.store = new AzureKeyVaultSecretStore(new RealKeyVaultClient(client))
        }
        return this.store
    }

    /** Best-effort: delete every created ref even if one fails; rethrow the first failure afterwards. */
    private async CleanUp(): Promise<void>
    {
        const refs = this.created.splice(0)
        if (this.store === undefined)
        {
            return
        }
        let first: unknown
        for (const ref of refs)
        {
            try
            {
                await this.store.Delete(ref)
            }
            catch (error)
            {
                first ??= error
            }
        }
        if (first !== undefined)
        {
            throw first
        }
    }
}

new LiveKeyVaultConformance().Register()
