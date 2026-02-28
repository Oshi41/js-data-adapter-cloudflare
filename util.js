import {Mapper, utils} from "js-data";
import knexLib from "knex";

/**
 * Convert camelCase to snake_case
 * @param str {string}
 * @return {string}
 */
export function underscore(str) {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// Create knex instance for query building only
// Using a mock connection since we only need the query builder, not actual DB connection
export const knex = (knexLib.knex || knexLib)({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
});

/**
 *
 * @param builder {QueryBuilder}
 * @param query
 * @return {*}
 */
export function toSql(builder, query) {
    query = utils.plainCopy(query);

    if ('limit' in query) {
        builder = builder.limit(query.limit);
        delete query.limit;
    }

    if ('offset' in query) {
        builder = builder.offset(query.offset);
        delete query.offset;
    }

    if ('orderBy' in query) {
        for (const [name, direction] of query.orderBy) {
            builder = builder.orderBy(name, direction.toLocaleLowerCase());
        }

        delete query.orderBy;
    }

    if ('where' in query) {
        builder = toSql(builder, query.where);
        delete query.where;
    }

    for (let [field, cond] of Object.entries(query)) {
        delete query[field];
        for (let [op, value] of Object.entries(cond)) {
            switch (op) {
                case '==':
                case '===':
                    builder = builder.where(field, '=', value);
                    break;

                case '!=':
                case '!==':
                    builder = builder.where(field, '<>', value);
                    break;

                case '>':
                    builder = builder.where(field, '>', value);
                    break;

                case '>=':
                    builder = builder.where(field, '>=', value);
                    break;

                case '<':
                    builder = builder.where(field, '<', value);
                    break;

                case '<=':
                    builder = builder.where(field, '<=', value);
                    break;

                case 'in':
                case 'contains':
                    builder = builder.whereIn(field, value);
                    break;

                case 'notIn':
                case 'notContains':
                    builder = builder.whereNotIn(field, value);
                    break;
            }
        }
    }

    return builder;
}

/**
 *
 * @param mapper {Mapper}
 * @param tableName {string}
 */
export function createTableSql(mapper, tableName) {
    const columns = [];
    const schema = mapper.schema || {};
    const properties = schema.properties || {};

    // Add id column if it doesn't exist in schema
    const idAttribute = mapper.idAttribute || '_id';
    if (!properties[idAttribute]) {
        columns.push(`${idAttribute} INTEGER PRIMARY KEY AUTOINCREMENT`);
    }

    // Generate columns from schema
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        if (fieldName === idAttribute && columns.length > 0) {
            continue; // Already added
        }

        let columnDef = fieldName;

        // Determine column type
        if (fieldSchema.type) {
            switch (fieldSchema.type) {
                case 'string':
                    columnDef += ' TEXT';
                    break;
                case 'number':
                case 'integer':
                    columnDef += ' INTEGER';
                    break;
                case 'boolean':
                    columnDef += ' INTEGER'; // SQLite uses 0/1 for boolean
                    break;
                case 'object':
                case 'array':
                    columnDef += ' TEXT'; // Store as JSON
                    break;
                default:
                    columnDef += ' TEXT';
            }
        } else {
            columnDef += ' TEXT';
        }

        // Add constraints
        if (fieldName === idAttribute) {
            columnDef += ' PRIMARY KEY AUTOINCREMENT';
        }

        if (fieldSchema.required || fieldSchema.notNull) {
            columnDef += ' NOT NULL';
        }

        if (fieldSchema.unique) {
            columnDef += ' UNIQUE';
        }

        if (fieldSchema.default !== undefined) {
            if (typeof fieldSchema.default === 'string') {
                columnDef += ` DEFAULT '${fieldSchema.default}'`;
            } else {
                columnDef += ` DEFAULT ${fieldSchema.default}`;
            }
        }

        columns.push(columnDef);
    }

    // If no schema provided, create a simple table with id
    if (columns.length === 0) {
        columns.push(`${idAttribute} INTEGER PRIMARY KEY AUTOINCREMENT`);
    }

    return `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`;
}