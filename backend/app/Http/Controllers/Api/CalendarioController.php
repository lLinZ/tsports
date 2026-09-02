<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * CalendarioController — qué acciones de campaña tocan cada día.
 * ---------------------------------------------------------------------
 * Cada fila de `eventos_de_campana` es una acción sobre una marca en un
 * día: "el 10 de septiembre, visita presencial a Azúcar la Pastora".
 * Este controlador las agrupa por día dentro de un periodo y devuelve
 * además el resumen que alimenta el reporte.
 *
 * DOS VISTAS
 *   · semana → los siete días, de lunes a domingo.
 *   · mes    → las semanas completas que cubren el mes. Se devuelven
 *              enteras, con los días de los meses vecinos marcados como
 *              `esDeOtroMes`, porque una rejilla mensual que empiece un
 *              miércoles se descuadra si faltan los huecos del principio.
 *
 * SOBRE EL PERIODO
 * Lo calcula el servidor, no el navegador. Si cada cliente decidiera
 * dónde empieza la semana según su configuración regional, dos personas
 * del mismo equipo verían periodos distintos y sus reportes no
 * cuadrarían entre sí.
 */
class CalendarioController extends Controller
{
    /** Las dos formas de mirar el calendario. */
    private const VISTA_SEMANA = 'semana';
    private const VISTA_MES = 'mes';

    /**
     * GET /api/panel/calendario?vista=mes&desde=2026-09-10
     *
     * Devuelve el periodo que contiene ese día. Sin parámetros, la
     * semana actual.
     */
    public function calendario(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Marca::class);

        $vista = $this->leerLaVista($peticion);
        $diaPedido = $this->leerElDiaPedido($peticion);

        [$primerDia, $ultimoDia] = $vista === self::VISTA_MES
            ? $this->rejillaDelMes($diaPedido)
            : [$diaPedido->startOfWeek(), $diaPedido->endOfWeek()];

        $eventos = $this->buscarEventosEntre($primerDia, $ultimoDia);

