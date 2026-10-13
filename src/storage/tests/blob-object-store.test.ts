import { BlobObjectStore } from '../blob-object-store.js'
import { FakeBlobBucket } from '../../testing/fake-blob-bucket.js'
import { IStorageConformance } from '../../testing/istorage-conformance.js'

class FakeBlobConformance
{
    private static readonly Descriptor = 'object://bucket'

    public static Register(): void
    {
        IStorageConformance.Run(() => new BlobObjectStore(new FakeBlobBucket(), FakeBlobConformance.Descriptor), {
            AssertCapabilityOmission: true,
            ExpectedRoot: FakeBlobConformance.Descriptor,
            Skip: false
        })
    }
}

FakeBlobConformance.Register()
