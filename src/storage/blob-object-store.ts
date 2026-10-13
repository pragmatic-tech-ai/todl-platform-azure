import type { IStorage, StorageEntry } from '@pragmatic-tech-ai/todl-runtime'
import type { IBlobBucket } from './blob-bucket.js'

/** Blob-backed object store over an injectable IBlobBucket seam. Reproduces InMemoryObjectStore semantics:
 *  directories are derived from key prefixes; explicit empty directories are zero-byte marker objects at
 *  `<dir>/`. Text is utf-8, bytes are raw. Rename is copy-then-delete (non-atomic). Implements IStorage
 *  ONLY (no Stat/Watch/local-file companions), so the runtime capability guards report false. */
export class BlobObjectStore implements IStorage
{
    private static readonly NotFoundPrefix = 'ENOENT: '
    private static readonly RootWriteMessage = 'cannot write an object at the storage root'
    private static readonly Separator = '/'
    private static readonly PathSplitter = /[\\/]/

    public readonly Root: string
    private readonly bucket: IBlobBucket

    public constructor(bucket: IBlobBucket, root: string)
    {
        this.bucket = bucket
        this.Root = root
    }

    public async ReadText(path: string): Promise<string>
    {
        return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this.Require(path))
    }

    public ReadBytes(path: string): Promise<Uint8Array>
    {
        return this.Require(path)
    }

    public async WriteText(path: string, content: string): Promise<void>
    {
        await this.bucket.Save(BlobObjectStore.WritableKey(path), new TextEncoder().encode(content))
    }

    public async WriteBytes(path: string, bytes: Uint8Array): Promise<void>
    {
        await this.bucket.Save(BlobObjectStore.WritableKey(path), bytes)
    }

    public async Exists(path: string): Promise<boolean>
    {
        const key = BlobObjectStore.Normalize(path)
        if (key === '')
        {
            return true
        }
        if ((await this.bucket.Download(key)) !== undefined)
        {
            return true
        }
        const prefix = key + BlobObjectStore.Separator
        const keys = await this.bucket.ListKeys()
        return keys.some(k => k.startsWith(prefix))
    }

    public async Delete(path: string): Promise<void>
    {
        const key = BlobObjectStore.Normalize(path)
        const prefix = key + BlobObjectStore.Separator
        const keys = await this.bucket.ListKeys()
        for (const k of keys)
        {
            if (k === key || k.startsWith(prefix))
            {
                await this.bucket.Delete(k)
            }
        }
    }

    public async CreateDirectory(path: string): Promise<void>
    {
        let key = BlobObjectStore.Normalize(path)
        while (key !== '')
        {
            await this.bucket.Save(key + BlobObjectStore.Separator, new Uint8Array(0))
            key = BlobObjectStore.ParentOf(key)
        }
    }

    public async Rename(from: string, to: string): Promise<void>
    {
        const src = BlobObjectStore.Normalize(from)
        const dst = BlobObjectStore.Normalize(to)
        const keys = await this.bucket.ListKeys()
        const moves: { key: string, next: string, bytes: Uint8Array | undefined }[] = []
        for (const key of keys)
        {
            const isMarker = BlobObjectStore.IsMarker(key)
            const name = isMarker ? BlobObjectStore.StripMarker(key) : key
            const rewritten = BlobObjectStore.Rewrite(name, src, dst)
            if (rewritten === undefined)
            {
                continue
            }
            if (rewritten === '' && !isMarker)
            {
                throw new Error(BlobObjectStore.RootWriteMessage)
            }
            const next = isMarker ? (rewritten === '' ? '' : rewritten + BlobObjectStore.Separator) : rewritten
            moves.push({ key, next, bytes: await this.bucket.Download(key) })
        }
        for (const move of moves)
        {
            await this.bucket.Delete(move.key)
        }
        for (const move of moves)
        {
            if (move.bytes !== undefined && move.next !== '')
            {
                await this.bucket.Save(move.next, move.bytes)
            }
        }
    }

    public async List(path: string): Promise<readonly StorageEntry[]>
    {
        const dir = BlobObjectStore.Normalize(path)
        const prefix = dir === '' ? '' : dir + BlobObjectStore.Separator
        const children = new Map<string, boolean>()
        for (const key of await this.bucket.ListKeys())
        {
            if (BlobObjectStore.IsMarker(key))
            {
                BlobObjectStore.CollectChild(children, BlobObjectStore.StripMarker(key), prefix, true)
            }
            else
            {
                BlobObjectStore.CollectChild(children, key, prefix, false)
            }
        }
        return [...children].map(([Name, IsDirectory]) => ({ Name, IsDirectory }))
    }

    private async Require(path: string): Promise<Uint8Array>
    {
        const key = BlobObjectStore.Normalize(path)
        const bytes = await this.bucket.Download(key)
        if (bytes === undefined)
        {
            throw new Error(`${BlobObjectStore.NotFoundPrefix}${key}`)
        }
        return bytes
    }

    private static WritableKey(path: string): string
    {
        const key = BlobObjectStore.Normalize(path)
        if (key === '')
        {
            throw new Error(BlobObjectStore.RootWriteMessage)
        }
        return key
    }

    private static IsMarker(key: string): boolean
    {
        return key.endsWith(BlobObjectStore.Separator)
    }

    private static StripMarker(key: string): string
    {
        return BlobObjectStore.Normalize(key)
    }

    private static CollectChild(children: Map<string, boolean>, key: string, prefix: string, forceDirectory: boolean): void
    {
        if (!key.startsWith(prefix))
        {
            return
        }
        const rest = key.slice(prefix.length)
        if (rest === '')
        {
            return
        }
        const slash = rest.indexOf(BlobObjectStore.Separator)
        if (slash === -1)
        {
            children.set(rest, forceDirectory || (children.get(rest) ?? false))
        }
        else
        {
            children.set(rest.slice(0, slash), true)
        }
    }

    private static Rewrite(key: string, src: string, dst: string): string | undefined
    {
        if (key === src)
        {
            return dst
        }
        if (key.startsWith(src + BlobObjectStore.Separator))
        {
            return BlobObjectStore.Normalize(dst + key.slice(src.length))
        }
        return undefined
    }

    private static Normalize(path: string): string
    {
        return path.split(BlobObjectStore.PathSplitter).filter(s => s.length > 0).join(BlobObjectStore.Separator)
    }

    private static ParentOf(key: string): string
    {
        const slash = key.lastIndexOf(BlobObjectStore.Separator)
        return slash === -1 ? '' : key.slice(0, slash)
    }
}
