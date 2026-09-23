# Dashboard CRRT — estructura A y dirección visual

Estado: diseño y entrega en dos PRs apiladas aprobados; preparación final contra el `origin/trunk` vigente.

## Objetivo y referencia

Llevar al dashboard la estructura A aprobada: navegación de proyectos a la izquierda, lista seleccionable y detalle de lectura. Figtree, superficies blancas, naranja puntual y detalles pixel. Referencia: `dashboard-figtree-v4.html`, conservada en la sesión local de brainstorming. El mockup es ilustrativo, no una especificación de APIs.

Entrega aislada en `design/dashboard-refresh-ui` y `design/dashboard-agent-handoff`, ambas reconstruidas desde el `origin/trunk` vigente. No modificar otros worktrees ni su trabajo pendiente.

## Alcance

- Dashboard autenticado: navegación, listado, detalle, selección y revisión para copiar.
- Mantener acceso a configuración, notificaciones, auditoría, administración según permisos y My comments. No sustituir acciones reales por placeholders.
- No rediseñar landing, widget ni extensión; no alterar facturación, permisos, endpoints ni esquema en el PR visual.
- Mantener el idioma inglés de la aplicación; el español del mockup fue material de evaluación, no una solicitud de localización.

## Dirección visual

- Figtree 400 para lectura, 500 para controles y 600 para énfasis. Texto principal de comentarios 14–16 px; metadatos 12–13 px; títulos 22–24 px.
- Figtree autohospedada en assets del dashboard, con fallback de sistema y carga swap. No añadir solicitudes a Google Fonts en producción.
- Blanco #ffffff, sidebar #f8f9fa, texto #202329, secundario #646b75 y divisores #e7e9ed.
- Naranja de acción #c24c12 con texto blanco (contraste calculado 4.84:1); selección suave #fff3eb. Conservar el naranja original en el logo.
- Usar el asset canónico de zanahoria, no el emoji ilustrativo del mockup. VT323 limitada a pequeños momentos de marca; monospace solo para código y contexto técnico.
- Registrar tokens nuevos en `branding/crrt/tokens.css` antes de consumirlos. Documentar en el sistema de diseño una excepción de dashboard que reemplaza Inter/dark-first. No modificar los defaults de otros productos.
- Light por defecto para usuarios sin preferencia válida guardada. Respetar dark explícitamente guardado y mantener el selector de tema y contraste de ese modo.
- Divisores finos, radios de 6–12 px, sombras reservadas a overlays, densidad útil en lista y más aire en detalle. No aumentar tamaños como en una landing.

## Estructura e interacciones

### Proyectos y lista

Sidebar compacta con proyectos y acciones existentes. Nombres largos truncados visualmente con nombre completo accesible. Lista y detalle son regiones distintas, con scroll propio en escritorio. En móvil, navegación compacta y vista de detalle con regreso a la lista sin perder selección.

Abrir un comentario y marcar su checkbox son acciones independientes. No seleccionar automáticamente al abrir. Los checkboxes son visibles sin un modo de selección previo. Seleccionar visibles afecta únicamente al filtro actual y muestra estado mixto cuando corresponde.

La selección persiste al cambiar filtros o búsqueda, pero se limpia al cambiar proyecto, salir del ámbito de feedback o perder permisos. Eliminar IDs que ya no estén disponibles después de una carga válida, sin limpiar por estados transitorios de carga. Mostrar cuántos seleccionados quedan fuera del filtro. Seleccionar y copiar no modifican reviewStatus ni implementationStatus.

### Detalle

Contenido del comentario antes de la captura, autor y contexto legibles. Estado arriba mediante acciones que reutilizan las transiciones existentes, sin colapsar los estados técnicos ni perder rechazo, bloqueo, progreso o resolución. Reutilizar manejo de errores y permisos.

Mantener audiencia Shared/Internal visible y editable solo con autorización. Contexto técnico desplegable. Capturas conservan proporción, permiten ampliar y tienen fallback ante imagen ausente o fallida. No recrear una imagen como si fuera una captura real.

Integraciones explícitas bajo el comentario: logo decorativo y nombre accesible de GitHub, Linear y Jira. Reutilizar preparación, revisión, creación, enlaces existentes, estados de sincronización y reintentos incorporados en los PRs recientes. No duplicar un issue ya vinculado. Conectar conduce a la configuración existente solo para quien pueda gestionarla; el resto recibe explicación, no un botón inoperante.

