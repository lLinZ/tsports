<?php

/**
 * Migración: `suscripciones_push` — a qué dispositivos hay que empujar
 * los avisos cuando el panel está cerrado.
 * ---------------------------------------------------------------------
 * Cada fila es UN navegador de UNA persona. Quien entra desde el móvil y
 * desde el portátil tiene dos, y el aviso le llega a los dos.
 *
 * EL ENDPOINT ES LA DIRECCIÓN, Y ES ÚNICO
 * Lo da el navegador y apunta al servicio de entrega de su fabricante
 * (Google, Mozilla, Apple). Va con índice único porque identifica al
 * dispositivo: si la misma persona vuelve a suscribirse, o si en ese
 * ordenador entra OTRA persona, la fila se actualiza en vez de duplicarse.
 * Esa última parte importa de verdad: sin ella, el ordenador compartido
 * de la oficina seguiría recibiendo los avisos de quien lo usó antes.
 *
 * LAS DOS CLAVES SON DEL NAVEGADOR, NO DEL SERVIDOR
 * `p256dh` y `auth` las genera el navegador al suscribirse y sirven para
 * CIFRAR el contenido del aviso, de modo que el servicio de entrega
 * transporte algo que no puede leer. Son inútiles fuera de su endpoint,
 * pero aun así no salen nunca de aquí.
 *
 * SIN FECHA DE CADUCIDAD A PROPÓSITO
 * Una suscripción no caduca sola: muere cuando el navegador la revoca, y
 * eso se sabe porque el servicio de entrega responde 404 o 410 al
 * intentar enviarle algo. Ahí es donde se borra (ver EnviarAvisoPush).
 * Inventarse una caducidad por tiempo apagaría los avisos de quien pasó
 * dos semanas de vacaciones.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suscripciones_push', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Si la cuenta se borra, sus dispositivos no apuntan a nadie.
            $tabla->foreignUuid('usuario_id')
                  ->constrained('users')->cascadeOnDelete();

            // 500 caracteres sobran: el más largo que se ve en la
            // práctica es el de Google, de unos 200. Cabe en un índice
            // único de MySQL con utf8mb4 (500 × 4 = 2000 bytes, y el
            // tope son 3072).
            $tabla->string('endpoint', 500)->unique();

            $tabla->string('clave_p256dh', 255);
            $tabla->string('clave_auth', 255);

            // Para que la persona reconozca cuál es cuál el día que haya
            // una pantalla de «mis dispositivos». Recortado: el
            // user-agent entero no aporta nada más.
            $tabla->string('dispositivo', 120)->nullable();

            $tabla->timestamps();

            // «Dame los dispositivos de esta persona» es la única
            // consulta que se hace al enviar, y se hace por cada aviso.
            $tabla->index('usuario_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suscripciones_push');
    }
};
