<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoRegistroActividad;
use App\Models\Campana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\CatalogosDelCrm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * PanelController — las cifras del tablero principal.
 * ---------------------------------------------------------------------
 * Reemplaza los cálculos que `crm.js` hacía en el navegador recorriendo
 * el arreglo completo de marcas. Traerlos al servidor tiene dos ventajas:
 * el navegador no necesita descargar todas las marcas para enseñar un
 * total, y las sumas se hacen con SQL, que para esto va sobrado.
 *
 * Devuelve todo lo que pinta la parte superior del CRM:
 *   · Los contadores grandes, incluidos la meta de venta del catálogo de
 *     propiedades y el pronóstico acumulado del equipo.
 *   · El resumen por zona (el gráfico de barras de cada fase).
 *   · El reparto por sector, por vendedor y por campaña.
 *   · Qué empresas de cada zona invierten hoy en marketing deportivo.
 *   · El informe de propiedades (MTP, meta y pronóstico de cada una) y
 *     cuánto pronostica cada prospector.
 *   · Las últimas cosas que ha hecho el equipo.
 */
class PanelController extends Controller
{
    /**
     * GET /api/panel/resumen
     */
    public function resumen(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Marca::class);

        return response()->json([
            'contadores' => $this->contadoresGenerales(),
            'porZona' => $this->resumenPorZona(),
            'porSector' => $this->resumenPorSector(),
            'porVendedor' => $this->resumenPorVendedor(),
            'inversionPorZona' => $this->inversionEnMarketingDeportivoPorZona(),
            'propiedades' => $this->resumenDePropiedades(),
            'forecastPorProspector' => $this->forecastPorProspector(),
            'porCampana' => $this->resumenPorCampana(),
            'actividadReciente' => $this->actividadReciente($peticion),
        ]);
    }

    /**
     * Los cinco números grandes de la cabecera del tablero.
     *
     * @return array<string,int|float>
     */
    private function contadoresGenerales(): array
    {
        // Una sola consulta con agregados condicionales, en vez de cinco
        // recorridos separados sobre la misma tabla.
        $agregados = Marca::query()
            ->selectRaw('COUNT(*) as total_marcas')
            ->selectRaw('SUM(CASE WHEN fase_aproximacion_completada = 1 THEN 1 ELSE 0 END) as total_aproximacion')
            ->selectRaw('SUM(CASE WHEN fase_prospeccion_completada = 1 THEN 1 ELSE 0 END) as total_prospeccion')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN 1 ELSE 0 END) as total_propuesta')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor_propuesto')
            ->selectRaw('SUM(CASE WHEN vendedor_asignado_id IS NULL THEN 1 ELSE 0 END) as total_sin_asignar')
            ->first();

        // Las dos cifras de los productos IOP viven en otras tablas, así
        // que se piden aparte. Son dos agregados sueltos, no un recorrido
        // por filas: no cuesta nada traerlos siempre.
        $forecastDeLasPropiedades = (float) Propiedad::query()
            ->activas()
            ->selectRaw('COALESCE(SUM(monto_total_usd * porcentaje_forecast / 100), 0) as forecast')
            ->value('forecast');

        $pronosticoAcumulado = (float) DB::table('propiedades_de_marca')->sum('ovp_usd');

        return [
            'totalMarcas' => (int) ($agregados->total_marcas ?? 0),
            'enAproximacion' => (int) ($agregados->total_aproximacion ?? 0),
            'enProspeccion' => (int) ($agregados->total_prospeccion ?? 0),
            'conPropuesta' => (int) ($agregados->total_propuesta ?? 0),
            'valorPropuestoAnual' => (float) ($agregados->valor_propuesto ?? 0),
            'sinAsignar' => (int) ($agregados->total_sin_asignar ?? 0),

            // Meta de venta de todo el catálogo: la suma del porcentaje
            // acordado sobre el monto total de cada propiedad activa.
            'forecastDePropiedades' => round($forecastDeLasPropiedades, 2),
            // Lo que el equipo pronostica vender de esas propiedades.
            'ovpPronosticado' => round($pronosticoAcumulado, 2),
        ];
    }

    /**
     * Resumen por zona: cuántas marcas hay en cada fase y cuánto valor
     * acumulan. Se devuelven SIEMPRE las cinco zonas oficiales, aunque
     * alguna esté vacía, para que el gráfico no cambie de forma según el
     * día y se note de un vistazo qué zona está parada.
     *
     * @return list<array<string,mixed>>
     */
    private function resumenPorZona(): array
    {
        $filasAgrupadas = Marca::query()
            ->select('zona')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN fase_aproximacion_completada = 1 THEN 1 ELSE 0 END) as aproximacion')
            ->selectRaw('SUM(CASE WHEN fase_prospeccion_completada = 1 THEN 1 ELSE 0 END) as prospeccion')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN 1 ELSE 0 END) as propuesta')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor')
            ->groupBy('zona')
            ->get()
            ->keyBy(fn ($fila): string => (string) ($fila->zona ?: 'Sin zona'));

        $zonasAMostrar = CatalogosDelCrm::ZONAS;

        // Si hay marcas con una zona que ya no está en el catálogo (o sin
        // zona), se añaden al final para que no desaparezcan del informe.
        foreach ($filasAgrupadas->keys() as $zonaEncontrada) {
            if (! in_array($zonaEncontrada, $zonasAMostrar, true)) {
                $zonasAMostrar[] = $zonaEncontrada;
            }
        }

        return array_map(static function (string $zona) use ($filasAgrupadas): array {
            $fila = $filasAgrupadas->get($zona);

            return [
                'zona' => $zona,
                'total' => (int) ($fila->total ?? 0),
                'aproximacion' => (int) ($fila->aproximacion ?? 0),
                'prospeccion' => (int) ($fila->prospeccion ?? 0),
                'propuesta' => (int) ($fila->propuesta ?? 0),
                'valor' => (float) ($fila->valor ?? 0),
            ];
        }, $zonasAMostrar);
    }

    /**
     * Cuántas marcas hay en cada sector, de mayor a menor.
     *
     * @return list<array<string,mixed>>
     */
    private function resumenPorSector(): array
    {
        return Marca::query()
            ->select('sector')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor')
            ->whereNotNull('sector')
            ->where('sector', '!=', '')
            ->groupBy('sector')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->get()
            ->map(static fn ($fila): array => [
                'sector' => (string) $fila->sector,
                'total' => (int) $fila->total,
                'valor' => (float) $fila->valor,
            ])
            ->all();
    }

    /**
     * Carga de trabajo por vendedor: cuántas marcas lleva cada uno y
     * cuánto valor tiene en propuestas.
     *
     * @return list<array<string,mixed>>
     */
    private function resumenPorVendedor(): array
    {
        return Marca::query()
            ->select('vendedor_asignado_id', 'vendedor_asignado_nombre')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN 1 ELSE 0 END) as propuestas')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor')
            ->whereNotNull('vendedor_asignado_id')
            ->groupBy('vendedor_asignado_id', 'vendedor_asignado_nombre')
            ->orderByDesc(DB::raw('COUNT(*)'))
            ->limit(20)
            ->get()
            ->map(static fn ($fila): array => [
                'vendedorId' => (string) $fila->vendedor_asignado_id,
                'vendedorNombre' => (string) ($fila->vendedor_asignado_nombre ?: 'Sin nombre'),
                'total' => (int) $fila->total,
                'propuestas' => (int) $fila->propuestas,
                'valor' => (float) $fila->valor,
            ])
            ->all();
    }

    /**
     * El informe que pidió el cliente en la primera etapa: cuántas
     * empresas de cada zona invierten hoy en marketing deportivo y
     * cuántas no.
     *
     * Sirve para decidir dónde apretar: una zona llena de marcas que ya
     * patrocinan es una zona con ventas cortas por delante; una llena de
     * "no invierte" exige un trabajo de convencimiento mucho más largo.
     *
     * @return list<array<string,mixed>>
     */
    private function inversionEnMarketingDeportivoPorZona(): array
    {
        $filasAgrupadas = Marca::query()
            ->select('zona')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN invierte_actualmente = 'si' THEN 1 ELSE 0 END) as si_invierte")
            ->selectRaw("SUM(CASE WHEN invierte_actualmente = 'no' THEN 1 ELSE 0 END) as no_invierte")
            ->selectRaw("SUM(CASE WHEN invierte_actualmente = 'desconocido' THEN 1 ELSE 0 END) as sin_definir")
            ->groupBy('zona')
            ->get()
            ->keyBy(fn ($fila): string => (string) ($fila->zona ?: 'Sin zona'));

        $zonasAMostrar = CatalogosDelCrm::ZONAS;

        foreach ($filasAgrupadas->keys() as $zonaEncontrada) {
            if (! in_array($zonaEncontrada, $zonasAMostrar, true)) {
                $zonasAMostrar[] = $zonaEncontrada;
            }
        }

        return array_map(static function (string $zona) use ($filasAgrupadas): array {
            $fila = $filasAgrupadas->get($zona);

            return [
                'zona' => $zona,
                'total' => (int) ($fila->total ?? 0),
                'siInvierte' => (int) ($fila->si_invierte ?? 0),
                'noInvierte' => (int) ($fila->no_invierte ?? 0),
                'sinDefinir' => (int) ($fila->sin_definir ?? 0),
            ];
        }, $zonasAMostrar);
    }

    /**
     * El informe de los productos IOP: los tres montos de cada propiedad
     * puestos uno al lado del otro.
     *
     *   · MTP        → cuánto vale la propiedad entera.
     *   · Forecast   → la meta (su porcentaje del MTP).
     *   · OVP        → lo que el equipo pronostica venderle, sumando lo
     *                  anotado en todas las marcas.
     *
     * Con eso la interfaz pinta la barra que pidió el cliente: qué
     * porcentaje del valor total de la propiedad se está pronosticando.
     *
     * @return list<array<string,mixed>>
     */
    private function resumenDePropiedades(): array
    {
        return Propiedad::query()
            // Sin el `select` explícito, añadir una columna calculada deja
            // fuera las columnas propias de la tabla.
            ->select('propiedades.*')
            ->withCount('marcasQueLaOfrecen')
            ->addSelect([
                'ovp_acumulado' => DB::table('propiedades_de_marca')
                    ->selectRaw('COALESCE(SUM(ovp_usd), 0)')
                    ->whereColumn('propiedad_id', 'propiedades.id'),
            ])
            ->enOrdenDeCatalogo()
            ->get()
            ->map(static function (Propiedad $propiedad): array {
                $montoTotal = (float) $propiedad->monto_total_usd;
                $pronosticado = (float) $propiedad->getAttribute('ovp_acumulado');
                $metaDeVenta = $propiedad->forecastDeVenta();

                return [
                    'propiedadId' => $propiedad->id,
                    'nombre' => $propiedad->nombre,
                    'logoUrl' => $propiedad->logo_url,
                    'activa' => $propiedad->activa,

                    'montoTotalUsd' => $montoTotal,
                    'porcentajeForecast' => (float) $propiedad->porcentaje_forecast,
                    'forecastDeVentaUsd' => $metaDeVenta,
                    'ovpAcumuladoUsd' => round($pronosticado, 2),

                    'totalMarcas' => (int) $propiedad->getAttribute('marcas_que_la_ofrecen_count'),

                    // La proporción que se enseña en la barra. Con el MTP
                    // sin cargar se devuelve 0 en lugar de dividir entre
                    // cero.
                    'porcentajeSobreElTotal' => $montoTotal > 0
                        ? round($pronosticado * 100 / $montoTotal, 2)
                        : 0.0,

                    // Y cuánto de la meta lleva cubierto, que es la otra
                    // lectura que interesa: ¿llegamos al 20 % acordado?
                    'porcentajeSobreLaMeta' => $metaDeVenta > 0
                        ? round($pronosticado * 100 / $metaDeVenta, 2)
                        : 0.0,
                ];
            })
            ->all();
    }

    /**
     * Cuánto pronostica vender cada prospector sumando todas sus marcas.
     *
     * El pronóstico se le apunta al VENDEDOR ASIGNADO de la marca, no a
     * quien escribió la cifra: si una marca cambia de manos, su
     * pronóstico se va con ella, que es lo que el equipo espera al
     * repartir el trabajo.
     *
     * @return list<array<string,mixed>>
     */
    private function forecastPorProspector(): array
    {
        return DB::table('propiedades_de_marca as lineas')
            ->join('marcas', 'marcas.id', '=', 'lineas.marca_id')
            ->selectRaw('marcas.vendedor_asignado_id as vendedor_id')
            ->selectRaw('MAX(marcas.vendedor_asignado_nombre) as vendedor_nombre')
            ->selectRaw('COALESCE(SUM(lineas.ovp_usd), 0) as ovp')
            ->selectRaw('COUNT(DISTINCT lineas.marca_id) as total_marcas')
            ->selectRaw('COUNT(DISTINCT lineas.propiedad_id) as total_propiedades')
            ->groupBy('marcas.vendedor_asignado_id')
            ->orderByDesc(DB::raw('SUM(lineas.ovp_usd)'))
            ->limit(20)
            ->get()
            ->map(static fn ($fila): array => [
                'vendedorId' => $fila->vendedor_id,
                // Las marcas sin dueño también suman: son pronósticos que
                // están ahí y esconderlos descuadraría el total.
                'vendedorNombre' => (string) ($fila->vendedor_nombre ?: 'Sin asignar'),
                'ovpUsd' => round((float) $fila->ovp, 2),
                'totalMarcas' => (int) $fila->total_marcas,
                'totalPropiedades' => (int) $fila->total_propiedades,
            ])
            ->all();
    }

    /**
     * Reparto del trabajo por campaña. Se listan todas las campañas
     * activas aunque estén vacías —una campaña recién abierta con cero
     * marcas es justo la que hay que empujar— y, al final, las marcas
     * que no pertenecen a ninguna.
     *
     * @return list<array<string,mixed>>
     */
    private function resumenPorCampana(): array
    {
        $filasPorCampana = Marca::query()
            ->select('campana_id')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw('SUM(CASE WHEN fase_propuesta_completada = 1 THEN valor_anual_usd ELSE 0 END) as valor')
            ->groupBy('campana_id')
            ->get()
            ->keyBy(fn ($fila): string => (string) ($fila->campana_id ?? 'sin_campana'));

        $resumen = Campana::query()
            ->enOrdenDeCatalogo()
            ->get()
            ->map(static function (Campana $campana) use ($filasPorCampana): array {
                $fila = $filasPorCampana->get($campana->id);

                return [
                    'campanaId' => $campana->id,
                    'nombre' => $campana->nombre,
                    'color' => $campana->color,
                    'activa' => $campana->activa,
                    'estaVigente' => $campana->estaVigente(),
                    'total' => (int) ($fila->total ?? 0),
                    'valor' => (float) ($fila->valor ?? 0),
                ];
            })
            ->all();

        $marcasSinCampana = $filasPorCampana->get('sin_campana');

        if ($marcasSinCampana !== null && (int) $marcasSinCampana->total > 0) {
            $resumen[] = [
                'campanaId' => null,
                'nombre' => 'Sin campaña',
                'color' => '#94a3b8',
                'activa' => true,
                'estaVigente' => true,
                'total' => (int) $marcasSinCampana->total,
                'valor' => (float) $marcasSinCampana->valor,
            ];
        }

        return $resumen;
    }

    /**
     * Últimos movimientos del equipo. Solo se muestran a quien gestiona
     * gente; un vendedor no necesita ver el detalle de lo que hacen los
     * demás en su panel.
     */
    private function actividadReciente(Request $peticion): array
    {
        /** @var User|null $usuarioQueConsulta */
        $usuarioQueConsulta = $peticion->user();

        if ($usuarioQueConsulta === null || ! $usuarioQueConsulta->rol->puedeAsignarVendedores()) {
            return [];
        }

        $ultimosMovimientos = RegistroActividad::query()
            ->latest('id')
            ->limit(12)
            ->get();

        return RecursoRegistroActividad::collection($ultimosMovimientos)
            ->toArray($peticion);
    }
}
