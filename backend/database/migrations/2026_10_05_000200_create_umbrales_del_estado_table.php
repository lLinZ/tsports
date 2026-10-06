<?php

/**
 * Migración: los días que tarda una marca en enfriarse.
 * ---------------------------------------------------------------------
 * Una sola fila, que fija el administrador desde el tablero. Hasta que
 * alguien la toque no existe y valen los de la propuesta: caliente hasta
 * 5 días, tibia hasta 15, fría después (App\Models\UmbralesDelEstado).
 *
 * Se guarda quién los cambió por última vez porque mover un umbral cambia
 * de golpe el color de todo el tablero, y el equipo tiene que poder saber
 * por qué amaneció distinto.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('umbrales_del_estado', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->unsignedSmallInteger('dias_caliente');
            $tabla->unsignedSmallInteger('dias_tibia');
            $tabla->foreignUuid('cambiado_por_id')->nullable()->constrained('users')->nullOnDelete();
            $tabla->string('cambiado_por_nombre')->nullable();
            $tabla->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('umbrales_del_estado');
    }
};
