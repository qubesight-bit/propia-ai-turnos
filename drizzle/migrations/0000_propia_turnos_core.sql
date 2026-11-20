
-- ========== Enums ==========
CREATE TYPE public.org_role AS ENUM ('owner','manager','staff','viewer');
CREATE TYPE public.room_status AS ENUM ('occupied','notice','turnover','available','reserved','out_of_service');
CREATE TYPE public.turnover_status AS ENUM ('exit_announced','exit_confirmed','inspection_pending','preparation_in_progress','ready_for_review','marketing_approval_pending','available_for_leasing','reserved','move_in_completed','closed');
CREATE TYPE public.hold_kind AS ENUM ('blocked','paused');
CREATE TYPE public.task_type AS ENUM ('cleaning','maintenance','painting','inventory','photos','other');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','done','cancelled');
CREATE TYPE public.inspection_kind AS ENUM ('exit','review');
CREATE TYPE public.inspection_status AS ENUM ('pending','completed');
CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected');

-- ========== updated_at helper ==========
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ========== Profiles ==========
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== Organizations & memberships ==========
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  timezone text NOT NULL DEFAULT 'America/Costa_Rica',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships(user_id);
GRANT SELECT, UPDATE ON public.organizations TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT ALL ON public.organizations, public.memberships TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER org_touch BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER mem_touch BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Non-recursive membership helpers (SECURITY DEFINER bypasses RLS on memberships)
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = _org AND user_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.org_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.memberships WHERE organization_id = _org AND user_id = auth.uid() AND role = ANY(_roles))
$$;

CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated USING (public.has_org_role(id, ARRAY['owner']::public.org_role[])) WITH CHECK (public.has_org_role(id, ARRAY['owner']::public.org_role[]));
CREATE POLICY mem_select ON public.memberships FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
-- profiles: self, or users who share an organization
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.user_id = profiles.id AND public.is_org_member(m.organization_id)
  )
);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ========== Properties & rooms ==========
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  zone text,
  address text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX properties_org_idx ON public.properties(organization_id);
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(trim(code)) BETWEEN 1 AND 40),
  status public.room_status NOT NULL DEFAULT 'occupied',
  monthly_rent numeric(12,2) CHECK (monthly_rent IS NULL OR monthly_rent >= 0),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, code)
);
CREATE INDEX rooms_org_idx ON public.rooms(organization_id, status);
CREATE INDEX rooms_property_idx ON public.rooms(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties, public.rooms TO authenticated;
GRANT ALL ON public.properties, public.rooms TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER prop_touch BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER room_touch BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY prop_select ON public.properties FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY prop_insert ON public.properties FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY prop_update ON public.properties FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY prop_delete ON public.properties FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY room_select ON public.rooms FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY room_insert ON public.rooms FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY room_update ON public.rooms FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY room_delete ON public.rooms FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));

-- room must belong to the same org as its property
CREATE OR REPLACE FUNCTION public.rooms_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = NEW.property_id AND p.organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'La propiedad no pertenece a la organización';
  END IF;
  -- status of a room in rotation is controlled by the turnover workflow only
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND coalesce(current_setting('propia.workflow', true),'') <> 'on'
     AND EXISTS (SELECT 1 FROM public.turnovers t WHERE t.room_id = NEW.id AND t.status <> 'closed') THEN
    RAISE EXCEPTION 'El estado de una habitación con rotación abierta solo cambia mediante la rotación';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('available','reserved') AND coalesce(current_setting('propia.workflow', true),'') <> 'on' THEN
    RAISE EXCEPTION 'No se puede marcar disponible/reservada sin pasar por rotación y aprobación';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status IN ('available','reserved','notice','turnover') AND coalesce(current_setting('propia.workflow', true),'') <> 'on' THEN
    RAISE EXCEPTION 'Una habitación nueva solo puede crearse como ocupada o fuera de servicio';
  END IF;
  RETURN NEW;
END $$;

