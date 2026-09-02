<?php

/**
 * Migración: `propiedades` — los productos IOP que vende la agencia.
 * ---------------------------------------------------------------------
 * Una propiedad es lo que TS Sports pone a la venta: el Comité Olímpico,
 * el Deportivo Táchira, Kombat Challenge… El equipo comercial no vende
 * "un patrocinio" en abstracto, sino un espacio DENTRO de una de estas
 * propiedades, y por eso cada marca del CRM lleva asociada la lista de
 * propiedades que se le están ofreciendo (tabla `propiedades_de_marca`).
 *
 * Se carga de forma general, sin sub-propiedades: una fila por producto.
 *
 * TRES MONTOS, Y SOLO UNO SE ESCRIBE AQUÍ
 *
 *   1. MTP  · monto_total_usd      → el valor total de la propiedad
 *                                    (el "sales budget"). Ej. 162.000.
 *   2. Forecast · derivado         → el porcentaje del MTP que la agencia
 *                                    se pone como meta de venta. Por
 *                                    defecto el 20 %, y se calcula solo:
 *                                    no es una columna para que nunca
 *                                    pueda contradecir al MTP.
 *   3. OVP  · vive en la otra tabla → lo que cada vendedor pronostica
 *                                    vender de esta propiedad a una
 *                                    marca concreta.
 *
 * ASIGNACIÓN
 * Una propiedad la puede trabajar todo el equipo (`asignada_a_todos`,
 * el caso de Sportbiz o Megafitness) o solo las personas concretas que
 * se listen en `prospectores_de_propiedad` (el caso del Deportivo
 * Táchira, que lleva una sola persona).
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('propiedades', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // El nombre es único: dos propiedades con el mismo nombre en
            // el checklist de una marca serían indistinguibles.
            $tabla->string('nombre')->unique();
            $tabla->text('descripcion')->nullable();
            $tabla->text('logo_url')->nullable();

            // MTP — monto total de la propiedad, al 100 %.
            $tabla->decimal('monto_total_usd', 14, 2)->default(0);

            // Porcentaje del MTP que se fija como meta de venta. Es
            // editable por propiedad porque el 20 % es el acuerdo
            // habitual, no una ley: alguna propiedad puede negociarse
            // con otro reparto.
            $tabla->decimal('porcentaje_forecast', 5, 2)->default(20);

            // Quién puede ofrecer la propiedad. Con `true` la ve todo el
            // equipo; con `false` manda la lista de prospectores.
            $tabla->boolean('asignada_a_todos')->default(true);

            // Orden en el que se enseña el checklist. El equipo tiene un
            // orden mental de sus propiedades y respetarlo hace que
            // encuentren la que buscan sin leer la lista entera.
            $tabla->unsignedSmallInteger('orden')->default(0);

            // Una propiedad que ya no se vende se desactiva en vez de
            // borrarse, para no perder el histórico de las marcas a las
            // que se les llegó a ofrecer.
            $tabla->boolean('activa')->default(true);

            $tabla->timestamps();

            $tabla->index(['activa', 'orden']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('propiedades');
    }
};
