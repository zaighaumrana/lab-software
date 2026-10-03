// Deployment policy, not a Prisma migration. No credentials are stored here.
const {randomBytes,pbkdf2Sync,createHmac,createHash}=require('node:crypto');
const FUNCTION_ALLOWLIST=[
  'phase_a_visit_accession(text,text,timestamp with time zone)',
  'phase_a_capture_test(text,"DefinitionCaptureSource")',
  'phase_a_capture_package(text,"DefinitionCaptureSource")',
  'phase_a_materialize_invoice(text,boolean)',
  'b2_capture_report_version(text,text)',
  // Required by the SECURITY INVOKER normalization trigger's nested PERFORM.
  'b1_normalize_definition(text)',
];
const INSERT_ONLY=['audit_logs','notification_attempts','payments','invoice_adjustments','report_version_results',
  'test_versions','package_versions','package_version_items','test_version_parameters','test_version_parameter_choices','test_version_reference_ranges'];
const ident=s=>'"'+String(s).replaceAll('"','""')+'"';
function roleName(s){if(!/^[a-z_][a-z0-9_]{0,62}$/.test(s))throw new Error('Use a simple lowercase PostgreSQL role name');return s;}
function scramVerifier(password){
  const salt=randomBytes(16),iterations=4096,salted=pbkdf2Sync(password,salt,iterations,32,'sha256');
  const clientKey=createHmac('sha256',salted).update('Client Key').digest();
  const storedKey=createHash('sha256').update(clientKey).digest('base64');
  const serverKey=createHmac('sha256',salted).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}
async function provision(db,{runtimeRole,password,createLogin=true}){
  roleName(runtimeRole);
  const [meta]=(await db.query(`SELECT current_user AS connection_role,d.datname AS database,pg_get_userbyid(d.datdba) AS owner
    FROM pg_database d WHERE d.datname=current_database()`)).rows;
  if(meta.owner===runtimeRole||meta.connection_role===runtimeRole)throw new Error('Runtime and migration/admin identities must differ');
  const existing=(await db.query('SELECT oid FROM pg_roles WHERE rolname=$1',[runtimeRole])).rows[0];
  if(existing){
    const membership=await db.query('SELECT 1 FROM pg_auth_members WHERE member=$1 LIMIT 1',[existing.oid]);
    const owns=await db.query(`SELECT 1 FROM pg_class WHERE relowner=$1 UNION ALL SELECT 1 FROM pg_proc WHERE proowner=$1
      UNION ALL SELECT 1 FROM pg_namespace WHERE nspowner=$1 UNION ALL SELECT 1 FROM pg_database WHERE datdba=$1 LIMIT 1`,[existing.oid]);
    if(membership.rowCount||owns.rowCount)throw new Error('Existing runtime role owns objects or has memberships; explicit administrator review required');
  }
  if(createLogin){
    if(!password || password.length<20)throw new Error('Provide a runtime password of at least 20 characters, or allow installation generation');
    if(!existing)await db.query(`CREATE ROLE ${ident(runtimeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
    // Locally derive SCRAM: plaintext passwords never enter SQL statements.
    const verifier=scramVerifier(password);
    await db.query(`ALTER ROLE ${ident(runtimeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD '${verifier}'`);
  }else if(!existing)throw new Error('Runtime login must be provisioned before grants');
  const app=ident(runtimeRole),owner=ident(meta.owner),database=ident(meta.database);
  await db.query('BEGIN');
  try{
    await db.query(`REVOKE CREATE,TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
    await db.query(`REVOKE ALL ON DATABASE ${database} FROM ${app}`);
    await db.query(`GRANT CONNECT ON DATABASE ${database} TO ${app}`);
    await db.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await db.query(`REVOKE ALL ON SCHEMA public FROM ${app}`);
    await db.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
    await db.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${app}, PUBLIC`);
    await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${app}`);
    await db.query(`REVOKE ALL ON public._prisma_migrations FROM ${app}`);
    const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r=>r.tablename);
    for(const table of INSERT_ONLY)if(tables.includes(table))await db.query(`REVOKE UPDATE,DELETE ON public.${ident(table)} FROM ${app}`);
    // PostgreSQL row locks require UPDATE on at least one column. The native guard
    // still rejects even id=id; no frozen definition column can be updated.
    if(tables.includes('test_versions'))await db.query(`GRANT UPDATE (id) ON public.test_versions TO ${app}`);
    if(tables.includes('report_versions'))await db.query(`REVOKE DELETE ON public.report_versions FROM ${app}`);
    await db.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${app}, PUBLIC`);
    await db.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
    const functions=(await db.query(`SELECT p.oid::regprocedure::text AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend x WHERE x.classid='pg_proc'::regclass AND x.objid=p.oid AND x.deptype='e')`)).rows;
    for(const f of functions)await db.query(`REVOKE ALL ON FUNCTION ${f.signature} FROM ${app}, PUBLIC`);
    for(const signature of FUNCTION_ALLOWLIST)await db.query(`GRANT EXECUTE ON FUNCTION public.${signature} TO ${app}`);
    await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${app}`);
    await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO ${app}`);
    // A schema-only revoke cannot undo the global PUBLIC function default.
    await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}
  return meta;
}
module.exports={provision,FUNCTION_ALLOWLIST,INSERT_ONLY,ident,roleName,scramVerifier};