        return response()->json([
            'periodo' => [
                'vista' => $vista,
                'desde' => $primerDia->toDateString(),
                'hasta' => $ultimoDia->toDateString(),
                // El día que se pidió: es lo que el navegador usa para
                // saltar al periodo anterior o siguiente sin recalcular
                // dónde empieza la semana.
                'dia' => $diaPedido->toDateString(),
                // Etiqueta ya redactada, para que la pantalla y el
                // reporte digan exactamente lo mismo.
                'etiqueta' => $vista === self::VISTA_MES
                    ? $this->redactarEtiquetaDelMes($diaPedido)
                    : $this->redactarEtiquetaDeLaSemana($primerDia, $ultimoDia),
                'esElPeriodoActual' => $vista === self::VISTA_MES
                    ? $diaPedido->isSameMonth(CarbonImmutable::now())
                    : $primerDia->isSameWeek(CarbonImmutable::now()),
            ],
            'dias' => $this->agruparPorDia($eventos, $primerDia, $ultimoDia, $diaPedido, $vista),
            'resumen' => $this->resumirParaElReporte($eventos),
        ]);
    }

    /* ------------------------------------------------------------------
     | Lectura de los parámetros
     |-----------------------------------------------------------------*/

    private function leerLaVista(Request $peticion): string
    {
        $vistaPedida = (string) $peticion->query('vista', self::VISTA_SEMANA);

        if (! in_array($vistaPedida, [self::VISTA_SEMANA, self::VISTA_MES], true)) {
            throw ValidationException::withMessages([
                'vista' => 'La vista debe ser "semana" o "mes".',
            ]);
        }

        return $vistaPedida;
    }

    /**
     * Lee y valida el día pedido.
     *
     * Un parámetro con basura devuelve un 422 explicando qué se esperaba,
     * en vez de caer silenciosamente en la fecha de hoy: si la interfaz
     * envía mal la fecha, es mejor enterarse que ver un calendario que no
     * corresponde a lo que se pidió.
     */
    private function leerElDiaPedido(Request $peticion): CarbonImmutable
    {
        // `desde` es el nombre nuevo; `semanaDe` se sigue aceptando para
        // no romper enlaces guardados de la versión anterior.
        $diaEnLaPeticion = $peticion->query('desde') ?? $peticion->query('semanaDe');

        if ($diaEnLaPeticion === null || $diaEnLaPeticion === '') {
            return CarbonImmutable::now()->startOfDay();
        }

        try {
            return CarbonImmutable::createFromFormat(
                'Y-m-d',
                (string) $diaEnLaPeticion,
            )->startOfDay();
        } catch (\Throwable) {
            throw ValidationException::withMessages([
                'desde' => 'La fecha debe tener el formato AAAA-MM-DD.',
            ]);
        }
    }

    /**
     * La rejilla de un mes: desde el lunes de la semana en que cae el
     * día 1 hasta el domingo de la semana en que cae el último día.
     *
     * Se devuelven semanas completas para que la cuadrícula salga
     * rectangular; los días sobrantes se marcan luego como de otro mes.
     *
     * @return array{0:CarbonImmutable,1:CarbonImmutable}
     */
    private function rejillaDelMes(CarbonImmutable $diaDelMes): array
    {
        return [
            $diaDelMes->startOfMonth()->startOfWeek(),
            $diaDelMes->endOfMonth()->endOfWeek(),
        ];
    }

    /* ------------------------------------------------------------------
     | Datos
     |-----------------------------------------------------------------*/

    /**
     * Los eventos del historial que caen dentro del rango.
     *
     * Se lee de `eventos_de_campana` y no de las columnas de `marcas`
     * porque una marca puede tener varias acciones en fechas distintas
     * —visitarla el 10 e invitarla a un evento el 20—, y desde la marca
     * solo se vería la última.
     *
     * @return \Illuminate\Support\Collection<int,EventoDeCampana>
     */
    private function buscarEventosEntre(
        CarbonImmutable $desde,
        CarbonImmutable $hasta,
    ) {
        return EventoDeCampana::query()
            ->with('marca:id,nombre_marca,logo_url,zona,sector,vendedor_asignado_nombre')
            ->entreFechas($desde->toDateString(), $hasta->toDateString())
            ->orderBy('fecha')
            ->get()
            // Por nombre de marca dentro de cada día, para que el orden
            // no baile entre recargas.
            ->sortBy(fn (EventoDeCampana $evento): string => $evento->marca?->nombre_marca ?? '')
            ->values();
    }

    /**
     * Reparte los eventos por día a lo largo de todo el periodo.
     *
     * Se devuelven TODOS los días, incluidos los vacíos: la cuadrícula
     * dibuja una celda por día y si el servidor omitiera los días sin
     * nada, se descuadraría.
     *
     * @return list<array<string,mixed>>
     */
    private function agruparPorDia(
        $eventos,
        CarbonImmutable $primerDia,
        CarbonImmutable $ultimoDia,
        CarbonImmutable $diaPedido,
        string $vista,
    ): array {
        $eventosPorFecha = $eventos->groupBy(
            fn (EventoDeCampana $evento): string => $evento->fecha->toDateString(),
        );

        $hoy = CarbonImmutable::now()->toDateString();
        $mesDelPeriodo = $diaPedido->month;

        $totalDeDias = $primerDia->diffInDays($ultimoDia) + 1;

        return collect(range(0, $totalDeDias - 1))
            ->map(function (int $desplazamiento) use (
                $primerDia,
                $eventosPorFecha,
                $hoy,
                $mesDelPeriodo,
                $vista,
            ): array {
                $dia = $primerDia->addDays($desplazamiento);
                $fecha = $dia->toDateString();

                return [
                    'fecha' => $fecha,
                    'diaDelMes' => $dia->day,
                    'esHoy' => $fecha === $hoy,
                    // En la vista mensual, los días de relleno del mes
                    // anterior y del siguiente se pintan apagados.
                    'esDeOtroMes' => $vista === self::VISTA_MES
                        && $dia->month !== $mesDelPeriodo,
                    'eventos' => $eventosPorFecha
                        ->get($fecha, collect())
                        ->map(fn (EventoDeCampana $evento): array => [
                            'eventoId' => $evento->id,
                            'marcaId' => $evento->marca_id,
                            'marcaNombre' => $evento->marca?->nombre_marca ?? 'Marca eliminada',
                            'logoUrl' => $evento->marca?->logo_url,
                            // El nombre y el color salen del propio
                            // evento, no de la campaña: así el historial
                            // aguanta que la campaña se renombre o se
                            // borre después.
                            'campanaNombre' => $evento->campana_nombre,
                            'campanaColor' => $evento->campana_color,
                            'zona' => $evento->marca?->zona,
                            'sector' => $evento->marca?->sector,
                            'vendedorNombre' => $evento->marca?->vendedor_asignado_nombre,
                        ])
                        ->values()
                        ->all(),
                ];
            })
            ->all();
    }

    /**
     * El resumen del reporte: totales por campaña, por zona y por
     * vendedor.
     *
     * Se calcula sobre los eventos ya traídos y no con tres consultas
     * más: son como mucho unas decenas de filas por periodo y recorrerlas
     * en memoria sale más barato que volver tres veces a la base.
     *
     * @return array<string,mixed>
     */
    private function resumirParaElReporte($eventos): array
    {
        $contarPor = function (callable $obtenerClave, string $textoSiFalta) use ($eventos): array {
            return $eventos
                ->groupBy(fn (EventoDeCampana $evento): string => $obtenerClave($evento) ?: $textoSiFalta)
                ->map->count()
                // De mayor a menor: lo que más se repite es lo que
                // interesa leer primero en el reporte.
                ->sortDesc()
                ->map(fn (int $total, string $etiqueta): array => [
                    'etiqueta' => $etiqueta,
                    'total' => $total,
                ])
                ->values()
                ->all();
        };

        return [
            'totalDeAcciones' => $eventos->count(),
            // Marcas DISTINTAS: en un mismo periodo se le pueden hacer
            // dos acciones a la misma marca, y contarla dos veces daría a
            // entender que se está llegando a más marcas de las reales.
            'marcasDistintas' => $eventos->pluck('marca_id')->unique()->count(),
            'porCampana' => $contarPor(
                fn (EventoDeCampana $evento): ?string => $evento->campana_nombre,
                'Sin campaña',
            ),
            'porZona' => $contarPor(
                fn (EventoDeCampana $evento): ?string => $evento->marca?->zona,
                'Sin zona',
            ),
            'porVendedor' => $contarPor(
                fn (EventoDeCampana $evento): ?string => $evento->marca?->vendedor_asignado_nombre,
                'Sin asignar',
            ),
        ];
    }

    /* ------------------------------------------------------------------
     | Etiquetas
     |-----------------------------------------------------------------*/

    /** "Septiembre de 2026". */
    private function redactarEtiquetaDelMes(CarbonImmutable $diaDelMes): string
    {
        $enEspanol = $diaDelMes->locale('es');

        return mb_convert_case($enEspanol->monthName, MB_CASE_TITLE, 'UTF-8')
            .' de '.$diaDelMes->year;
    }

    /**
     * "8 – 14 de septiembre de 2026", y si la semana cruza de mes,
     * "29 de septiembre – 5 de octubre de 2026".
     */
    private function redactarEtiquetaDeLaSemana(
        CarbonImmutable $lunes,
        CarbonImmutable $domingo,
    ): string {
        $lunesEnEspanol = $lunes->locale('es');
        $domingoEnEspanol = $domingo->locale('es');

        if ($lunes->month === $domingo->month) {
            return sprintf(
                '%d – %d de %s de %d',
                $lunes->day,
                $domingo->day,
                $domingoEnEspanol->monthName,
                $domingo->year,
            );
        }

        return sprintf(
            '%d de %s – %d de %s de %d',
            $lunes->day,
            $lunesEnEspanol->monthName,
            $domingo->day,
            $domingoEnEspanol->monthName,
            $domingo->year,
        );
    }
}
