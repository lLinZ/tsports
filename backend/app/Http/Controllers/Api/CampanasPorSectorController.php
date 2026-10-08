<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EventoDeCampana;
use App\Models\Sector;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * CampanasPorSectorController — qué campañas se hicieron en cada rubro,
 * semana a semana.
 * ---------------------------------------------------------------------
 * Pedido por LinZ el 2026-10-08: en la pantalla de Sectores, un gráfico
 * de tarta por sector y por semana del mes, con el reparto de las
 * acciones de campaña. Contesta «en qué rubros se está moviendo cada
 * campaña, y cuándo».
 *
 *   · LO QUE SE CUENTA son acciones de campaña: filas de
 *     `eventos_de_campana`, las mismas que pinta el calendario (regla 13).
 *     Una marca con dos visitas en la misma semana suma dos.
 *   · EL NOMBRE Y EL COLOR salen del evento, no de la campaña, igual que
 *     en el calendario: lo que se hizo en septiembre se sigue viendo como
 *     se hizo aunque la campaña se renombre o se borre después.
 *   · EL SECTOR es el que la marca tiene HOY (`marcas.sector`). El evento
 *     no lo copia, y renombrar un sector arrastra a sus marcas (regla 15),
 *     así que la fila de cada rubro reúne todo lo suyo.
 *   · LAS SEMANAS son las del calendario, de lunes a domingo, recortadas
 *     al mes: «Semana 1» empieza el día 1 aunque caiga en jueves. Así una
 *     semana de esta pantalla es la misma fila que se ve en el calendario.
 *     Las calcula el servidor con el día de Caracas (reglas 16 y 30).
 *   · CADA QUIEN VE LO DE LAS MARCAS QUE VE (regla 6): la agencia entera
 *     admin y comercial, su cartera el agente. No lleva importes.
 */
class CampanasPorSectorController extends Controller
{
    /** El mismo gris del calendario para una acción sin color. */
    private const COLOR_SIN_CAMPANA = '#94a3b8';

    /**
     * GET /api/sectores/campanas?mes=2026-09
     *
     * Sin `mes`, el mes en curso.
     */
    public function index(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Sector::class);

        $primerDia = $this->leerElMes($peticion);
        $ultimoDia = $primerDia->endOfMonth()->startOfDay();

        /** @var User $usuario */
        $usuario = $peticion->user();

        $eventos = EventoDeCampana::query()
            ->with('marca:id,sector')
            ->entreFechas($primerDia->toDateString(), $ultimoDia->toDateString())
            // El corte por rol va en la consulta: si viajaran todas y la
            // pantalla escondiera las ajenas, la actividad de la agencia
            // entera seguiría en la respuesta.
            ->whereHas('marca', fn ($marcas) => $marcas->quePuedeVer($usuario))
            ->get()
            // Colección normal: la de Eloquent cambia `except` y compañía
            // para que trabajen con ids de modelo, no con claves.
            ->toBase();

        $semanas = $this->semanasDelMes($primerDia, $ultimoDia);
        $leyenda = $this->leyendaDeCampanas($eventos);
        $ordenDeLaLeyenda = array_flip(array_column($leyenda, 'etiqueta'));

        // Lo que no está en el catálogo (sin sector, o con un nombre que ya
        // no está) va junto, como en la fila «Sin sector» del dinero.
        $nombresDelCatalogo = Sector::query()->pluck('nombre')->all();

        $porSector = $eventos->groupBy(function (EventoDeCampana $evento) use ($nombresDelCatalogo): string {
            $sector = (string) ($evento->marca?->sector ?? '');

            return in_array($sector, $nombresDelCatalogo, true) ? $sector : '';
        });

        $repartir = fn (Collection $eventosDelSector): array => $this->repartirPorSemana(
            $eventosDelSector,
            $semanas,
            $ordenDeLaLeyenda,
        );

        $hoy = CarbonImmutable::now()->toDateString();

