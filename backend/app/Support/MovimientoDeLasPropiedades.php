<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\EstadoDeMarca;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\Recordatorio;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * MovimientoDeLasPropiedades — dónde está caliente cada propiedad.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05 (propuesta «Propiedades en caliente», aprobada por
 * LinZ, pensada para Edgar, el comercial). Arma las tres lecturas de
 * Propiedades › Movimiento:
 *
 *   · `ranking()` → una fila por propiedad: cuántas de sus marcas están
 *     calientes, tibias y frías, cuánto del pronóstico está en las
 *     calientes, cuántas se le añadieron este mes y su último movimiento.
 *   · `ficha()`   → las marcas de UNA propiedad, por estado, con el OVP
 *     de esa propiedad, la fase, quién la lleva y el siguiente paso.
 *   · `cruce()`   → marcas en filas y propiedades en columnas.
 *
 * NO HAY UN ESTADO DE LA PROPIEDAD. Cada propiedad toma el de las marcas
 * que la llevan en su checklist y se cuenta cuántas hay de cada uno; no
 * se promedia. Dos calientes y dos frías no son «tibia»: son dos para
 * cerrar y dos para retomar, y el promedio lo escondería.
 *
 * EL ESTADO ES EL DE LA MARCA y sale de EstadoDeLasMarcas, en la misma
 * consulta (`conEstado`), con lo fijado a mano contando (regla 26). Una
 * marca caliente lo es en todas sus propiedades, aunque la llamaran por
 * una sola: es el límite que explica la propuesta.
 *
 * «Sin siguiente paso» sale de SiguientePasoDeLasMarcas, también en SQL
 * (regla 29). De aquí solo sale CUÁL es el siguiente paso de quien sí
 * tiene uno, para enseñarlo.
 *
 * Cada quien cuenta las marcas que puede ver (`quePuedeVer`). Hoy solo
 * entran admin y comercial, que las ven todas, así que el total coincide
 * con «Pronosticado por el equipo» de Propiedades, que suma TODAS las
 * líneas, también las de propiedades desactivadas (regla 8).
 */
final class MovimientoDeLasPropiedades
{
    /** Los órdenes del ranking. El primero es el de partida. */
    public const ORDENES_DEL_RANKING = ['calientes', 'marcas', 'pronostico', 'avance'];

    /** Los órdenes del cruce. */
    public const ORDENES_DEL_CRUCE = ['pronostico', 'nombre'];

    /** El valor del filtro por agente para las marcas sin agente. */
    public const SIN_AGENTE = 'sin';

    /** @var Collection<int, Marca>|null */
    private ?Collection $marcas = null;

    private function __construct(
        private readonly User $quienMira,
        private readonly EstadoDeLasMarcas $estados,
    ) {}

    public static function para(User $quienMira): self
    {
        return new self($quienMira, EstadoDeLasMarcas::conLosUmbralesVigentes());
    }

    /* ------------------------------------------------------------------
     | Ranking
     |-----------------------------------------------------------------*/

