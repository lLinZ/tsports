<?php

/**
 * Migración: los avisos se configuran y se ven (2026-11-05).
 * ---------------------------------------------------------------------
 * La propuesta «Panel de avisos», aprobada por LinZ: hasta hoy el
 * sistema mandaba seis avisos y nadie podía ver cuáles, a quién ni si
 * llegaban. Cuatro piezas:
 *
 *   · `ajustes_de_avisos` → lo que decide el administrador: si un aviso
 *     sale y, en los dos de grupo (lead y comentario), a qué roles. Sin
 *     fila, el aviso va como venía de fábrica (AjustesDeAvisos).
 *   · `preferencias_de_avisos` → lo que decide cada persona, aviso por
 *     aviso: si le suena el móvil y si suena con el panel abierto. La
 *     campanita no se apaga: la fila del aviso es el aviso (regla 17).
 *   · El horario de silencio, en `users`: en esas horas el teléfono no
 *     suena. Apagado de partida, con 20:00 a 07:30 y fines de semana ya
 *     puestos para quien lo encienda: encenderlo para todos habría
 *     dejado sin aviso de noche a quien no lo pidió.
 *   · Qué pasó con cada aviso, en la propia `notificaciones`: si llegó a
 *     la pantalla, si se entregó al móvil o por qué no. Es el registro de
 *     envíos; hasta hoy un fallo del móvil solo quedaba en el log.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ajustes_de_avisos', function (Blueprint $tabla) {
            // El tipo del aviso (Notificacion::TIPO_* o el del chat).
            $tabla->string('tipo', 40)->primary();
            $tabla->boolean('activo')->default(true);
            // Solo en los avisos de grupo: {"administracion": true, ...}.
            $tabla->json('destinatarios')->nullable();
            $tabla->string('cambiado_por_nombre', 160)->nullable();
            $tabla->timestamps();
        });

        Schema::create('preferencias_de_avisos', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();
            $tabla->foreignUuid('usuario_id')->constrained('users')->cascadeOnDelete();
            $tabla->string('tipo', 40);
            $tabla->boolean('al_movil')->default(true);
            $tabla->boolean('con_sonido')->default(true);
            $tabla->timestamps();

            $tabla->unique(['usuario_id', 'tipo']);
        });

        Schema::table('users', function (Blueprint $tabla) {
            $tabla->boolean('silencio_activo')->default(false);
            $tabla->string('silencio_desde', 5)->default('20:00');
            $tabla->string('silencio_hasta', 5)->default('07:30');
            $tabla->boolean('silencio_fines_de_semana')->default(true);
        });

        Schema::table('notificaciones', function (Blueprint $tabla) {
            // Si sonó en el panel: lo decide la preferencia de la persona
            // al crearse. La campanita suena cuando sube esta cuenta.
            $tabla->boolean('con_sonido')->default(true);
            // al_momento | panel_cerrado | sin_tiempo_real | fallo
            $tabla->string('entrega_en_pantalla', 20)->nullable();
            // en_cola | entregado | ya_leido | sin_dispositivo | apagado_por_la_persona
            // | silencio | sin_push | fallo
            $tabla->string('entrega_al_movil', 30)->nullable();
            // A qué dispositivos llegó, o por qué falló.
            $tabla->string('entrega_al_movil_detalle', 160)->nullable();
            $tabla->timestamp('entrega_al_movil_en')->nullable();

            $tabla->index(['tipo', 'created_at']);
        });

        Schema::table('suscripciones_push', function (Blueprint $tabla) {
            $tabla->timestamp('ultimo_envio_en')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('suscripciones_push', function (Blueprint $tabla) {
            $tabla->dropColumn('ultimo_envio_en');
        });

        Schema::table('notificaciones', function (Blueprint $tabla) {
            $tabla->dropIndex(['tipo', 'created_at']);
            $tabla->dropColumn(['con_sonido', 'entrega_en_pantalla', 'entrega_al_movil', 'entrega_al_movil_detalle', 'entrega_al_movil_en']);
        });

        Schema::table('users', function (Blueprint $tabla) {
            $tabla->dropColumn(['silencio_activo', 'silencio_desde', 'silencio_hasta', 'silencio_fines_de_semana']);
        });

        Schema::dropIfExists('preferencias_de_avisos');
        Schema::dropIfExists('ajustes_de_avisos');
    }
};
