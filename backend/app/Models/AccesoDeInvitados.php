<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Database\Eloquent\Model;

/**
 * AccesoDeInvitados — el usuario y la contraseña del catálogo de la web.
 * ---------------------------------------------------------------------
 * Una sola fila: la pareja genérica con la que un cliente abre el
 * catálogo de propiedades de la web pública. Por qué no es una cuenta
 * de `users`, y por qué la contraseña va cifrada y no con hash, está en
 * su migración.
 *
 * Lo que abre el catálogo no es esta pareja, sino la llave que se da al
 * entrar con ella (App\Support\LlaveDelCatalogo).
 *
 * @property int $id
 * @property string $usuario
 * @property int $version
 */
class AccesoDeInvitados extends Model
{
    protected $table = 'acceso_de_invitados';

    protected $fillable = [
        'usuario',
        'contrasena',
        'version',
        'cambiado_por_id',
        'cambiado_por_nombre',
    ];

    protected $hidden = [
        'contrasena',
    ];

    protected function casts(): array
    {
        return [
            'contrasena' => 'encrypted',
            'version' => 'integer',
        ];
    }

    /** El acceso en uso, o nulo si nadie lo ha configurado todavía. */
    public static function elVigente(): ?self
    {
        return self::query()->oldest('id')->first();
    }

    /**
     * La contraseña en claro, o nulo si no se puede leer.
     *
     * Solo deja de poderse leer si alguien cambió la APP_KEY del servidor.
     * En ese caso el acceso deja de funcionar hasta que se ponga otra
     * contraseña desde el panel, en vez de tumbar la página con un 500.
     */
    public function contrasenaEnClaro(): ?string
    {
        try {
            return $this->contrasena;
        } catch (DecryptException) {
            return null;
        }
    }

    /**
     * ¿Abre el catálogo esta pareja?
     *
     * El usuario no distingue mayúsculas: «Invitado» e «invitado» son el
     * mismo para quien lo copia de un mensaje. La contraseña sí.
     */
    public function aceptaA(string $usuario, string $contrasena): bool
    {
        $laGuardada = $this->contrasenaEnClaro();

        if ($laGuardada === null) {
            return false;
        }

        $elUsuarioCoincide = hash_equals(mb_strtolower($this->usuario), mb_strtolower(trim($usuario)));

        return $elUsuarioCoincide && hash_equals($laGuardada, $contrasena);
    }
}
