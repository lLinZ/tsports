<?php

declare(strict_types=1);

/**
 * routes/channels.php — quién puede escuchar qué canal privado de Reverb.
 * ---------------------------------------------------------------------
 * Hoy solo hay un canal: el buzón privado de cada persona. Por él llega
 * ya el aviso de `php artisan tiempo-real:probar`, y llegarán las
 * notificaciones cuando exista la Etapa 1 (tabla `notificaciones`). Se
 * autoriza por ID, nunca por nombre — la misma regla que ya sigue
 * User::laMarcaEsSuya(): el nombre se repite entre personas y se puede
 * editar, así que no sirve para dar acceso.
 *
 * La autorización de este canal NO cuelga de la ruta que registra
 * Laravel por defecto (/broadcasting/auth, bajo el grupo `web` con
 * cookie de sesión): este proyecto solo usa tokens Bearer de Sanctum,
 * así que la ruta es /api/broadcasting/auth, con `auth:sanctum`, y se
 * declara al cargar este fichero en bootstrap/app.php
 * (`withBroadcasting`).
 */

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('usuario.{idDeUsuario}', function (User $usuario, string $idDeUsuario): bool {
    return $usuario->id === $idDeUsuario;
});
