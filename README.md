# @pragmatic-tech-ai/todl-platform-azure

Azure-backed platform adapters for `pragmatic-server` running in `DeploymentMode.Cloud`:

- **BlobObjectStore** — an `IStorage` over Azure Blob Storage.
- **AzureKeyVaultSecretStore** — an identity `ISecretStore` over Azure Key Vault (Stage B).
- **FlexiblePoolFactory** — a managed-Postgres `pg.Pool` over Azure Database for PostgreSQL Flexible Server (Stage C).

## Build & test

```
npm install
npx tsc -p tsconfig.build.json --noEmit
npx tsx --test "src/**/*.test.ts"
```

Emulator/live tests are opt-in (Azurite) and skip cleanly by default when their env var is unset.

LOCAL repository (no remote).
