import {Mapper, utils} from 'js-data';
import {Adapter} from 'js-data-adapter';
import {createTableSql, knex, toSql, underscore} from "./util.js";

export class CloudflareAdapter extends Adapter {
    /*** @type {RequestInit}*/
    #params;
    #url;
    #tableCache = new Set();

    /**
     * @param params {CloudflareAdapterParams}
     */
    constructor(params) {
        super(params);

        this.#params = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + params.token,
            },
            method: 'POST',
        };
        this.#url = `https://api.cloudflare.com/client/v4/accounts/${params.accountId}/d1/database/${params.databaseId}`;

        (async () => {
            const resp = await this._executeSQL('select name from sqlite_master');
            resp?.results?.map(x => x.name).forEach((x) => this.#tableCache.add(x));
        })()
    }

    /**
     * Execute HTTP request to Cloudflare D1 API
     * @typeParam {any} T
     * @param url {string}
     * @param params {RequestInit}
     * @return {Promise<CloudflareResponse<T>>}
     */
    async HTTP(url, params) {
        this.dbg('HTTP Request', {url, method: params.method, hasBody: !!params.body});
        const startTime = Date.now();

        try {
            const response = await fetch(url, params);
            const duration = Date.now() - startTime;
            const data = await response.json();

            this.dbg('HTTP Response', {
                url,
                status: response.status,
                duration: `${duration}ms`,
                success: data.success
            });

            return data;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.dbg('HTTP Error', {url, duration: `${duration}ms`, error: error.message});
            throw error;
        }
    }

    /**
     * Execute SQL query against D1
     * @param sql {string}
     * @param params {any[]}
     * @return {Promise<QueryResult<any>>}
     * @private
     */
    async _executeSQL(sql, params = []) {
        this.dbg('Executing SQL', {sql, params});

        const resp = await this.HTTP(this.#url + '/query', {
            ...this.#params,
            body: JSON.stringify({
                sql,
                params
            }),
        });

        if (!resp.success) {
            this.dbg('SQL Error', {sql, errors: resp.errors});
            throw new Error(resp.errors[0]?.message || 'Unknown error');
        }

        this.dbg('SQL Success', {
            rowsRead: resp.result[0]?.meta?.rows_read,
            rowsWritten: resp.result[0]?.meta?.rows_written,
            duration: resp.result[0]?.meta?.duration
        });

        return resp.result[0];
    }

    /**
     * Get table name from mapper
     * @param mapper {Mapper}
     * @return {string}
     * @private
     */
    _getTable(mapper) {
        return mapper.table || underscore(mapper.name);
    }

    /**
     * Ensure table exists, create if it doesn't
     * @param mapper {Mapper}
     * @return {Promise<void>}
     * @private
     */
    async _ensureTable(mapper) {
        const tableName = this._getTable(mapper);

        // Check cache first
        if (this.#tableCache.has(tableName)) {
            return;
        }

        if (!this.autocreateTables) {
            this.dbg('Table is not exists', {tableName});
            throw new Error(`Table ${tableName} not found`);
        }

        this.dbg('Trying to create table', {tableName});
        const createSQL = createTableSql(mapper, tableName);
        await this._executeSQL(createSQL);
        this.dbg('Table created successfully', {tableName, sql: createSQL});

        // Cache the table existence
        this.#tableCache.add(tableName);
    }

    /**
     * Count records
     * @param mapper {Mapper}
     * @param query
     * @param opts
     * @return {Promise<[number, any]>}
     * @private
     */
    async _count(mapper, query, opts) {
        this.dbg('_count', {mapper: mapper.name, query});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        let builder = knex(table).count('* as count');
        builder = toSql(builder, query || {});
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);
        const count = result.results?.[0]?.count || 0;

        this.dbg('_count result', {count});
        return [count, result.meta];
    }

    /**
     * Create a single record
     * @param mapper {Mapper}
     * @param props
     * @param opts
     * @return {Promise<[any, any]>}
     * @private
     */
    async _create(mapper, props, opts) {
        this.dbg('_create', {mapper: mapper.name, props});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        const builder = knex(table).insert(props);
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);
        const id = result.meta?.last_row_id;

        if (id) {
            props[mapper.idAttribute] = id;
        }

        this.dbg('_create result', {id, props});
        return [props, result.meta];
    }

    /**
     * Create multiple records
     * @param mapper {Mapper}
     * @param props
     * @param opts
     * @return {Promise<[any[], any]>}
     * @private
     */
    async _createMany(mapper, props, opts) {
        this.dbg('_createMany', {mapper: mapper.name, count: props.length});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        const builder = knex(table).insert(props);
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);

        // Note: D1 doesn't return individual IDs for batch inserts
        this.dbg('_createMany result', {count: props.length});
        return [props, result.meta];
    }

    /**
     * Find a single record by ID
     * @param mapper {Mapper}
     * @param id
     * @param opts
     * @return {Promise<[any, any]>}
     * @private
     */
    async _find(mapper, id, opts) {
        this.dbg('_find', {mapper: mapper.name, id});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        const builder = knex(table)
            .where(mapper.idAttribute, '=', id)
            .limit(1);
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);
        const record = result.results?.[0];

        this.dbg('_find result', {found: !!record});
        return [record, result.meta];
    }

    /**
     * Find all records matching query
     * @param mapper {Mapper}
     * @param query
     * @param opts
     * @return {Promise<[any[], any]>}
     * @private
     */
    async _findAll(mapper, query, opts) {
        this.dbg('_findAll', {mapper: mapper.name, query});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        let builder = knex(table).select('*');
        builder = toSql(builder, query || {});
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);
        const records = result.results || [];

        this.dbg('_findAll result', {count: records.length});
        return [records, result.meta];
    }

    /**
     * Update a single record by ID
     * @param mapper {Mapper}
     * @param id
     * @param props
     * @param opts
     * @return {Promise<[any, any]>}
     * @private
     */
    async _update(mapper, id, props, opts) {
        this.dbg('_update', {mapper: mapper.name, id, props});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        const builder = knex(table)
            .where(mapper.idAttribute, '=', id)
            .update(props);
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);

        // Fetch the updated record
        const [record] = await this._find(mapper, id, opts);

        this.dbg('_update result', {updated: result.meta?.changes > 0});
        return [record, result.meta];
    }

    /**
     * Update all records matching query
     * @param mapper {Mapper}
     * @param props
     * @param query
     * @param opts
     * @return {Promise<[any[], any]>}
     * @private
     */
    async _updateAll(mapper, props, query, opts) {
        this.dbg('_updateAll', {mapper: mapper.name, props, query});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        let builder = knex(table).update(props);
        builder = toSql(builder, query || {});
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);

        // Note: D1 doesn't return updated records, would need a separate query
        this.dbg('_updateAll result', {changes: result.meta?.changes});
        return [[], result.meta];
    }

    /**
     * Update many records
     * @param mapper {Mapper}
     * @param records
     * @param opts
     * @return {Promise<[any[], any]>}
     * @private
     */
    async _updateMany(mapper, records, opts) {
        this.dbg('_updateMany', {mapper: mapper.name, count: records.length});

        const results = [];
        const metas = [];

        for (const record of records) {
            const id = utils.get(record, mapper.idAttribute);
            const [updated, meta] = await this._update(mapper, id, record, opts);
            results.push(updated);
            metas.push(meta);
        }

        this.dbg('_updateMany result', {count: results.length});
        return [results, {updates: metas}];
    }

    /**
     * Destroy a single record by ID
     * @param mapper {Mapper}
     * @param id
     * @param opts
     * @return {Promise<[undefined, any]>}
     * @private
     */
    async _destroy(mapper, id, opts) {
        this.dbg('_destroy', {mapper: mapper.name, id});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        const builder = knex(table)
            .where(mapper.idAttribute, '=', id)
            .delete();
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);

        this.dbg('_destroy result', {deleted: result.meta?.changes > 0});
        return [undefined, result.meta];
    }

    /**
     * Destroy all records matching query
     * @param mapper {Mapper}
     * @param query
     * @param opts
     * @return {Promise<[undefined, any]>}
     * @private
     */
    async _destroyAll(mapper, query, opts) {
        this.dbg('_destroyAll', {mapper: mapper.name, query});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        let builder = knex(table).delete();
        builder = toSql(builder, query || {});
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);

        this.dbg('_destroyAll result', {changes: result.meta?.changes});
        return [undefined, result.meta];
    }

    /**
     * Sum a field
     * @param mapper {Mapper}
     * @param field
     * @param query
     * @param opts
     * @return {Promise<[number, any]>}
     * @private
     */
    async _sum(mapper, field, query, opts) {
        this.dbg('_sum', {mapper: mapper.name, field, query});
        await this._ensureTable(mapper);
        const table = this._getTable(mapper);

        let builder = knex(table).sum(`${field} as sum`);
        builder = toSql(builder, query || {});
        const {sql, bindings} = builder.toSQL();

        const result = await this._executeSQL(sql, bindings);
        const sum = result.results?.[0]?.sum || 0;

        this.dbg('_sum result', {sum});
        return [sum, result.meta];
    }
}
