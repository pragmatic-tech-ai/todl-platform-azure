// todl-platform-azure: Azure-backed platform adapters.
export { BlobObjectStore } from './storage/blob-object-store.js'
export type { IBlobBucket } from './storage/blob-bucket.js'
export { RealBlobBucket } from './storage/real-blob-bucket.js'
export { BlobStorageProviderRegistry } from './storage/blob-storage-provider-registry.js'
export { AzureKeyVaultSecretStore } from './secrets/azure-key-vault-secret-store.js'
export { RealKeyVaultClient } from './secrets/real-key-vault-client.js'
export { SecretRefEncoding } from './secrets/secret-ref-encoding.js'
export type { ISecretManagerClient } from './secrets/secret-manager-client.js'
