-- Borrador para Lovable. Aplicar solo en un entorno autorizado con el esquema base.
BEGIN;

-- Serializa cambios de tareas y decisiones sobre la misma rotación.
-- El bloqueo asesor se toma antes del bloqueo de la fila en las RPC de aprobación.
CREATE FUNCTION public.turnos_lock_approval_inputs() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  turnover uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.turnover_id ELSE NEW.turnover_id END;
  stage public.turnover_status;
  org uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.turnover_id IS DISTINCT FROM OLD.turnover_id THEN
    RAISE EXCEPTION 'No se puede mover la tarea';
  END IF;
  SELECT organization_id INTO org FROM public.turnovers WHERE id = turnover;
  IF TG_OP = 'DELETE' AND org IS NULL THEN RETURN OLD; END IF; -- cascada del padre
  IF org IS NULL OR (TG_OP <> 'DELETE' AND NEW.organization_id IS DISTINCT FROM org) THEN
    RAISE EXCEPTION 'Rotación inválida para esta organización' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('turnos.approval:' || turnover::text, 0));
  SELECT status INTO stage FROM public.turnovers WHERE id = turnover;
  IF stage IN ('available_for_leasing', 'reserved', 'move_in_completed', 'closed') THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.status = 'done' THEN
        RAISE EXCEPTION 'No se pueden eliminar tareas completadas de una rotación comercializada';
      END IF;
    ELSIF NEW.status IN ('pending', 'in_progress') OR
      (TG_OP = 'UPDATE' AND OLD.status = 'done' AND NEW.status <> 'done') THEN
      RAISE EXCEPTION 'No se pueden introducir tareas pendientes ni deshacer tareas completadas después de aprobar';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER approval_inputs_guard BEFORE INSERT OR UPDATE OR DELETE ON public.turnover_tasks
FOR EACH ROW EXECUTE FUNCTION public.turnos_lock_approval_inputs();
REVOKE ALL ON FUNCTION public.turnos_lock_approval_inputs() FROM PUBLIC, anon, authenticated;

-- Esta función solo se ejecuta desde las RPC tras verificar autorización y bloquear la rotación.
CREATE FUNCTION public.turnos_require_publish_checks(_org uuid, _turnover uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.turnover_tasks
    WHERE organization_id = _org AND turnover_id = _turnover AND status = 'done'
  ) OR EXISTS (
    SELECT 1 FROM public.turnover_tasks
    WHERE organization_id = _org AND turnover_id = _turnover AND status IN ('pending', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'La preparación requiere al menos una tarea completada y ninguna tarea pendiente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inspections
    WHERE organization_id = _org AND turnover_id = _turnover
      AND kind = 'exit' AND status = 'completed' AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Registre la inspección de salida antes de comercializar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inspections AS inspection
    WHERE organization_id = _org AND turnover_id = _turnover
      AND kind = 'review' AND status = 'completed' AND completed_at IS NOT NULL
      AND char_length(regexp_replace(notes, '^[[:space:]]+|[[:space:]]+$', '', 'g')) >= 5
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(inspection.checklist) = 'array' THEN inspection.checklist ELSE '[]'::jsonb END
        ) AS point(value)
        WHERE jsonb_typeof(point.value) = 'string' AND (point.value #>> '{}') ~ '[^[:space:]]'
      )
  ) THEN
    RAISE EXCEPTION 'La revisión final requiere hallazgos y al menos un punto verificado';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.turnos_require_publish_checks(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_publish_approval(_turnover uuid, _note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE t public.turnovers%ROWTYPE; aid uuid;
BEGIN
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager','staff']::public.org_role[]);
  PERFORM pg_advisory_xact_lock(hashtextextended('turnos.approval:' || _turnover::text, 0));
  SELECT * INTO t FROM public.turnovers WHERE id = _turnover FOR UPDATE;
  PERFORM public._require_role(t.organization_id, ARRAY['owner','manager','staff']::public.org_role[]);
  IF t.hold_kind IS NOT NULL THEN RAISE EXCEPTION 'La rotación está bloqueada/pausada'; END IF;
  IF t.status <> 'ready_for_review' THEN RAISE EXCEPTION 'Solo se solicita aprobación desde "lista para revisión"'; END IF;
  PERFORM public.turnos_require_publish_checks(t.organization_id, t.id);

  INSERT INTO public.approvals(organization_id, turnover_id, requested_by, request_note)
    VALUES (t.organization_id, t.id, auth.uid(), NULLIF(btrim(_note),'')) RETURNING id INTO aid;
  UPDATE public.turnovers SET status = 'marketing_approval_pending' WHERE id = t.id;
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, 'transition', jsonb_build_object('status','ready_for_review'),
    jsonb_build_object('status','marketing_approval_pending','approval_id',aid));
  RETURN aid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_approval(_approval uuid, _approve boolean, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE a public.approvals%ROWTYPE; t public.turnovers%ROWTYPE; nxt public.turnover_status;
BEGIN
  SELECT * INTO a FROM public.approvals WHERE id = _approval;
  PERFORM public._require_role(a.organization_id, ARRAY['owner','manager']::public.org_role[]);
  IF _approve IS NULL THEN RAISE EXCEPTION 'Indique una decisión válida'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('turnos.approval:' || a.turnover_id::text, 0));
  SELECT * INTO t FROM public.turnovers WHERE id = a.turnover_id FOR UPDATE;
  SELECT * INTO a FROM public.approvals WHERE id = _approval FOR UPDATE;
  PERFORM public._require_role(a.organization_id, ARRAY['owner','manager']::public.org_role[]);
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Esta solicitud ya fue resuelta' USING ERRCODE = '40001'; END IF;
  IF t.id IS NULL OR t.organization_id <> a.organization_id OR t.status <> 'marketing_approval_pending' THEN
    RAISE EXCEPTION 'La rotación no está esperando aprobación' USING ERRCODE = '40001';
  END IF;
  IF t.hold_kind IS NOT NULL THEN RAISE EXCEPTION 'La rotación está bloqueada/pausada'; END IF;
  IF _approve THEN
    PERFORM public.turnos_require_publish_checks(t.organization_id, t.id);
  ELSIF coalesce(char_length(btrim(_note)),0) < 3 THEN
    RAISE EXCEPTION 'Indique el motivo del rechazo';
  END IF;

  UPDATE public.approvals SET status = CASE WHEN _approve THEN 'approved'::public.approval_status ELSE 'rejected'::public.approval_status END,
    decided_by = auth.uid(), decided_at = now(), decision_note = NULLIF(btrim(_note),'') WHERE id = a.id;
  nxt := CASE WHEN _approve THEN 'available_for_leasing'::public.turnover_status ELSE 'ready_for_review'::public.turnover_status END;
  UPDATE public.turnovers SET status = nxt WHERE id = t.id;
  IF NOT _approve THEN
    UPDATE public.inspections SET status = 'pending', completed_at = NULL
    WHERE organization_id = t.organization_id AND turnover_id = t.id AND kind = 'review';
  END IF;
  PERFORM set_config('propia.workflow','on',true);
  UPDATE public.rooms SET status = public._room_status_for(nxt) WHERE id = t.room_id AND organization_id = t.organization_id;
  PERFORM set_config('propia.workflow','off',true);
  PERFORM public._audit(t.organization_id, 'turnovers', t.id, 'transition', jsonb_build_object('status','marketing_approval_pending'),
    jsonb_build_object('status',nxt,'approval_id',a.id,'decision',CASE WHEN _approve THEN 'approved' ELSE 'rejected' END));
END $$;

COMMIT;
