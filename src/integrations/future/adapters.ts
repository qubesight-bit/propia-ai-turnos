/**
 * Contratos para conectores futuros (Sara IA, n8n, WhatsApp).
 * NINGUNO está implementado ni conectado. Cualquier adaptador futuro debe:
 *  - llamar únicamente a las funciones seguras del servidor (transition_turnover, etc.),
 *  - nunca saltarse la aprobación humana,
 *  - nunca automatizar decisiones legales, pagos, desalojos, cambio de cerraduras o documentos sensibles.
 */
export type ConnectorId = "sara_ai" | "n8n" | "whatsapp";

export interface TurnoverEvent {
  organizationId: string;
  turnoverId: string;
  action: string;
  occurredAt: string;
}

export interface OutboundConnector {
  id: ConnectorId;
  /** Notifica un evento ya auditado. Solo lectura/notificación: no muta estado. */
  notify(event: TurnoverEvent): Promise<void>;
}

/** Sugerencia de IA: requiere siempre confirmación humana antes de ejecutarse. */
export interface AiSuggestion {
  turnoverId: string;
  suggestion: string;
  requiresHumanApproval: true;
}

export const CONNECTOR_STATUS: Record<ConnectorId, "not_connected"> = {
  sara_ai: "not_connected",
  n8n: "not_connected",
  whatsapp: "not_connected",
};
