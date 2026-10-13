import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SecretRefEncoding } from '../secret-ref-encoding.js'

class EncodingFixture
{
    public static readonly RefA = 'tenant/a/db-password'
    public static readonly RefB = 'tenant/a/db-passwore'
    public static readonly Utf8Ref = 'tenant/世界/key_1'
    public static readonly Prefix = 'r-'
    public static readonly ValidName = /^[0-9a-zA-Z-]{1,127}$/
    public static readonly HexBody = /^[0-9a-f]+$/
    public static readonly OverLongRefLength = 200
}

test('ToSecretId is deterministic and prefixed', () =>
{
    const first = SecretRefEncoding.ToSecretId(EncodingFixture.RefA)
    assert.equal(SecretRefEncoding.ToSecretId(EncodingFixture.RefA), first)
    assert.ok(first.startsWith(EncodingFixture.Prefix))
})

test('ToSecretId is injective for distinct references', () =>
{
    assert.notEqual(SecretRefEncoding.ToSecretId(EncodingFixture.RefA), SecretRefEncoding.ToSecretId(EncodingFixture.RefB))
})

test('ToSecretId output is a valid Key Vault name with a hex body', () =>
{
    for (const ref of [EncodingFixture.RefA, EncodingFixture.Utf8Ref])
    {
        const id = SecretRefEncoding.ToSecretId(ref)
        assert.match(id, EncodingFixture.ValidName)
        assert.match(id.slice(EncodingFixture.Prefix.length), EncodingFixture.HexBody)
    }
})

test('an over-long reference throws without naming the reference or a secret', () =>
{
    const ref = 'x'.repeat(EncodingFixture.OverLongRefLength)
    assert.throws(() => SecretRefEncoding.ToSecretId(ref), (err: Error) =>
    {
        assert.ok(!err.message.includes(ref))
        assert.ok(!err.message.includes('xxx'))
        assert.ok(!/secret\s+\S*[0-9a-f]{8}/i.test(err.message))
        return true
    })
})
