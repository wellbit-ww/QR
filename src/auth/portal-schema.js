async function ensurePortalSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS portal_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      login TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      equipment_ids TEXT[] NOT NULL DEFAULT '{}',
      equipment_quantity INTEGER NOT NULL DEFAULT 1,
      equipment_quantities JSONB NOT NULL DEFAULT '{}'::jsonb,
      label TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE portal_users
      ADD COLUMN IF NOT EXISTS equipment_quantity INTEGER NOT NULL DEFAULT 1;
  `);

  await pool.query(`
    ALTER TABLE portal_users
      ADD COLUMN IF NOT EXISTS equipment_quantities JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE portal_users
      ADD COLUMN IF NOT EXISTS equipment_serials JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await pool.query(`
    UPDATE portal_users
    SET equipment_quantities = jsonb_build_object(equipment_ids[1], equipment_quantity)
    WHERE equipment_quantities = '{}'::jsonb
      AND array_length(equipment_ids, 1) > 0;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS portal_users_login_lower_idx
      ON portal_users (LOWER(login));
  `);
}

module.exports = {
  ensurePortalSchema,
};
