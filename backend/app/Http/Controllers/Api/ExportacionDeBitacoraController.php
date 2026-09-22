<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ExportacionDeBitacoraController — sacar el histórico de la bitácora.
 * ---------------------------------------------------------------------
 * Devuelve las entradas en plano, cronológicas y ya redactadas; el
 * fichero lo arma la interfaz, igual que el reporte del calendario en
 * Excel. Es deliberado: montar un generador de PDF en el servidor
 * añadiría una dependencia pesada para hacer lo que el navegador ya
 * sabe hacer.
 *
 * DOS ALCANCES Y DOS PERMISOS
 *
 *   · El de UNA MARCA lo saca quien pueda ver esa marca. Es su relación
 *     comercial y ya la tiene delante en pantalla.
 *   · El COMPLETO —todas las marcas— es solo del administrador. Es la
 *     conversación entera de la agencia en un fichero; que un agente
 *     pudiera descargársela sería peor que darle acceso al tablero.
 *
 * Y LAS DOS QUEDAN ANOTADAS en el registro de actividad, antes de
 * devolver nada. Sacar una bitácora es sacar del sistema toda la
 * relación con un cliente: si no queda escrito quién lo hizo, el
 * registro de auditoría tiene un agujero justo en lo que más importa.
 *
 * Las entradas eliminadas SALEN, sin texto y diciendo quién las quitó.
 * Si desaparecieran, bastaría con borrar lo incómodo antes de exportar
 * para que el histórico dijese otra cosa.
 */
class ExportacionDeBitacoraController extends Controller
{
    /**
     * GET /api/marcas/{marca}/bitacora/exportacion
     */
    public function deUnaMarca(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('view', $marca);

        /** @var User $quienExporta */
        $quienExporta = $peticion->user();

        $entradas = $this->entradasDe(
            ComentarioMarca::query()->where('marca_id', $marca->id),
        );

        RegistroActividad::anotar(
            $quienExporta,
            RegistroActividad::ACCION_EXPORTO,
            'marca',
            $marca->id,
            'Exportó la bitácora de '.$marca->nombre_marca,
            ['entradas' => count($entradas)],
        );

        return response()->json([
            'alcance' => 'marca',
            'marcaNombre' => $marca->nombre_marca,
            'generadoEn' => now()->toIso8601String(),
            'generadoPor' => $quienExporta->nombreParaMostrar(),
            'entradas' => $entradas,
        ]);
    }

    /**
     * GET /api/bitacora/exportacion
     *
     * El histórico completo. Solo administrador.
     */
    public function completa(Request $peticion): JsonResponse
    {
        /** @var User $quienExporta */
        $quienExporta = $peticion->user();

        // El mismo permiso que abre la auditoría: quien puede ver quién
        // hizo qué es quien puede llevarse el histórico entero.
        $this->authorize('verAuditoria', User::class);

        $entradas = $this->entradasDe(ComentarioMarca::query());

        RegistroActividad::anotar(
            $quienExporta,
            RegistroActividad::ACCION_EXPORTO,
            'bitacora',
            null,
            'Exportó la bitácora completa',
            ['entradas' => count($entradas)],
        );

        return response()->json([
            'alcance' => 'completa',
            'marcaNombre' => null,
            'generadoEn' => now()->toIso8601String(),
            'generadoPor' => $quienExporta->nombreParaMostrar(),
            'entradas' => $entradas,
        ]);
    }

    /**
     * Las entradas en plano, en orden cronológico, con la respuesta
     * justo debajo de aquello a lo que responde.
     *
     * Se aplana aquí y no en la interfaz porque el orden ES el
     * documento: un histórico donde las respuestas salen al final,
     * lejos de su entrada, no se puede leer seis meses después.
     *
     * @param  \Illuminate\Database\Eloquent\Builder<ComentarioMarca>  $consulta
     * @return list<array<string,mixed>>
     */
    private function entradasDe($consulta): array
    {
        $comentarios = $consulta
            ->with(['marca:id,nombre_marca', 'mencionados:id,name', 'reacciones'])
            ->orderBy('marca_id')
            ->orderBy('created_at')
            ->get();

        $porPadre = $comentarios
            ->filter(fn (ComentarioMarca $entrada): bool => $entrada->esUnaRespuesta())
            ->groupBy('comentario_padre_id');

        $enOrden = [];

        foreach ($comentarios->reject(fn (ComentarioMarca $entrada): bool => $entrada->esUnaRespuesta()) as $raiz) {
            $enOrden[] = $this->comoFila($raiz, esRespuesta: false);

            foreach ($porPadre->get($raiz->id, collect()) as $respuesta) {
                $enOrden[] = $this->comoFila($respuesta, esRespuesta: true);
            }
        }

        return $enOrden;
    }

    /**
     * @return array<string,mixed>
     */
    private function comoFila(ComentarioMarca $entrada, bool $esRespuesta): array
    {
        return [
            'id' => $entrada->id,
            'marcaNombre' => $entrada->marca?->nombre_marca ?? 'Marca eliminada',
            'esRespuesta' => $esRespuesta,
            'autorNombre' => $entrada->autor_nombre ?? 'Usuario dado de baja',
            'fecha' => $entrada->created_at?->toIso8601String(),
            'cuerpo' => $entrada->cuerpo,
            'editado' => $entrada->editado_en !== null,
            'eliminado' => $entrada->estaEliminado(),
            'eliminadoPorNombre' => $entrada->eliminado_por_nombre,
            'mencionados' => $entrada->mencionados
                ->map(fn (User $persona): string => $persona->nombreParaMostrar())
                ->values()
                ->all(),
            // Un recuento, no la lista de quién puso qué: en un documento
            // que se archiva, saber que hubo tres reacciones basta.
            'totalReacciones' => $entrada->reacciones->count(),
        ];
    }
}
