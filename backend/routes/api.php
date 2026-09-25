<?php

declare(strict_types=1);

/**
 * routes/api.php — el mapa completo de la API de TS Sports.
 * ---------------------------------------------------------------------
 * Todas las rutas de este fichero cuelgan del prefijo /api.
 *
 * Están agrupadas en tres bloques según quién puede llamarlas:
 *
 *   1. PÚBLICO      → sin sesión. Es lo que consume la web pública: el
 *                     contenido del sitio y el formulario de contacto.
 *                     Van con limitación de peticiones por IP.
 *
 *   2. AUTENTICADO  → cualquier persona del equipo con sesión iniciada.
 *                     Es el grueso del CRM. El permiso fino (quién puede
 *                     editar qué marca) lo resuelven las políticas.
 *
 *   3. ADMINISTRACIÓN → gestión de cuentas, contenido de la web y
 *                     auditoría. La restricción exacta la aplica cada
 *                     política; aquí solo se agrupan por claridad.
 */

use App\Http\Controllers\Api\AuditoriaController;
use App\Http\Controllers\Api\AutenticacionController;
use App\Http\Controllers\Api\CalendarioController;
use App\Http\Controllers\Api\CampanaController;
use App\Http\Controllers\Api\CatalogoController;
use App\Http\Controllers\Api\ComentarioMarcaController;
use App\Http\Controllers\Api\ContenidoSitioController;
use App\Http\Controllers\Api\LeadPublicoController;
use App\Http\Controllers\Api\EventoDeCampanaController;
use App\Http\Controllers\Api\MarcaController;
use App\Http\Controllers\Api\MediaController;
use App\Http\Controllers\Api\MiPerfilController;
use App\Http\Controllers\Api\NotificacionController;
use App\Http\Controllers\Api\PanelController;
use App\Http\Controllers\Api\PropiedadController;
use App\Http\Controllers\Api\SectorController;
use App\Http\Controllers\Api\ExportacionDeBitacoraController;
use App\Http\Controllers\Api\SuscripcionPushController;
use App\Http\Controllers\Api\TiempoRealController;
use App\Http\Controllers\Api\UsuarioController;
use Illuminate\Support\Facades\Route;

/* =====================================================================
 | 1. Rutas públicas (sin sesión)
 |==================================================================== */

// Contenido de la web pública. Es la petición más frecuente del sitio,
// así que va con un límite alto y se puede cachear delante sin problema.
Route::get('/contenido-web', [ContenidoSitioController::class, 'mostrarPublico'])
    ->middleware('throttle:120,1');

// Formulario de contacto. Límite estrecho: cinco envíos por minuto e IP
// bastan de sobra para una persona y frenan a un robot.
Route::post('/contacto', [LeadPublicoController::class, 'store'])
    ->middleware('throttle:5,1');

// Inicio de sesión. El freno por fuerza bruta fino (por correo + IP) lo
// aplica además el propio controlador.
Route::post('/auth/login', [AutenticacionController::class, 'iniciarSesion'])
    ->middleware('throttle:10,1');

/* =====================================================================
 | 2. Rutas del equipo (requieren token de Sanctum)
 |==================================================================== */

