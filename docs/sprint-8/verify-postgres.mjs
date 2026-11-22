import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";

const url = new URL(process.env.TURNOS_TEST_DATABASE_URL ?? "postgres://localhost/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert.equal(url.pathname, "/turnos_sprint8_test", "Use una base local desechable dedicada.");
assert.equal(url.search, "", "La conexión de prueba no admite parámetros adicionales.");
const sql = postgres(url.toString(), { max: 5 });
const root = new URL("../../", import.meta.url);
const orgA = randomUUID();
const orgB = randomUUID();
const users = Object.fromEntries(
  ["owner", "manager", "staff", "viewer", "outsider"].map((role) => [role, randomUUID()]),
);
const secret = "FICTICIO_NO_ENVIAR";
const managedAudit = process.argv.includes("--managed-audit");

async function load(path) {
  const source = await readFile(new URL(path, root), "utf8");
  await sql.unsafe(managedAudit ? `SET ROLE turnos_qa_migrator;\n${source}\nRESET ROLE;` : source).simple();
}

function asUser(user, operation) {
  return sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub', ${user}, true)`;
    await tx`set local statement_timeout = '10s'`;
    return operation(tx);
  });
}

async function fixture({
  hold = null,
  exit = true,
  checklist = ["Limpieza verificada"],
  request = true,
  stage = "ready_for_review",
} = {}) {
  const property = randomUUID();
  const room = randomUUID();
  const turnover = randomUUID();
  const task = randomUUID();
  await sql.begin(async (tx) => {
    await tx`insert into public.properties (id, organization_id, name) values (${property}, ${orgA}, ${property})`;
    await tx`insert into public.rooms (id, organization_id, property_id, code) values (${room}, ${orgA}, ${property}, 'PILOTO')`;
    await tx`insert into public.turnovers (id, organization_id, room_id, status, move_out_date, created_by)
      values (${turnover}, ${orgA}, ${room}, ${stage}, current_date, ${users.owner})`;
    await tx`insert into public.turnover_tasks (id, organization_id, turnover_id, title, status)
      values (${task}, ${orgA}, ${turnover}, 'Limpieza ficticia', 'done')`;
    await tx`insert into public.inspections (organization_id, turnover_id, kind, status, notes, checklist, completed_at)
      values (${orgA}, ${turnover}, 'exit', ${exit ? "completed" : "pending"}, 'Inspección ficticia', '[]', ${exit ? new Date() : null}),
             (${orgA}, ${turnover}, 'review', 'completed', 'Revisión ficticia', ${tx.json(checklist)}, now())`;
  });
  const approval = request
    ? await asUser(
        users.staff,
        async (tx) =>
          (await tx`select public.request_publish_approval(${turnover}, '') as id`)[0].id,
      )
    : null;
  if (hold)
    await asUser(
      users.owner,
      (tx) => tx`select public.set_turnover_hold(${turnover}, ${hold}, 'Motivo ficticio')`,
    );
  return { turnover, approval, task, room };
}

const approve = ({ approval }, actor = users.manager) =>
  asUser(actor, (tx) => tx`select public.decide_approval(${approval}, true, '')`);

async function concurrentDenial(
  firstActor,
  firstOperation,
  secondActor,
  secondOperation,
  rejection,
) {
  let release;
  const holdCommit = new Promise((resolve) => {
    release = resolve;
  });
  let ready;
  const firstMutation = new Promise((resolve) => {
    ready = resolve;
  });
  const first = asUser(firstActor, async (tx) => {
    await firstOperation(tx);
    ready();
    await holdCommit;
  });
  await Promise.race([firstMutation, first]);
  let reportPid;
  const secondPid = new Promise((resolve) => {
    reportPid = resolve;
  });
  const second = asUser(secondActor, async (tx) => {
    reportPid((await tx`select pg_backend_pid() as id`)[0].id);
    await secondOperation(tx);
  });
  const secondResult = assert.rejects(second, rejection);
  try {
    const pid = await Promise.race([secondPid, second]);
    let waiting = false;
    for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
      waiting = (await sql`select cardinality(pg_blocking_pids(${pid})) > 0 as waiting`)[0].waiting;
      if (!waiting) await delay(50);
    }
    assert.ok(waiting, "La segunda operación debe esperar a la primera.");
  } finally {
    release();
    await Promise.all([first, secondResult]);
  }
}