        return response()->json([
            'periodo' => [
                'mes' => $primerDia->format('Y-m'),
                'etiqueta' => $this->redactarEtiquetaDelMes($primerDia),
                // Los vecinos los pone el servidor, para que el navegador
                // no tenga que hacer cuentas de calendario.
                'anterior' => $primerDia->subMonth()->format('Y-m'),
                'siguiente' => $primerDia->addMonth()->format('Y-m'),
                'esElMesActual' => $primerDia->isSameMonth(CarbonImmutable::now()),
            ],
            'semanas' => array_map(fn (array $semana): array => [
                'numero' => $semana['numero'],
                'desde' => $semana['desde']->toDateString(),
                'hasta' => $semana['hasta']->toDateString(),
                'esLaActual' => $hoy >= $semana['desde']->toDateString()
                    && $hoy <= $semana['hasta']->toDateString(),
            ], $semanas),
            'campanas' => $leyenda,
            'totalDeAcciones' => $eventos->count(),
            'sectores' => $porSector
                ->except([''])
                ->map(fn (Collection $deEseSector, string $nombre): array => [
                    'sector' => $nombre,
                    'semanas' => $repartir($deEseSector),
                ])
                ->values()
                ->all(),
            'sinSector' => $porSector->has('') ? $repartir($porSector->get('')) : null,
        ]);
    }

    /* ------------------------------------------------------------------
     | Lectura del parámetro
     |-----------------------------------------------------------------*/

    /**
     * El día 1 del mes pedido. Un valor con basura es un 422, no el mes en
     * curso: si la interfaz manda mal el mes, mejor enterarse que enseñar
     * otro sin decirlo.
     */
    private function leerElMes(Request $peticion): CarbonImmutable
    {
        $mesPedido = (string) $peticion->query('mes', '');

        if ($mesPedido === '') {
            return CarbonImmutable::now()->startOfMonth();
        }

        if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mesPedido) !== 1) {
            throw ValidationException::withMessages([
                'mes' => 'El mes debe tener el formato AAAA-MM.',
            ]);
        }

        return CarbonImmutable::createFromFormat('Y-m-d', $mesPedido.'-01')->startOfDay();
    }

    /* ------------------------------------------------------------------
     | Reparto
     |-----------------------------------------------------------------*/

    /**
     * Las semanas del mes, de lunes a domingo, recortadas al mes.
     *
     * @return list<array{numero:int,desde:CarbonImmutable,hasta:CarbonImmutable}>
     */
    private function semanasDelMes(CarbonImmutable $primerDia, CarbonImmutable $ultimoDia): array
    {
        $semanas = [];
        $desde = $primerDia;

        while ($desde->lessThanOrEqualTo($ultimoDia)) {
            $domingo = $desde->endOfWeek()->startOfDay();
            $hasta = $domingo->lessThan($ultimoDia) ? $domingo : $ultimoDia;

            $semanas[] = ['numero' => count($semanas) + 1, 'desde' => $desde, 'hasta' => $hasta];
            $desde = $hasta->addDay();
        }

        return $semanas;
    }

    /**
     * Las campañas del mes con su color y su total, de más a menos. Es la
     * leyenda de la pantalla y también el orden de las porciones de cada
     * tarta: con el mismo orden en todas, el mismo color cae siempre en el
     * mismo sitio y se comparan de un vistazo.
     *
     * @return list<array{etiqueta:string,color:string,total:int}>
     */
    private function leyendaDeCampanas(Collection $eventos): array
    {
        return $eventos
            ->groupBy(fn (EventoDeCampana $evento): string => $evento->campana_nombre ?: 'Sin campaña')
            ->map(fn (Collection $deEsaCampana, string $etiqueta): array => [
                'etiqueta' => $etiqueta,
                'color' => $deEsaCampana->first()->campana_color ?: self::COLOR_SIN_CAMPANA,
                'total' => $deEsaCampana->count(),
            ])
            // A igual total, por nombre: que el orden no baile al recargar.
            ->sortBy([['total', 'desc'], ['etiqueta', 'asc']])
            ->values()
            ->all();
    }

    /**
     * Las acciones de un sector repartidas por semana. Se devuelven TODAS
     * las semanas, también las vacías, para que cada tarta caiga bajo su
     * columna.
     *
     * @param  list<array{numero:int,desde:CarbonImmutable,hasta:CarbonImmutable}>  $semanas
     * @param  array<string,int>  $ordenDeLaLeyenda
     * @return list<array{total:int,porCampana:list<array{etiqueta:string,color:string,total:int}>}>
     */
    private function repartirPorSemana(Collection $eventos, array $semanas, array $ordenDeLaLeyenda): array
    {
        return array_map(function (array $semana) use ($eventos, $ordenDeLaLeyenda): array {
            $desde = $semana['desde']->toDateString();
            $hasta = $semana['hasta']->toDateString();

            $deLaSemana = $eventos->filter(function (EventoDeCampana $evento) use ($desde, $hasta): bool {
                $fecha = $evento->fecha->toDateString();

                return $fecha >= $desde && $fecha <= $hasta;
            });

            return [
                'total' => $deLaSemana->count(),
                'porCampana' => collect($this->leyendaDeCampanas($deLaSemana))
                    ->sortBy(fn (array $campana): int => $ordenDeLaLeyenda[$campana['etiqueta']])
                    ->values()
                    ->all(),
            ];
        }, $semanas);
    }

    /** "Septiembre de 2026", como el calendario. */
    private function redactarEtiquetaDelMes(CarbonImmutable $diaDelMes): string
    {
        return mb_convert_case($diaDelMes->locale('es')->monthName, MB_CASE_TITLE, 'UTF-8')
            .' de '.$diaDelMes->year;
    }
}
