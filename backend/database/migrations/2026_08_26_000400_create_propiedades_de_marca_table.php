<?php

/**
 * Migración: `propiedades_de_marca` — el checklist de prospección.
 * ---------------------------------------------------------------------
 * Cada fila dice: "a esta MARCA se le está ofreciendo esta PROPIEDAD, y
 * el vendedor pronostica venderle este importe (OVP)".
 *
 * Es la tabla donde vive el tercero de los tres montos del producto IOP:
 *
 *   · MTP (en `propiedades`)   → cuánto vale la propiedad entera.
 *   · Forecast (derivado)      → el % del MTP que es la meta de venta.
 *   · OVP (esta tabla)         → lo que el vendedor cree que le va a
 *                                sacar a ESTA marca dentro de ESA
 *                                propiedad. Es el único de los tres que
 *                                escribe un vendedor.
 *
 * La proporción que se pinta en la interfaz (la barra de porcentaje) es
 * OVP ÷ MTP y NO se guarda: se calcula al leer. Guardarla obligaría a
 * recalcular todas las filas cada vez que alguien corrige el MTP de una
 * propiedad, y bastaría un fallo para que el tablero mintiera.
 *
 * A quién se le suma el OVP en el informe por prospector: al vendedor
 * asignado de la marca. No se copia aquí para que reasignar una marca
 * mueva también su pronóstico, que es lo que espera el equipo.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('propiedades_de_marca', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->foreignUuid('marca_id')
                  ->constrained('marcas')->cascadeOnDelete();

            $tabla->foreignUuid('propiedad_id')
                  ->constrained('propiedades')->cascadeOnDelete();

            // OVP — pronóstico de venta del vendedor para esta marca
            // dentro de esta propiedad.
            $tabla->decimal('ovp_usd', 14, 2)->default(0);

            // Nota corta del vendedor sobre qué se le va a ofrecer.
            $tabla->text('nota')->nullable();

            $tabla->timestamps();

            // Una propiedad no se puede ofrecer dos veces a la misma
            // marca: si no, el total del pronóstico saldría duplicado.
            $tabla->unique(['marca_id', 'propiedad_id']);
            $tabla->index('propiedad_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('propiedades_de_marca');
    }
};
