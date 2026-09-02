<?php

/**
 * Migración: añade la campaña a `marcas`.
 * ---------------------------------------------------------------------
 * El selector de "campaña asignada" que faltaba de la primera etapa.
 * Es una relación simple: una marca pertenece como mucho a una campaña.
 *
 * `nullOnDelete` en lugar de `cascade`: si alguien borra una campaña, se
 * pierde la etiqueta, no las marcas. Borrar una campaña no puede
 * llevarse por delante el trabajo comercial hecho dentro de ella.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->foreignUuid('campana_id')->nullable()->after('zona')
                  ->constrained('campanas')->nullOnDelete();

            $tabla->index('campana_id');
        });
    }

    public function down(): void
    {
        Schema::table('marcas', function (Blueprint $tabla) {
            $tabla->dropConstrainedForeignId('campana_id');
        });
    }
};
