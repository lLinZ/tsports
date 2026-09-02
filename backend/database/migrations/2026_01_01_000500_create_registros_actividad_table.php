<?php

/**
 * Migración: `registros_actividad` — auditoría del CRM.
 * ---------------------------------------------------------------------
 * No existía en la versión de Supabase y es la principal mejora de esta:
 * deja rastro de quién creó, editó o borró cada marca, quién cambió el
 * rol de quién y quién tocó la web. Con varios comerciales trabajando
 * sobre las mismas marcas, poder responder "¿quién movió esto?" evita
 * discusiones.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('registros_actividad', function (Blueprint $tabla) {
            $tabla->id();

            $tabla->foreignUuid('usuario_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('usuario_nombre')->nullable();

            // Verbo de lo ocurrido: 'creo', 'actualizo', 'elimino', 'inicio_sesion'...
            $tabla->string('accion', 60);

            // Sobre qué se actuó: 'marca', 'usuario', 'contenido_sitio'...
            $tabla->string('entidad_tipo', 60);
            $tabla->string('entidad_id')->nullable();

            // Frase ya redactada para mostrar en pantalla sin recomponerla.
            $tabla->string('descripcion');

            // Detalle de los campos que cambiaron (antes / después).
            $tabla->json('metadatos')->nullable();

            $tabla->string('direccion_ip', 45)->nullable();

            $tabla->timestamps();

            $tabla->index(['entidad_tipo', 'entidad_id']);
            $tabla->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('registros_actividad');
    }
};
