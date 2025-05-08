// src/lib/db.ts
import { Pool } from 'pg';

// Declare a variable to hold the pool instance in the global scope
// This helps reuse the connection pool across requests, especially in serverless environments.
let pool: Pool | null = null;

const getPool = (): Pool => {
    if (!pool) {
        console.log('Creating new PostgreSQL connection pool...');
        // Ensure environment variables are loaded and asserted (basic check)
        if (!process.env.DB_USER || !process.env.DB_HOST || !process.env.DB_DATABASE || !process.env.DB_PASSWORD) {
            throw new Error('Database environment variables are not fully configured!');
        }

        pool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_DATABASE,
            password: process.env.DB_PASSWORD,
            port: parseInt(process.env.DB_PORT || '5432', 10),
            // Add other pool options if needed (e.g., max connections, ssl)
            // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false, // Example for production SSL
        });

        // Optional: Test connection on creation (can be verbose)
        pool.connect((err, client, release) => {
            if (err) {
                console.error('Error acquiring client from pool on initial connect', err.stack);
                // Consider throwing an error or handling more gracefully if initial connect fails
            } else {
                client?.query('SELECT NOW()', (err, result) => {
                    release();
                    if (err) {
                        console.error('Error executing initial query', err.stack);
                    } else {
                        console.log('Database pool connected successfully at:', result.rows[0].now);
                    }
                });
            }
        });

        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle client in pool', err);
            // Optional: Implement logic to handle pool errors, e.g., attempt to recreate pool
        });
    }
    return pool;
};

// Export the function to get the pool instance
export const dbPool = getPool();

// You might also export the Pool type if needed elsewhere
export type { Pool };