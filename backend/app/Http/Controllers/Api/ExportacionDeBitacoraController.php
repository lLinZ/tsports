<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ArchivoMedia;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\RegistroActividad;
use App\Models\User;
use Carbon\CarbonImmutable;
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
 * El REPORTE POR FECHAS (`porFechas`) es la misma bitácora cortada por
 * un rango de días y agrupada por marca. Lo saca cualquiera, de las
 * marcas que ve: sin marcas elegidas son todas las suyas (la agencia
 * entera para admin y comercial, su cartera para un agente); con
 * marcas, cada una tiene que poder verla.
 *
 * Y TODAS QUEDAN ANOTADAS en el registro de actividad, antes de
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
     * La del equipo, para cuando el navegador no dice la suya. El servidor
     * trabaja en UTC (config/app.php), así que sin zona un «día» sería un
     * día de Londres.
     */
    private const ZONA_HORARIA_POR_DEFECTO = 'America/Caracas';

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
     * GET /api/bitacora/reporte?desde=2026-09-01&hasta=2026-09-25
     *
     * Lo que se escribió en la bitácora entre dos fechas, agrupado por
     * marca. Parámetros:
     *
     *   · `desde`, `hasta` → días, los dos incluidos.
     *   · `marcas[]`       → opcional; sin él, todas las que quien pide
     *                        puede ver.
     *   · `zona`           → la zona horaria del navegador. Un día es un
     *                        día DE QUIEN MIRA. El sistema va en hora de
     *                        Caracas; desde otra zona, el 25 de septiembre
     *                        empieza a otra hora de Caracas, y sin esto lo
     *                        comentado al final de su día saldría en otro.
     *
     * QUÉ MARCAS ENTRAN lo decide lo que cada quien ve (regla 6):
     *
     *   · Sin elegir marcas, TODAS LAS SUYAS: la agencia entera para admin
     *     y comercial, su cartera para un agente. Hasta el 2026-10-01 esto
     *     era solo del administrador y los demás tenían que elegir las
     *     marcas una a una; con quinientas marcas eran quinientos clics, y
     *     el comercial ya las ve todas en el tablero.
     *   · Eligiendo marcas, cada una tiene que poder verla quien pregunta.
     *     Una sola ajena y se rechaza entera con un 403: devolver las
     *     demás y callarse esa diría, por omisión, que existe.
     *
     * El histórico completo de una vez (`completa`) sigue siendo solo del
     * administrador.
     *
     * Y queda anotado en la auditoría, igual que las otras dos.
     */
    public function porFechas(Request $peticion): JsonResponse
    {
        /** @var User $quienConsulta */
        $quienConsulta = $peticion->user();

        $datos = $peticion->validate([
            'desde' => ['required', 'date_format:Y-m-d'],
            'hasta' => ['required', 'date_format:Y-m-d', 'after_or_equal:desde'],
            'marcas' => ['sometimes', 'array', 'max:200'],
            'marcas.*' => ['uuid'],
            'zona' => ['sometimes', 'nullable', 'timezone:all'],
        ], [
            'hasta.after_or_equal' => 'La fecha final no puede ser anterior a la inicial.',
        ], [
            'desde' => 'fecha inicial',
            'hasta' => 'fecha final',
            'marcas' => 'marcas',
            'zona' => 'zona horaria',
        ]);

        $idsDeMarcas = array_values(array_unique($datos['marcas'] ?? []));

        if ($idsDeMarcas === []) {
            $marcasElegidas = null;
        } else {
            $marcasElegidas = Marca::query()->whereIn('id', $idsDeMarcas)->get();

            // Una marca que no existe se trata como una ajena: el mensaje
            // no distingue entre «no existe» y «no es tuya».
            if ($marcasElegidas->count() !== count($idsDeMarcas)) {
                abort(403, 'Alguna de las marcas elegidas no la puedes consultar.');
            }

            foreach ($marcasElegidas as $marca) {
                $this->authorize('view', $marca);
            }
        }

        $zonaHoraria = $datos['zona'] ?? self::ZONA_HORARIA_POR_DEFECTO;

        $inicio = CarbonImmutable::createFromFormat('Y-m-d', $datos['desde'], $zonaHoraria)->startOfDay();
        $fin = CarbonImmutable::createFromFormat('Y-m-d', $datos['hasta'], $zonaHoraria)->endOfDay();

        $comentarios = ComentarioMarca::query()
            ->with([
                'marca:id,nombre_marca,logo_url,sector,zona,vendedor_asignado_nombre',
                'mencionados:id,name,email',
                'reacciones',
                'adjuntos',
                'padre:id,autor_nombre,cuerpo,created_at,eliminado_en',
            ])
            // A la hora del sistema, que es en la que se guardan las fechas:
            // la consulta compara el texto de la fecha, no el instante.
            ->whereBetween('created_at', [
                $inicio->setTimezone(config('app.timezone')),
                $fin->setTimezone(config('app.timezone')),
            ])
            ->when($marcasElegidas !== null, fn ($consulta) => $consulta->whereIn('marca_id', $idsDeMarcas))
            // Sin marcas elegidas, las que ve. Para quien las ve todas no
            // hace falta filtrar nada.
            ->when(
                $marcasElegidas === null && ! $quienConsulta->rol->veTodasLasMarcas(),
                fn ($consulta) => $consulta->whereIn('marca_id', Marca::query()->quePuedeVer($quienConsulta)->select('id')),
            )
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        $porMarca = $comentarios
            ->groupBy('marca_id')
            ->map(fn ($deUnaMarca) => $this->bloqueDeUnaMarca($deUnaMarca))
            // Primero donde más se habló, que es lo que se mira antes en
            // una reunión; a igualdad, por nombre.
            ->sortBy([
                fn (array $una, array $otra): int => $otra['totalEntradas'] <=> $una['totalEntradas'],
                fn (array $una, array $otra): int => strcasecmp($una['marcaNombre'], $otra['marcaNombre']),
            ])
            ->values()
            ->all();

        $porAutor = $comentarios
            ->groupBy(fn (ComentarioMarca $entrada): string => $entrada->autor_nombre ?? 'Usuario dado de baja')
            ->map(fn ($suyas, string $nombre): array => ['nombre' => $nombre, 'total' => $suyas->count()])
            ->sortByDesc('total')
            ->values()
            ->all();

        RegistroActividad::anotar(
            $quienConsulta,
            RegistroActividad::ACCION_EXPORTO,
            'bitacora',
            null,
            sprintf(
                'Sacó el reporte de bitácora del %s al %s (%s)',
                $inicio->format('d/m/Y'),
                $fin->format('d/m/Y'),
                $marcasElegidas === null
                    ? ($quienConsulta->rol->veTodasLasMarcas() ? 'todas las marcas' : 'todas sus marcas')
                    : ($marcasElegidas->count() === 1
                        ? $marcasElegidas->first()->nombre_marca
                        : $marcasElegidas->count().' marcas'),
            ),
            ['entradas' => $comentarios->count(), 'marcas' => count($porMarca)],
        );

        return response()->json([
            'desde' => $datos['desde'],
            'hasta' => $datos['hasta'],
            'zonaHoraria' => $zonaHoraria,
            'alcance' => $marcasElegidas === null ? 'todas' : 'seleccion',
            'marcasElegidas' => $marcasElegidas === null
                ? []
                : $marcasElegidas->map(fn (Marca $marca): array => [
                    'id' => $marca->id,
                    'nombre' => $marca->nombre_marca,
                ])->values()->all(),
            'generadoEn' => now()->toIso8601String(),
            'generadoPor' => $quienConsulta->nombreParaMostrar(),
            'resumen' => [
                'totalEntradas' => $comentarios->count(),
                'totalMarcas' => count($porMarca),
                'totalAutores' => count($porAutor),
                'porAutor' => $porAutor,
            ],
            'marcas' => $porMarca,
        ]);
    }

    /**
     * Las entradas de una marca en el periodo, con cada respuesta justo
     * debajo de su entrada.
     *
     * Una respuesta cuya entrada queda FUERA del periodo sale en su sitio
     * cronológico y con una línea de contexto («en respuesta a Ana, del 3
     * de septiembre: …»). Dejarla fuera ocultaría trabajo de esas fechas;
     * sacarla sin contexto dejaría un «sí, mándaselo» que no se entiende.
     *
     * @param  \Illuminate\Support\Collection<int,ComentarioMarca>  $entradas
     * @return array<string,mixed>
     */
    private function bloqueDeUnaMarca($entradas): array
    {
        $primera = $entradas->first();
        $marca = $primera->marca;

        $idsEnElPeriodo = $entradas->pluck('id')->all();

        $respuestasPorPadre = $entradas
            ->filter(fn (ComentarioMarca $entrada): bool => $entrada->esUnaRespuesta()
                && in_array($entrada->comentario_padre_id, $idsEnElPeriodo, true))
            ->groupBy('comentario_padre_id');

        $filas = [];

        foreach ($entradas as $entrada) {
            // Las que cuelgan de una entrada del periodo ya salieron debajo
            // de ella.
            if ($entrada->esUnaRespuesta() && in_array($entrada->comentario_padre_id, $idsEnElPeriodo, true)) {
                continue;
            }

            $filas[] = $this->comoFila($entrada, esRespuesta: $entrada->esUnaRespuesta()) + [
                'respondeA' => $entrada->esUnaRespuesta() ? $this->contextoDeLaEntradaPadre($entrada) : null,
            ];

            foreach ($respuestasPorPadre->get($entrada->id, collect()) as $respuesta) {
                $filas[] = $this->comoFila($respuesta, esRespuesta: true) + ['respondeA' => null];
            }
        }

        return [
            'marcaId' => $primera->marca_id,
            'marcaNombre' => $marca?->nombre_marca ?? 'Marca eliminada',
            'logoUrl' => $marca?->logo_url,
            'sector' => $marca?->sector,
            'zona' => $marca?->zona,
            'agenteNombre' => $marca?->vendedor_asignado_nombre,
            'totalEntradas' => $entradas->count(),
            'entradas' => $filas,
        ];
    }

    /**
     * @return array<string,string|null>|null
     */
    private function contextoDeLaEntradaPadre(ComentarioMarca $respuesta): ?array
    {
        $padre = $respuesta->padre;

        if ($padre === null) {
            return null;
        }

        $texto = trim(preg_replace('/\s+/u', ' ', (string) $padre->cuerpo) ?? '');

        return [
            'autorNombre' => $padre->autor_nombre ?? 'Usuario dado de baja',
            'fecha' => $padre->created_at?->toIso8601String(),
            // Una entrada borrada tampoco enseña su texto aquí.
            'extracto' => $padre->estaEliminado()
                ? null
                : (mb_strlen($texto) > 140 ? mb_substr($texto, 0, 139).'…' : $texto),
        ];
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
            ->with(['marca:id,nombre_marca', 'mencionados:id,name', 'reacciones', 'adjuntos'])
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
            // «Llamada», «WhatsApp»… en las que dejó «Contacté».
            'tipoDeContacto' => $entrada->tipo_de_contacto?->etiqueta(),
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
            // Qué se envió con cada entrada. El enlace es firmado y
            // caduca: sirve para abrirlo desde el reporte en pantalla,
            // y el documento impreso lista solo los nombres.
            'adjuntos' => $entrada->adjuntos
                ->map(fn (ArchivoMedia $adjunto): array => [
                    'nombre' => $adjunto->nombre_original,
                    'tipo' => $adjunto->tipo(),
                    'tamanoBytes' => $adjunto->tamano_bytes,
                    'url' => $adjunto->enlaceFirmado(),
                ])
                ->values()
                ->all(),
        ];
    }
}
