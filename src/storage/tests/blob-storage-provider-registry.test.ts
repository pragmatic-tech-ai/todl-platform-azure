import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BlobServiceClient } from '@azure/storage-blob'
import { BlobStorageProviderRegistry } from '../blob-storage-provider-registry.js'
import { FakeBlobServiceClient } from '../../testing/fake-container-client.js'

class Fixture
{
    public readonly Sdk = new FakeBlobServiceClient()
    public readonly Registry = new BlobStorageProviderRegistry(this.Sdk as unknown as BlobServiceClient, 'cont', 'base/')
}

test('a repeated location returns the same cached store and shares state', async () =>
{
    const f = new Fixture()
    const a = f.Registry.CreateStorage('t1')
    assert.equal(f.Registry.CreateStorage('t1'), a)
    await a.WriteText('x.txt', 'hello')
    assert.equal(await f.Registry.CreateStorage('t1').ReadText('x.txt'), 'hello')
    assert.ok(f.Sdk.Container.Blobs.has('base/t1/x.txt'))
})

test('different locations are isolated by prefix', async () =>
{
    const f = new Fixture()
    const a = f.Registry.CreateStorage('t1')
    const b = f.Registry.CreateStorage('t2')
    assert.notEqual(a, b)
    await a.WriteText('x.txt', 'hello')
    await assert.rejects(() => b.ReadText('x.txt'), /ENOENT/)
    assert.deepEqual([...f.Sdk.Container.Blobs.keys()], ['base/t1/x.txt'])
})

test('Root carries blob://container/basePrefix/location/', () =>
{
    const f = new Fixture()
    assert.equal(f.Registry.CreateStorage('t1').Root, 'blob://cont/base/t1/')
    assert.deepEqual(f.Sdk.RequestedNames, ['cont'])
})
