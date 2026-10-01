<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoCierreDeMes;
use App\Models\ArchivoMedia;
use App\Models\CierreDeMes;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\GuardadoDeArchivos;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

/**
 * CierreDeMesController — los reportes de cierre de cada mes.
 * ---------------------------------------------------------------------
 * Desde el 2026-10-01. El comercial sube su reporte del mes (un PDF, un
 * Excel, una presentación) y aquí quedan, ordenados por mes, para admin
 * y comercial. Quién puede qué lo decide CierreDeMesPolicy.
 *
 * El fichero entra por GuardadoDeArchivos, como todos (regla 21), al
 * disco privado; se sirve con enlace firmado por la misma ruta que los
 * adjuntos de la bitácora. Subir y borrar quedan en la auditoría.
 *
 * A diferencia de los adjuntos de la bitácora, el fichero y el cierre se
 * crean en la MISMA petición: aquí no hay un mensaje que se escribe
 * mientras sube, así que no hacía falta separarlos.
 */
class CierreDeMesController extends Controller
{
    /**
     * GET /api/cierres-de-mes
     *
     * Todos, del mes más reciente al más antiguo y, dentro de cada mes,
     * lo último que se subió primero. La interfaz los agrupa por mes.
     */
    public function index(): AnonymousResourceCollection
    {
        $this->authorize('viewAny', CierreDeMes::class);

        $cierres = CierreDeMes::query()
            ->with('archivo')
            ->orderByDesc('mes')
            ->orderByDesc('created_at')
            ->get();

        return RecursoCierreDeMes::collection($cierres);
    }

    /**
     * POST /api/cierres-de-mes  (multipart)
     *
     *   · `archivo` → el reporte.
     *   · `mes`     → «2026-09»: el mes AL QUE CORRESPONDE, no el de hoy.
     *   · `titulo`  → opcional; sin él, el nombre del fichero.
     *   · `notas`   → opcional.
     */
    public function store(Request $peticion, GuardadoDeArchivos $guardado): JsonResponse
    {
        $this->authorize('create', CierreDeMes::class);

        $datos = $peticion->validate([
            'archivo' => ['required', 'file', 'max:'.GuardadoDeArchivos::TAMANO_MAXIMO_DE_DOCUMENTO_KB],
            'mes' => ['required', 'date_format:Y-m'],
            'titulo' => ['nullable', 'string', 'max:160'],
            'notas' => ['nullable', 'string', 'max:2000'],
        ], [
            'archivo.required' => 'Elige el fichero del reporte.',
            'archivo.max' => 'El fichero no puede pesar más de 20 MB.',
            'archivo.uploaded' => 'El fichero no llegó entero al servidor. Si pesa mucho, prueba a reducirlo.',
            'mes.required' => 'Elige a qué mes corresponde el reporte.',
            'mes.date_format' => 'El mes no es válido.',
        ], [
            'titulo' => 'título',
            'notas' => 'notas',
        ]);

        /** @var User $quienSube */
        $quienSube = $peticion->user();

        $mes = CarbonImmutable::createFromFormat('!Y-m', $datos['mes'])->startOfMonth();

        // Un reporte de un mes que todavía no ha empezado es un error al
        // elegirlo; el del mes en curso sí vale (hay quien lo adelanta).
        if ($mes->greaterThan(CarbonImmutable::now('America/Caracas')->startOfMonth())) {
            return response()->json([
                'mensaje' => 'Ese mes todavía no ha empezado.',
                'errores' => ['mes' => ['Ese mes todavía no ha empezado.']],
            ], 422);
        }

        $cierre = DB::transaction(function () use ($datos, $peticion, $guardado, $quienSube, $mes): CierreDeMes {
            $archivo = $guardado->guardar(
                $peticion->file('archivo'),
                ArchivoMedia::PROPOSITO_CIERRE_DE_MES,
                $quienSube,
            );

            $titulo = trim((string) ($datos['titulo'] ?? ''));
            $notas = trim((string) ($datos['notas'] ?? ''));

            return CierreDeMes::create([
                'mes' => $mes->toDateString(),
                // Sin título, el nombre del fichero sin la extensión, que
                // suele ser lo que el comercial ya le puso.
                'titulo' => $titulo !== ''
                    ? $titulo
                    : (pathinfo($archivo->nombre_original, PATHINFO_FILENAME) ?: 'Reporte'),
                'notas' => $notas !== '' ? $notas : null,
                'archivo_media_id' => $archivo->id,
                'subido_por_id' => $quienSube->id,
                'subido_por_nombre' => $quienSube->nombreParaMostrar(),
            ]);
        });

        RegistroActividad::anotar(
            $quienSube,
            RegistroActividad::ACCION_CREO,
            'cierre_de_mes',
            $cierre->id,
            'Subió el cierre de '.$cierre->mesEnPalabras().': '.$cierre->titulo,
        );

        return (new RecursoCierreDeMes($cierre->load('archivo')))->response()->setStatusCode(201);
    }

    /**
     * DELETE /api/cierres-de-mes/{cierre}
     *
     * Se lleva el fichero del disco.
     */
    public function destroy(Request $peticion, CierreDeMes $cierre): JsonResponse
    {
        $this->authorize('delete', $cierre);

        $descripcion = 'Eliminó el cierre de '.$cierre->mesEnPalabras().': '.$cierre->titulo;
        $idDelCierre = $cierre->id;

        $cierre->eliminarConSuArchivo();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ELIMINO,
            'cierre_de_mes',
            $idDelCierre,
            $descripcion,
        );

        return response()->json(['mensaje' => 'Reporte eliminado.']);
    }
}
