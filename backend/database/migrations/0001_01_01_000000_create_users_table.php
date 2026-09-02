<?php

/**
 * Migración: usuarios, recuperación de contraseña y sesiones.
 * ---------------------------------------------------------------------
 * Sustituye a la tabla `auth.users` + `profiles` que había en Supabase:
 * ahora las credenciales y el perfil viven juntos en una sola tabla.
 *
 * La clave primaria es un UUID (no un entero autoincremental) para poder
 * importar tal cual los identificadores que ya existen en Supabase sin
 * tener que reescribir las referencias de las marcas y los comentarios.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // --- Identidad ---
            $tabla->string('name');
            $tabla->string('email')->unique();
            $tabla->timestamp('email_verified_at')->nullable();
            $tabla->string('password');

            // --- Rol y ámbito de trabajo -------------------------------
            // admin     : lo ve y lo edita todo, gestiona usuarios y web.
            // comercial : gestiona todas las marcas y asigna vendedores.
            // vendedor  : ve todas las marcas pero solo edita las suyas.
            $tabla->enum('rol', ['admin', 'comercial', 'vendedor'])->default('comercial');

            // Zona geográfica del prospector; las marcas la heredan.
            $tabla->string('zona')->nullable();

            // --- Preferencias visuales, persistentes por usuario -------
            // Se guardan en el servidor para que el tema siga al usuario
            // aunque cambie de navegador o de ordenador.
            $tabla->enum('tema', ['claro', 'oscuro', 'sistema'])->default('sistema');
            $tabla->string('color_acento', 7)->default('#1b9aaa');
            $tabla->string('url_avatar')->nullable();

            // Un usuario desactivado conserva su historial pero no entra.
            $tabla->boolean('activo')->default(true);
            $tabla->timestamp('ultimo_acceso_at')->nullable();

            $tabla->rememberToken();
            $tabla->timestamps();

            $tabla->index('rol');
            $tabla->index('zona');
        });

        Schema::create('password_reset_tokens', function (Blueprint $tabla) {
            $tabla->string('email')->primary();
            $tabla->string('token');
            $tabla->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $tabla) {
            $tabla->string('id')->primary();
            $tabla->foreignUuid('user_id')->nullable()->index();
            $tabla->string('ip_address', 45)->nullable();
            $tabla->text('user_agent')->nullable();
            $tabla->longText('payload');
            $tabla->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};
