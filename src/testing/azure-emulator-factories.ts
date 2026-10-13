import type { TokenCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import { BlobServiceClient } from '@azure/storage-blob'
import type { IAzureCloudBackendsConfig, IAzureCloudBackendsFactories } from '../platform/azure-cloud-backends.js'
import type { IFlexiblePoolHandle } from '../sql/flexible-pool-factory.js'

export interface IAzureEmulatorOptions
{
    /** Azurite connection string for Blob storage */
    blobConnectionString: string
    /** Key Vault has no emulator: a live run supplies a real vault URL + credential */
    keyVaultUrl: string
    credential: TokenCredential
    /** supplies the SQL pool (there is no Flexible Server emulator; tests pass a plain local pg pool) */
    CreatePool(config: IAzureCloudBackendsConfig, password?: string): Promise<IFlexiblePoolHandle>
}

/** Test helper: AzureCloudBackends factories that point the real SDK clients at local emulators, so
 *  consumers can exercise the real backend wiring without importing the @azure clients themselves. */
export class AzureEmulatorFactories
{
    public static ForTest(options: IAzureEmulatorOptions): IAzureCloudBackendsFactories
    {
        return {
            CreateBlobService: () => BlobServiceClient.fromConnectionString(options.blobConnectionString),
            CreateSecretClient: () => new SecretClient(options.keyVaultUrl, options.credential),
            CreatePool: (config, password) => options.CreatePool(config, password)
        }
    }
}
