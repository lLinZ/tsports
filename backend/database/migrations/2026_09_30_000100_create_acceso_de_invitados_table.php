<?php

/**
 * Migración: el acceso de invitados al catálogo de la web.
 * ---------------------------------------------------------------------
 * El catálogo de propiedades de la web pública ya no lo ve cualquiera:
 * se entra con UN usuario y UNA contraseña genéricos, que la agencia le
 * pasa a quien quiera enseñárselo. Esta tabla guarda esa pareja, y solo
 * tiene una fila.
 *
 * Va aparte de `users` a propósito. Un invitado en `users` sería una
 * cuenta más del equipo: saldría en el chat, en los selectores de
 * agente, en las menciones y en la pantalla de Equipo, y con su token
 * de Sanctum llamaría a las rutas del panel. Aquí no es nadie: solo
 * abre el catálogo.
 *
 *   · `contrasena` va CIFRADA con la APP_KEY, no con hash. Es una clave
 *     que se comparte con clientes, no la de una persona: quien gestiona
 *     el catálogo tiene que poder leerla para mandársela a otro cliente
 *     sin tener que cambiarla (y dejar fuera a todos los demás).
 *   · `version` sube cada vez que cambia la pareja. Va dentro de la llave
 *     que recibe el navegador del invitado al entrar, y una llave de otra
 *     versión ya no abre nada: cambiar la contraseña echa a todos.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('acceso_de_invitados', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->string('usuario', 60);
            $tabla->text('contrasena');
            $tabla->unsignedInteger('version')->default(1);
            $tabla->foreignUuid('cambiado_por_id')->nullable()->constrained('users')->nullOnDelete();
            $tabla->string('cambiado_por_nombre')->nullable();
            $tabla->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('acceso_de_invitados');
    }
};
