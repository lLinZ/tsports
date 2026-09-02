<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Request;

/**
 * RegistroActividad — la auditoría del sistema.
 * ---------------------------------------------------------------------
 * No existía en la versión de Supabase y es una de las mejoras de esta:
 * deja rastro de quién creó, editó o borró cada marca, quién cambió el
 * rol de quién y quién publicó cambios en la web.
 *
 * Con varias personas trabajando sobre las mismas marcas, poder
 * responder "¿quién movió esto y cuándo?" evita discusiones y permite
 * deshacer errores con conocimiento de causa.
 *
 * La forma normal de escribir aquí es el método estático `anotar()`,
 * que rellena solo el usuario, su nombre y la IP.
 */
class RegistroActividad extends Model
{
    protected $table = 'registros_actividad';

    /** Verbos admitidos, para que el listado se pueda filtrar por acción. */
    public const ACCION_CREO = 'creo';
    public const ACCION_ACTUALIZO = 'actualizo';
    public const ACCION_ELIMINO = 'elimino';
    public const ACCION_COMENTO = 'comento';
    public const ACCION_INICIO_SESION = 'inicio_sesion';
    public const ACCION_PUBLICO_WEB = 'publico_web';

    protected $fillable = [
        'usuario_id',
        'usuario_nombre',
        'accion',
        'entidad_tipo',
        'entidad_id',
        'descripcion',
        'metadatos',
        'direccion_ip',
    ];

    protected function casts(): array
    {
        return [
            'metadatos' => 'array',
        ];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /**
     * Deja constancia de algo que acaba de ocurrir.
     *
     * @param  array<string,mixed>  $metadatos  Detalle del cambio (antes/después).
     */
    public static function anotar(
        ?User $usuarioQueActua,
        string $accion,
        string $entidadTipo,
        ?string $entidadId,
        string $descripcion,
        array $metadatos = [],
    ): self {
        return self::create([
            'usuario_id' => $usuarioQueActua?->id,
            'usuario_nombre' => $usuarioQueActua?->nombreParaMostrar(),
            'accion' => $accion,
            'entidad_tipo' => $entidadTipo,
            'entidad_id' => $entidadId,
            'descripcion' => $descripcion,
            'metadatos' => $metadatos === [] ? null : $metadatos,
            'direccion_ip' => Request::ip(),
        ]);
    }
}