    /**
     * @return array<string, mixed>
     */
    public function ranking(string $orden): array
    {
        $orden = in_array($orden, self::ORDENES_DEL_RANKING, true) ? $orden : self::ORDENES_DEL_RANKING[0];
        $lineasPorPropiedad = $this->lineas()->groupBy('propiedad_id');
        $inicioDelMes = $this->estados->hoy()->startOfMonth();

        $propiedades = Propiedad::query()->enOrdenDeCatalogo()->get();
        $filas = [];
        $sinMarcas = [];

        foreach ($propiedades as $propiedad) {
            /** @var Collection<int, PropiedadDeMarca> $suyas */
            $suyas = $lineasPorPropiedad->get($propiedad->id, collect());

            if ($suyas->isEmpty()) {
                // Una desactivada sin marcas no se vende ni se trabaja:
                // no tiene nada que contar aquí.
                if ($propiedad->activa) {
                    $sinMarcas[] = [
                        'propiedadId' => $propiedad->id,
                        'nombre' => $propiedad->nombre,
                        'tieneMtp' => (float) $propiedad->monto_total_usd > 0,
                    ];
                }

                continue;
            }

            $filas[] = $this->filaDelRanking($propiedad, $suyas, $inicioDelMes);
        }

        $todas = $this->lineas();
        $ovpTotal = $this->sumaDelOvp($todas);
        $ovpEnCalientes = $this->sumaDelOvp($todas->filter(
            fn (PropiedadDeMarca $linea): bool => $this->estadoDe($linea->marca) === EstadoDeMarca::Caliente,
        ));
        $enVenta = $propiedades->where('activa', true);

        return [
            'totales' => [
                // Como en Propiedades: el MTP y la meta, de lo que está en
                // venta; el pronóstico, de todas las líneas.
                'montoTotalUsd' => round((float) $enVenta->sum('monto_total_usd'), 2),
                'forecastDeVentaUsd' => round((float) $enVenta->sum(fn (Propiedad $propiedad): float => $propiedad->forecastDeVenta()), 2),
                'ovpUsd' => $ovpTotal,
                'ovpEnCalientesUsd' => $ovpEnCalientes,
                'porcentajeEnCalientes' => $ovpTotal > 0 ? round($ovpEnCalientes * 100 / $ovpTotal, 1) : null,
            ],
            'propiedades' => $this->ordenarRanking($filas, $orden),
            'sinMarcas' => $sinMarcas,
            'orden' => $orden,
            'umbrales' => $this->estados->umbrales(),
        ];
    }

    /**
     * @param  Collection<int, PropiedadDeMarca>  $suyas
     * @return array<string, mixed>
     */
    private function filaDelRanking(Propiedad $propiedad, Collection $suyas, \DateTimeInterface $inicioDelMes): array
    {
        $porEstado = $this->repartoPorEstado($suyas);
        $ovp = $this->sumaDelOvp($suyas);
        $montoTotal = (float) $propiedad->monto_total_usd;

        // El último movimiento entre todas las marcas que la llevan: la
        // fila dice cuándo se tocó por última vez y cuál fue.
        $ultima = $suyas
            ->map(fn (PropiedadDeMarca $linea): array => ['marca' => $linea->marca, ...$linea->marca->ultimoMovimiento()])
            ->sortByDesc(fn (array $movimiento): int => $movimiento['el']->getTimestamp())
            ->first();

        return [
            'propiedadId' => $propiedad->id,
            'nombre' => $propiedad->nombre,
            'logoUrl' => $propiedad->logo_url,
            'activa' => (bool) $propiedad->activa,
            'montoTotalUsd' => $montoTotal,
            'porcentajeForecast' => (float) $propiedad->porcentaje_forecast,
            'forecastDeVentaUsd' => $propiedad->forecastDeVenta(),
            'ovpUsd' => $ovp,
            // Sin MTP no hay proporción: null, y la interfaz dice «sin MTP».
            'porcentajeSobreElTotal' => $montoTotal > 0 ? round($ovp * 100 / $montoTotal, 2) : null,
            'marcas' => $suyas->count(),
            'porEstado' => $porEstado,
            'ovpEnCalientesUsd' => $porEstado['caliente']['ovpUsd'],
            'nuevasEsteMes' => $suyas->filter(
                fn (PropiedadDeMarca $linea): bool => $linea->created_at !== null && $linea->created_at->greaterThanOrEqualTo($inicioDelMes),
            )->count(),
            'ultimoMovimiento' => $ultima === null ? null : [
                'haceDias' => EstadoDeLasMarcas::diasDesde($ultima['el']),
                'etiqueta' => $ultima['motivo']->etiqueta(),
                'marcaId' => $ultima['marca']->id,
                'marcaNombre' => $ultima['marca']->nombre_marca,
                'estado' => $this->estadoDe($ultima['marca'])->value,
            ],
        ];
    }

