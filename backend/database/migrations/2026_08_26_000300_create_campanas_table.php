<?php

/**
 * Migración: `campanas` — las campañas comerciales del año.
 * ---------------------------------------------------------------------
 * Una campaña es el empujón comercial al que pertenece el trabajo sobre
 * una marca ("Temporada 2026", "Copa América", "Cierre de año"). Sirve
 * para dos cosas concretas que pidió el cliente:
 *
 *   · Poder elegirla desde la ficha de la marca (un solo selector).
 *   · Poder filtrar el tablero y sacar el reparto por campaña.
 *
 * Una marca pertenece como mucho a una campaña; la relación vive en la
 * columna `campana_id` de `marcas`, no aquí.
 *
 * El nombre NO se copia en la marca a propósito: una campaña se renombra
 * de vez en cuando y una copia desactualizada engañaría al leer la
 * ficha. Se lee siempre por la relación.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campanas', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->string('nombre')->unique();
            $tabla->text('descripcion')->nullable();

            // Color del distintivo en el tablero, en hexadecimal. Con
            // varias campañas abiertas a la vez, el color es lo que
            // permite distinguirlas de un vistazo en la cuadrícula.
            $tabla->string('color', 9)->default('#1b9aaa');

            $tabla->date('fecha_inicio')->nullable();
            $tabla->date('fecha_fin')->nullable();

            $tabla->unsignedSmallInteger('orden')->default(0);

            // Igual que las propiedades: una campaña terminada se
            // desactiva, no se borra, para conservar a qué campaña
            // perteneció cada marca.
            $tabla->boolean('activa')->default(true);

            $tabla->timestamps();

            $tabla->index(['activa', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campanas');
    }
};
