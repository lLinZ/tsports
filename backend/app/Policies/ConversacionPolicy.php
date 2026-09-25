<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\Conversacion;
use App\Models\User;

/**
 * ConversacionPolicy — quién puede qué en el chat.
 * ---------------------------------------------------------------------
 * Una sola regla, dicha de tres formas: LO DE UNA CHARLA ES DE QUIEN
 * ESTÁ DENTRO.
 *
 *   · LEER y ESCRIBIR → los participantes. Ni un administrador lee las
 *     charlas de otros, igual que no lee sus avisos: el chat es entre
 *     personas, y un chat que el jefe puede leer por detrás no lo usa
 *     nadie para lo que de verdad importa.
 *   · CAMBIAR UN GRUPO (nombre, quién está) → cualquiera de dentro. El
 *     equipo son once personas; un grupo con «dueño» obligaría a
 *     buscarlo para añadir a alguien. Cada cambio deja una línea en la
 *     charla, así que se sabe quién lo hizo.
 *   · Una charla DIRECTA no se cambia: es de dos, y siempre de esos dos.
 *
 * Una cuenta desactivada no puede nada, aunque siga dentro.
 */
class ConversacionPolicy
{
    public function view(User $usuario, Conversacion $conversacion): bool
    {
        return $usuario->activo && $conversacion->tieneDentroA($usuario);
    }

    public function escribir(User $usuario, Conversacion $conversacion): bool
    {
        return $this->view($usuario, $conversacion);
    }

    public function cambiarElGrupo(User $usuario, Conversacion $conversacion): bool
    {
        return $conversacion->esGrupo() && $this->view($usuario, $conversacion);
    }
}