    /**
     * Cada orden lleva sus desempates, para que dos propiedades iguales
     * salgan siempre en el mismo sitio (la misma trampa de la regla 14).
     *
     * @param  list<array<string, mixed>>  $filas
     * @return list<array<string, mixed>>
     */
    private function ordenarRanking(array $filas, string $orden): array
    {
        $criterios = match ($orden) {
            'marcas' => [['marcas', -1], ['porEstado.caliente.marcas', -1], ['ovpUsd', -1]],
            'pronostico' => [['ovpUsd', -1], ['porEstado.caliente.marcas', -1]],
            'avance' => [['porcentajeSobreElTotal', -1], ['ovpUsd', -1]],
            default => [
                ['porEstado.caliente.marcas', -1],
                ['ovpEnCalientesUsd', -1],
                ['porEstado.tibia.marcas', -1],
                ['ovpUsd', -1],
            ],
        };

        usort($filas, function (array $una, array $otra) use ($criterios): int {
            foreach ($criterios as [$campo, $sentido]) {
                // Lo que no tiene valor (sin MTP) va al final.
                $deUna = data_get($una, $campo) ?? -INF;
                $deOtra = data_get($otra, $campo) ?? -INF;

                if ($deUna != $deOtra) {
                    return ($deUna <=> $deOtra) * $sentido;
                }
            }

            return strcasecmp((string) $una['nombre'], (string) $otra['nombre']);
        });

        return $filas;
    }

    /* ------------------------------------------------------------------
     | Ficha de una propiedad
     |-----------------------------------------------------------------*/

    /**
     * @return array<string, mixed>
     */
    public function ficha(Propiedad $propiedad): array
    {
        /** @var Collection<int, PropiedadDeMarca> $suyas */
        $suyas = $this->lineas()->where('propiedad_id', $propiedad->id)->values();
        $idsDeLasMarcas = $suyas->pluck('marca_id')->all();
        $siguientes = $this->siguientesPasos($idsDeLasMarcas);
        $ovp = $this->sumaDelOvp($suyas);
        $montoTotal = (float) $propiedad->monto_total_usd;

        $marcas = $suyas
            ->map(function (PropiedadDeMarca $linea) use ($siguientes): array {
                $marca = $linea->marca;
                $ultimo = $marca->ultimoMovimiento();

                return [
                    'marcaId' => $marca->id,
                    'nombre' => $marca->nombre_marca,
                    'logoUrl' => $marca->logo_url,
                    'estado' => $this->estadoDe($marca)->value,
                    'ovpUsd' => (float) $linea->ovp_usd,
                    'nota' => $linea->nota,
                    'ultimoMovimiento' => [
                        'haceDias' => EstadoDeLasMarcas::diasDesde($ultimo['el']),
                        'etiqueta' => $ultimo['motivo']->etiqueta(),
                    ],
                    'fase' => $this->faseDe($marca),
                    'agente' => $marca->vendedor_asignado_id === null ? null : [
                        'id' => $marca->vendedor_asignado_id,
                        'nombre' => $marca->vendedor_asignado_nombre,
                    ],
                    // El chip «Sin siguiente paso» lo decide el SQL de
                    // SiguientePasoDeLasMarcas; aquí solo se dice cuál es.
                    'siguientePaso' => (bool) $marca->getAttribute('sin_siguiente_paso')
                        ? null
                        : ($siguientes[$marca->id] ?? null),
                ];
            })
            ->sort(function (array $una, array $otra): int {
                return [$otra['ovpUsd'], $una['nombre']] <=> [$una['ovpUsd'], $otra['nombre']];
            })
            ->values();

        return [
            'propiedad' => [
                'id' => $propiedad->id,
                'nombre' => $propiedad->nombre,
                'logoUrl' => $propiedad->logo_url,
                'activa' => (bool) $propiedad->activa,
                'publicadaEnLaWeb' => (bool) $propiedad->publicada_en_la_web,
                'asignadaATodos' => (bool) $propiedad->asignada_a_todos,
                'montoTotalUsd' => $montoTotal,
                'porcentajeForecast' => (float) $propiedad->porcentaje_forecast,
                'forecastDeVentaUsd' => $propiedad->forecastDeVenta(),
                'ovpUsd' => $ovp,
                'porcentajeSobreElTotal' => $montoTotal > 0 ? round($ovp * 100 / $montoTotal, 2) : null,
            ],
            'porEstado' => $this->repartoPorEstado($suyas),
            'marcas' => $marcas,
            'umbrales' => $this->estados->umbrales(),
        ];
    }

