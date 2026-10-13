import type { ContainerClient } from '@azure/storage-blob'
import type { IBlobBucket } from './blob-bucket.js'

/** Thin @azure/storage-blob wrapper behind IBlobBucket. The prefix is prepended on the way in and stripped on
 *  the way out so BlobObjectStore only ever sees location-relative keys. Logs nothing. */
export class RealBlobBucket implements IBlobBucket
{
    private static readonly NotFoundStatus = 404
    private static readonly BlobNotFoundCode = 'BlobNotFound'

    private readonly container: ContainerClient
    private readonly prefix: string

    public constructor(container: ContainerClient, prefix: string)
    {
        this.container = container
        this.prefix = prefix
    }

    public async Save(key: string, bytes: Uint8Array): Promise<void>
    {
        await this.container.getBlockBlobClient(this.prefix + key).uploadData(Buffer.from(bytes))
    }

    public async Download(key: string): Promise<Uint8Array | undefined>
    {
        try
        {
            const buffer = await this.container.getBlockBlobClient(this.prefix + key).downloadToBuffer()
            return new Uint8Array(buffer)
        }
        catch (e)
        {
            if (RealBlobBucket.IsNotFound(e))
            {
                return undefined
            }
            throw e
        }
    }

    public async Delete(key: string): Promise<void>
    {
        await this.container.getBlockBlobClient(this.prefix + key).deleteIfExists()
    }

    public async ListKeys(): Promise<string[]>
    {
        const keys: string[] = []
        for await (const blob of this.container.listBlobsFlat({ prefix: this.prefix }))
        {
            keys.push(blob.name.slice(this.prefix.length))
        }
        return keys
    }

    private static IsNotFound(e: unknown): boolean
    {
        const err = e as { statusCode?: number, code?: string }
        return err.statusCode === RealBlobBucket.NotFoundStatus
            || err.code === RealBlobBucket.BlobNotFoundCode
    }
}
