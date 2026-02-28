/**
 * Test suite for CloudflareAdapter using Node.js test runner
 */
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import assert from 'node:assert';
import {CloudflareAdapter} from "./index.js";
import {Mapper} from 'js-data';

describe('CloudflareAdapter', () => {
    let adapter;
    let mockFetch;
    let testMapper;

    beforeEach(() => {
        // Mock fetch BEFORE creating adapter (constructor makes HTTP call)
        mockFetch = mock.fn(async () => ({
            status: 200,
            json: async () => ({success: true, result: [{results: [], meta: {}}], errors: [], messages: []})
        }));
        global.fetch = mockFetch;

        // Create adapter instance
        adapter = new CloudflareAdapter({
            accountId: 'test-account-id',
            databaseId: 'test-database-id',
            token: 'test-token',
            autocreateTables: true,
        });

        // Create test mapper
        testMapper = new Mapper({
            name: 'user',
            idAttribute: 'id'
        });
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe('constructor', () => {
        it('should initialize with correct configuration', () => {
            assert.ok(adapter instanceof CloudflareAdapter);
        });
    });

    describe('HTTP', () => {
        it('should make successful HTTP request', async () => {
            const mockResponse = {
                success: true,
                result: [{results: [], meta: {}}],
                errors: [],
                messages: []
            };

            // Reset mock to clear constructor call
            mockFetch.mock.resetCalls();

            mockFetch.mock.mockImplementation(async () => ({
                status: 200,
                json: async () => mockResponse
            }));

            const result = await adapter.HTTP('https://test.url', {method: 'POST'});

            assert.deepStrictEqual(result, mockResponse);
            assert.strictEqual(mockFetch.mock.calls.length, 1);
            assert.strictEqual(mockFetch.mock.calls[0].arguments[0], 'https://test.url');
        });

        it('should handle HTTP errors', async () => {
            mockFetch.mock.mockImplementation(async () => {
                throw new Error('Network error');
            });

            await assert.rejects(
                async () => await adapter.HTTP('https://test.url', {method: 'POST'}),
                {message: 'Network error'}
            );
        });
    });

    describe('_executeSQL', () => {
        it('should execute SQL successfully', async () => {
            const mockResult = {
                results: [{id: 1, name: 'test'}],
                meta: {duration: 10, rows_read: 1}
            };

            mockFetch.mock.mockImplementation(async () => ({
                status: 200,
                json: async () => ({
                    success: true,
                    result: [mockResult],
                    errors: [],
                    messages: []
                })
            }));

            const result = await adapter._executeSQL('SELECT * FROM users');

            assert.deepStrictEqual(result, mockResult);
        });

        it('should handle SQL errors', async () => {
            mockFetch.mock.mockImplementation(async () => ({
                status: 200,
                json: async () => ({
                    success: false,
                    errors: [{message: 'SQL syntax error'}],
                    messages: []
                })
            }));

            await assert.rejects(
                async () => await adapter._executeSQL('INVALID SQL'),
                {message: 'SQL syntax error'}
            );
        });
    });

    describe('_count', () => {
        it('should count all records', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Count query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{count: 42}], meta: {}}]
                        })
                    };
                }
            });

            const [count, meta] = await adapter._count(testMapper, {}, {});

            assert.strictEqual(count, 42);
        });

        it('should count with query filters', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Count query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{count: 5}], meta: {}}]
                        })
                    };
                }
            });

            const [count] = await adapter._count(testMapper, {
                where: {status: {'==': 'active'}}
            }, {});

            assert.strictEqual(count, 5);
        });
    });

    describe('_create', () => {
        it('should create a record', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Insert query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {last_row_id: 123}}]
                        })
                    };
                }
            });

            const props = {name: 'John Doe', email: 'john@example.com'};
            const [created, meta] = await adapter._create(testMapper, props, {});

            assert.strictEqual(created.id, 123);
            assert.strictEqual(created.name, 'John Doe');
        });
    });

    describe('_createMany', () => {
        it('should create multiple records', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Batch insert query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 3}}]
                        })
                    };
                }
            });

            const props = [
                {name: 'User 1'},
                {name: 'User 2'},
                {name: 'User 3'}
            ];
            const [created, meta] = await adapter._createMany(testMapper, props, {});

            assert.strictEqual(created.length, 3);
        });
    });

    describe('_find', () => {
        it('should find a record by ID', async () => {
            const mockUser = {id: 1, name: 'John Doe', email: 'john@example.com'};
            let callCount = 0;

            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Find query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [mockUser], meta: {}}]
                        })
                    };
                }
            });

            const [record, meta] = await adapter._find(testMapper, 1, {});

            assert.deepStrictEqual(record, mockUser);
        });

        it('should return undefined for non-existent record', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Find query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                }
            });

            const [record] = await adapter._find(testMapper, 999, {});

            assert.strictEqual(record, undefined);
        });
    });

    describe('_findAll', () => {
        it('should find all records', async () => {
            const mockUsers = [
                {id: 1, name: 'User 1'},
                {id: 2, name: 'User 2'}
            ];
            let callCount = 0;

            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // FindAll query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: mockUsers, meta: {}}]
                        })
                    };
                }
            });

            const [records] = await adapter._findAll(testMapper, {}, {});

            assert.strictEqual(records.length, 2);
            assert.deepStrictEqual(records, mockUsers);
        });

        it('should find records with query', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // FindAll query with filter
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{id: 1, name: 'Active User'}], meta: {}}]
                        })
                    };
                }
            });

            const [records] = await adapter._findAll(testMapper, {
                where: {status: {'==': 'active'}},
                limit: 10
            }, {});

            assert.strictEqual(records.length, 1);
        });
    });

    describe('_update', () => {
        it('should update a record', async () => {
            const updatedUser = {id: 1, name: 'Updated Name', email: 'updated@example.com'};

            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check for _update
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else if (callCount === 2) {
                    // Update query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 1}}]
                        })
                    };
                } else {
                    // Find query to get updated record (table check is cached)
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [updatedUser], meta: {}}]
                        })
                    };
                }
            });

            const [record] = await adapter._update(testMapper, 1, {name: 'Updated Name'}, {});

            assert.deepStrictEqual(record, updatedUser);
        });
    });

    describe('_updateAll', () => {
        it('should update all matching records', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // UpdateAll query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 5}}]
                        })
                    };
                }
            });

            const [records, meta] = await adapter._updateAll(
                testMapper,
                {status: 'inactive'},
                {where: {last_login: {'<': '2023-01-01'}}},
                {}
            );

            assert.strictEqual(meta.changes, 5);
        });
    });

    describe('_updateMany', () => {
        it('should update multiple records', async () => {
            const records = [
                {id: 1, name: 'User 1 Updated'},
                {id: 2, name: 'User 2 Updated'}
            ];

            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                // First _update call for record 1
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else if (callCount === 2) {
                    // Update query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 1}}]
                        })
                    };
                } else if (callCount === 3) {
                    // Find query (table check is cached)
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [records[0]], meta: {}}]
                        })
                    };
                }
                // Second _update call for record 2
                else if (callCount === 4) {
                    // Update query (table check is cached)
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 1}}]
                        })
                    };
                } else {
                    // Find query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [records[1]], meta: {}}]
                        })
                    };
                }
            });

            const [updated] = await adapter._updateMany(testMapper, records, {});

            assert.strictEqual(updated.length, 2);
        });
    });

    describe('_destroy', () => {
        it('should destroy a record', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Delete query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 1}}]
                        })
                    };
                }
            });

            const [result, meta] = await adapter._destroy(testMapper, 1, {});

            assert.strictEqual(result, undefined);
            assert.strictEqual(meta.changes, 1);
        });
    });

    describe('_destroyAll', () => {
        it('should destroy all matching records', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // DeleteAll query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {changes: 10}}]
                        })
                    };
                }
            });

            const [result, meta] = await adapter._destroyAll(
                testMapper,
                {where: {status: {'==': 'deleted'}}},
                {}
            );

            assert.strictEqual(result, undefined);
            assert.strictEqual(meta.changes, 10);
        });
    });

    describe('_sum', () => {
        it('should sum a field', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Sum query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{sum: 12345}], meta: {}}]
                        })
                    };
                }
            });

            const [sum] = await adapter._sum(testMapper, 'amount', {}, {});

            assert.strictEqual(sum, 12345);
        });

        it('should sum with query filters', async () => {
            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Table existence check
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{name: 'user'}], meta: {}}]
                        })
                    };
                } else {
                    // Sum query with filter
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{sum: 1000}], meta: {}}]
                        })
                    };
                }
            });

            const [sum] = await adapter._sum(
                testMapper,
                'amount',
                {where: {status: {'==': 'completed'}}},
                {}
            );

            assert.strictEqual(sum, 1000);
        });
    });

    describe('_getTable', () => {
        it('should use mapper.table if defined', () => {
            testMapper.table = 'custom_users';
            assert.strictEqual(adapter._getTable(testMapper), 'custom_users');
        });

        it('should use underscore mapper.name if table not defined', () => {
            const camelMapper = new Mapper({name: 'UserProfile'});
            assert.strictEqual(adapter._getTable(camelMapper), 'user_profile');
        });
    });

    describe('Auto table creation', () => {
        it('should auto-create table when it does not exist', async () => {
            // Reset mock to clear constructor call
            mockFetch.mock.resetCalls();

            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // Create table (CREATE TABLE IF NOT EXISTS)
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                } else {
                    // Count query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{count: 0}], meta: {}}]
                        })
                    };
                }
            });

            const [count] = await adapter._count(testMapper, {}, {});

            assert.strictEqual(count, 0);
            assert.strictEqual(mockFetch.mock.calls.length, 2); // Create + Count
        });

        it('should not recreate table if cached', async () => {
            // First, create the table by calling a method
            mockFetch.mock.resetCalls();

            let firstCallCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                firstCallCount++;
                if (firstCallCount === 1) {
                    // Create table
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                } else {
                    // Count query
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{count: 5}], meta: {}}]
                        })
                    };
                }
            });

            await adapter._count(testMapper, {}, {});
            const firstCalls = mockFetch.mock.calls.length;

            // Second call - should not try to create table again
            mockFetch.mock.resetCalls();
            let secondCallCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                secondCallCount++;
                // Only count query, no create
                return {
                    status: 200,
                    json: async () => ({
                        success: true,
                        result: [{results: [{count: 10}], meta: {}}]
                    })
                };
            });

            const [count] = await adapter._count(testMapper, {}, {});

            assert.strictEqual(count, 10);
            // Should only make 1 call (count), not create since table is cached
            assert.strictEqual(mockFetch.mock.calls.length, 1);
        });

        it('should cache table creation attempt', async () => {
            // Reset mock to clear constructor call
            mockFetch.mock.resetCalls();

            let callCount = 0;
            mockFetch.mock.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    // First create table
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                } else {
                    // Count queries
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [{count: 10}], meta: {}}]
                        })
                    };
                }
            });

            // First call - creates table + counts
            await adapter._count(testMapper, {}, {});
            const firstCallCount = mockFetch.mock.calls.length;

            // Second call - should not try to create table again, just count
            await adapter._count(testMapper, {}, {});
            const secondCallCount = mockFetch.mock.calls.length;

            // First call: create + count = 2 calls
            // Second call: only count = 1 more call
            // Total should be 3
            assert.strictEqual(firstCallCount, 2);
            assert.strictEqual(secondCallCount, 3);
        });

        it('should create table for first insert operation', async () => {
            let callCount = 0;
            const newMockFetch = mock.fn(async () => {
                callCount++;
                if (callCount === 1) {
                    // Constructor query: select name from sqlite_master
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                } else if (callCount === 2) {
                    // Create table (CREATE TABLE IF NOT EXISTS)
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {}}]
                        })
                    };
                } else {
                    // Insert record
                    return {
                        status: 200,
                        json: async () => ({
                            success: true,
                            result: [{results: [], meta: {last_row_id: 1}}]
                        })
                    };
                }
            });
            global.fetch = newMockFetch;

            const newAdapter = new CloudflareAdapter({
                accountId: 'test-account-id',
                databaseId: 'test-database-id',
                token: 'test-token',
                autocreateTables: true
            });

            // Wait a bit for constructor's async operation to complete
            await new Promise(resolve => setTimeout(resolve, 50));

            const props = {name: 'Test User', email: 'test@example.com'};
            const [created] = await newAdapter._create(testMapper, props, {});

            assert.strictEqual(created.id, 1);
            assert.strictEqual(created.name, 'Test User');
            // Should make 3 calls: constructor query + create table + insert
            assert.strictEqual(newMockFetch.mock.calls.length, 3);
        });
    });
});
