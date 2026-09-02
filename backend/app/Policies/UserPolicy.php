<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\User;

/**
 * UserPolicy — quién puede gestionar cuentas.
 * ---------------------------------------------------------------------
 * Traduce las reglas que antes estaban repartidas entre las políticas de
 * `profiles` y la Edge Function `update-user` de Supabase.
 *
 * La regla clave, y la razón por la que este fichero existe, es evitar
 * la escalada de privilegios: cualquiera puede editar sus propios datos
 * (nombre, correo, contraseña, tema y color), pero SOLO un administrador
 * puede tocar el rol y la zona, que son lo que determina qué ve y qué
 * puede cambiar cada persona.
 */
class UserPolicy
{
    /** Ver la lista de usuarios del sistema. */
    public function viewAny(User $usuario): bool
    {
        // Admin y comercial necesitan la lista para asignar vendedores.
        return $usuario->activo && $usuario->rol->puedeAsignarVendedores();
    }

    /** Ver la ficha de un usuario concreto. */
    public function view(User $usuario, User $usuarioObjetivo): bool
    {
        return $usuario->esAdministrador() || $usuario->id === $usuarioObjetivo->id;
    }

    /** Crear cuentas nuevas. */
    public function create(User $usuario): bool
    {
        return $usuario->activo && $usuario->esAdministrador();
    }

    /**
     * Editar una cuenta desde la pantalla de Equipo: solo un administrador.
     *
     * Editarse a uno mismo NO pasa por aquí: tiene su propia ruta
     * (/api/mi-perfil), que expone únicamente los campos inocuos
     * (nombre, correo, avatar, tema y color).
     *
     * Separarlo así es defensa en profundidad. Si ambos caminos
     * compartieran esta política, cualquier campo que se añadiera en el
     * futuro al formulario de administración quedaría automáticamente al
     * alcance de todo el mundo "para su propia cuenta", y esa es
     * exactamente la clase de descuido con la que se cuelan las
     * escaladas de privilegios.
     */
    public function update(User $usuario, User $usuarioObjetivo): bool
    {
        unset($usuarioObjetivo); // El permiso depende solo de quién pregunta.

        return $usuario->activo && $usuario->esAdministrador();
    }

    /**
     * Cambiar rol y zona: solo un administrador, y nunca sobre sí mismo.
     *
     * Lo segundo es deliberado: si el único administrador se rebajase a
     * comercial por error, nadie podría volver a promover a nadie y
     * habría que arreglarlo a mano en la base de datos.
     */
    public function cambiarRolYZona(User $usuario, User $usuarioObjetivo): bool
    {
        return $usuario->activo
            && $usuario->esAdministrador()
            && $usuario->id !== $usuarioObjetivo->id;
    }

    /** Dar de baja una cuenta. Un administrador no puede borrarse solo. */
    public function delete(User $usuario, User $usuarioObjetivo): bool
    {
        return $usuario->activo
            && $usuario->esAdministrador()
            && $usuario->id !== $usuarioObjetivo->id;
    }

    /** Editar el contenido de la web pública. */
    public function administrarContenidoWeb(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->puedeEditarLaWeb();
    }

    /** Consultar el registro de auditoría del sistema. */
    public function verAuditoria(User $usuario): bool
    {
        return $usuario->activo && $usuario->esAdministrador();
    }
}
