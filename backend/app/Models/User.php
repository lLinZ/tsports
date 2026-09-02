<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\RolUsuario;
use App\Enums\TemaInterfaz;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * User — persona que entra al CRM.
 * ---------------------------------------------------------------------
 * Reúne en un solo modelo lo que en Supabase estaba partido entre
 * `auth.users` (credenciales) y `profiles` (rol, zona, nombre). Además
 * guarda las preferencias visuales, que ahora viajan con la cuenta y no
 * con el navegador.
 *
 * Las preguntas de permisos se delegan siempre en el enum RolUsuario,
 * de modo que las reglas de negocio vivan en un único sitio.
 *
 * @property string $id
 * @property RolUsuario $rol
 * @property TemaInterfaz $tema
 */
class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    /**
     * Campos que se pueden asignar en masa. La contraseña entra aquí
     * porque el mutador la cifra sola (ver $casts), nunca se guarda en
     * claro.
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'rol',
        'zona',
        'tema',
        'color_acento',
        'url_avatar',
        'activo',
    ];

    /** Nunca se serializan hacia el cliente. */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'ultimo_acceso_at' => 'datetime',
            'password' => 'hashed',
            'rol' => RolUsuario::class,
            'tema' => TemaInterfaz::class,
            'activo' => 'boolean',
        ];
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    /** Marcas que esta persona dio de alta en el CRM. */
    public function marcasRegistradas(): HasMany
    {
        return $this->hasMany(Marca::class, 'registrada_por_id');
    }

    /** Marcas que esta persona tiene asignadas para trabajar. */
    public function marcasAsignadas(): HasMany
    {
        return $this->hasMany(Marca::class, 'vendedor_asignado_id');
    }

    /** Comentarios que ha escrito en las fichas de las marcas. */
    public function comentarios(): HasMany
    {
        return $this->hasMany(ComentarioMarca::class, 'autor_id');
    }

    /**
     * Propiedades (productos IOP) que esta persona tiene asignadas en
     * exclusiva. No incluye las que están abiertas a todo el equipo: para
     * saber si alguien puede ofrecer una propiedad se pregunta siempre a
     * `Propiedad::laPuedeOfrecer()`, que contempla los dos casos.
     */
    public function propiedadesAsignadas(): BelongsToMany
    {
        return $this->belongsToMany(
            Propiedad::class,
            'prospectores_de_propiedad',
            'usuario_id',
            'propiedad_id',
        );
    }

    /* ------------------------------------------------------------------
     | Atajos de permisos
     |-----------------------------------------------------------------*/

    public function esAdministrador(): bool
    {
        return $this->rol === RolUsuario::Admin;
    }

    public function esComercial(): bool
    {
        return $this->rol === RolUsuario::Comercial;
    }

    public function esVendedor(): bool
    {
        return $this->rol === RolUsuario::Vendedor;
    }

    /**
     * Nombre para mostrar. Si alguien se registró sin nombre, se usa la
     * parte del correo anterior a la arroba antes que dejar un hueco.
     */
    public function nombreParaMostrar(): string
    {
        $nombreGuardado = trim((string) $this->name);

        if ($nombreGuardado !== '') {
            return $nombreGuardado;
        }

        return (string) strstr($this->email, '@', true) ?: $this->email;
    }

    /**
     * ¿Puede editar esta marca concreta?
     * Admin y comercial pueden con todas; el vendedor solo con las que
     * tiene asignadas. Además, cualquiera puede trabajar una marca que
     * llegó por la web y todavía no tiene dueño (la "adopta").
     */
    public function puedeEditarLaMarca(Marca $marca): bool
    {
        if ($this->rol->puedeEditarCualquierMarca()) {
            return true;
        }

        if ($marca->vendedor_asignado_id === $this->id) {
            return true;
        }

        return $marca->estaSinDuenio();
    }
}