-- ========== Turnovers ==========
CREATE TABLE public.turnovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  status public.turnover_status NOT NULL DEFAULT 'exit_announced',
  move_out_date date NOT NULL,
  target_ready_date date,
  move_in_date date,
  hold_kind public.hold_kind,
  hold_reason text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK ((hold_kind IS NULL) = (hold_reason IS NULL)),
  CHECK (target_ready_date IS NULL OR target_ready_date >= move_out_date)
);
CREATE UNIQUE INDEX turnovers_one_open_per_room ON public.turnovers(room_id) WHERE status <> 'closed';
CREATE INDEX turnovers_org_idx ON public.turnovers(organization_id, status);
CREATE TRIGGER rooms_guard_trg BEFORE INSERT OR UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.rooms_guard();
CREATE TRIGGER turn_touch BEFORE UPDATE ON public.turnovers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.turnover_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  turnover_id uuid NOT NULL REFERENCES public.turnovers(id) ON DELETE CASCADE,
  type public.task_type NOT NULL DEFAULT 'cleaning',
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
  status public.task_status NOT NULL DEFAULT 'pending',
  assignee_id uuid,
  due_date date,
  evidence_url text,
  evidence_note text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tasks_turnover_idx ON public.turnover_tasks(turnover_id);
CREATE INDEX tasks_org_idx ON public.turnover_tasks(organization_id, status);
CREATE INDEX tasks_assignee_idx ON public.turnover_tasks(assignee_id);
CREATE TRIGGER task_touch BEFORE UPDATE ON public.turnover_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  turnover_id uuid NOT NULL REFERENCES public.turnovers(id) ON DELETE CASCADE,
  kind public.inspection_kind NOT NULL,
  status public.inspection_status NOT NULL DEFAULT 'pending',
  notes text,
  evidence_url text,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspector_id uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (turnover_id, kind)
);
CREATE INDEX inspections_org_idx ON public.inspections(organization_id, status);
CREATE TRIGGER insp_touch BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  turnover_id uuid NOT NULL REFERENCES public.turnovers(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'publish_for_leasing' CHECK (action IN ('publish_for_leasing')),
  status public.approval_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  request_note text,
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX approvals_one_pending ON public.approvals(turnover_id, action) WHERE status = 'pending';
CREATE INDEX approvals_org_idx ON public.approvals(organization_id, status);
CREATE TRIGGER appr_touch BEFORE UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_org_created_idx ON public.audit_events(organization_id, created_at DESC);
CREATE INDEX audit_entity_idx ON public.audit_events(entity_type, entity_id);

CREATE TABLE public.idempotency_keys (
  key text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.turnovers, public.inspections, public.approvals, public.audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.turnover_tasks TO authenticated;
GRANT ALL ON public.turnovers, public.turnover_tasks, public.inspections, public.approvals, public.audit_events, public.idempotency_keys TO service_role;
ALTER TABLE public.turnovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnover_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY turn_select ON public.turnovers FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY insp_select ON public.inspections FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY appr_select ON public.approvals FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY audit_select ON public.audit_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY task_select ON public.turnover_tasks FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY task_insert ON public.turnover_tasks FOR INSERT TO authenticated WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));
CREATE POLICY task_update ON public.turnover_tasks FOR UPDATE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager','staff']::public.org_role[])) WITH CHECK (public.has_org_role(organization_id, ARRAY['owner','manager','staff']::public.org_role[]));
CREATE POLICY task_delete ON public.turnover_tasks FOR DELETE TO authenticated USING (public.has_org_role(organization_id, ARRAY['owner','manager']::public.org_role[]));

-- task integrity: same org as turnover; turnover must be open; staff can only change status/evidence
CREATE OR REPLACE FUNCTION public.tasks_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t public.turnovers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = NEW.turnover_id;
  IF t.id IS NULL OR t.organization_id <> NEW.organization_id THEN RAISE EXCEPTION 'Rotación inválida para esta organización'; END IF;
  IF t.status IN ('move_in_completed','closed') THEN RAISE EXCEPTION 'La rotación ya no admite cambios en tareas'; END IF;
  IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.organization_id = NEW.organization_id AND m.user_id = NEW.assignee_id) THEN
    RAISE EXCEPTION 'El responsable debe ser miembro de la organización';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id <> OLD.organization_id OR NEW.turnover_id <> OLD.turnover_id THEN RAISE EXCEPTION 'No se puede mover la tarea'; END IF;
    IF NOT public.has_org_role(NEW.organization_id, ARRAY['owner','manager']::public.org_role[])
       AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.type IS DISTINCT FROM OLD.type OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.due_date IS DISTINCT FROM OLD.due_date) THEN
      RAISE EXCEPTION 'Solo owner/manager pueden editar o reasignar tareas';
    END IF;
  END IF;
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status <> 'done') THEN NEW.completed_at := now(); END IF;
  IF NEW.status <> 'done' THEN NEW.completed_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_guard_trg BEFORE INSERT OR UPDATE ON public.turnover_tasks FOR EACH ROW EXECUTE FUNCTION public.tasks_guard();

