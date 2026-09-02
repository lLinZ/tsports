<?php

/**
 * Migración: `prospectores_de_propiedad` — quién trabaja cada producto.
 * ---------------------------------------------------------------------
 * Tabla puente entre `propiedades` y `users`. Solo tiene sentido cuando
 * la propiedad NO está marcada como `asignada_a_todos`:
 *
 *   · Comité Olímpico  → dirección
 *   · Dvo. Táchira     → una sola persona
 *   · Sportbiz         → asignada a todos (esta tabla queda vacía)
 *
 * La comprobación de "¿puedo ofrecer esta propiedad?" vive en el modelo
 * Propiedad y en PropiedadPolicy, no aquí.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prospectores_de_propiedad', function (Blueprint $tabla) {
            $tabla->id();

            $tabla->foreignUuid('propiedad_id')
                  ->constrained('propiedades')->cascadeOnDelete();

            // Si la persona se da de baja definitiva, su asignación
            // desaparece con ella; la propiedad sigue existiendo.
            $tabla->foreignUuid('usuario_id')
                  ->constrained('users')->cascadeOnDelete();

            // Nadie puede estar asignado dos veces a la misma propiedad.
            $tabla->unique(['propiedad_id', 'usuario_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prospectores_de_propiedad');
    }
};
