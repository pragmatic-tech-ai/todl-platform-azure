import type { SecretClient } from '@azure/keyvault-secrets'
import type { ISecretManagerClient } from './secret-manager-client.js'

/** ISecretManagerClient over the real @azure/keyvault-secrets SecretClient. Maps 404 / SecretNotFound to
 *  "absent" (undefined / no-op); EnsureSecret is a no-op because Key Vault has no empty container (a secret
 *  exists only once it has a value). Every other error is rethrown untouched (fail-closed). Logs nothing and
 *  adds no message carrying a secret id or value. */
export class RealKeyVaultClient implements ISecretManagerClient
{
    private static readonly NotFoundStatus = 404
    private static readonly SecretNotFoundCode = 'SecretNotFound'

    public constructor(private readonly client: SecretClient)
    {
    }

    public async AccessLatest(secretId: string): Promise<string | undefined>
    {
        try
        {
            const secret = await this.client.getSecret(secretId)
            return secret.value
        }
        catch (e)
        {
            if (this.IsNotFound(e))
            {
                return undefined
            }
            throw e
        }
    }

    public async EnsureSecret(_secretId: string): Promise<void>
    {
        // Intentionally empty: Key Vault cannot hold a value-less secret.
    }

    public async AddVersion(secretId: string, value: string): Promise<void>
    {
        await this.client.setSecret(secretId, value)
    }

    public async DeleteSecret(secretId: string): Promise<void>
    {
        try
        {
            const poller = await this.client.beginDeleteSecret(secretId)
            await poller.pollUntilDone()
        }
        catch (e)
        {
            if (this.IsNotFound(e))
            {
                return
            }
            throw e
        }
    }

    private IsNotFound(e: unknown): boolean
    {
        return (e as { statusCode?: number } | null | undefined)?.statusCode === RealKeyVaultClient.NotFoundStatus
            || (e as { code?: string } | null | undefined)?.code === RealKeyVaultClient.SecretNotFoundCode
    }
}
