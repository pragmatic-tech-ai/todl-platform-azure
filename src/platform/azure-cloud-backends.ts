import { DefaultAzureCredential } from '@azure/identity'
import { SecretClient } from '@azure/keyvault-secrets'
import { BlobServiceClient } from '@azure/storage-blob'
import type { ISqlSession, IStorageProviderRegistry } from '@pragmatic-tech-ai/todl'
import type { ISecretStore } from '@pragmatic-tech-ai/todl-identity'
import { PgSession } from '@pragmatic-tech-ai/todl-platform-cloud'
import { AzureKeyVaultSecretStore } from '../secrets/azure-key-vault-secret-store.js'
import { RealKeyVaultClient } from '../secrets/real-key-vault-client.js'
import { FlexibleAuthMode, FlexiblePoolFactory } from '../sql/flexible-pool-factory.js'
import type { IFlexiblePoolHandle } from '../sql/flexible-pool-factory.js'
import { BlobStorageProviderRegistry } from '../storage/blob-storage-provider-registry.js'

export interface IAzureCloudBackendsConfig
{
    blobAccount: string
    blobContainer: string
    blobPrefix?: string
    keyVaultUrl: string
    azpgHost: string
    azpgPort?: number
    azpgUser: string
    azpgDatabase: string
    azpgAuth?: string
    azpgPasswordRef?: string
}

/** Injectable SDK/pool construction (defaults build the real clients). */
export interface IAzureCloudBackendsFactories
{
    CreateBlobService(config: IAzureCloudBackendsConfig): BlobServiceClient
    CreateSecretClient(config: IAzureCloudBackendsConfig): SecretClient
    CreatePool(config: IAzureCloudBackendsConfig, password?: string): Promise<IFlexiblePoolHandle>
}

/** Blob storage + Key Vault + Flexible Server session, assembled from config. Owns the pool lifecycle. */
export class AzureCloudBackends
{
    private static readonly BlobHostScheme = 'https://'
    private static readonly BlobHostSuffix = '.blob.core.windows.net'
    private static readonly DefaultFlexiblePort = 5432
    private static readonly MissingFlexiblePasswordRef = 'Flexible Server password authentication requires a password secret reference'
    private static readonly FlexiblePasswordAbsent = 'Flexible Server password secret could not be resolved'
    private static readonly InvalidFlexibleAuth = 'Invalid azpgAuth'

    private static readonly DefaultFactories: IAzureCloudBackendsFactories = {
        CreateBlobService: config => new BlobServiceClient(
            AzureCloudBackends.BlobHostScheme + config.blobAccount + AzureCloudBackends.BlobHostSuffix,
            new DefaultAzureCredential()),
        CreateSecretClient: config => new SecretClient(config.keyVaultUrl, new DefaultAzureCredential()),
        CreatePool: (config, password) => new FlexiblePoolFactory({
            host: config.azpgHost,
            port: config.azpgPort ?? AzureCloudBackends.DefaultFlexiblePort,
            user: config.azpgUser,
            database: config.azpgDatabase,
            authMode: AzureCloudBackends.ParseAuth(config.azpgAuth),
            password
        }).Create()
    }

    private constructor(
        public readonly Storage: IStorageProviderRegistry,
        public readonly SecretManager: ISecretStore,
        public readonly Session: ISqlSession,
        private readonly sql: IFlexiblePoolHandle)
    {
    }

    public static async Create(
        config: IAzureCloudBackendsConfig,
        factories: IAzureCloudBackendsFactories = AzureCloudBackends.DefaultFactories): Promise<AzureCloudBackends>
    {
        const authMode = AzureCloudBackends.ParseAuth(config.azpgAuth)
        const storage = new BlobStorageProviderRegistry(
            factories.CreateBlobService(config), config.blobContainer, config.blobPrefix ?? '')
        const secretManager = new AzureKeyVaultSecretStore(
            new RealKeyVaultClient(factories.CreateSecretClient(config)))
        let password: string | undefined
        if (authMode === FlexibleAuthMode.Password)
        {
            const ref = config.azpgPasswordRef
            if (ref === undefined)
            {
                throw new Error(AzureCloudBackends.MissingFlexiblePasswordRef)
            }
            const resolved = await secretManager.Get(ref)
            if (resolved === null)
            {
                throw new Error(AzureCloudBackends.FlexiblePasswordAbsent)
            }
            password = resolved
        }
        const sql = await factories.CreatePool(config, password)
        return new AzureCloudBackends(storage, secretManager, new PgSession(sql.Pool), sql)
    }

    /** Ends the pool, once. Deliberately does NOT also call Session.Dispose()
     *  (PgSession.Dispose also ends the pool: calling both would double-close it). */
    public async Dispose(): Promise<void>
    {
        await this.sql.Dispose()
    }

    private static ParseAuth(value: string | undefined): FlexibleAuthMode | undefined
    {
        if (value === undefined)
        {
            return undefined
        }
        const found = Object.values(FlexibleAuthMode).find(v => v === value.toLowerCase())
        if (found === undefined)
        {
            throw new Error(AzureCloudBackends.InvalidFlexibleAuth)
        }
        return found
    }
}
