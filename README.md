# Propia AI TurnOS

Construye una aplicación SaaS web REAL llamada "Propia AI" (primer módulo "TurnOS") en el workspace del propietario. Debe ser full-stack con Lovable Cloud/Supabase (base de datos PostgreSQL gestionada), React + TypeScript + Tailwind + shadcn/ui, NO VPS, Docker, localhost ni dependencias self-hosted. Idioma español (Costa Rica) y zona horaria America/Costa_Rica. No usar n8n al comienzo; dejar conectores futuros desacoplados.

Producto: Autonomous Property Operations para administradores de habitaciones, residencias y apartahoteles; primera entrega: rotación inteligente de habitaciones desde aviso de salida hasta nuevo ingreso. Crear aplicación funcional con persistencia real, NO solo una landing ni datos mock como fuente de verdad.

PANTALLAS: 1) acceso/login; 2) dashboard con habitaciones por estado, rotaciones abiertas, inspecciones pendientes, aprobaciones y auditoría; 3) propiedades y habitaciones CRUD; 4) tablero de rotaciones con etapas, detalle y línea de tiempo; 5) tareas/inspecciones y checklist con evidencia opcional; 6) bandeja de aprobaciones; 7) historial de auditoría filtrable; 8) ajustes de organización y miembros básico. Responsive mobile/desktop, diseño SaaS profesional, sobrio y premium en azul petróleo/verde azulado con tipografía legible. Usar datos de demostración solo mediante seed explícito y claramente identificado; una propiedad ficticia "Freses Demo", habitación "204" de ejemplo, sin datos personales ni API keys reales.

MODELO DE DATOS: organizations (id,name), memberships (organization_id,user_id,role), properties (organization_id,name,zone,address optional), rooms (organization_id,property_id,code,status,monthly_rent optional), turnovers (organization_id,room_id,status,move_out_date,target_ready_date,created_by,created_at), turnover_tasks (organization_id,turnover_id,type,title,status,assignee_id nullable,due_date nullable,completed_at), inspections (organization_id,turnover_id,status,notes,completed_at), approvals (organization_id,turnover_id,action,status,requested_by,decided_by,decided_at), audit_events (organization_id,actor_id,entity_type,entity_id,action,before_json,after_json,created_at). Añade constraints, índices y timestamps. Auth Supabase. Multiempresa por organization_id desde el inicio con RLS y verificación en backend; membresía estricta para SELECT/INSERT/UPDATE/DELETE. Roles owner, manager, staff, viewer. Prohibido confiar en role o organization_id enviado sin comprobar membresía. Evitar políticas RLS recursivas. No exponer service role ni secretos en navegador.

ESTADOS DE ROTACIÓN: exit_announced -> exit_confirmed -> inspection_pending -> preparation_in_progress -> ready_for_review -> marketing_approval_pending -> available_for_leasing -> reserved -> move_in_completed -> closed. Permitir bloqueado/pausado en etapas con razón. No avanzar ni saltar estados arbitrariamente: transiciones autorizadas validadas del lado servidor (RPC/edge functions seguras) con locks/transacción, control de idempotencia y auditoría. Confirmación de salida e inspección; tareas de preparación completadas y evidencia de revisión antes de solicitar aprobación comercial; aprobación explícita por owner/manager para publicar; cierre solo cuando se confirme ingreso. Decisiones legales, pagos, desalojos, cambio de cerraduras y documentos sensibles SIEMPRE fuera de automatización y con intervención humana. La IA todavía NO debe ejecutar acciones; diseñar interfaces de adaptación futuras para Sara/n8n/WhatsApp, pero no simular que están conectadas.

FUNCIONES PRIMERA ITERACIÓN: crear propiedad y habitación; abrir rotación; ver progreso y checklist; crear/asignar/completar tareas; registrar inspección; solicitar/aprobar/rechazar publicación; cambiar estados con permisos; cerrar con verificación; registro auditable; métricas básicas de conteos y días de rotación. Toasts/estados de carga y errores; casos vacíos. No añadir pagos ni marketplace ni contratos completos.

CRITERIOS DE ACEPTACIÓN: recorrido completo habitación 204 de Freses Demo desde aviso hasta cierre, respetando transiciones y aprobación; usuario sin permiso no modifica; usuarios otra organización no ven registros; registros persisten tras refresh; no se puede marcar disponible sin aprobación; todas las acciones dejan auditoría. Ejecuta o prepara tests básicos y realiza comprobación de errores de compilación. No afirmar integraciones existentes. Incluye README/guía de uso en el proyecto.

Trabaja de manera incremental priorizando aplicación operativa, base de datos y autorización antes de elementos decorativos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0605c3a3-d219-4fd1-bd4d-a30456b3e6ee).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
