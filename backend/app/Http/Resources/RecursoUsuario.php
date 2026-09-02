<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * RecursoUsuario — cómo se ve un usuario desde el frontend.
 * ---------------------------------------------------------------------
 * Traduce el modelo a un objeto JSON en camelCase, que es la convención
 * del código TypeScript del cliente. Que la traducción viva aquí y no en
 * el frontend evita que cada pantalla invente su propio nombre para el
 * mismo campo.
 *
 * El correo solo se incluye para quien tiene derecho a verlo: uno mismo,
 * o alguien que gestiona equipo (admin y comercial). Así el listado de
 * vendedores que se usa para asignar marcas no filtra correos a quien no
 * los necesita.
 *
 * @mixin User
 */
class RecursoUsuario extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $peticion): array
    {
        $usuarioQueConsulta = $peticion->user();

        $puedeVerElCorreo = $usuarioQueConsulta !== null
            && ($usuarioQueConsulta->id === $this->id || $usuarioQueConsulta->rol->puedeAsignarVendedores());

        return [
            'id' => $this->id,
            'nombre' => $this->nombreParaMostrar(),
            'email' => $this->when($puedeVerElCorreo, fn (): string => $this->email),

            'rol' => $this->rol->value,
            'rolEtiqueta' => $this->rol->etiqueta(),
            'zona' => $this->zona,
            'activo' => $this->activo,

            // Preferencias visuales; el frontend las aplica al arrancar.
            'tema' => $this->tema->value,
            'colorAcento' => $this->color_acento,
            'urlAvatar' => $this->url_avatar,

            // Capacidades ya resueltas: la interfaz esconde o muestra
            // botones preguntando por estas banderas y no por el rol, así
            // las reglas viven en un solo sitio (el enum RolUsuario).
            'permisos' => [
                'administraElSistema' => $this->rol->puedeAdministrarElSistema(),
                'editaCualquierMarca' => $this->rol->puedeEditarCualquierMarca(),
                'asignaVendedores' => $this->rol->puedeAsignarVendedores(),
                'eliminaMarcas' => $this->rol->puedeEliminarMarcas(),
                'editaLaWeb' => $this->rol->puedeEditarLaWeb(),
                'gestionaElCatalogoComercial' => $this->rol->puedeGestionarElCatalogoComercial(),
            ],

            'creadoEn' => $this->created_at?->toIso8601String(),
            'ultimoAccesoEn' => $this->ultimo_acceso_at?->toIso8601String(),
        ];
    }
}
