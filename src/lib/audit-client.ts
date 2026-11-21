import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";

export type SafeAuditRow = Tables<"audit_events"> & {
  before_redacted: boolean;
  after_redacted: boolean;
};

type AuditReadArgs = {
  _org: string;
  _offset?: number;
  _limit?: number;
  _turnover?: string;
  _from?: string;
  _to?: string;
  _actor?: string;
  _system?: boolean;
  _action?: string;
  _entity?: string;
};

// The candidate RPC is absent from generated types until the approved migration runs.
type AuditDatabase = Database & {
  public: {
    Functions: { read_turnos_audit: { Args: AuditReadArgs; Returns: SafeAuditRow[] } };
  };
};

export function readSafeAudit(args: AuditReadArgs, signal: AbortSignal) {
  const client = supabase as unknown as SupabaseClient<AuditDatabase>;
  return client.rpc("read_turnos_audit", args).abortSignal(signal);
}
