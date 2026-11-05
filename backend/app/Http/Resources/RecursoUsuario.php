<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Marca;
use App\Models\PreferenciaDeAviso;
use App\Models\User;
use App\Support\AjustesDeAvisos;
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
                'veTodasLasMarcas' => $this->rol->veTodasLasMarcas(),
                'veLasCifrasDeTodaLaEmpresa' => $this->rol->veLasCifrasDeTodaLaEmpresa(),
                // Sacar la bitácora de TODAS las marcas (el histórico o un
                // reporte sin marcas elegidas). Pregunta a la misma política
                // que lo comprueba al pedirlo, para que no puedan discrepar.
                'sacaLaBitacoraCompleta' => $this->resource->can('verAuditoria', User::class),
                'veLosCierresDeMes' => $this->rol->veLosCierresDeMes(),
                'veLosReportes' => $this->resource->can('verReportes', User::class),
                'veElMovimientoDeLasPropiedades' => $this->resource->can('verMovimientoDeLasPropiedades', User::class),
                'configuraLosAvisos' => $this->resource->can('configurarAvisos', User::class),
                'ajustaLosUmbralesDelEstado' => $this->resource->can('ajustarUmbralesDelEstado', Marca::class),
                'fijaLasMetas' => $this->resource->can('fijarMetas', User::class),
            ],

            // Lo que el panel necesita saber de sus propios avisos sin
            // pedirlo aparte: si el chat le hace «pop». Solo de uno mismo.
            'avisos' => $this->when(
                $usuarioQueConsulta !== null && $usuarioQueConsulta->id === $this->id,
                fn (): array => [
                    'sonidoDelChat' => AjustesDeAvisos::vigentes()->estaActivo(AjustesDeAvisos::CHAT)
                        && (bool) (PreferenciaDeAviso::query()
                            ->where('usuario_id', $this->id)
                            ->where('tipo', AjustesDeAvisos::CHAT)
                            ->value('con_sonido') ?? true),
                ],
            ),
            'creadoEn' => $this->created_at?->toIso8601String(),
            'ultimoAccesoEn' => $this->ultimo_acceso_at?->toIso8601String(),
        ];
    }
}
