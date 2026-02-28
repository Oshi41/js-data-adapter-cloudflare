# js-data-adapter-cloudflare

A [js-data](https://www.js-data.io/) adapter for [Cloudflare D1](https://developers.cloudflare.com/d1/) databases, allowing you to interact with D1 databases using the js-data ORM pattern via Cloudflare's HTTP API.

## Features

- ✅ Full CRUD operations (Create, Read, Update, Delete)
- ✅ **Automatic table creation** - Tables are created automatically if they don't exist
- ✅ Advanced querying with filters, sorting, pagination
- ✅ Aggregate operations (count, sum)
- ✅ Batch operations (createMany, updateMany, destroyAll)
- ✅ Built-in query builder using Knex.js
- ✅ Schema-based table generation
- ✅ Comprehensive logging for debugging
- ✅ TypeScript definitions included
- ✅ Fully tested

## Installation

```bash
npm install js-data-adapter-cloudflare
```

## Quick Start

```javascript
import {CloudflareAdapter} from 'js-data-adapter-cloudflare';
import {DataStore} from 'js-data';

// Create adapter instance
const adapter = new CloudflareAdapter({
    accountId: 'your-cloudflare-account-id',
    databaseId: 'your-d1-database-id',
    token: 'your-cloudflare-api-token'
});

// Create DataStore and register adapter
const store = new DataStore();
store.registerAdapter('cloudflare', adapter, {default: true});

// Define a mapper
const User = store.defineMapper('user', {
    // Optional: specify table name (defaults to underscored mapper name)
    table: 'users'
});

// Now you can use js-data methods
const user = await User.create({
    name: 'John Doe',
    email: 'john@example.com'
});

const users = await User.findAll({
    where: {
        status: {'==': 'active'}
    },
    limit: 10
});
```

## Configuration

### CloudflareAdapterParams

```typescript
interface CloudflareAdapterParams {
    /**
     * Cloudflare account ID
     */
    accountId: string;

    /**
     * Cloudflare D1 database ID
     */
    databaseId: string;

    /**
     * Cloudflare API token with D1 read/edit privileges
     */
    token: string;

    /**
     * Enable automatic table creation (optional, default: true)
     */
    autocreateTables?: boolean;

    /**
     * Enable debug logging (optional)
     */
    debug?: boolean;

    /**
     * Return raw responses with metadata (optional)
     */
    raw?: boolean;
}
```

### Getting Cloudflare Credentials

1. **Account ID**: Found in your Cloudflare dashboard URL: `https://dash.cloudflare.com/{accountId}`
2. **Database ID**: Found in the D1 database dashboard
3. **API Token**: Create an API token with D1 read/write permissions at `https://dash.cloudflare.com/profile/api-tokens`

## Automatic Table Creation

One of the key features of this adapter is **automatic table creation**. You don't need to manually create tables in your D1 database - the adapter will automatically create them when you perform your first operation.

### How It Works

When you perform any CRUD operation, the adapter:
1. Checks its internal cache to see if the table has been processed
2. If not cached, executes `CREATE TABLE IF NOT EXISTS` based on your mapper configuration
3. Caches the table name to avoid repeated CREATE TABLE statements

The adapter uses SQLite's `CREATE TABLE IF NOT EXISTS` statement, which safely creates the table only if it doesn't already exist. This approach is efficient and eliminates the need for a separate existence check.

### Basic Table Creation

Without a schema, the adapter creates a simple table with an auto-incrementing ID:

```javascript
const User = store.defineMapper('user');

// This will automatically create a table with: id INTEGER PRIMARY KEY AUTOINCREMENT
await User.create({name: 'John Doe'});
```

### Schema-Based Table Creation

For more control, define a schema to specify column types and constraints:

```javascript
const User = store.defineMapper('user', {
    schema: {
        properties: {
            id: {type: 'integer'},
            name: {type: 'string', required: true},
            email: {type: 'string', unique: true},
            age: {type: 'integer'},
            active: {type: 'boolean', default: true},
            created_at: {type: 'string'}
        }
    }
});

// First operation will create table:
// CREATE TABLE IF NOT EXISTS user (
//   id INTEGER PRIMARY KEY AUTOINCREMENT,
//   name TEXT NOT NULL,
//   email TEXT UNIQUE,
//   age INTEGER,
//   active INTEGER DEFAULT true,
//   created_at TEXT
// )
await User.create({
    name: 'Jane Smith',
    email: 'jane@example.com',
    age: 25,
    active: true
});
```

### Supported Schema Types

- `string` → TEXT
- `integer`, `number` → INTEGER
- `boolean` → INTEGER (0 or 1)
- `object`, `array` → TEXT (stored as JSON)

### Supported Constraints

- `required` or `notNull` → NOT NULL
- `unique` → UNIQUE
- `default` → DEFAULT value

### Performance

The adapter caches table creation attempts, so the overhead is minimal:
- First operation: Executes `CREATE TABLE IF NOT EXISTS` and caches the table name
- Subsequent operations: Uses cached result, no additional queries

### Disabling Auto-Creation

If you prefer to manage tables manually, you can disable automatic table creation:

```javascript
const adapter = new CloudflareAdapter({
    accountId: 'your-account-id',
    databaseId: 'your-database-id',
    token: 'your-token',
    autocreateTables: false // Disable auto-creation
});

// Now tables must exist before operations, or an error will be thrown
```

## Usage Examples

### Basic CRUD Operations

#### Create

```javascript
// Create single record
const user = await User.create({
    name: 'Jane Smith',
    email: 'jane@example.com',
    status: 'active'
});

// Create multiple records
const users = await User.createMany([
    {name: 'User 1', email: 'user1@example.com'},
    {name: 'User 2', email: 'user2@example.com'},
    {name: 'User 3', email: 'user3@example.com'}
]);
```

#### Read

```javascript
// Find by ID
const user = await User.find(1);

// Find all
const allUsers = await User.findAll();

// Find with filters
const activeUsers = await User.findAll({
    where: {
        status: {'==': 'active'},
        age: {'>=': 18}
    }
});

// Find with sorting
const sortedUsers = await User.findAll({
    orderBy: [['created_at', 'DESC']]
});

// Find with pagination
const pagedUsers = await User.findAll({
    limit: 10,
    offset: 20
});

// Complex queries
const results = await User.findAll({
    where: {
        status: {'==': 'active'},
        email: {contains: '@example.com'},
        age: {
            '>=': 18,
            '<': 65
        }
    },
    orderBy: [['name', 'ASC']],
    limit: 50,
    offset: 0
});
```

#### Update

```javascript
// Update single record
const updatedUser = await User.update(1, {
    name: 'Updated Name',
    email: 'updated@example.com'
});

// Update multiple specific records
const users = await User.updateMany([
    {id: 1, status: 'inactive'},
    {id: 2, status: 'inactive'}
]);

// Update all matching records
await User.updateAll(
    {status: 'inactive'}, // props to update
    {where: {last_login: {'<': '2023-01-01'}}} // query
);
```

#### Delete

```javascript
// Delete single record
await User.destroy(1);

// Delete all matching records
await User.destroyAll({
    where: {
        status: {'==': 'deleted'},
        created_at: {'<': '2022-01-01'}
    }
});
```

### Aggregate Operations

```javascript
// Count all records
const totalUsers = await User.count();

// Count with filters
const activeCount = await User.count({
    where: {status: {'==': 'active'}}
});

// Sum a field
const totalAmount = await User.sum('amount', {
    where: {status: {'==': 'completed'}}
});
```

### Query Operators

The adapter supports the following query operators:

- `==` or `===` - Equals
- `!=` or `!==` - Not equals
- `>` - Greater than
- `>=` - Greater than or equal
- `<` - Less than
- `<=` - Less than or equal
- `in` or `contains` - Value in array
- `notIn` or `notContains` - Value not in array

Example:

```javascript
const users = await User.findAll({
    where: {
        age: {'>=': 18, '<': 65},
        status: {in: ['active', 'pending']},
        role: {'!=': 'admin'}
    }
});
```

### Logging

Enable debug logging to see SQL queries and HTTP requests:

```javascript
const adapter = new CloudflareAdapter({
    accountId: 'your-account-id',
    databaseId: 'your-database-id',
    token: 'your-token',
    debug: true // Enable logging
});
```

Log output includes:

- HTTP requests and responses
- SQL queries with parameters
- Query execution times
- Rows read/written
- Error details

### Raw Responses

Get detailed metadata about operations:

```javascript
const adapter = new CloudflareAdapter({
    accountId: 'your-account-id',
    databaseId: 'your-database-id',
    token: 'your-token',
    raw: true // Enable raw responses
});

const response = await User.find(1);
// response.data - The actual record
// response.meta - Metadata (duration, rows_read, etc.)
// response.op - Operation name
```

## API Reference

### CloudflareAdapter Methods

All methods are inherited from `js-data-adapter` base class. The adapter implements:

#### Private Implementation Methods

- `_count(mapper, query, opts)` - Count records
- `_create(mapper, props, opts)` - Create single record
- `_createMany(mapper, props, opts)` - Create multiple records
- `_find(mapper, id, opts)` - Find by ID
- `_findAll(mapper, query, opts)` - Find all matching
- `_update(mapper, id, props, opts)` - Update by ID
- `_updateAll(mapper, props, query, opts)` - Update all matching
- `_updateMany(mapper, records, opts)` - Update multiple records
- `_destroy(mapper, id, opts)` - Delete by ID
- `_destroyAll(mapper, query, opts)` - Delete all matching
- `_sum(mapper, field, query, opts)` - Sum field values

#### Utility Methods

- `HTTP(url, params)` - Execute HTTP request to Cloudflare API
- `_executeSQL(sql, params)` - Execute SQL query against D1
- `_getTable(mapper)` - Get table name from mapper

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import {CloudflareAdapter, CloudflareAdapterParams, CloudflareResponse, QueryResult} from 'js-data-adapter-cloudflare';

const adapter = new CloudflareAdapter({
    accountId: 'account-id',
    databaseId: 'database-id',
    token: 'api-token'
});
```

## Testing

The project uses Node.js built-in test runner (requires Node.js 18+):

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Limitations

- D1 uses SQLite syntax, so some advanced SQL features may not be available
- Batch inserts don't return individual record IDs (D1 limitation)
- `updateAll` doesn't return updated records (would require additional query)
- Transactions are not yet supported in the HTTP API

## Error Handling

The adapter throws errors for:

- Invalid SQL syntax
- Network failures
- Authentication errors
- D1 API errors

Example:

```javascript
try {
    const user = await User.create({
        email: 'invalid-email' // Missing required fields
    });
} catch (error) {
    console.error('Failed to create user:', error.message);
}
```

## Best Practices

1. **Use query limits**: Always use `limit` to prevent fetching too many records
2. **Index your tables**: Create appropriate indexes in D1 for better query performance
3. **Enable logging in development**: Use `debug: true` to troubleshoot issues
4. **Handle errors**: Always wrap database operations in try-catch blocks
5. **Batch operations**: Use `createMany`, `updateMany` for better performance

## Examples

### Complete Example with DataStore

```javascript
import {CloudflareAdapter} from 'js-data-adapter-cloudflare';
import {DataStore} from 'js-data';

// Initialize
const adapter = new CloudflareAdapter({
    accountId: process.env.CF_ACCOUNT_ID,
    databaseId: process.env.CF_DATABASE_ID,
    token: process.env.CF_API_TOKEN,
    debug: true
});

const store = new DataStore();
store.registerAdapter('cloudflare', adapter, {default: true});

// Define models
const User = store.defineMapper('user');
const Post = store.defineMapper('post', {
    relations: {
        belongsTo: {
            user: {
                foreignKey: 'user_id',
                localField: 'user'
            }
        }
    }
});

// Use the models
async function example() {
    // Create a user
    const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com'
    });

    // Create posts for the user
    await Post.createMany([
        {user_id: user.id, title: 'First Post', content: 'Hello World'},
        {user_id: user.id, title: 'Second Post', content: 'Another post'}
    ]);

    // Find user's posts
    const posts = await Post.findAll({
        where: {user_id: {'==': user.id}},
        orderBy: [['created_at', 'DESC']]
    });

    console.log(`Found ${posts.length} posts for ${user.name}`);
}

example().catch(console.error);
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC

## Links

- [js-data Documentation](https://www.js-data.io/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare D1 HTTP API](https://developers.cloudflare.com/api/operations/cloudflare-d1-query-database)

## Changelog

### 1.0.0

- Initial release
- Full CRUD operations
- **Automatic table creation** from mapper schemas
- Query support with filters, sorting, pagination
- Aggregate operations (count, sum)
- Schema-based table generation with constraints
- Table existence caching for performance
- Comprehensive logging
- TypeScript definitions
- Complete test suite with Node.js test runner
