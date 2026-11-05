<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * AjusteDeAviso — lo que el administrador decidió de UN aviso.
 * ---------------------------------------------------------------------
 * Si sale (`activo`) y, en los avisos de grupo, a qué destinatarios
 * (`destinatarios`). Una fila por tipo, y solo existe si alguien lo tocó:
 * sin fila, el aviso va como venía de fábrica. Cómo se lee todo esto lo
 * decide App\Support\AjustesDeAvisos; aquí no hay reglas.
 *
 * @property string $tipo
 * @property bool $activo
 * @property array<string, bool>|null $destinatarios
 */
class AjusteDeAviso extends Model
{
    protected $table = 'ajustes_de_avisos';

    protected $primaryKey = 'tipo';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tipo',
        'activo',
        'destinatarios',
        'cambiado_por_nombre',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'destinatarios' => 'array',
        ];
    }
}
