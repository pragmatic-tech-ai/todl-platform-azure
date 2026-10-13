/** Network-free stand-in for the slice of @azure/storage-blob's ContainerClient / BlockBlobClient /
 *  BlobServiceClient that RealBlobBucket uses. Cast `as unknown as ContainerClient` at the call site. */
export class FakeBlockBlobClient
{
    private readonly owner: FakeContainerClient
    private readonly name: string

    public constructor(owner: FakeContainerClient, name: string)
    {
        this.owner = owner
        this.name = name
    }

    public async uploadData(data: Buffer): Promise<void>
    {
        this.owner.Blobs.set(this.name, new Uint8Array(data))
    }

    public async downloadToBuffer(): Promise<Buffer>
    {
        if (this.owner.DownloadError !== undefined)
        {
            throw this.owner.DownloadError
        }
        const bytes = this.owner.Blobs.get(this.name)
        if (bytes === undefined)
        {
            throw this.owner.MissingError()
        }
        return Buffer.from(bytes)
    }

    public async deleteIfExists(): Promise<{ succeeded: boolean }>
    {
        return { succeeded: this.owner.Blobs.delete(this.name) }
    }
}

export class FakeContainerClient
{
    public readonly Blobs = new Map<string, Uint8Array>()
    /** When set, downloadToBuffer throws this regardless of presence. */
    public DownloadError: Error | undefined
    /** Shapes the error thrown for a missing blob. */
    public MissingError: () => Error = () => Object.assign(new Error('not found'), { statusCode: 404 })

    public getBlockBlobClient(name: string): FakeBlockBlobClient
    {
        return new FakeBlockBlobClient(this, name)
    }

    public async *listBlobsFlat(options: { prefix?: string }): AsyncGenerator<{ name: string }>
    {
        for (const name of [...this.Blobs.keys()])
        {
            if (name.startsWith(options.prefix ?? ''))
            {
                await Promise.resolve()
                yield { name }
            }
        }
    }
}

export class FakeBlobServiceClient
{
    public readonly Container = new FakeContainerClient()
    public readonly RequestedNames: string[] = []

    public getContainerClient(name: string): FakeContainerClient
    {
        this.RequestedNames.push(name)
        return this.Container
    }
}
