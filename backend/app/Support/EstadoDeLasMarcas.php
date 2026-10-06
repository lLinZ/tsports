<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\EstadoDeMarca;
use App\Models\Marca;
use App\Models\UmbralesDelEstado;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * EstadoDeLasMarcas — la fórmula de caliente, tibia o fría.
 * ---------------------------------------------------------------------
 * El estado de una marca se CALCULA al leer, nunca se guarda: con los
 * umbrales del momento y el día de hoy. Cambiar los umbrales recolorea
 * el tablero entero al instante, y una marca se enfría sola con el paso
 * de los días sin que nadie tenga que recalcular nada.
 *
 * La fórmula vive aquí, en SQL, y solo aquí: el filtro del tablero, sus
 * contadores, el reparto del resumen y la tarjeta de cada marca la leen
 * de este sitio. Si la tarjeta la recalculase en PHP o en el navegador,
 * tarde o temprano diría «tibia» de una marca que el filtro cuenta como
 * caliente.
 *
 * UNA MARCA ESTÁ CALIENTE si en los últimos `dias_caliente` días:
 *
 *   · se movió (`marcas.ultimo_movimiento_en`: alta, fase, valor,
 *     comentario o acción anotada; ver MotivoDeMovimiento), o
 *   · tiene una acción de campaña con fecha en esos días o POR DELANTE.
 *
 * Lo segundo es lo que pide la propuesta («caliente hasta que pase el
 * día»): una visita agendada para dentro de tres semanas la mantiene
 * caliente hasta ese día, y después se enfría contando desde la visita,
 * que es cuando de verdad pasó algo. TIBIA es lo mismo con `dias_tibia`,
 * y FRÍA lo demás. El estado fijado a mano manda sobre todo esto.
 *
 * LOS DÍAS SON LOS DE CARACAS porque el sistema entero va en hora de
 * Venezuela (APP_TIMEZONE y DB_TIMEZONE, regla 16): `today()` ya es el
 * día del equipo y `ultimo_movimiento_en` se lee en su hora, así que aquí
 * no se convierte nada.
 */
final class EstadoDeLasMarcas
{
    private function __construct(
        public readonly int $diasCaliente,
        public readonly int $diasTibia,
        private readonly CarbonImmutable $hoy,
    ) {}

    public static function conLosUmbralesVigentes(): self
    {
        $umbrales = UmbralesDelEstado::vigentes();

        return new self($umbrales->dias_caliente, $umbrales->dias_tibia, CarbonImmutable::today());
    }

    /**
     * Cuántos días han pasado desde ese instante: 0 si fue hoy, 1 si fue
     * ayer. Se pasa a la hora del sistema por si llega en otra zona.
     */
    public static function diasDesde(CarbonInterface $instante): int
    {
        $elDia = CarbonImmutable::instance($instante)
            ->setTimezone(config('app.timezone'))
            ->startOfDay();

        return (int) $elDia->diffInDays(CarbonImmutable::today(), false);
    }

    /**
     * Cuántos días faltan para un día del calendario (AAAA-MM-DD): 0 si es
     * hoy, 1 si es mañana, negativo si ya pasó. Es lo que dice «mañana» en
     * la interfaz: el navegador puede estar en otra zona horaria.
     */
    public static function diasHastaElDia(string $dia): int
    {
        $elDia = CarbonImmutable::createFromFormat('Y-m-d', substr($dia, 0, 10))->startOfDay();

        return (int) CarbonImmutable::today()->diffInDays($elDia, false);
    }

    /**
     * La columna con el estado de cada marca, lista para un SELECT o un
     * WHERE sobre la tabla `marcas`.
     *
     * Sin lo fijado a mano es el estado AUTOMÁTICO, el que la tarjeta
     * enseña como «calculado» junto al fijado.
     *
     * @return array{0: string, 1: list<string>} El SQL y sus valores.
     */
    public function columnaSql(bool $contandoLoFijado = true): array
    {
        [$caliente, $valoresDeCaliente] = $this->seMovioEnLosUltimos($this->diasCaliente);
        [$tibia, $valoresDeTibia] = $this->seMovioEnLosUltimos($this->diasTibia);

        $fijado = $contandoLoFijado ? 'WHEN marcas.estado_fijado IS NOT NULL THEN marcas.estado_fijado ' : '';

        return [
            "CASE {$fijado}WHEN {$caliente} THEN 'caliente' WHEN {$tibia} THEN 'tibia' ELSE 'fria' END",
            [...$valoresDeCaliente, ...$valoresDeTibia],
        ];
    }

    /**
     * Cuántas marcas hay en cada estado, entre las de la consulta.
     *
     * Para los contadores de los filtros se le pasa el tablero con TODOS
     * los demás filtros puestos menos el de estado: «Calientes · 12» tiene
     * que ser lo que sale al pulsarlo.
     *
     * @param  Builder<Marca>  $marcas
     * @return array{caliente: int, tibia: int, fria: int}
     */
    public function contarPorEstado(Builder $marcas): array
    {
        [$columna, $valores] = $this->columnaSql();

        $porEstado = DB::query()
            ->fromSub(
                (clone $marcas)->reorder()->select('marcas.id')->selectRaw("{$columna} as estado", $valores),
                'marcas_con_estado',
            )
            ->select('estado')
            ->selectRaw('COUNT(*) as total')
            ->groupBy('estado')
            ->pluck('total', 'estado');

        return [
            'caliente' => (int) ($porEstado[EstadoDeMarca::Caliente->value] ?? 0),
            'tibia' => (int) ($porEstado[EstadoDeMarca::Tibia->value] ?? 0),
            'fria' => (int) ($porEstado[EstadoDeMarca::Fria->value] ?? 0),
        ];
    }

    /** Los umbrales, como los lee la interfaz para explicar cada estado. */
    public function umbrales(): array
    {
        return [
            'diasCaliente' => $this->diasCaliente,
            'diasTibia' => $this->diasTibia,
        ];
    }

    public function hoy(): CarbonImmutable
    {
        return $this->hoy;
    }

    /**
     * La condición «se movió en los últimos N días, o tiene una acción de
     * ahí en adelante».
     *
     * @return array{0: string, 1: list<string>}
     */
    private function seMovioEnLosUltimos(int $dias): array
    {
        $primerDiaQueCuenta = $this->hoy->subDays($dias);

        return [
            '(COALESCE(marcas.ultimo_movimiento_en, marcas.created_at) >= ?'
                .' OR EXISTS (SELECT 1 FROM eventos_de_campana'
                .' WHERE eventos_de_campana.marca_id = marcas.id AND eventos_de_campana.fecha >= ?))',
            [
                $primerDiaQueCuenta->format('Y-m-d H:i:s'),
                $primerDiaQueCuenta->format('Y-m-d'),
            ],
        ];
    }
}
