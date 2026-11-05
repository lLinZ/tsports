<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * PreferenciaDeAviso — lo que una persona eligió para UN tipo de aviso.
 * ---------------------------------------------------------------------
 * Si le suena el móvil (`al_movil`) y si suena con el panel abierto
 * (`con_sonido`). La campanita no está aquí porque no se apaga: es donde
 * queda guardado el aviso (regla 17). Sin fila, las dos van encendidas.
 *
 * Cada quien toca solo las suyas (MisAvisosController); ni un
 * administrador las de otro, igual que no lee sus avisos.
 *
 * @property string $usuario_id
 * @property string $tipo
 * @property bool $al_movil
 * @property bool $con_sonido
 */
class PreferenciaDeAviso extends Model
{
    use HasUuids;

    protected $table = 'preferencias_de_avisos';

    protected $fillable = [
        'usuario_id',
        'tipo',
        'al_movil',
        'con_sonido',
    ];

    protected function casts(): array
    {
        return [
            'al_movil' => 'boolean',
            'con_sonido' => 'boolean',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
