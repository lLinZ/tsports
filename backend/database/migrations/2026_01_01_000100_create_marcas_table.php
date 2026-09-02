<?php

/**
 * Migración: `marcas` — el corazón del CRM de patrocinios.
 * ---------------------------------------------------------------------
 * Es la tabla que en Supabase se llamaba `deals`. Aquí se renombra a
 * `marcas` y sus columnas pasan a español, porque todo el equipo que la
 * consulta trabaja en ese idioma; el comando `tsports:importar-supabase`
 * se encarga de traducir los nombres antiguos al importar los datos.
 *
 * El proceso comercial tiene tres fases que NO son secuenciales: una
 * marca puede estar en propuesta sin haber cerrado la prospección.
 * Por eso cada fase es un booleano independiente y no un único `stage`.
 *
 *   · Prospección  → se calcula sola: está completa cuando la marca tiene
 *                    nombre, logo, persona de contacto, cargo y email.
 *   · Aproximación → sí/no manual; si es sí exige indicar la vía.
 *   · Propuesta    → sí/no manual; si es sí exige una descripción.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marcas', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // --- Identificación de la marca ----------------------------
            $tabla->string('nombre_marca');
            $tabla->string('sector')->nullable();
            $tabla->text('logo_url')->nullable();
            $tabla->string('zona')->nullable();

            // ¿La marca ya invierte hoy en patrocinios? Sirve para
            // priorizar: quien ya invierte es una venta más corta.
            $tabla->enum('invierte_actualmente', ['desconocido', 'si', 'no'])
                  ->default('desconocido');

            // Acción BTL donde se detectó la marca (Instagram, valla...).
            $tabla->string('via_prospeccion')->nullable();

            // --- Persona con la que se cierra el negocio ---------------
            $tabla->string('persona_contacto')->nullable();
            $tabla->string('cargo_contacto')->nullable();
            $tabla->string('email_contacto')->nullable();
            $tabla->string('telefono_contacto')->nullable();
            $tabla->text('notas')->nullable();

            // --- Avance del proceso comercial --------------------------
            $tabla->boolean('fase_prospeccion_completada')->default(false);

            $tabla->boolean('fase_aproximacion_completada')->default(false);
            $tabla->string('via_aproximacion')->nullable();   // Conocido / WhatsApp / Otro

            $tabla->boolean('fase_propuesta_completada')->default(false);
            $tabla->text('descripcion_propuesta')->nullable();

            // Valor anual del patrocinio propuesto, al 100%.
            $tabla->decimal('valor_anual_usd', 14, 2)->default(0);

            // --- Responsables ------------------------------------------
            // Quién registró la marca (se conserva aunque el usuario se
            // borre: por eso el nombre se guarda además del id).
            $tabla->foreignUuid('registrada_por_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('registrada_por_nombre')->nullable();

            // Vendedor que trabaja la marca; es quien puede editarla.
            $tabla->foreignUuid('vendedor_asignado_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('vendedor_asignado_nombre')->nullable();

            // 'web' = llegó por el formulario público; 'manual' = la cargó
            // un comercial desde el CRM.
            $tabla->enum('origen', ['manual', 'web'])->default('manual');

            $tabla->timestamps();

            // Índices de los campos por los que se filtra en el tablero.
            $tabla->index('zona');
            $tabla->index('sector');
            $tabla->index('vendedor_asignado_id');
            $tabla->index('registrada_por_id');
            $tabla->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marcas');
    }
};