try {
  const [ready] =
    await sql`select current_database() as database, to_regclass('public.organizations') is null as empty`;
  assert.equal(ready.database, "turnos_sprint8_test");
  assert.ok(ready.empty, "La base debe estar vacía. El runner nunca limpia bases existentes.");

  // Shim de Auth para PostgreSQL local. La autorización de la aplicación sigue usando RLS real.
  await sql
    .unsafe(
      `
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  `,
    )
    .simple();
  if (managedAudit) {
    await sql.unsafe(`
      CREATE ROLE turnos_qa_migrator NOLOGIN CREATEROLE NOBYPASSRLS;
      GRANT USAGE, CREATE ON SCHEMA public TO turnos_qa_migrator WITH GRANT OPTION;
      GRANT USAGE ON SCHEMA auth TO turnos_qa_migrator;
      GRANT REFERENCES, TRIGGER ON auth.users TO turnos_qa_migrator;
      REVOKE EXECUTE ON FUNCTION auth.uid() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION auth.uid() TO turnos_qa_migrator, authenticated;
    `).simple();
  }
  await load("drizzle/migrations/0000_propia_turnos_core.sql");
  await sql`grant all on public.audit_events to authenticated`;
  await load("docs/sprint-8/sql/01-approval-integrity.sql");
  await load(managedAudit ? "docs/sprint-9b/sql/02-audit-privacy-managed.sql" : "docs/sprint-8/sql/02-audit-privacy.sql");
  if (managedAudit) {
    const [permissions] = await sql`select
      has_schema_privilege('turnos_qa_migrator', 'auth', 'USAGE WITH GRANT OPTION') as migrator_auth,
      has_function_privilege('turnos_qa_migrator', 'auth.uid()', 'EXECUTE WITH GRANT OPTION') as migrator_uid,
      has_schema_privilege('turnos_audit_reader', 'auth', 'USAGE') as reader_auth,
      has_function_privilege('turnos_audit_reader', 'auth.uid()', 'EXECUTE') as reader_uid,
      pg_has_role('turnos_qa_migrator', 'turnos_audit_reader', 'SET') as migrator_set,
      pg_has_role('turnos_qa_migrator', 'turnos_audit_reader', 'USAGE') as migrator_usage`;
    assert.deepEqual(Object.values(permissions), [false, false, false, false, false, false]);
    await assert.rejects(asUser("", (tx) => tx`select * from public.read_turnos_audit(${orgA})`), { code: "42501" });
    await assert.rejects(asUser(users.owner, (tx) => tx`select * from public.read_turnos_audit(null)`), { code: "42501" });
  }
  for (const [role, id] of Object.entries(users)) {
    await sql`insert into auth.users values (${id}, ${role + "@example.invalid"}, '{}'::jsonb)`;
  }
  await sql`insert into public.organizations (id, name) values (${orgA}, 'Piloto A ficticio'), (${orgB}, 'Piloto B ficticio')`;
  for (const [role, id] of Object.entries(users)) {
    await sql`insert into public.memberships (organization_id,user_id,role)
      values (${role === "outsider" ? orgB : orgA}, ${id}, ${role === "outsider" ? "owner" : role})`;
  }

  const valid = await fixture();
  await approve(valid);
  await assert.rejects(approve(valid), { code: "40001" });
  const [published] = await sql`select t.status, a.status as decision, r.status as room
    from public.turnovers t join public.approvals a on a.turnover_id=t.id
    join public.rooms r on r.id=t.room_id where t.id=${valid.turnover}`;
  assert.deepEqual(
    [published.status, published.decision, published.room],
    ["available_for_leasing", "approved", "available"],
  );
  await assert.rejects(
    asUser(
      users.staff,
      (tx) => tx`update public.turnover_tasks set status='pending' where id=${valid.task}`,
    ),
    /después de aprobar/,
  );
  console.log(
    "OK aprobación válida, efecto atómico, duplicado y preservación de tareas completadas",
  );

  for (const hold of ["paused", "blocked"]) {
    await assert.rejects(approve(await fixture({ hold })), /bloqueada\/pausada/);
  }
  const changed = await fixture();
  await asUser(
    users.staff,
    (tx) => tx`update public.turnover_tasks set status='pending' where id=${changed.task}`,
  );
  await assert.rejects(approve(changed), /ninguna tarea pendiente/);
  const [stillPending] =
    await sql`select status from public.approvals where id=${changed.approval}`;
  assert.equal(stillPending.status, "pending");
  const staleReview = await fixture();
  await sql`update public.inspections set checklist='[]' where turnover_id=${staleReview.turnover} and kind='review'`;
  await assert.rejects(approve(staleReview), /al menos un punto verificado/);
  for (const [options, message] of [
    [{ exit: false }, /inspección de salida/],
    [{ checklist: ["\t\n"] }, /al menos un punto verificado/],
  ]) {
    const missing = await fixture({ ...options, request: false });
    await assert.rejects(
      asUser(
        users.staff,
        (tx) => tx`select public.request_publish_approval(${missing.turnover}, '')`,
      ),
      message,
    );
  }
  console.log("OK pausas, bloqueos, tarea reabierta e inspecciones incompletas");

  const permissions = await fixture();
  for (const actor of [users.staff, users.viewer, users.outsider]) {
    await assert.rejects(approve(permissions, actor), { code: "42501" });
  }
  const otherReads = await asUser(
    users.outsider,
    (tx) => tx`select id from public.approvals where id=${permissions.approval}`,
  );
  assert.equal(otherReads.length, 0);
  console.log("OK roles y aislamiento de aprobaciones con RLS");

  const race = await fixture();
  await concurrentDenial(
    users.owner,
    (tx) => tx`select public.decide_approval(${race.approval}, true, '')`,
    users.manager,
    (tx) => tx`select public.decide_approval(${race.approval}, false, 'Revisión ficticia')`,
    { code: "40001" },
  );
  const [decisions] = await sql`select count(*)::int as total from public.audit_events
    where entity_id=${race.turnover} and action='transition' and after_json->>'status'='available_for_leasing'`;
  assert.equal(decisions.total, 1);
  console.log("OK dos decisiones desde conexiones separadas, una única publicación");

  const taskRace = await fixture();
  await concurrentDenial(
    users.staff,
    (tx) => tx`update public.turnover_tasks set status='pending' where id=${taskRace.task}`,
    users.manager,
    (tx) => tx`select public.decide_approval(${taskRace.approval}, true, '')`,
    /ninguna tarea pendiente/,
  );
  const [pendingRace] =
    await sql`select status from public.approvals where id=${taskRace.approval}`;
  assert.equal(pendingRace.status, "pending");
  console.log("OK la decisión concurrente espera y lee el cambio de tarea confirmado");

  await sql`insert into public.audit_events (organization_id,entity_type,entity_id,action,after_json)
    values (${orgA}, 'turnovers', ${valid.turnover}, 'transition',
      ${sql.json({ status: "closed", email: secret, monthly_rent: secret, token: secret, room_id: valid.room })})`;
  const [reader] = await sql`select r.rolname, r.rolbypassrls, r.rolcanlogin, c.relrowsecurity,
      c.relowner = p.proowner as same_owner
    from pg_proc p join pg_roles r on r.oid=p.proowner
    cross join pg_class c
    where p.oid='public.read_turnos_audit(uuid,integer,integer,uuid,timestamptz,timestamptz,uuid,boolean,text,text)'::regprocedure
      and c.oid='public.audit_events'::regclass`;
  assert.deepEqual(Object.values(reader), ["turnos_audit_reader", false, false, true, false]);
  for (const role of ["owner", "manager", "staff", "viewer"]) {
    const actor = users[role];
    const events = await asUser(
      actor,
      (tx) =>
        tx`select * from public.read_turnos_audit(${orgA}, _turnover => ${valid.turnover}, _limit => 25)`,
    );
    const event = events.find(({ after_json }) => after_json?.status === "closed");
    assert.deepEqual(event.after_json, { status: "closed", room_id: valid.room });
    assert.equal(event.after_redacted, true);
    assert.ok(events.every(({ organization_id }) => organization_id === orgA));
    await assert.rejects(
      asUser(actor, (tx) => tx`select after_json from public.audit_events limit 1`),
      { code: "42501" },
    );
  }
  await assert.rejects(
    asUser(users.outsider, (tx) => tx`select * from public.read_turnos_audit(${orgA})`),
    { code: "42501" },
  );
  const [stored] = await sql`select after_json from public.audit_events
    where entity_id=${valid.turnover} and after_json->>'status'='closed'`;
  assert.equal(stored.after_json.token, secret);
  console.log(
    "OK proyección protegida para los cuatro roles, aislamiento y retención del original",
  );
} finally {
  await sql.end();
}
