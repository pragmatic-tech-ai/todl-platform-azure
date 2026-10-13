import { DefaultAzureCredential } from '@azure/identity'
import pg from 'pg'

export enum FlexibleAuthMode
{
    Entra = 'entra',
    Password = 'password'
}

/** The slice of @azure/identity's credential this factory uses (injectable for tests). */
export interface IEntraCredential
{
    getToken(scope: string): Promise<{ token: string }>
}

/** The slice of pg.Pool this factory needs to tear down. */
export interface IFlexiblePool
{
    end(): Promise<void>
}

export interface IFlexiblePoolOptions
{
    host: string
    port: number
    user: string
    database: string
    authMode?: FlexibleAuthMode
    /** Already-resolved password; only meaningful with PASSWORD auth. This factory never reads a secret. */
    password?: string
    entraScope?: string
}

export interface IFlexiblePoolHandle
{
    Pool: pg.Pool
    Dispose(): Promise<void>
}

/** Builds a pg.Pool over Azure Database for PostgreSQL Flexible Server. Entra mode passes pg a password
 *  FUNCTION that mints a fresh Entra access token per connection (never cached, never logged). TLS is
 *  required in both modes. */
export class FlexiblePoolFactory
{
    private static readonly MaxConnections = 10
    private static readonly DefaultAuthMode = FlexibleAuthMode.Entra
    private static readonly DefaultEntraScope = 'https://ossrdbms-aad.database.windows.net/.default'

    public constructor(
        private readonly options: IFlexiblePoolOptions,
        private readonly createCredential: () => IEntraCredential = () =>
            new DefaultAzureCredential() as unknown as IEntraCredential,
        private readonly createPool: (cfg: Record<string, unknown>) => IFlexiblePool = cfg => new pg.Pool(cfg))
    {
    }

    public async Create(): Promise<IFlexiblePoolHandle>
    {
        const authMode = this.options.authMode ?? FlexiblePoolFactory.DefaultAuthMode
        const cfg: Record<string, unknown> = {
            host: this.options.host,
            port: this.options.port,
            user: this.options.user,
            database: this.options.database,
            max: FlexiblePoolFactory.MaxConnections,
            ssl: { rejectUnauthorized: true }
        }
        if (authMode === FlexibleAuthMode.Entra)
        {
            cfg.password = async () =>
                (await this.createCredential().getToken(this.options.entraScope ?? FlexiblePoolFactory.DefaultEntraScope)).token
        }
        else if (this.options.password !== undefined)
        {
            cfg.password = this.options.password
        }
        const pool = this.createPool(cfg)
        return {
            Pool: pool as pg.Pool,
            Dispose: async () =>
            {
                await pool.end()
            }
        }
    }
}
