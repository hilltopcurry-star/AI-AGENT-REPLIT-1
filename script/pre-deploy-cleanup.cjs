const pg = require("pg");

async function cleanup() {
  if (!process.env.DATABASE_URL) {
    console.log("No DATABASE_URL, skipping cleanup");
    return;
  }
  
  console.log("Pre-deploy: cleaning up old database tables...");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await pool.query("DROP TABLE IF EXISTS job_logs CASCADE");
    await pool.query("DROP TABLE IF EXISTS jobs CASCADE");
    await pool.query("DROP TABLE IF EXISTS messages CASCADE");
    await pool.query("DROP TABLE IF EXISTS chats CASCADE");
    await pool.query("DROP TABLE IF EXISTS projects CASCADE");
    await pool.query("DROP TABLE IF EXISTS sessions CASCADE");
    await pool.query("DROP TABLE IF EXISTS session CASCADE");
    await pool.query("DROP TABLE IF EXISTS users CASCADE");
    await pool.query("DROP TABLE IF EXISTS __drizzle_migrations CASCADE");
    console.log("Pre-deploy: old tables dropped successfully");
  } catch (err) {
    console.error("Pre-deploy cleanup error:", err.message);
  } finally {
    await pool.end();
  }
}

cleanup().then(() => process.exit(0)).catch(() => process.exit(1));
