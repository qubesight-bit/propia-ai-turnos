-- Borrador QA para PostgreSQL gestionado. Aplicar por el canal autorizado de Lovable.
BEGIN;

-- El propietario de la RPC queda separado del propietario de audit_events.
-- El rol no puede iniciar sesión, no se concede a clientes y sigue sujeto a RLS.
CREATE ROLE turnos_audit_reader NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO turnos_audit_reader;
GRANT SELECT ON public.audit_events TO turnos_audit_reader;
-- El auxiliar SECURITY DEFINER valida el usuario de la sesión con su propietario existente.
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO turnos_audit_reader;
CREATE POLICY audit_reader_select ON public.audit_events
  FOR SELECT TO turnos_audit_reader USING (public.is_org_member(organization_id));

CREATE FUNCTION public.turnos_audit_snapshot(_entity text, _snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN _snapshot IS NULL OR _snapshot = 'null'::jsonb THEN NULL ELSE coalesce((
    SELECT jsonb_object_agg(field.key, field.value)
    FROM jsonb_each(CASE WHEN jsonb_typeof(_snapshot) = 'object' THEN _snapshot ELSE '{}'::jsonb END) AS field
    WHERE CASE
      WHEN field.key IN ('turnover_id','room_id','property_id') THEN
        jsonb_typeof(field.value) = 'string' AND (field.value #>> '{}') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      WHEN field.key = 'role' AND _entity = 'memberships' THEN
        (field.value #>> '{}') = ANY(enum_range(NULL::public.org_role)::text[])
      WHEN field.key = 'status' THEN CASE _entity
        WHEN 'rooms' THEN (field.value #>> '{}') = ANY(enum_range(NULL::public.room_status)::text[])
        WHEN 'turnovers' THEN (field.value #>> '{}') = ANY(enum_range(NULL::public.turnover_status)::text[])
        WHEN 'turnover_tasks' THEN (field.value #>> '{}') = ANY(enum_range(NULL::public.task_status)::text[])
        WHEN 'inspections' THEN (field.value #>> '{}') = ANY(enum_range(NULL::public.inspection_status)::text[])
        WHEN 'approvals' THEN (field.value #>> '{}') = ANY(enum_range(NULL::public.approval_status)::text[])
        ELSE false END
      WHEN field.key = 'hold_kind' AND _entity = 'turnovers' THEN
        field.value = 'null'::jsonb OR (field.value #>> '{}') IN ('paused','blocked')
      WHEN field.key = 'decision' AND _entity = 'turnovers' THEN (field.value #>> '{}') IN ('approved','rejected')
      WHEN field.key = 'type' AND _entity = 'turnover_tasks' THEN
        (field.value #>> '{}') = ANY(enum_range(NULL::public.task_type)::text[])
      WHEN field.key = 'kind' AND _entity = 'inspections' THEN (field.value #>> '{}') IN ('exit','review')
      WHEN field.key = 'action' AND _entity = 'approvals' THEN (field.value #>> '{}') = 'publish_for_leasing'
      WHEN (_entity = 'turnovers' AND field.key IN ('move_out_date','target_ready_date','move_in_date','closed_at'))
        OR (_entity = 'turnover_tasks' AND field.key IN ('due_date','completed_at'))
        OR (_entity = 'inspections' AND field.key = 'completed_at')
        OR (_entity = 'approvals' AND field.key = 'decided_at') THEN
          field.value = 'null'::jsonb OR (field.value #>> '{}') ~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2}))?$'
      ELSE false END
  ), '{}'::jsonb) END
$$;
REVOKE ALL ON FUNCTION public.turnos_audit_snapshot(text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.turnos_audit_snapshot(text,jsonb) TO turnos_audit_reader;

CREATE FUNCTION public.read_turnos_audit(
  _org uuid, _offset integer DEFAULT 0, _limit integer DEFAULT 25,
  _turnover uuid DEFAULT NULL, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL,
  _actor uuid DEFAULT NULL, _system boolean DEFAULT false, _action text DEFAULT NULL, _entity text DEFAULT NULL
) RETURNS TABLE (
  id uuid, organization_id uuid, actor_id uuid, entity_type text, entity_id uuid,
  action text, before_json jsonb, after_json jsonb,
  before_redacted boolean, after_redacted boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog SET row_security = on AS $$
BEGIN
  IF _org IS NULL OR public.is_org_member(_org) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Permiso denegado para consultar la auditoría' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT event.id, event.organization_id, event.actor_id, event.entity_type, event.entity_id,
    event.action, safe.before_json, safe.after_json,
    (event.before_json IS DISTINCT FROM safe.before_json),
    (event.after_json IS DISTINCT FROM safe.after_json), event.created_at
  FROM (
    SELECT a.* FROM public.audit_events AS a
    WHERE a.organization_id = _org
      AND (_turnover IS NULL OR (a.entity_type = 'turnovers' AND a.entity_id = _turnover)
        OR a.before_json->>'turnover_id' = _turnover::text OR a.after_json->>'turnover_id' = _turnover::text)
      AND (_from IS NULL OR a.created_at >= _from) AND (_to IS NULL OR a.created_at <= _to)
      AND (_actor IS NULL OR a.actor_id = _actor)
      AND (_system IS NOT TRUE OR a.actor_id IS NULL)
      AND (_action IS NULL OR a.action = _action) AND (_entity IS NULL OR a.entity_type = _entity)
    ORDER BY a.created_at DESC, a.id
    OFFSET greatest(coalesce(_offset, 0), 0)
    LIMIT least(greatest(coalesce(_limit, 25), 1), 500)
  ) AS event
  CROSS JOIN LATERAL (SELECT
    public.turnos_audit_snapshot(event.entity_type, event.before_json) AS before_json,
    public.turnos_audit_snapshot(event.entity_type, event.after_json) AS after_json
  ) AS safe
  ORDER BY event.created_at DESC, event.id;
END $$;

-- La transferencia requiere pertenencia y CREATE en el esquema. Ambos permisos son temporales.
REVOKE ALL ON FUNCTION public.read_turnos_audit(uuid,integer,integer,uuid,timestamptz,timestamptz,uuid,boolean,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_turnos_audit(uuid,integer,integer,uuid,timestamptz,timestamptz,uuid,boolean,text,text)
  TO authenticated;
GRANT turnos_audit_reader TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT CREATE ON SCHEMA public TO turnos_audit_reader;
ALTER FUNCTION public.read_turnos_audit(uuid,integer,integer,uuid,timestamptz,timestamptz,uuid,boolean,text,text)
  OWNER TO turnos_audit_reader;
REVOKE CREATE ON SCHEMA public FROM turnos_audit_reader;
REVOKE turnos_audit_reader FROM CURRENT_USER;

-- El cliente consume únicamente la RPC. Las escrituras internas y la retención se conservan.
REVOKE ALL PRIVILEGES ON TABLE public.audit_events FROM PUBLIC, anon, authenticated;
REVOKE SELECT (id,organization_id,actor_id,entity_type,entity_id,action,before_json,after_json,created_at)
  ON TABLE public.audit_events FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity AND relowner <> 'turnos_audit_reader'::regrole
          FROM pg_catalog.pg_class WHERE oid = 'public.audit_events'::regclass)
     OR pg_catalog.has_schema_privilege('turnos_audit_reader', 'public', 'CREATE')
     OR EXISTS (
       SELECT 1 FROM unnest(ARRAY['anon', 'authenticated']::name[]) AS client(role_name)
       WHERE pg_catalog.pg_has_role(client.role_name, 'turnos_audit_reader', 'MEMBER')
          OR pg_catalog.has_any_column_privilege(client.role_name, 'public.audit_events', 'SELECT')
     ) THEN
    RAISE EXCEPTION 'Los privilegios efectivos de auditoría no son seguros';
  END IF;
END $$;

COMMIT;
