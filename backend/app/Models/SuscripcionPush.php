<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * SuscripcionPush — un navegador al que se le pueden empujar avisos.
 * ---------------------------------------------------------------------
 * La crea el propio navegador al aceptar los avisos y la guarda
 * `SuscripcionPushController`. Aquí no se decide nada: quién recibe qué
 * lo sigue decidiendo `App\Support\Notificador`, igual que con la
 * campanita, y esto es solo la libreta de direcciones.
 *
 * No tiene política propia. La regla es una sola y la aplica el
 * controlador: cada quien registra y borra SUS dispositivos, y nunca los
 * de otro. Como el endpoint es único, registrar el de este navegador
 * cuando ya estaba a nombre de otra persona lo REASIGNA — que es lo
 * correcto, porque el dispositivo ahora lo usa quien acaba de entrar.
 */
class SuscripcionPush extends Model
{
    use HasUuids;

    protected $table = 'suscripciones_push';

    protected $fillable = [
        'usuario_id',
        'endpoint',
        'clave_p256dh',
        'clave_auth',
        'dispositivo',
    ];

    /**
     * Las claves del navegador no salen de aquí en ninguna respuesta.
     *
     * Solo sirven para cifrar el contenido del aviso y no valen fuera de
     * su endpoint, pero tampoco hay ningún motivo para enseñarlas.
     */
    protected $hidden = [
        'clave_p256dh',
        'clave_auth',
    ];

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
