<?php

/**
 * Migración: lo que hace falta guardar para saber si una marca está
 * caliente, tibia o fría.
 * ---------------------------------------------------------------------
 * El estado en sí NO se guarda: se calcula al leer con los umbrales del
 * momento (App\Support\EstadoDeLasMarcas). Lo que sí se guarda:
 *
 *   · `ultimo_movimiento_en` / `ultimo_movimiento_motivo` — cuándo se
 *     movió la marca por última vez y por qué. Columna propia, y no el
 *     `updated_at`: ese cambia también al corregir el teléfono o el logo,
 *     y la propuesta aceptada dice expresamente que eso no calienta una
 *     marca. Solo avanza, nunca retrocede: la actividad nunca enfría.
 *
 *   · `estado_fijado` (+ quién y cuándo) — el estado puesto a mano, que
 *     manda sobre el calculado hasta que alguien lo suelta. Quién lo fijó
 *     se enseña en la tarjeta: un «caliente» de hace dos meses puesto por
 *     alguien que ya no lleva la marca se tiene que poder reconocer.
 *
 * Las acciones de campaña con fecha por delante no necesitan columna:
 * se leen de `eventos_de_campana` en la misma consulta.
 *
 * EL RELLENO de las marcas que ya existen sale de lo que el sistema
 * recuerda: el alta, el último comentario, la última acción de campaña
 * anotada y, de la auditoría, los cambios de fase y de valor. Sin esto,
 * todas las marcas amanecerían «calientes» con la fecha de hoy.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->timestamp('ultimo_movimiento_en')->nullable()->after('origen');
            $tabla->string('ultimo_movimiento_motivo', 30)->nullable()->after('ultimo_movimiento_en');

            $tabla->string('estado_fijado', 10)->nullable()->after('ultimo_movimiento_motivo');
            $tabla->string('estado_fijado_por_nombre')->nullable()->after('estado_fijado');
            $tabla->timestamp('estado_fijado_en')->nullable()->after('estado_fijado_por_nombre');

            // Los filtros del tablero comparan contra esta fecha.
            $tabla->index('ultimo_movimiento_en');
        });

        $this->rellenarElUltimoMovimiento();
    }

    public function down(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->dropIndex(['ultimo_movimiento_en']);
            $tabla->dropColumn([
                'ultimo_movimiento_en',
                'ultimo_movimiento_motivo',
                'estado_fijado',
                'estado_fijado_por_nombre',
                'estado_fijado_en',
            ]);
        });
    }

    /**
     * Para cada marca, el movimiento más reciente que se puede reconstruir.
     */
    private function rellenarElUltimoMovimiento(): void
    {
        /** @var array<string, array{0: string, 1: string}> $movimientos marca => [instante, motivo] */
        $movimientos = [];

        $anotar = static function (string $idDeLaMarca, mixed $instante, string $motivo) use (&$movimientos): void {
            if ($instante === null || $instante === '') {
                return;
            }

            // Todo a un mismo formato para poder comparar como texto: MySQL
            // y SQLite no devuelven las fechas igual.
            $normalizado = Carbon::parse((string) $instante)->format('Y-m-d H:i:s');

            if (! isset($movimientos[$idDeLaMarca]) || $movimientos[$idDeLaMarca][0] < $normalizado) {
                $movimientos[$idDeLaMarca] = [$normalizado, $motivo];
            }
        };

        foreach (DB::table('marcas')->select('id', 'created_at')->cursor() as $marca) {
            $anotar($marca->id, $marca->created_at, 'alta');
        }

        $ultimoComentario = DB::table('comentarios_marca')
            ->selectRaw('marca_id, MAX(created_at) as instante')
            ->groupBy('marca_id')
            ->get();

        foreach ($ultimoComentario as $fila) {
            $anotar($fila->marca_id, $fila->instante, 'comentario');
        }

        $ultimaAccion = DB::table('eventos_de_campana')
            ->selectRaw('marca_id, MAX(created_at) as instante')
            ->groupBy('marca_id')
            ->get();

        foreach ($ultimaAccion as $fila) {
            $anotar($fila->marca_id, $fila->instante, 'accion_de_campana');
        }

        // Los cambios de fase y de valor solo los recuerda la auditoría:
        // el interruptor de la tarjeta deja «Completó/Reabrió la fase…» y
        // la ficha deja el antes y el después de cada campo.
        $ediciones = DB::table('registros_actividad')
            ->where('entidad_tipo', 'marca')
            ->where('accion', 'actualizo')
            ->whereNotNull('entidad_id')
            ->select('entidad_id', 'descripcion', 'metadatos', 'created_at')
            ->orderBy('created_at')
            ->cursor();

        foreach ($ediciones as $edicion) {
            if (! isset($movimientos[$edicion->entidad_id])) {
                continue; // Auditoría de una marca que ya no existe.
            }

            $motivo = $this->motivoDeUnaEdicion((string) $edicion->descripcion, $edicion->metadatos);

            if ($motivo !== null) {
                $anotar($edicion->entidad_id, $edicion->created_at, $motivo);
            }
        }

        foreach ($movimientos as $idDeLaMarca => [$instante, $motivo]) {
            DB::table('marcas')->where('id', $idDeLaMarca)->update([
                'ultimo_movimiento_en' => $instante,
                'ultimo_movimiento_motivo' => $motivo,
            ]);
        }
    }

    private function motivoDeUnaEdicion(string $descripcion, mixed $metadatos): ?string
    {
        if (str_starts_with($descripcion, 'Completó la fase') || str_starts_with($descripcion, 'Reabrió la fase')) {
            return 'fase';
        }

        $datos = is_string($metadatos) ? json_decode($metadatos, true) : null;

        if (! is_array($datos) || ! is_array($datos['antes'] ?? null) || ! is_array($datos['despues'] ?? null)) {
            return null;
        }

        $antes = $datos['antes'];
        $despues = $datos['despues'];

        foreach (['fase_aproximacion_completada', 'fase_propuesta_completada'] as $fase) {
            if (array_key_exists($fase, $antes) && (bool) $antes[$fase] !== (bool) ($despues[$fase] ?? false)) {
                return 'fase';
            }
        }

        if (array_key_exists('valor_anual_usd', $antes)
            && round((float) $antes['valor_anual_usd'], 2) !== round((float) ($despues['valor_anual_usd'] ?? 0), 2)) {
            return 'valor';
        }

        return null;
    }
};