-- ========== Generic audit trigger ==========
CREATE OR REPLACE FUNCTION public.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; o jsonb; org uuid; eid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN o := to_jsonb(OLD); r := NULL; ELSIF TG_OP = 'INSERT' THEN o := NULL; r := to_jsonb(NEW); ELSE o := to_jsonb(OLD); r := to_jsonb(NEW); END IF;
  org := COALESCE((r->>'organization_id')::uuid, (o->>'organization_id')::uuid);
  IF TG_TABLE_NAME = 'organizations' THEN org := COALESCE((r->>'id')::uuid, (o->>'id')::uuid); END IF;
  eid := COALESCE((r->>'id')::uuid, (o->>'id')::uuid);
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'organizations' THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = org) THEN RETURN OLD; END IF;
  INSERT INTO public.audit_events(organization_id, actor_id, entity_type, entity_id, action, before_json, after_json)
  VALUES (org, auth.uid(), TG_TABLE_NAME, eid, lower(TG_OP), o, r);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER audit_orgs AFTER UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_memberships AFTER INSERT OR UPDATE OR DELETE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_properties AFTER INSERT OR UPDATE OR DELETE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_rooms AFTER INSERT OR UPDATE OR DELETE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.turnover_tasks FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_inspections AFTER INSERT OR UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_approvals AFTER INSERT OR UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- explicit audit helper for workflow events
