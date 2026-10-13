import type { BlobServiceClient } from '@azure/storage-blob'
import type { IStorageProviderRegistry } from '@pragmatic-tech-ai/todl'
import type { IStorage } from '@pragmatic-tech-ai/todl-runtime'
import { BlobObjectStore } from './blob-object-store.js'
import { RealBlobBucket } from './real-blob-bucket.js'

/** Blob storage provider registry: one BlobObjectStore per location, each isolated under its own blob-name
 *  prefix (`basePrefix/location/`) within a single container. A repeated location returns the cached store. */
export class BlobStorageProviderRegistry implements IStorageProviderRegistry
{
    private static readonly Separator = '/'
    private static readonly RootScheme = 'blob://'

    private readonly stores = new Map<string, BlobObjectStore>()
    private readonly service: BlobServiceClient
    private readonly containerName: string
    private readonly basePrefix: string

    public constructor(service: BlobServiceClient, containerName: string, basePrefix: string)
    {
        this.service = service
        this.containerName = containerName
        this.basePrefix = basePrefix
    }

    public CreateStorage(location: string): IStorage
    {
        const existing = this.stores.get(location)
        if (existing !== undefined)
        {
            return existing
        }
        const prefix = this.PrefixFor(location)
        const created = new BlobObjectStore(
            new RealBlobBucket(this.service.getContainerClient(this.containerName), prefix),
            this.RootDescriptor(prefix))
        this.stores.set(location, created)
        return created
    }

    private PrefixFor(location: string): string
    {
        const sep = BlobStorageProviderRegistry.Separator
        const parts = [this.basePrefix, location].join(sep).split(sep).filter(p => p.length > 0)
        return parts.length === 0 ? '' : parts.join(sep) + sep
    }

    private RootDescriptor(prefix: string): string
    {
        return BlobStorageProviderRegistry.RootScheme + this.containerName + BlobStorageProviderRegistry.Separator + prefix
    }
}