    /**
     * El próximo paso de cada marca: su recordatorio pendiente más
     * cercano (de quien sea, vencido o no) o su próxima acción de
     * campaña, lo que llegue antes. Es lo mismo que cuenta
     * SiguientePasoDeLasMarcas, ahora para decir CUÁL.
     *
     * @param  list<string>  $idsDeLasMarcas
     * @return array<string, array<string, mixed>>
     */
    private function siguientesPasos(array $idsDeLasMarcas): array
    {
        if ($idsDeLasMarcas === []) {
            return [];
        }

        $hoy = $this->estados->hoy()->format('Y-m-d');

        $recordatorios = Recordatorio::query()
            ->whereIn('marca_id', $idsDeLasMarcas)
            ->pendientes()
            ->orderBy('fecha')
            ->orderBy('hora')
            ->orderBy('created_at')
            ->get()
            ->groupBy('marca_id')
            ->map(fn (Collection $suyos): Recordatorio => $suyos->first());

        $acciones = EventoDeCampana::query()
            ->whereIn('marca_id', $idsDeLasMarcas)
            ->where('fecha', '>=', $hoy)
            ->orderBy('fecha')
            ->get()
            ->groupBy('marca_id')
            ->map(fn (Collection $suyas): EventoDeCampana => $suyas->first());

        $pasos = [];

        foreach ($idsDeLasMarcas as $idDeLaMarca) {
            $recordatorio = $recordatorios->get($idDeLaMarca);
            $accion = $acciones->get($idDeLaMarca);

            $diaDelRecordatorio = $recordatorio?->fecha->format('Y-m-d');
            $diaDeLaAccion = $accion?->fecha->format('Y-m-d');

            // Con los dos, el que llega antes; el mismo día, el recordatorio,
            // que dice qué toca hacer.
            if ($recordatorio !== null && ($accion === null || $diaDelRecordatorio <= $diaDeLaAccion)) {
                $pasos[$idDeLaMarca] = [
                    'clase' => 'recordatorio',
                    'fecha' => $diaDelRecordatorio,
                    'diasHasta' => $recordatorio->diasHasta(),
                    'hora' => $recordatorio->hora,
                    'etiqueta' => $recordatorio->tipo?->etiqueta() ?? $recordatorio->nota ?? 'Recordatorio',
                ];
            } elseif ($accion !== null) {
                $pasos[$idDeLaMarca] = [
                    'clase' => 'accion',
                    'fecha' => $diaDeLaAccion,
                    'diasHasta' => EstadoDeLasMarcas::diasHastaElDia($diaDeLaAccion),
                    'hora' => null,
                    'etiqueta' => $accion->campana_nombre ?? 'Acción de campaña',
                ];
            }
        }

        return $pasos;
    }

    /**
     * La fase que se enseña en la ficha de la propiedad: la más avanzada
     * de las que tiene marcadas. Las tres son independientes (regla 1);
     * esto es solo una etiqueta para leer de un vistazo.
     *
     * @return array{valor: string, etiqueta: string}
     */
    private function faseDe(Marca $marca): array
    {
        return match (true) {
            (bool) $marca->fase_propuesta_completada => ['valor' => 'propuesta', 'etiqueta' => 'Propuesta enviada'],
            (bool) $marca->fase_aproximacion_completada => ['valor' => 'aproximacion', 'etiqueta' => 'Aproximación'],
            default => ['valor' => 'prospeccion', 'etiqueta' => 'Prospección'],
        };
    }

