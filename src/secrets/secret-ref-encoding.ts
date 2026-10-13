/** Maps an ISecretStore reference (which may contain '/' and other chars) to a valid Azure Key Vault
 *  secret name. Key Vault names allow only [0-9a-zA-Z-] (1-127 chars); lowercase hex ([0-9a-f]) plus the
 *  fixed 'r-' prefix is injective and within that alphabet, whereas base64url's '_' would be rejected.
 *  Not reversed anywhere (the store never enumerates names back to references), so a one-way
 *  deterministic injective map suffices. */
export class SecretRefEncoding
{
    private static readonly Prefix = 'r-'
    private static readonly MaxIdLength = 127
    private static readonly TooLongMessage = 'Secret reference is too long to encode as a Key Vault secret name'

    public static ToSecretId(reference: string): string
    {
        const id = SecretRefEncoding.Prefix + Buffer.from(reference, 'utf8').toString('hex')
        if (id.length > SecretRefEncoding.MaxIdLength)
        {
            throw new Error(SecretRefEncoding.TooLongMessage)
        }
        return id
    }
}
