import { before } from 'node:test'
import { randomBytes } from 'node:crypto'
import type { ContainerClient } from '@azure/storage-blob'
import { BlobServiceClient } from '@azure/storage-blob'
import { BlobObjectStore } from '../blob-object-store.js'
import { RealBlobBucket } from '../real-blob-bucket.js'
import { IStorageConformance } from '../../testing/istorage-conformance.js'

/** Gated: runs the shared IStorage conformance suite against the real SDK + RealBlobBucket pointed at an
 *  Azurite emulator. Skips unless PRAGMATIC_TEST_BLOB_CONNSTR and PRAGMATIC_TEST_BLOB_CONTAINER are set.
 *  The connection string is read from the environment and never logged. */
class LiveBlobConformance
{
    private static readonly ConnStrVar = 'PRAGMATIC_TEST_BLOB_CONNSTR'
    private static readonly ContainerVar = 'PRAGMATIC_TEST_BLOB_CONTAINER'
    private static readonly Descriptor = 'object://bucket'
    private static readonly RunPrefix = 'run-'
    private static readonly Separator = '/'
    private static readonly SkipReason = 'set PRAGMATIC_TEST_BLOB_CONNSTR and PRAGMATIC_TEST_BLOB_CONTAINER to run'

    private readonly connStr: string | undefined = process.env[LiveBlobConformance.ConnStrVar]
    private readonly containerName: string | undefined = process.env[LiveBlobConformance.ContainerVar]
    private readonly prefixes: string[] = []
    private container: ContainerClient | undefined

    public Register(): void
    {
        const enabled = this.connStr !== undefined && this.containerName !== undefined
        if (enabled)
        {
            before(async () =>
            {
                await this.Container().createIfNotExists()
            })
        }
        IStorageConformance.Run(() => this.MakeStore(), {
            AssertCapabilityOmission: true,
            ExpectedRoot: LiveBlobConformance.Descriptor,
            Skip: enabled ? false : LiveBlobConformance.SkipReason,
            Cleanup: () => this.CleanUp()
        })
    }

    private MakeStore(): BlobObjectStore
    {
        const prefix = LiveBlobConformance.RunPrefix + randomBytes(8).toString('hex') + LiveBlobConformance.Separator
        this.prefixes.push(prefix)
        return new BlobObjectStore(new RealBlobBucket(this.Container(), prefix), LiveBlobConformance.Descriptor)
    }

    private Container(): ContainerClient
    {
        if (this.container === undefined)
        {
            const service = BlobServiceClient.fromConnectionString(this.connStr as string)
            this.container = service.getContainerClient(this.containerName as string)
        }
        return this.container
    }

    private async CleanUp(): Promise<void>
    {
        const container = this.container
        const prefixes = this.prefixes.splice(0)
        if (container === undefined)
        {
            return
        }
        for (const prefix of prefixes)
        {
            for await (const blob of container.listBlobsFlat({ prefix }))
            {
                await container.getBlockBlobClient(blob.name).deleteIfExists()
            }
        }
    }
}

new LiveBlobConformance().Register()
