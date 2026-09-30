<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\AccesoDeInvitados;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

/**
 * LlaveDelCatalogo — lo que abre el catálogo de la web a un invitado.
 * ---------------------------------------------------------------------
 * Quien entra con el usuario y la contraseña de invitado recibe una
 * llave, y con ella pide el catálogo. La contraseña no se guarda en su
 * navegador: la llave caduca sola y no sirve para nada más.
 *
 * NO ES UN TOKEN DE SANCTUM, y no por comodidad. Cualquier token de
 * Sanctum pasa el `auth:sanctum` de las rutas del panel; esta llave no
 * pasa ninguno. Tampoco deja filas: es un texto cifrado con la APP_KEY
 * que dice de qué acceso y de qué versión es, y hasta cuándo vale.
 *
 *   · Cambiar la contraseña sube la versión del acceso, y todas las
 *     llaves de antes dejan de abrir. Es la forma de echar a quien ya no
 *     tiene que ver el catálogo.
 *   · Viaja en una cabecera propia (X-Llave-Del-Catalogo), no en
 *     Authorization: allí va el token del panel, que la misma persona
 *     puede tener abierto en otra pestaña.
 */
final class LlaveDelCatalogo
{
    public const CABECERA = 'X-Llave-Del-Catalogo';

    /** Un mes: lo que dura una conversación comercial sin pedir la clave otra vez. */
    public const DIAS_DE_VALIDEZ = 30;

    /**
     * @return array{llave: string, caducaEn: CarbonImmutable}
     */
    public static function emitir(AccesoDeInvitados $acceso): array
    {
        $caducaEn = CarbonImmutable::now()->addDays(self::DIAS_DE_VALIDEZ);

        $llave = Crypt::encryptString((string) json_encode([
            'acceso' => $acceso->id,
            'version' => $acceso->version,
            'hasta' => $caducaEn->getTimestamp(),
        ]));

        return ['llave' => $llave, 'caducaEn' => $caducaEn];
    }

    public static function abre(?string $llave): bool
    {
        if ($llave === null || $llave === '') {
            return false;
        }

        $acceso = AccesoDeInvitados::elVigente();

        if ($acceso === null) {
            return false;
        }

        try {
            $contenido = json_decode(Crypt::decryptString($llave), true);
        } catch (DecryptException) {
            return false;
        }

        if (! is_array($contenido)) {
            return false;
        }

        return ($contenido['acceso'] ?? null) === $acceso->id
            && ($contenido['version'] ?? null) === $acceso->version
            && (int) ($contenido['hasta'] ?? 0) > CarbonImmutable::now()->getTimestamp();
    }
}
