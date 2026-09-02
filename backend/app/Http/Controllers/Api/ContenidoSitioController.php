<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ContenidoSitio;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\ContenidoWebPorDefecto;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ContenidoSitioController — el administrador de la web pública.
 * ---------------------------------------------------------------------
 * Sustituye a `admin.js` + la tabla `site_content` de Supabase. Maneja
 * un único documento JSON con todo lo editable del sitio: colores,
 * imágenes, textos en español e inglés, servicios, proyectos, equipo,
 * aliados y datos de contacto.
 *
 * Lo que aporta frente a la versión anterior es el HISTORIAL: cada
 * guardado crea una versión nueva en lugar de pisar la anterior, así que
 * si alguien borra media página por accidente se puede volver atrás en
 * un clic en vez de reescribirla de memoria.
 */
class ContenidoSitioController extends Controller
{
    /**
     * GET /api/contenido-web  (público, sin sesión)
     * Lo que consume la web pública para pintarse.
     */
    public function mostrarPublico(): JsonResponse
    {
        $versionVigente = ContenidoSitio::versionPublicada();

        return response()->json([
            'contenido' => ContenidoWebPorDefecto::completar($versionVigente->contenido ?? []),
            'actualizadoEn' => $versionVigente->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * GET /api/admin/contenido-web
     * Igual que el anterior, pero añadiendo quién y cuándo lo tocó por
     * última vez, que es lo que el panel muestra en la cabecera.
     */
    public function mostrarParaEdicion(Request $peticion): JsonResponse
    {
        $this->authorize('administrarContenidoWeb', User::class);
        unset($peticion);

        $versionVigente = ContenidoSitio::versionPublicada();

        return response()->json([
            'contenido' => ContenidoWebPorDefecto::completar($versionVigente->contenido ?? []),
            'versionId' => $versionVigente->id,
            'actualizadoPor' => $versionVigente->actualizado_por_nombre,
            'actualizadoEn' => $versionVigente->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * PUT /api/admin/contenido-web
     * Publica una versión nueva del contenido.
     */
    public function actualizar(Request $peticion): JsonResponse
    {
        $this->authorize('administrarContenidoWeb', User::class);

        $datos = $peticion->validate([
            'contenido' => ['required', 'array'],
            'notaDeCambio' => ['nullable', 'string', 'max:180'],
        ], [
            'contenido.required' => 'No llegó ningún contenido que guardar.',
        ]);

        /** @var User $autor */
        $autor = $peticion->user();

        // Se completa con los valores de fábrica antes de guardar: si el
        // panel envía un documento parcial (por ejemplo, porque se editó
        // solo una pestaña), las claves que falten no se pierden.
        $contenidoCompleto = ContenidoWebPorDefecto::completar($datos['contenido']);

        $versionNueva = ContenidoSitio::publicarNuevaVersion(
            $contenidoCompleto,
            $autor,
            $datos['notaDeCambio'] ?? null,
        );

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_PUBLICO_WEB,
            'contenido_sitio',
            (string) $versionNueva->id,
            'Publicó cambios en la web pública'
                .(isset($datos['notaDeCambio']) ? ': '.$datos['notaDeCambio'] : ''),
        );

        return response()->json([
            'mensaje' => 'Cambios publicados. Ya se ven en la web.',
            'contenido' => $versionNueva->contenido,
            'versionId' => $versionNueva->id,
            'actualizadoEn' => $versionNueva->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * GET /api/admin/contenido-web/historial
     * Últimas versiones guardadas, para poder restaurar una.
     */
    public function historial(): JsonResponse
    {
        $this->authorize('administrarContenidoWeb', User::class);

        $ultimasVersiones = ContenidoSitio::query()
            ->where('clave', ContenidoSitio::CLAVE_PRINCIPAL)
            ->latest('id')
            // El documento completo no se envía en el listado: pesa mucho
            // y no hace falta hasta que se pide restaurar una versión.
            ->select(['id', 'es_version_publicada', 'actualizado_por_nombre', 'nota_de_cambio', 'created_at'])
            ->limit(40)
            ->get()
            ->map(fn (ContenidoSitio $version): array => [
                'id' => $version->id,
                'esLaPublicada' => $version->es_version_publicada,
                'autor' => $version->actualizado_por_nombre ?? 'Sistema',
                'nota' => $version->nota_de_cambio,
                'creadaEn' => $version->created_at?->toIso8601String(),
            ]);

        return response()->json(['versiones' => $ultimasVersiones]);
    }

    /**
     * POST /api/admin/contenido-web/restaurar/{version}
     * Vuelve a publicar una versión anterior tal cual estaba.
     */
    public function restaurar(Request $peticion, ContenidoSitio $version): JsonResponse
    {
        $this->authorize('administrarContenidoWeb', User::class);

        /** @var User $autor */
        $autor = $peticion->user();

        $versionRestaurada = ContenidoSitio::publicarNuevaVersion(
            $version->contenido ?? [],
            $autor,
            'Restauración de la versión #'.$version->id,
        );

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_PUBLICO_WEB,
            'contenido_sitio',
            (string) $versionRestaurada->id,
            'Restauró la versión #'.$version->id.' de la web',
        );

        return response()->json([
            'mensaje' => 'Versión restaurada.',
            'contenido' => $versionRestaurada->contenido,
            'versionId' => $versionRestaurada->id,
        ]);
    }

    /**
     * POST /api/admin/contenido-web/restablecer
     * Devuelve la web al contenido de fábrica. La versión anterior queda
     * en el historial, así que no es una operación destructiva.
     */
    public function restablecerDeFabrica(Request $peticion): JsonResponse
    {
        $this->authorize('administrarContenidoWeb', User::class);

        /** @var User $autor */
        $autor = $peticion->user();

        $versionDeFabrica = ContenidoSitio::publicarNuevaVersion(
            ContenidoWebPorDefecto::comoArreglo(),
            $autor,
            'Restablecido al contenido de fábrica',
        );

        return response()->json([
            'mensaje' => 'La web volvió al contenido de fábrica. La versión anterior sigue en el historial.',
            'contenido' => $versionDeFabrica->contenido,
            'versionId' => $versionDeFabrica->id,
        ]);
    }
}