CREATE OR REPLACE FUNCTION public._audit(_org uuid, _type text, _id uuid, _action text, _before jsonb, _after jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_events(organization_id, actor_id, entity_type, entity_id, action, before_json, after_json)
  VALUES (_org, auth.uid(), _type, _id, _action, _before, _after);
$$;

-- ========== Workflow RPCs ==========
CREATE OR REPLACE FUNCTION public._require_role(_org uuid, _roles public.org_role[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_org_role(_org, _roles) THEN RAISE EXCEPTION 'Permiso denegado para esta acción' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public._room_status_for(_s public.turnover_status) RETURNS public.room_status
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _s IN ('exit_announced','exit_confirmed') THEN 'notice'::public.room_status
    WHEN _s IN ('inspection_pending','preparation_in_progress','ready_for_review','marketing_approval_pending') THEN 'turnover'::public.room_status
    WHEN _s = 'available_for_leasing' THEN 'available'::public.room_status
    WHEN _s = 'reserved' THEN 'reserved'::public.room_status
    ELSE 'occupied'::public.room_status END
$$;

CREATE OR REPLACE FUNCTION public.create_organization(_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.organizations(name) VALUES (trim(_name)) RETURNING id INTO oid;
  INSERT INTO public.memberships(organization_id, user_id, role) VALUES (oid, auth.uid(), 'owner');
  PERFORM public._audit(oid, 'organizations', oid, 'create', NULL, jsonb_build_object('name', trim(_name)));
  RETURN oid;
END $$;

CREATE OR REPLACE FUNCTION public.add_member_by_email(_org uuid, _email text, _role public.org_role) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  PERFORM public._require_role(_org, ARRAY['owner']::public.org_role[]);
  SELECT id INTO uid FROM public.profiles WHERE lower(email) = lower(trim(_email));
  IF uid IS NULL THEN RAISE EXCEPTION 'No existe una cuenta registrada con ese correo. Pídale que se registre primero.'; END IF;
  INSERT INTO public.memberships(organization_id, user_id, role) VALUES (_org, uid, _role)
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION public.update_member_role(_org uuid, _user uuid, _role public.org_role) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_role(_org, ARRAY['owner']::public.org_role[]);
  IF _role <> 'owner' AND (SELECT count(*) FROM public.memberships WHERE organization_id = _org AND role = 'owner' AND user_id <> _user) = 0 THEN
    RAISE EXCEPTION 'La organización debe conservar al menos un owner';
  END IF;
  UPDATE public.memberships SET role = _role WHERE organization_id = _org AND user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.remove_member(_org uuid, _user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._require_role(_org, ARRAY['owner']::public.org_role[]);
  IF (SELECT count(*) FROM public.memberships WHERE organization_id = _org AND role = 'owner' AND user_id <> _user) = 0 THEN
    RAISE EXCEPTION 'La organización debe conservar al menos un owner';
  END IF;
  DELETE FROM public.memberships WHERE organization_id = _org AND user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.open_turnover(_room uuid, _move_out date, _target date, _notes text, _idem text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.rooms%ROWTYPE; tid uuid; prev jsonb;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Habitación no encontrada'; END IF;
  PERFORM public._require_role(r.organization_id, ARRAY['owner','manager']::public.org_role[]);
  IF _idem IS NOT NULL THEN
    SELECT result INTO prev FROM public.idempotency_keys WHERE key = _idem AND organization_id = r.organization_id;
    IF prev IS NOT NULL THEN RETURN (prev->>'id')::uuid; END IF;
  END IF;
  IF r.status = 'out_of_service' THEN RAISE EXCEPTION 'La habitación está fuera de servicio'; END IF;
  IF EXISTS (SELECT 1 FROM public.turnovers WHERE room_id = _room AND status <> 'closed') THEN
    RAISE EXCEPTION 'Esta habitación ya tiene una rotación abierta';
  END IF;
  INSERT INTO public.turnovers(organization_id, room_id, move_out_date, target_ready_date, notes, created_by)
  VALUES (r.organization_id, _room, _move_out, _target, NULLIF(trim(_notes),''), auth.uid()) RETURNING id INTO tid;
  INSERT INTO public.inspections(organization_id, turnover_id, kind) VALUES (r.organization_id, tid, 'exit'), (r.organization_id, tid, 'review');
  PERFORM set_config('propia.workflow','on',true);
  UPDATE public.rooms SET status = 'notice' WHERE id = _room;
  PERFORM set_config('propia.workflow','off',true);
  PERFORM public._audit(r.organization_id, 'turnovers', tid, 'open', NULL,
    jsonb_build_object('status','exit_announced','room_id',_room,'move_out_date',_move_out,'target_ready_date',_target));
  IF _idem IS NOT NULL THEN
    INSERT INTO public.idempotency_keys(key, organization_id, actor_id, result) VALUES (_idem, r.organization_id, auth.uid(), jsonb_build_object('id', tid));
  END IF;
  RETURN tid;
END $$;

-- Central guarded transition
CREATE OR REPLACE FUNCTION public.transition_turnover(_turnover uuid, _from public.turnover_status, _to public.turnover_status, _note text, _idem text, _move_in date DEFAULT NULL)
RETURNS public.turnover_status
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.turnovers%ROWTYPE; prev jsonb; allowed boolean := false; ops public.org_role[];
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Rotación no encontrada'; END IF;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager','staff']::public.org_role[]);
  IF _idem IS NOT NULL THEN
    SELECT result INTO prev FROM public.idempotency_keys WHERE key = _idem AND organization_id = t.organization_id;
    IF prev IS NOT NULL THEN RETURN (prev->>'status')::public.turnover_status; END IF;
  END IF;
  IF t.status <> _from THEN RAISE EXCEPTION 'Conflicto: la rotación ya está en "%"; recargue la página', t.status USING ERRCODE = '40001'; END IF;
  IF t.hold_kind IS NOT NULL THEN RAISE EXCEPTION 'La rotación está %: %', CASE WHEN t.hold_kind = 'blocked' THEN 'bloqueada' ELSE 'pausada' END, t.hold_reason; END IF;

  ops := ARRAY['owner','manager']::public.org_role[];
  IF (_from, _to) IN (('exit_announced','exit_confirmed'),('exit_confirmed','inspection_pending'),
      ('available_for_leasing','reserved'),('reserved','available_for_leasing'),('reserved','move_in_completed'),('move_in_completed','closed')) THEN
    allowed := true;
  ELSIF (_from, _to) IN (('inspection_pending','preparation_in_progress'),('preparation_in_progress','ready_for_review')) THEN
    allowed := true; ops := ARRAY['owner','manager','staff']::public.org_role[];
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Transición no permitida: % → %. La aprobación comercial y la publicación usan su propio flujo.', _from, _to;
  END IF;
  PERFORM public._require_role(t.organization_id, ops);

  -- guards
  IF _to = 'preparation_in_progress' AND NOT EXISTS (SELECT 1 FROM public.inspections WHERE turnover_id = t.id AND kind = 'exit' AND status = 'completed') THEN
    RAISE EXCEPTION 'Debe registrar la inspección de salida antes de iniciar la preparación';
  END IF;
  IF _to = 'ready_for_review' THEN
    IF NOT EXISTS (SELECT 1 FROM public.turnover_tasks WHERE turnover_id = t.id AND status <> 'cancelled') THEN
      RAISE EXCEPTION 'Debe existir al menos una tarea de preparación';
    END IF;
    IF EXISTS (SELECT 1 FROM public.turnover_tasks WHERE turnover_id = t.id AND status IN ('pending','in_progress')) THEN
      RAISE EXCEPTION 'Todas las tareas de preparación deben estar completadas';
    END IF;
  END IF;
  IF _to = 'move_in_completed' AND _move_in IS NULL THEN
    RAISE EXCEPTION 'Debe confirmar la fecha real de ingreso';
  END IF;

  UPDATE public.turnovers SET status = _to,
    move_in_date = COALESCE(_move_in, move_in_date),
    closed_at = CASE WHEN _to = 'closed' THEN now() ELSE closed_at END
  WHERE id = t.id;
  PERFORM set_config('propia.workflow','on',true);
  UPDATE public.rooms SET status = public._room_status_for(_to) WHERE id = t.room_id;
  PERFORM set_config('propia.workflow','off',true);
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, 'transition',
    jsonb_build_object('status', _from), jsonb_build_object('status', _to, 'note', NULLIF(trim(_note),''), 'move_in_date', _move_in));
  IF _idem IS NOT NULL THEN
    INSERT INTO public.idempotency_keys(key, organization_id, actor_id, result) VALUES (_idem, t.organization_id, auth.uid(), jsonb_build_object('status', _to));
  END IF;
  RETURN _to;
END $$;

CREATE OR REPLACE FUNCTION public.set_turnover_hold(_turnover uuid, _kind public.hold_kind, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.turnovers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Rotación no encontrada'; END IF;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager']::public.org_role[]);
  IF t.status = 'closed' THEN RAISE EXCEPTION 'La rotación está cerrada'; END IF;
  IF _kind IS NOT NULL AND coalesce(char_length(trim(_reason)),0) < 3 THEN RAISE EXCEPTION 'Indique una razón (mínimo 3 caracteres)'; END IF;
  UPDATE public.turnovers SET hold_kind = _kind, hold_reason = CASE WHEN _kind IS NULL THEN NULL ELSE trim(_reason) END WHERE id = t.id;
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, CASE WHEN _kind IS NULL THEN 'hold_released' ELSE 'hold_set' END,
    jsonb_build_object('hold_kind', t.hold_kind, 'hold_reason', t.hold_reason), jsonb_build_object('hold_kind', _kind, 'hold_reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.record_inspection(_turnover uuid, _kind public.inspection_kind, _notes text, _evidence_url text, _checklist jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.turnovers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Rotación no encontrada'; END IF;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager','staff']::public.org_role[]);
  IF _kind = 'exit' AND t.status <> 'inspection_pending' THEN RAISE EXCEPTION 'La inspección de salida se registra en la etapa "inspección pendiente"'; END IF;
  IF _kind = 'review' AND t.status <> 'ready_for_review' THEN RAISE EXCEPTION 'La revisión final se registra en la etapa "lista para revisión"'; END IF;
  IF coalesce(char_length(trim(_notes)),0) < 5 THEN RAISE EXCEPTION 'Las notas de inspección son obligatorias (mínimo 5 caracteres)'; END IF;
  UPDATE public.inspections SET status = 'completed', notes = trim(_notes), evidence_url = NULLIF(trim(_evidence_url),''),
    checklist = COALESCE(_checklist,'[]'::jsonb), inspector_id = auth.uid(), completed_at = now()
  WHERE turnover_id = t.id AND kind = _kind;
END $$;

CREATE OR REPLACE FUNCTION public.request_publish_approval(_turnover uuid, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.turnovers%ROWTYPE; aid uuid;
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Rotación no encontrada'; END IF;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager','staff']::public.org_role[]);
  IF t.hold_kind IS NOT NULL THEN RAISE EXCEPTION 'La rotación está bloqueada/pausada'; END IF;
  IF t.status <> 'ready_for_review' THEN RAISE EXCEPTION 'Solo se solicita aprobación desde "lista para revisión"'; END IF;
  IF EXISTS (SELECT 1 FROM public.turnover_tasks WHERE turnover_id = t.id AND status IN ('pending','in_progress')) THEN
    RAISE EXCEPTION 'Hay tareas pendientes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inspections WHERE turnover_id = t.id AND kind = 'review' AND status = 'completed') THEN
    RAISE EXCEPTION 'Registre la revisión final con evidencia antes de solicitar aprobación';
  END IF;
  INSERT INTO public.approvals(organization_id, turnover_id, requested_by, request_note) VALUES (t.organization_id, t.id, auth.uid(), NULLIF(trim(_note),'')) RETURNING id INTO aid;
  UPDATE public.turnovers SET status = 'marketing_approval_pending' WHERE id = t.id;
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, 'transition', jsonb_build_object('status','ready_for_review'), jsonb_build_object('status','marketing_approval_pending','approval_id',aid));
  RETURN aid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_approval(_approval uuid, _approve boolean, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.approvals%ROWTYPE; t public.turnovers%ROWTYPE; nxt public.turnover_status;
BEGIN
  SELECT * INTO a FROM public.approvals WHERE id = _approval FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Aprobación no encontrada'; END IF;
  PERFORM public._require_role(a.organization_id, ARRAY['owner','manager']::public.org_role[]);
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue resuelta'; END IF;
  IF NOT _approve AND coalesce(char_length(trim(_note)),0) < 3 THEN RAISE EXCEPTION 'Indique el motivo del rechazo'; END IF;
  SELECT * INTO t FROM public.turnovers WHERE id = a.turnover_id FOR UPDATE;
  IF t.status <> 'marketing_approval_pending' THEN RAISE EXCEPTION 'La rotación no está esperando aprobación'; END IF;
  UPDATE public.approvals SET status = CASE WHEN _approve THEN 'approved'::public.approval_status ELSE 'rejected'::public.approval_status END,
    decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(trim(_note),'') WHERE id = a.id;
  nxt := CASE WHEN _approve THEN 'available_for_leasing'::public.turnover_status ELSE 'ready_for_review'::public.turnover_status END;
  UPDATE public.turnovers SET status = nxt WHERE id = t.id;
  IF NOT _approve THEN
    -- a rejected publication requires a fresh review
    UPDATE public.inspections SET status = 'pending', completed_at = NULL WHERE turnover_id = t.id AND kind = 'review';
  END IF;
  PERFORM set_config('propia.workflow','on',true);
  UPDATE public.rooms SET status = public._room_status_for(nxt) WHERE id = t.room_id;
  PERFORM set_config('propia.workflow','off',true);
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, 'transition', jsonb_build_object('status','marketing_approval_pending'),
    jsonb_build_object('status', nxt, 'approval_id', a.id, 'decision', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END));
END $$;

-- Explicit, clearly-labelled demo seed
CREATE OR REPLACE FUNCTION public.seed_demo_data(_org uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  PERFORM public._require_role(_org, ARRAY['owner','manager']::public.org_role[]);
  SELECT id INTO pid FROM public.properties WHERE organization_id = _org AND name = 'Freses Demo';
  IF pid IS NULL THEN
    INSERT INTO public.properties(organization_id, name, zone, address, is_demo)
    VALUES (_org, 'Freses Demo', 'Curridabat (ficticio)', 'Dirección ficticia de demostración', true) RETURNING id INTO pid;
  END IF;
  INSERT INTO public.rooms(organization_id, property_id, code, status, monthly_rent, is_demo)
  VALUES (_org, pid, '204', 'occupied', 250000, true) ON CONFLICT (property_id, code) DO NOTHING;
  RETURN pid;
END $$;

REVOKE ALL ON FUNCTION public._audit(uuid,text,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._require_role(uuid, public.org_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_organization(text), public.add_member_by_email(uuid,text,public.org_role), public.update_member_role(uuid,uuid,public.org_role), public.remove_member(uuid,uuid),
  public.open_turnover(uuid,date,date,text,text), public.transition_turnover(uuid,public.turnover_status,public.turnover_status,text,text,date),
  public.set_turnover_hold(uuid,public.hold_kind,text), public.record_inspection(uuid,public.inspection_kind,text,text,jsonb),
  public.request_publish_approval(uuid,text), public.decide_approval(uuid,boolean,text), public.seed_demo_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text), public.add_member_by_email(uuid,text,public.org_role), public.update_member_role(uuid,uuid,public.org_role), public.remove_member(uuid,uuid),
  public.open_turnover(uuid,date,date,text,text), public.transition_turnover(uuid,public.turnover_status,public.turnover_status,text,text,date),
  public.set_turnover_hold(uuid,public.hold_kind,text), public.record_inspection(uuid,public.inspection_kind,text,text,jsonb),
  public.request_publish_approval(uuid,text), public.decide_approval(uuid,boolean,text), public.seed_demo_data(uuid),
  public.is_org_member(uuid), public.has_org_role(uuid, public.org_role[]) TO authenticated;
