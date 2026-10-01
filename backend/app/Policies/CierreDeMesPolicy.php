<?php

declare(strict_types=1);

namespace App\Policies;

use App\Models\CierreDeMes;
use App\Models\User;

/**
 * CierreDeMesPolicy — quién ve y quién sube los reportes de cierre de mes.
 * ---------------------------------------------------------------------
 *   · VER y SUBIR → admin y comercial (`RolUsuario::veLosCierresDeMes`).
 *                   El agente no: el reporte habla de toda la agencia.
 *   · BORRAR      → quien lo subió, y el administrador. Un comercial no
 *                   borra el reporte de otro: es su trabajo del mes.
 */
class CierreDeMesPolicy
{
    public function viewAny(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->veLosCierresDeMes();
    }

    public function create(User $usuario): bool
    {
        return $usuario->activo && $usuario->rol->veLosCierresDeMes();
    }

    public function delete(User $usuario, CierreDeMes $cierre): bool
    {
        if (! $usuario->activo || ! $usuario->rol->veLosCierresDeMes()) {
            return false;
        }

        return $usuario->esAdministrador() || $cierre->subido_por_id === $usuario->id;
    }
}
