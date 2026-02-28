import {IAdapterOpts} from "js-data-adapter";

export interface CloudflareAdapterParams extends IAdapterOpts{
    /**
     * Cloudflare account ID
     */
    accountId: string;

    /**
     * Cloudflare database ID
     */
    databaseId: string;

    /**
     * Cloudflare API token
     * Should contain D1 read \ edit privileges
     */
    token: string;

    /**
     * Should we create tables automatically
     */
    autocreateTables?: boolean;
}

export interface ResponseInfo {
    code: number
    message: string
    documentation_url: string;
    source: {
        pointer: string;
    }
}

export interface D1 {
    /**
     * Specifies the timestamp the resource was created as an ISO8601 string
     */
    created_at?: string;
    /**
     * The D1 database's size, in bytes
     */
    file_size?: number;
    /**
     * D1 database name
     */
    name?: string;

    /**
     * Configuration for D1 read replication.
     */
    read_replication?: {
        mode: 'auto' | 'disabled';
    }

    /**
     * D1 database identifier (UUID).
     */
    uuid?: string;

    num_tables?: number;
    version?: string;
}

export interface QueryResult<T> {
    meta?: {
        /**
         * Denotes if the database has been altered in some way, like deleting rows.
         */
        changed_db: boolean;

        /**
         * Rough indication of how many rows were modified by the query, as provided by SQLite's sqlite3_total_changes().
         */
        changes?: number

        /**
         * The duration of the SQL query execution inside the database. Does not include any network communication.
         */
        duration?: number

        /**
         * The row ID of the last inserted row in a table with an INTEGER PRIMARY KEY as provided by SQLite. Tables created with WITHOUT ROWID do not populate this.
         */
        last_row_id?: number;

        /**
         * Number of rows read during the SQL query execution, including indices (not all rows are necessarily returned).
         */
        rows_read?: number;

        /**
         * Number of rows written during the SQL query execution, including indices.
         */
        rows_written?: number

        /**
         * The three letters airport code of the colo that handled the query.
         */
        served_by_colo?: string

        /**
         * Denotes if the query has been handled by the database primary instance.
         */
        served_by_primary?: boolean

        /**
         * Region location hint of the database instance that handled the query.
         */
        served_by_region?: "WNAM" | "ENAM" | "WEUR" | "EEUR" | "APAC" | "OC",

        /**
         * Size of the database after the query committed, in bytes.
         */
        size_after?: number;

        /**
         * Various durations for the query.
         */
        timings?: {
            /**
             * The duration of the SQL query execution inside the database. Does not include any network communication
             */
            sql_duration_ms?: number
        },
    }
    results?: T,
    success?: boolean
}

export interface CloudflareResponse<T> {
    errors: Array<ResponseInfo>,
    messages: Array<ResponseInfo>,
    success?: boolean,
    result: T
}