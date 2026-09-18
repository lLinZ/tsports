<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Notificacion;
use App\Models\User;

/**
 * NotificacionPolicy — de quién es cada aviso.
 * ---------------------------------------------------------------------
 * Una sola regla, sin excepciones: cada quien ve y marca SUS avisos. Ni
 * un administrador lee los de otro, porque un aviso de «te asignaron
 * tal marca» es correspondencia de esa persona, no un registro de
 * auditoría (para eso está la auditoría).
 *
 * El listado ya viene cortado por destinatario desde el controlador;
 * esta política es la que protege las rutas que reciben un id concreto,
 * donde alguien podría escribir el de un aviso ajeno. Ahí la respuesta
 * es un 403 explícito, no un «correcto» que no hizo nada.
 */
class NotificacionPolicy
{
    public function update(User $usuario, Notificacion $notificacion): bool
    {
        return $notificacion->destinatario_id === $usuario->id;
    }
}
