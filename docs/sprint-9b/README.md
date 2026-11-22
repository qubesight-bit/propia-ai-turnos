# Sprint 9B · Integración QA de TurnOS

El candidato de aplicación es `1e84e4d` en `feat/turnos-dashboard`, con el código de producto de `758a588`. El directorio de trabajo incluye cambios previos de la demo en `demo/`, el cliente, rutas, configuración y pruebas. Usa un checkout limpio del candidato para QA.

## Proyecto QA y orden de instalación

1. Tras recibir autorización, el propietario puede abrir **Project settings → Project actions → Remix** en el proyecto original, seleccionar el espacio aprobado y llamar al destino **TurnOS QA 9B**. Desactiva la copia de historial, archivos y conocimiento. Revisa antes de copiar las funciones y destinos que podrían activarse. Si no puedes verificar su independencia, crea un proyecto limpio. La consulta de proyectos en ambos espacios Lovable visibles no identificó un destino QA. [Remix de Lovable](https://docs.lovable.dev/features/projects/remix)
2. Para la alternativa con Supabase, usa **New project** en una organización aprobada, selecciona la región y guarda la contraseña de base en el gestor autorizado. En un proyecto Lovable independiente, selecciona el backend nuevo desde la integración Supabase si se requiere un entorno alojado. Para el primer pase usa el frontend local en loopback y ese backend QA. Si después se requiere acceso para un equipo, usa un proyecto de alojamiento distinto con acceso restringido y variables QA propias. [Conectar Supabase en Lovable](https://docs.lovable.dev/integrations/supabase)
3. Registra por separado las referencias y orígenes HTTP del proyecto original y de QA. Confirma Auth independiente, tablas de aplicación vacías y ausencia de integraciones, jobs, webhooks, dominios y SMTP heredados. En **Authentication → URL Configuration**, usa `http://127.0.0.1:3000` como Site URL para el primer pase y agrega `http://127.0.0.1:3000/dashboard` como redirección exacta si se confirman cuentas por correo. [Redirecciones de Supabase Auth](https://supabase.com/docs/guides/auth/redirect-urls)
4. El ejecutor autorizado revisa propietarios, ACL y versión con la [consulta inicial de QA](../sprint-9a/README.md#orden-de-ejecución-en-sprint-9b). Si falta la base, instala el [esquema base](../../drizzle/migrations/0000_propia_turnos_core.sql) por el canal autorizado del backend QA. Si Remix ya lo instaló, compara funciones, disparadores y políticas con el esquema base. Aplica [01 de Sprint 8](../sprint-8/sql/01-approval-integrity.sql) y [02 gestionado](sql/02-audit-privacy-managed.sql) en ese orden. Verifica la firma y disponibilidad en PostgREST antes de abrir el acceso a la aplicación.

## Propietarios y permisos SQL

- **01.** Reemplaza dos RPC y conserva sus propietarios y ACL. El ejecutor necesita autoridad sobre ambas funciones y sobre la tabla de tareas para instalar el disparador, y permiso para crear los auxiliares en `public`. Verifica que solo los roles previstos ejecuten las RPC públicas. Staff puede solicitar y owner o manager puede decidir. El bloqueo por rotación serializa la decisión con cambios de tareas.
- **02.** El ejecutor precisa `CREATEROLE`, capacidad de delegar `CREATE` en `public`, controlar la tabla de auditoría y conceder ejecución del auxiliar de membresía. Usa PostgreSQL 16 o posterior para las opciones de membresía. El lector `turnos_audit_reader` es propietario exclusivo de la nueva RPC, tiene `NOLOGIN`, `NOINHERIT`, `NOBYPASSRLS`, `USAGE` en `public`, `SELECT` en auditoría y ejecución de dos auxiliares. La transferencia usa `SET TRUE` temporal y revoca la concesión temporal y `CREATE`. PostgreSQL puede conservar para el creador una membresía administrativa automática con `INHERIT FALSE` y `SET FALSE`. Verifica las opciones efectivas en `pg_auth_members`.
- `public.is_org_member(uuid)` conserva su propietario y su alcance. Debe ser el auxiliar `SECURITY DEFINER` del esquema base, con referencias calificadas a `public.memberships` y `auth.uid()`. Su propietario necesita consultar membresías sin recurrencia de RLS y ejecutar `auth.uid()`. La RPC nueva fija `search_path = pg_catalog` y `row_security = on`. Valida la organización y la identidad del JWT mediante el auxiliar, tanto al comenzar como en la política RLS. El lector carece de dependencia de concesiones en `auth`. [Permisos sobre Auth gestionado](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema-9e32e7)
- Revisa ACL efectivas, incluidas las heredadas de `PUBLIC` y de otras membresías. `authenticated` ejecuta la RPC. `anon` y `service_role` carecen de concesión directa para ejecutarla. Los roles de navegador carecen de lectura directa de la tabla y sus columnas. Revisa exposiciones adicionales en vistas y RPC del catálogo real. El acceso interno autorizado conserva el historial íntegro, incluido el acceso administrativo previsto para `service_role`, que se mantiene en servidor.
- Ante un fallo de instalación comprueba el rollback y conserva el error. Ante un fallo posterior, aplica la [reversión controlada](../sprint-9a/README.md#reversión-y-limpieza) con la aprobación correspondiente.

## Cuentas y primera prueba autenticada

Crea o invita desde **Cloud → Users** o **Authentication → Users** las cinco identidades, usando estos nombres como alias en un dominio de correo de pruebas controlado. Conserva las contraseñas y los tokens fuera del repositorio, terminal compartida y evidencias. Confirma el perfil generado para cada identidad.

| Identidad             | Organización | Rol     |
| --------------------- | ------------ | ------- |
| `turnos-qa-a-owner`   | A            | owner   |
| `turnos-qa-a-manager` | A            | manager |
| `turnos-qa-a-staff`   | A            | staff   |
| `turnos-qa-a-viewer`  | A            | viewer  |
| `turnos-qa-b-owner`   | B            | owner   |

En sesiones separadas, los owners crean `Piloto A <corrida>` y `Piloto B <corrida>` desde TurnOS o con la RPC `create_organization` y el argumento `_name`. A owner llama a `add_member_by_email` con `_org`, `_email` y `_role` para agregar los otros tres usuarios. Usa JWT del usuario y clave publicable en cada operación. El procedimiento de [9A](../sprint-9a/README.md#cuentas-ficticias) detalla el aprovisionamiento.

Primer pase recomendado. En perfiles de navegador separados, inicia como A owner y B owner. Crea ambos pilotos y una propiedad y habitación en A desde la app. Recarga y vuelve a entrar como A owner, y comprueba la persistencia. Verifica acceso a `read_turnos_audit` desde A y denegación de A desde B y desde una sesión anónima. En DevTools conserva el código HTTP y el código de PostgREST, sin copiar cabeceras ni cuerpos sensibles. Confirma que todas las solicitudes de Auth y de datos usan exclusivamente el origen QA. Si aparece `PGRST202`, comprueba firma, esquema expuesto y caché de PostgREST antes de continuar.

## Recorrido completo

1. **A owner** crea propiedad y habitación `A-204`, abre rotación, confirma salida y avanza a inspección. **B owner** registra una propiedad y habitación `B-101` para el control inverso.
2. **A staff** registra inspección inicial y avanza a preparación. **A owner** crea una tarea y **A staff** la termina, avanza a revisión, registra inspección final con hallazgos y un punto verificado y solicita aprobación.
3. **A manager** aprueba, registra la reserva, confirma ingreso con fecha real y cierra. **A owner** verifica rotación, estados, auditoría, tareas e inspecciones tras recargar, cerrar sesión y volver a iniciar.
4. En fixtures independientes, verifica la matriz [A1–D1 de 9A](../sprint-9a/README.md#matriz-de-pruebas). Staff obtiene denegación al decidir o registrar operaciones reservadas a owner/manager. Viewer conserva lectura de A y las escrituras se deniegan. A y B quedan aisladas en ambos sentidos. Comprueba el rechazo de transiciones inválidas, el cierre sin ingreso y la aprobación con tarea pendiente o revisión incompleta.
5. Repite la apertura o transición con la misma carga y la misma clave `_idem` única para esa operación. Espera el resultado original, un único cambio y un único evento. Repite la decisión de aprobación en dos sesiones. Espera una resolución y un conflicto de la segunda. Para auditoría, escribe un marcador ficticio en notas, comprueba la proyección para los cuatro roles A y pide al canal interno autorizado confirmar que conserva el marcador completo. Comprueba la denegación de lectura directa de auditoría.
6. Registra fecha, commit, proyecto, rol, caso, datos ficticios, resultado y evidencia sanitizada. Revisa consola y red tras cada hito. El ensayo sigue pendiente hasta contar con QA y sesiones reales.

## PowerShell

Desde el repositorio local, exporta el commit limpio a una carpeta temporal. La clave debe ser la publicable del proyecto aprobado. Usa el mismo origen QA para frontend y servidor en el primer pase.

```powershell
Set-Location C:\Proyectos\propia-ai-turnos
git status --short --branch
$qaRoot = Join-Path $env:TEMP ('turnos-qa-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $qaRoot | Out-Null
git archive --format=tar --output="$qaRoot/candidate.tar" 1e84e4d -- . ':(exclude).env' ':(exclude)supabase/config.toml'
if ($LASTEXITCODE -ne 0) { throw 'Falló git archive' }
tar.exe -xf "$qaRoot/candidate.tar" -C $qaRoot
if ($LASTEXITCODE -ne 0) { throw 'Falló la extracción del candidato' }
Set-Location $qaRoot
bun install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación' }
```

Para repetir las comprobaciones sin un backend, usa `https://turnos.invalid` y `sb_publishable_test_placeholder` en las dos asignaciones QA siguientes. Para iniciar la aplicación, usa los valores QA autorizados y confirma la referencia antes de iniciar sesión.

```powershell
$qaUrl = 'https://REFERENCIA_QA.supabase.co'
$qaPublicKey = 'CLAVE_PUBLICABLE_QA'
$env:VITE_SUPABASE_URL = $qaUrl
$env:VITE_SUPABASE_PUBLISHABLE_KEY = $qaPublicKey
$env:SUPABASE_URL = $qaUrl
$env:SUPABASE_PUBLISHABLE_KEY = $qaPublicKey
$env:VITE_TURNOS_DEMO = '0'
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
bun run test
bun run lint
bun run build
bun run tsc --noEmit
# Después de confirmar el destino y la autorización de QA:
bun run dev --mode qa --host 127.0.0.1 --port 3000 --strictPort
```

Para repetir SQL local, prepara un clúster PostgreSQL 16+ desechable en loopback con una base vacía llamada `turnos_sprint8_test`. El runner crea roles globales de prueba en ese clúster. En el repositorio con los archivos de 9B y las dependencias instaladas, ejecuta:

```powershell
Set-Location C:\Proyectos\propia-ai-turnos
$env:TURNOS_TEST_DATABASE_URL = 'postgres://postgres@127.0.0.1:55492/turnos_sprint8_test'
node docs/sprint-8/verify-postgres.mjs --managed-audit
Remove-Item Env:TURNOS_TEST_DATABASE_URL
```

En 9B pasaron 43 pruebas de Vitest con dependencias simuladas, lint con siete advertencias de Fast Refresh, build y TypeScript. En PostgreSQL local 18.7, el runner instaló 01 y 02 con un ejecutor sin superusuario y sin opción de delegar Auth, validó concurrencia, permisos, aislamiento, proyección y conservación de instantáneas. El runner simula las claims de sesión. Supabase Auth, PostgREST, persistencia remota y navegador quedan pendientes de la autorización del proyecto y los datos ficticios.
