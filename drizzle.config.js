/** @type {import('drizzle-kit').Config} */
export default {
  schema: './src/backend/db/schema.js',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || './data/chops.db',
  },
};