    /* ------------------------------------------------------------------
     | Cruce de marcas y propiedades
     |-----------------------------------------------------------------*/

    /**
     * @return array<string, mixed>
     */
    public function cruce(?string $estado, ?string $agente, string $orden): array
    {
        $orden = in_array($orden, self::ORDENES_DEL_CRUCE, true) ? $orden : self::ORDENES_DEL_CRUCE[0];
        $estadoPedido = EstadoDeMarca::tryFrom((string) $estado);
        $todas = $this->marcas();

        // Las columnas no cambian con los filtros: una propiedad que se
        // queda sin marcas al filtrar sale con su casilla vacía, en vez de
        // desaparecer y mover las demás de sitio.
        $idsConLineas = $this->lineas()->pluck('propiedad_id')->unique()->all();
        $columnas = Propiedad::query()
            ->enOrdenDeCatalogo()
            ->whereIn('id', $idsConLineas)
            ->get(['id', 'nombre', 'logo_url', 'activa']);

        $agentes = $todas
            ->filter(fn (Marca $marca): bool => $marca->vendedor_asignado_id !== null)
            ->map(fn (Marca $marca): array => ['id' => $marca->vendedor_asignado_id, 'nombre' => $marca->vendedor_asignado_nombre])
            ->unique('id')
            ->sortBy(fn (array $persona): string => mb_strtolower((string) $persona['nombre']))
            ->values();

        $deEsePerfil = $todas->filter(fn (Marca $marca): bool => match (true) {
            $agente === null || $agente === '' => true,
            $agente === self::SIN_AGENTE => $marca->vendedor_asignado_id === null,
            default => $marca->vendedor_asignado_id === $agente,
        });

        // Los contadores llevan todos los filtros menos el de estado:
        // «Calientes · 6» es lo que sale al pulsarlo (como el tablero).
        $contadores = ['todas' => $deEsePerfil->count()];
        foreach (EstadoDeMarca::cases() as $caso) {
            $contadores[$caso->value] = $deEsePerfil
                ->filter(fn (Marca $marca): bool => $this->estadoDe($marca) === $caso)
                ->count();
        }

        $filas = $deEsePerfil
            ->filter(fn (Marca $marca): bool => $estadoPedido === null || $this->estadoDe($marca) === $estadoPedido)
            ->map(fn (Marca $marca): array => [
                'marcaId' => $marca->id,
                'nombre' => $marca->nombre_marca,
                'logoUrl' => $marca->logo_url,
                'estado' => $this->estadoDe($marca)->value,
                'agente' => $marca->vendedor_asignado_id === null ? null : [
                    'id' => $marca->vendedor_asignado_id,
                    'nombre' => $marca->vendedor_asignado_nombre,
                ],
                // Una casilla por propiedad que la marca lleva en su
                // checklist, con su OVP (0 si aún no tiene cifra).
                'celdas' => $marca->propiedadesOfrecidas
                    ->mapWithKeys(fn (PropiedadDeMarca $linea): array => [$linea->propiedad_id => (float) $linea->ovp_usd])
                    ->all(),
                'ovpUsd' => $this->sumaDelOvp($marca->propiedadesOfrecidas),
            ])
            ->sort(fn (array $una, array $otra): int => $orden === 'nombre'
                ? strcasecmp($una['nombre'], $otra['nombre'])
                : ([$otra['ovpUsd'], $una['nombre']] <=> [$una['ovpUsd'], $otra['nombre']]))
            ->values();

        $totalesPorColumna = $columnas->map(function (Propiedad $propiedad) use ($filas): array {
            $conEsaPropiedad = $filas->filter(fn (array $fila): bool => array_key_exists($propiedad->id, $fila['celdas']));

            return [
                'propiedadId' => $propiedad->id,
                'ovpUsd' => round((float) $conEsaPropiedad->sum(fn (array $fila): float => $fila['celdas'][$propiedad->id]), 2),
                'marcas' => $conEsaPropiedad->count(),
                'calientes' => $conEsaPropiedad->where('estado', EstadoDeMarca::Caliente->value)->count(),
            ];
        })->values();

        return [
            'columnas' => $columnas->map(fn (Propiedad $propiedad): array => [
                'propiedadId' => $propiedad->id,
                'nombre' => $propiedad->nombre,
                'logoUrl' => $propiedad->logo_url,
                'activa' => (bool) $propiedad->activa,
            ])->values(),
            'filas' => $filas,
            'totalesPorColumna' => $totalesPorColumna,
            'ovpUsd' => round((float) $filas->sum('ovpUsd'), 2),
            'contadores' => $contadores,
            'agentes' => $agentes,
            'filtros' => ['estado' => $estadoPedido?->value, 'agente' => $agente ?: null, 'orden' => $orden],
        ];
    }

