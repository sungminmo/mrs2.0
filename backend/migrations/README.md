# Database Migrations

Run `npm run db:make -- descriptive_name` from the backend directory with DB_HOST,
DB_NAME, DB_USER and DB_PASSWORD configured. The command also loads the root .env
when present. It creates a TypeScript migration without connecting to the database.

Implement both `up` and `down` before building. Production runs only compiled .js
migrations from dist/migrations. Do not modify migrations that have already run.
No business tables or demo data are included in this initial setup.