<?php

/**
 * Migración: la meta de venta de cada persona del equipo, por año.
 * ---------------------------------------------------------------------
 * La meta SÍ se guarda, porque es un acuerdo («Ana: 60.000 $ este año»).
 * El avance NO: se mide al leer contra el OVP de sus marcas (decidido por
 * LinZ el 2026-10-05), que cambia cada vez que alguien corrige un
 * pronóstico. Guardado, se quedaría viejo al día siguiente.
 *
 * Por AÑO porque los importes del sistema son anuales (valor anual de la
 * propuesta, MTP de cada propiedad) y el OVP es el pronóstico de la
 * cartera, no de un mes: contra una meta mensual no diría nada.
 *
 * Una por persona y año. Quién la puso queda copiado, como en el resto
 * del sistema, por si la cuenta se borra.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('metas', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->foreignUuid('persona_id')->constrained('users')->cascadeOnDelete();
            $tabla->unsignedSmallInteger('anio');
            $tabla->decimal('monto_usd', 14, 2);
            $tabla->foreignUuid('fijada_por_id')->nullable()->constrained('users')->nullOnDelete();
            $tabla->string('fijada_por_nombre')->nullable();
            $tabla->timestamps();

            $tabla->unique(['persona_id', 'anio']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('metas');
    }
};