    /* ------------------------------------------------------------------
     | Lo común
     |-----------------------------------------------------------------*/

    /**
     * Las marcas con alguna propiedad en su checklist que esta persona
     * puede ver, con su estado y su «sin siguiente paso» calculados en la
     * MISMA consulta, y sus líneas del checklist.
     *
     * @return Collection<int, Marca>
     */
    private function marcas(): Collection
    {
        if ($this->marcas !== null) {
            return $this->marcas;
        }

        [$faltaElSiguientePaso, $valores] = SiguientePasoDeLasMarcas::faltaSql();

        return $this->marcas = Marca::query()
            ->quePuedeVer($this->quienMira)
            ->whereHas('propiedadesOfrecidas')
            ->conEstado($this->estados)
            ->selectRaw("CASE WHEN {$faltaElSiguientePaso} THEN 1 ELSE 0 END as sin_siguiente_paso", $valores)
            ->with('propiedadesOfrecidas')
            ->get();
    }

    /**
     * Todas las líneas del checklist de esas marcas, cada una con su marca
     * ya cargada (la misma instancia, con su estado).
     *
     * @return Collection<int, PropiedadDeMarca>
     */
    private function lineas(): Collection
    {
        return $this->marcas()->flatMap(function (Marca $marca): Collection {
            return $marca->propiedadesOfrecidas->each(
                fn (PropiedadDeMarca $linea) => $linea->setRelation('marca', $marca),
            );
        })->values();
    }

    /**
     * @param  Collection<int, PropiedadDeMarca>  $lineas
     * @return array<string, array{marcas: int, ovpUsd: float}>
     */
    private function repartoPorEstado(Collection $lineas): array
    {
        $reparto = [];

        foreach (EstadoDeMarca::cases() as $caso) {
            $deEseEstado = $lineas->filter(fn (PropiedadDeMarca $linea): bool => $this->estadoDe($linea->marca) === $caso);
            $reparto[$caso->value] = [
                'marcas' => $deEseEstado->pluck('marca_id')->unique()->count(),
                'ovpUsd' => $this->sumaDelOvp($deEseEstado),
            ];
        }

        return $reparto;
    }

    /**
     * El estado de la marca, el mismo de la tarjeta: lo fijado a mano o,
     * si no, el calculado en SQL por EstadoDeLasMarcas.
     */
    private function estadoDe(Marca $marca): EstadoDeMarca
    {
        return $marca->estado();
    }

    /**
     * @param  Collection<int, PropiedadDeMarca>  $lineas
     */
    private function sumaDelOvp(Collection $lineas): float
    {
        return round((float) $lineas->sum(fn (PropiedadDeMarca $linea): float => (float) $linea->ovp_usd), 2);
    }
}
