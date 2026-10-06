<?php

/**
 * Migración: los recordatorios de seguimiento.
 * ---------------------------------------------------------------------
 * «Volver a llamar a Pepsi el jueves.» Cada fila es una cosa que una
 * persona tiene que hacer con una marca un día concreto.
 *
 * Tabla y no una columna «próximo contacto» en `marcas`: una marca puede
 * tener varios a la vez (llamar el jueves, mandar el dossier el lunes) y
 * cada uno es de una persona, que no tiene por qué ser quien lleva la
 * marca (el comercial puede dejarle uno a la agente).
 *
 *   · `fecha` es un DÍA, sin hora: el equipo planifica por jornadas, igual
 *     que las acciones de campaña.
 *   · `cumplido_en` vacío = pendiente. Se guarda quién lo cumplió porque
 *     puede no ser su persona (un comercial que hizo la llamada él mismo).
 *   · `avisado_en` lo pone el aviso de la mañana (recordatorios:avisar-
 *     del-dia) para no mandar dos veces el mismo si se ejecuta de nuevo.
 *   · Los nombres van copiados junto a los ids, como en la bitácora: si
 *     una cuenta se borra, el recordatorio sigue diciendo quién lo dejó.
 *
 * Borrar la marca se lleva sus recordatorios. Borrar la cuenta de su
 * persona, también: ya no hay nadie que los vaya a hacer.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recordatorios', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->foreignUuid('marca_id')->constrained('marcas')->cascadeOnDelete();
            $tabla->foreignUuid('persona_id')->constrained('users')->cascadeOnDelete();

            $tabla->date('fecha');
            $tabla->string('nota', 300)->nullable();

            $tabla->foreignUuid('creado_por_id')->nullable()->constrained('users')->nullOnDelete();
            $tabla->string('creado_por_nombre')->nullable();

            $tabla->timestamp('cumplido_en')->nullable();
            $tabla->string('cumplido_por_nombre')->nullable();

            $tabla->timestamp('avisado_en')->nullable();

            $tabla->timestamps();

            // «Lo mío pendiente, por día» es la consulta del panel y la del
            // aviso de la mañana.
            $tabla->index(['persona_id', 'cumplido_en', 'fecha']);
            $tabla->index(['marca_id', 'cumplido_en']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recordatorios');
    }
};