Route::middleware('auth:sanctum')->group(function (): void {

    /* ---------- Sesión y perfil propio ---------- */
    Route::get('/auth/yo', [AutenticacionController::class, 'usuarioActual']);
    Route::post('/auth/logout', [AutenticacionController::class, 'cerrarSesion']);
    Route::post('/auth/cambiar-password', [AutenticacionController::class, 'cambiarPassword']);

    /* ---------- Tiempo real ----------
     | Si el WebSocket está encendido y con qué clave se entra. La
     | autorización de cada canal privado va aparte, en
     | /api/broadcasting/auth, registrada en bootstrap/app.php.          */
    Route::get('/tiempo-real', [TiempoRealController::class, 'configuracion']);

    /* ---------- Avisos al móvil ----------
     | La libreta de direcciones del push: cada quien da de alta y de
     | baja SU navegador. Quién recibe qué lo sigue decidiendo
     | App\Support\Notificador, igual que con la campanita.             */
    Route::get('/push', [SuscripcionPushController::class, 'configuracion']);
    Route::post('/push/suscripciones', [SuscripcionPushController::class, 'store']);
    Route::delete('/push/suscripciones', [SuscripcionPushController::class, 'destroy']);

    /* ---------- Notificaciones (la campanita) ----------
     | Cada quien, las suyas. Las crea App\Support\Notificador; aquí
     | solo se leen y se marcan.                                         */
    Route::get('/notificaciones', [NotificacionController::class, 'index']);
    Route::get('/notificaciones/sin-leer', [NotificacionController::class, 'contarSinLeer']);
    Route::post('/notificaciones/leidas', [NotificacionController::class, 'marcarTodasComoLeidas']);
    Route::patch('/notificaciones/{notificacion}/leida', [NotificacionController::class, 'marcarComoLeida']);

    Route::get('/mi-perfil', [MiPerfilController::class, 'show']);
    Route::put('/mi-perfil', [MiPerfilController::class, 'update']);
    // Tema y color de acento. Va aparte porque se llama cada vez que
    // alguien pulsa el interruptor de tema y conviene que sea ligera.
    Route::put('/mi-perfil/apariencia', [MiPerfilController::class, 'actualizarApariencia']);

    /* ---------- Listas cerradas para poblar los selectores ---------- */
    Route::get('/catalogos', [CatalogoController::class, 'index']);

    /* ---------- Tablero y métricas ---------- */
    Route::get('/panel/resumen', [PanelController::class, 'resumen']);
    // El calendario de acciones de campaña, semana a semana.
    Route::get('/panel/calendario', [CalendarioController::class, 'calendario']);

    /* ---------- Corregir el historial de acciones de campaña ----------
     | Los eventos se crean solos al asignar campaña en la ficha; estas
     | dos rutas son para arreglarlos cuando la realidad cambia. Quién
     | puede qué lo decide EventoDeCampanaPolicy.                        */
    Route::put('/eventos-de-campana/{evento}', [EventoDeCampanaController::class, 'update']);
    Route::delete('/eventos-de-campana/{evento}', [EventoDeCampanaController::class, 'destroy']);

    /* ---------- Marcas (el CRM propiamente dicho) ---------- */
    Route::get('/marcas', [MarcaController::class, 'index']);
    Route::post('/marcas', [MarcaController::class, 'store']);

    // Van ANTES de /marcas/{marca}: si no, Laravel leería "agentes" como
    // el identificador de una marca y respondería 404.
    Route::get('/marcas/agentes', [MarcaController::class, 'agentes']);
    // Buscador corto de marcas para elegir una (etiquetar en el chat,
    // acotar un reporte). Solo devuelve las que quien busca puede ver.
    Route::get('/marcas/sugerencias', [MarcaController::class, 'sugerencias']);

    Route::get('/marcas/{marca}', [MarcaController::class, 'show']);
    Route::put('/marcas/{marca}', [MarcaController::class, 'update']);
    Route::delete('/marcas/{marca}', [MarcaController::class, 'destroy']);
    // Marcar/desmarcar una fase desde la tarjeta, sin abrir la ficha.
    Route::patch('/marcas/{marca}/fase', [MarcaController::class, 'alternarFase']);
    // Anotar una acción de campaña en el calendario al momento, sin
    // tener que guardar la ficha entera.
    Route::post('/marcas/{marca}/acciones-de-campana', [MarcaController::class, 'anotarAccionDeCampana']);
    // Repartir trabajo desde la propia tarjeta. Es permiso de comercial,
    // no de quien edita la marca: un vendedor no reasigna lo suyo.
    Route::patch('/marcas/{marca}/vendedor', [MarcaController::class, 'asignarVendedor']);

    /* ---------- Propiedades: los productos IOP que se venden ----------
     | El catálogo lo consulta todo el equipo (hace falta para pintar el
     | checklist de la ficha); crearlas y ponerles precio solo lo puede
     | hacer quien gestiona el catálogo, y eso lo decide PropiedadPolicy. */
    Route::get('/propiedades', [PropiedadController::class, 'index']);
    Route::get('/propiedades/{propiedad}', [PropiedadController::class, 'show']);
    Route::post('/propiedades', [PropiedadController::class, 'store']);
    Route::put('/propiedades/{propiedad}', [PropiedadController::class, 'update']);
    // Desactivar desde la tarjeta: lo que se hace con una propiedad que
    // ya pasó y volverá, en vez de borrarla y perder sus marcas.
    Route::patch('/propiedades/{propiedad}/activa', [PropiedadController::class, 'activarODesactivar']);
    Route::delete('/propiedades/{propiedad}', [PropiedadController::class, 'destroy']);

    /* ---------- Sectores (el rubro de cada marca) ----------
     | El catálogo lo consulta todo el equipo, porque hace falta para el
     | selector de la ficha; crearlos y retirarlos lo decide quien
     | gestiona el catálogo comercial, y eso lo aplica SectorPolicy.     */
    Route::get('/sectores', [SectorController::class, 'index']);
    Route::post('/sectores', [SectorController::class, 'store']);
    Route::put('/sectores/{sector}', [SectorController::class, 'update']);
    Route::delete('/sectores/{sector}', [SectorController::class, 'destroy']);

    /* ---------- Campañas comerciales ---------- */
    Route::get('/campanas', [CampanaController::class, 'index']);
    Route::post('/campanas', [CampanaController::class, 'store']);
    Route::put('/campanas/{campana}', [CampanaController::class, 'update']);
    // Igual que con las propiedades: una campaña terminada se desactiva.
    Route::patch('/campanas/{campana}/activa', [CampanaController::class, 'activarODesactivar']);
    Route::delete('/campanas/{campana}', [CampanaController::class, 'destroy']);

    /* ---------- Bitácora de cada marca ---------- */
    Route::get('/marcas/{marca}/comentarios', [ComentarioMarcaController::class, 'index']);
    Route::post('/marcas/{marca}/comentarios', [ComentarioMarcaController::class, 'store']);
    Route::patch('/marcas/{marca}/comentarios/{comentario}', [ComentarioMarcaController::class, 'update']);
    Route::delete('/marcas/{marca}/comentarios/{comentario}', [ComentarioMarcaController::class, 'destroy']);
    Route::put('/marcas/{marca}/comentarios/{comentario}/reacciones', [ComentarioMarcaController::class, 'reaccionar']);

    // A quién se puede etiquetar en ESTA marca. Sale de los
    // permisos sobre ella, no de la lista del equipo (regla 6).
    Route::get('/marcas/{marca}/mencionables', [ComentarioMarcaController::class, 'mencionables']);

    // Sacar el histórico. Todas las salidas quedan anotadas en la
    // auditoría: exportar una bitácora es sacar del sistema toda la
    // relación comercial con esa marca.
    Route::get('/marcas/{marca}/bitacora/exportacion', [ExportacionDeBitacoraController::class, 'deUnaMarca']);

    // Lo que se escribió entre dos fechas, agrupado por marca. Sin marcas
    // elegidas es la agencia entera y solo lo saca el administrador; con
    // marcas, quien pueda ver cada una (lo decide el controlador).
    Route::get('/bitacora/reporte', [ExportacionDeBitacoraController::class, 'porFechas']);

    /* ---------- Imágenes ---------- */
    Route::post('/media', [MediaController::class, 'subir']);
    Route::delete('/media/{archivo}', [MediaController::class, 'destroy']);

    /* ---------- Listado del equipo ----------
     | Lo necesitan admin y comercial para el selector de "vendedor
     | asignado"; la política UserPolicy::viewAny hace el filtro.        */
    Route::get('/usuarios', [UsuarioController::class, 'index']);

    /* =================================================================
     | 3. Administración
     |================================================================ */
    Route::prefix('admin')->group(function (): void {

        /* ---------- Cuentas del equipo ---------- */
        Route::post('/usuarios', [UsuarioController::class, 'store']);
        Route::put('/usuarios/{usuario}', [UsuarioController::class, 'update']);
        Route::delete('/usuarios/{usuario}', [UsuarioController::class, 'destroy']);

        /* ---------- Administrador de la web pública ---------- */
        Route::get('/contenido-web', [ContenidoSitioController::class, 'mostrarParaEdicion']);
        Route::put('/contenido-web', [ContenidoSitioController::class, 'actualizar']);
        Route::get('/contenido-web/historial', [ContenidoSitioController::class, 'historial']);
        Route::post('/contenido-web/restaurar/{version}', [ContenidoSitioController::class, 'restaurar']);
        Route::post('/contenido-web/restablecer', [ContenidoSitioController::class, 'restablecerDeFabrica']);

        /* ---------- Histórico completo de la bitácora ----------
         | La conversación entera de la agencia en un fichero. Mismo
         | permiso que la auditoría, y queda anotada en ella.          */
        Route::get('/bitacora/exportacion', [ExportacionDeBitacoraController::class, 'completa']);

        /* ---------- Auditoría ---------- */
        Route::get('/auditoria', [AuditoriaController::class, 'index']);
        // Va ANTES de nada que use un comodín: es la lista de personas
        // que alimenta el filtro por persona del historial.
        Route::get('/auditoria/personas', [AuditoriaController::class, 'personas']);

        /* ---------- Tiempo real: pantalla de pruebas ----------
         | Quién está conectado ahora y mandar avisos de prueba. Solo
         | admin: lo decide UserPolicy::probarTiempoReal.                  */
        Route::get('/tiempo-real', [TiempoRealController::class, 'panel']);
        Route::post('/tiempo-real/prueba', [TiempoRealController::class, 'enviarPrueba']);
    });
});
