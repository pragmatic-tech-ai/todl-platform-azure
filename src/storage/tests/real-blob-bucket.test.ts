import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ContainerClient } from '@azure/storage-blob'
import { RealBlobBucket } from '../real-blob-bucket.js'
import { FakeContainerClient } from '../../testing/fake-container-client.js'

class Fixture
{
    public static readonly Prefix = 'base/t1/'

    public readonly Container = new FakeContainerClient()
    public readonly Bucket = new RealBlobBucket(this.Container as unknown as ContainerClient, Fixture.Prefix)
}

test('Save then Download round-trips bytes 0-255', async () =>
{
    const f = new Fixture()
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    await f.Bucket.Save('a.bin', bytes)
    assert.ok(f.Container.Blobs.has('base/t1/a.bin'))
    assert.deepEqual(await f.Bucket.Download('a.bin'), bytes)
})

test('Download of a missing blob with statusCode 404 returns undefined', async () =>
{
    const f = new Fixture()
    assert.equal(await f.Bucket.Download('nope'), undefined)
})

test('Download of a missing blob with code BlobNotFound returns undefined', async () =>
{
    const f = new Fixture()
    f.Container.MissingError = () => Object.assign(new Error('missing'), { code: 'BlobNotFound' })
    assert.equal(await f.Bucket.Download('nope'), undefined)
})

test('a non-404 download error propagates', async () =>
{
    const f = new Fixture()
    f.Container.DownloadError = Object.assign(new Error('forbidden'), { statusCode: 403 })
    await assert.rejects(() => f.Bucket.Download('a'), /forbidden/)
})

test('Delete is idempotent for a missing blob and removes an existing one', async () =>
{
    const f = new Fixture()
    await f.Bucket.Delete('ghost')
    await f.Bucket.Save('a', new Uint8Array([1]))
    await f.Bucket.Delete('a')
    assert.equal(await f.Bucket.Download('a'), undefined)
})

test('ListKeys strips the prefix and ignores other prefixes', async () =>
{
    const f = new Fixture()
    f.Container.Blobs.set('other/x', new Uint8Array())
    await f.Bucket.Save('dir/a.txt', new Uint8Array([1]))
    assert.deepEqual(await f.Bucket.ListKeys(), ['dir/a.txt'])
})

test('ListKeys drains the whole async iterator', async () =>
{
    const f = new Fixture()
    const names = ['a', 'b', 'c/d', 'e', 'f', 'g']
    for (const n of names)
    {
        await f.Bucket.Save(n, new Uint8Array([1]))
    }
    assert.deepEqual((await f.Bucket.ListKeys()).sort(), [...names].sort())
})
