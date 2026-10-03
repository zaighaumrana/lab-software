/** Production always enforces isolation; development fallback must be explicit. */
export function hardenedRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.DB_RUNTIME_MODE === 'hardened';
}

// Catalog inspection only: never attempt DDL during application startup.
export async function assertRuntimePrivileges(client: { $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T> }, schema = 'public'): Promise<void> {
  const [row] = await client.$queryRawUnsafe<{ unsafe: boolean }[]>(`
    SELECT (
      r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
      OR d.datdba=r.oid OR n.nspowner=r.oid
      OR has_database_privilege(current_user,current_database(),'CREATE')
      OR has_database_privilege(current_user,current_database(),'TEMP')
      OR has_schema_privilege(current_user,n.oid,'CREATE')
      OR has_parameter_privilege(current_user,'session_replication_role','SET')
      OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace=n.oid AND
        (c.relowner=r.oid OR (c.relkind IN ('r','p') AND
          (has_table_privilege(current_user,c.oid,'TRUNCATE') OR has_table_privilege(current_user,c.oid,'TRIGGER') OR has_table_privilege(current_user,c.oid,'REFERENCES')))))
      OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid AND p.proowner=r.oid)
      OR has_table_privilege(current_user,format('%I._prisma_migrations',n.nspname),'INSERT')
    ) AS unsafe
    FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
    JOIN pg_namespace n ON n.nspname=$1 WHERE r.rolname=current_user`, schema);
  if (!row || row.unsafe) throw new Error('Unsafe PostgreSQL runtime privileges. Provision a restricted runtime role before starting the API.');
}
