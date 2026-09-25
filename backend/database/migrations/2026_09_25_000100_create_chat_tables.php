<?php

/**
 * Migración: el chat interno del equipo.
 * ---------------------------------------------------------------------
 * Mensajería ENTRE PERSONAS, uno a uno y en grupo. No hay un hilo por
 * marca: eso ya es la bitácora, y un chat por marca la vaciaría (ver
 * PLAN-FASE-3.md, etapa 8). Lo que sí se puede es ETIQUETAR una marca
 * dentro de un mensaje.
 *
 * CUATRO TABLAS
 *
 *   · `conversaciones`: una charla. Directa (dos personas) o grupo (con
 *     nombre). Una directa entre dos personas es ÚNICA: `clave_directa`
 *     lleva los dos ids ordenados y tiene índice único, así que dos
 *     clics a la vez en «Escribir» no abren dos charlas con la misma
 *     persona.
 *
 *   · `participantes_de_conversacion`: quién está en cada una y hasta
 *     qué mensaje ha leído. «Sin leer» es todo lo que va después de
 *     `ultimo_leido_id`; no hay una fila por mensaje y persona.
 *
 *   · `mensajes_de_chat`: el id es un NÚMERO QUE CRECE, a diferencia del
 *     resto de tablas (UUID). No es un descuido: ordena los mensajes sin
 *     empates —dos en el mismo segundo no se pueden desordenar— y sirve
 *     de cursor para pedir «lo nuevo desde el 1532» sin saltarse ni
 *     repetir ninguno (la misma trampa que la regla 14 resuelve en el
 *     tablero con el desempate por id). Y deja «leído hasta el 1532»
 *     como un solo número.
 *
 *   · `marcas_en_mensajes`: las marcas etiquetadas en un mensaje, con su
 *     nombre COPIADO al escribirlo. Quien no puede ver la marca (un
 *     agente, si es de otra cartera) ve solo ese nombre, que es lo que
 *     quien escribió decidió contarle, y no el logo ni el enlace. Y si la
 *     marca se borra, el mensaje sigue diciendo de cuál se hablaba.
 *     Lo que decide quién ve qué no es esta tabla sino MarcaPolicy, que
 *     se consulta al servir cada mensaje a cada persona.
 *
 * Los mensajes llevan emoji: la base está en utf8mb4 (comprobado en
 * producción el 2026-09-18) y los emoji ocupan cuatro bytes.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversaciones', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            $tabla->string('tipo', 10); // directa | grupo
            $tabla->string('nombre', 80)->nullable(); // solo los grupos

            // «id-menor:id-mayor» en las directas; null en los grupos.
            $tabla->string('clave_directa', 80)->nullable()->unique();

            $tabla->foreignUuid('creada_por_id')->nullable()
                  ->constrained('users')->nullOnDelete();

            // Para ordenar la lista de charlas por la última que se movió
            // sin tener que buscar el mensaje más reciente de cada una.
            $tabla->unsignedBigInteger('ultimo_mensaje_id')->nullable();

            $tabla->timestamps();
        });

        Schema::create('participantes_de_conversacion', function (Blueprint $tabla) {
            $tabla->id();

            $tabla->foreignUuid('conversacion_id')
                  ->constrained('conversaciones')->cascadeOnDelete();

            // Si la cuenta se borra, deja de estar en sus charlas. Sus
            // mensajes se quedan, con el nombre copiado.
            $tabla->foreignUuid('usuario_id')
                  ->constrained('users')->cascadeOnDelete();

            $tabla->unsignedBigInteger('ultimo_leido_id')->default(0);

            $tabla->timestamps();

            $tabla->unique(['conversacion_id', 'usuario_id']);
            $tabla->index('usuario_id');
        });

        Schema::create('mensajes_de_chat', function (Blueprint $tabla) {
            $tabla->id();

            $tabla->foreignUuid('conversacion_id')
                  ->constrained('conversaciones')->cascadeOnDelete();

            $tabla->foreignUuid('autor_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            // Copiado, como en la bitácora: si la cuenta se borra o se
            // renombra, el mensaje sigue diciendo quién lo escribió.
            $tabla->string('autor_nombre', 120);

            // texto | sistema («Ana añadió a Pedro»). Los de sistema no
            // cuentan como sin leer.
            $tabla->string('tipo', 10)->default('texto');

            $tabla->text('cuerpo');

            $tabla->timestamps();

            $tabla->index(['conversacion_id', 'id']);
        });

        Schema::create('marcas_en_mensajes', function (Blueprint $tabla) {
            $tabla->id();

            $tabla->foreignId('mensaje_id')
                  ->constrained('mensajes_de_chat')->cascadeOnDelete();

            // Sin clave foránea, a propósito: el mismo id va escrito
            // dentro del texto del mensaje y es lo que une cada etiqueta
            // con su sitio. Si la marca se borra, el id se queda y el
            // mensaje sigue enseñando el nombre copiado.
            $tabla->uuid('marca_id');

            $tabla->string('nombre_marca', 160);

            $tabla->index('mensaje_id');
        });

        // La presencia: quién está ahora mismo con el panel delante y
        // cuándo se le vio por última vez. Dos columnas porque son dos
        // preguntas: «en línea» caduca sola si el navegador deja de
        // avisar (se cerró el portátil sin despedirse); «visto por última
        // vez» se queda para siempre.
        Schema::table('users', function (Blueprint $tabla) {
            $tabla->timestamp('en_linea_hasta')->nullable();
            $tabla->timestamp('visto_por_ultima_vez_en')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $tabla) {
            $tabla->dropColumn(['en_linea_hasta', 'visto_por_ultima_vez_en']);
        });

        Schema::dropIfExists('marcas_en_mensajes');
        Schema::dropIfExists('mensajes_de_chat');
        Schema::dropIfExists('participantes_de_conversacion');
        Schema::dropIfExists('conversaciones');
    }
};