### Copiar para agente

Una barra compacta aparece solo cuando hay selección autorizada: cantidad, limpiar y Copy for agent. Abre revisión de comentarios y selector de herramienta. Debe incluir exactamente los IDs seleccionados, de cualquier estado legible y permitido, nunca todos los Ready for Agent por defecto. Informar éxito solo tras escritura real al portapapeles, conservar selección en error y permitir reintentar.

No usar un panel permanente de agente para esta acción. Las funciones existentes de sesión/presencia que sigan siendo necesarias deben quedar accesibles desde herramientas, sin confundirlas con copiar una selección.

## Diferencias verificadas entre mockup y runtime

1. `CommentDetail.tsx` abre `pageUrl` directamente. En los archivos de widget y dashboard inspeccionados no se encontró un contrato de enlace para enfocar un pin. El PR visual conserva Open page junto a la captura: solo podrá llamarse View pin cuando un receptor real soporte y verifique esa navegación. Implementar el receptor requiere un PR coordinado separado para no interferir con la extensión.
2. `useAgentSession.copyPrompt(target)` usa `getPromptByShare` sin IDs seleccionados. No reutilizar esa función detrás de un contador de selección. La implementación del flujo de copia exacta exige verificar el contrato de prompts y separar el cambio funcional del visual. No alterar sesiones compartidas ni permisos para simularlo.
3. Existen capacidades separadas feedback:manage, agent:operate y project:manage. La nueva estructura debe conservarlas; ocultar controles no reemplaza validación del servidor.
4. Las reglas actuales definen Inter, cream y dark-first. La excepción de dashboard debe ser explícita y con alcance local.

## División de PRs

1. **UI del dashboard:** tokens acotados, Figtree, light por defecto sin pisar preferencias, sidebar, lista/detalle, ubicación clara de integraciones y Open page. Preservar las funciones de agente existentes mientras no esté listo el siguiente PR.
2. **Selección y copia exacta:** selección independiente de estado, barra contextual, revisión y contrato de copia comprobado. Reemplazar la presentación antigua del agente una vez que este flujo funcione. No publicar una barra de selección con un exportador que ignore sus IDs.
3. **Navegación al pin:** contrato receptor/emisor y verificación con widget o extensión en coordinación con su trabajo. Hasta entonces mantener Open page.

Cada PR debe ser funcional por sí mismo. No aprobar ni mergear automáticamente estos cambios.

## Validación antes de entregar

Usar fixtures representativas de los esquemas reales y capturas autorizadas; no publicar información privada de clientes ni modificar comentarios reales para probar. No se ha realizado una sesión autenticada con datos reales durante esta preparación.

- Cuenta sin proyectos, proyecto sin feedback y búsqueda sin resultados deben tener mensajes y acciones distintos. No confundir fallo de carga con vacío.
- Comentarios largos, palabras/URLs sin espacios, autores y proyectos extensos, capturas verticales/horizontales/ausentes/fallidas.
- Loading, error y reintento; lectores sin gestión, usuarios sin agent:operate y usuarios sin project:manage.
- Integración desconectada, issue existente, preparación y creación pendientes, error, cierre fallido/bloqueado y reintento.
- Selección de comentarios en distintos estados, filtro/búsqueda, seleccionar visibles, limpiar, cambio de proyecto, refresh y pérdida de permisos.
- Copia de selección exacta, portapapeles rechazado y ausencia de mutaciones de estado al seleccionar/copiar.
- Layout a 1440, 1024 y 390 px; zoom 200%; teclado, foco visible, devolución de foco de modal, Escape y reduced motion.
- Tests de componentes e integración afectados, build y revisión visual en navegador. Ejecutar la skill local diff-coverage, con 100% de cobertura diferencial de líneas y ramas exigida por el repo. Registrar bloqueos o fallos en vez de afirmar validación completa.

## Revisión interna

El diseño conserva el UX aprobado, pero distingue acciones ilustrativas de contratos existentes. No añade infraestructura de pagos ni extiende permisos. La separación de PRs evita tocar la extensión y evita un contador de selección engañoso. Los puntos de integración quedan definidos como gates verificables, no como controles ficticios.
