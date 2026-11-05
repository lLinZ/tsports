<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Notificacion — un aviso para una persona concreta.
 * ---------------------------------------------------------------------
 * Lo crea siempre `App\Support\Notificador`, que es quien decide a quién
 * le toca cada aviso y cómo se redacta. Este modelo solo lo guarda y
 * sabe a dónde lleva.
 *
 * No es el sistema de notificaciones de Laravel (`Notifiable`, tabla
 * `notifications`): aquel guarda el contenido en un JSON sin forma, y
 * aquí interesa poder filtrar por tipo y contar las no leídas con un
 * índice.
 */
class Notificacion extends Model
{
    use HasUuids;

    protected $table = 'notificaciones';

    /** Entró un lead por el formulario de la web. */
    public const TIPO_LEAD_NUEVO = 'lead_nuevo';

    /** Alguien te asignó una marca. */
    public const TIPO_MARCA_ASIGNADA = 'marca_asignada';

    /** Te etiquetaron en la bitácora de una marca. */
    public const TIPO_MENCION = 'mencion_en_bitacora';

    /** Alguien escribió en la bitácora de una marca (a los administradores y a su agente). */
    public const TIPO_COMENTARIO = 'comentario_en_bitacora';

    /** El aviso de la mañana: los recordatorios que te tocan hoy. */
    public const TIPO_RECORDATORIOS_DEL_DIA = 'recordatorios_del_dia';

    /*
     | Qué pasó con el aviso en cada canal (desde el 2026-11-05). Es el
     | registro de envíos de la pantalla «Avisos»: lo apuntan Notificador
     | al crearlo y EnviarAvisoPush al mandarlo. La campanita no tiene
     | columna: la fila es el aviso (regla 17).
     */

    /** Se empujó en vivo y la persona tenía el panel a la vista. */
    public const PANTALLA_AL_MOMENTO = 'al_momento';

    /** Se empujó en vivo, pero no tenía el panel a la vista. */
    public const PANTALLA_PANEL_CERRADO = 'panel_cerrado';

    /** El tiempo real está apagado: lo verá al entrar o en la consulta de cada minuto. */
    public const PANTALLA_SIN_TIEMPO_REAL = 'sin_tiempo_real';

    /** Reverb no contestó. */
    public const PANTALLA_FALLO = 'fallo';

    public const MOVIL_EN_COLA = 'en_cola';

    public const MOVIL_ENTREGADO = 'entregado';

    /** Ya lo había leído en el panel cuando le tocó salir: no hizo falta. */
    public const MOVIL_YA_LEIDO = 'ya_leido';

    public const MOVIL_SIN_DISPOSITIVO = 'sin_dispositivo';

    /** La persona quitó ese aviso del móvil en sus ajustes. */
    public const MOVIL_APAGADO_POR_LA_PERSONA = 'apagado_por_la_persona';

    /** Estaba en su horario de silencio. */
    public const MOVIL_SILENCIO = 'silencio';

    /** El servidor no tiene las claves de los avisos al móvil. */
    public const MOVIL_SIN_PUSH = 'sin_push';

    public const MOVIL_FALLO = 'fallo';

    protected $fillable = [
        'destinatario_id',
        'tipo',
        'titulo',
        'cuerpo',
        'entidad_tipo',
        'entidad_id',
        'leida_en',
        // Qué pasó con el aviso en cada canal (el registro de envíos).
        'con_sonido',
        'entrega_en_pantalla',
        'entrega_al_movil',
        'entrega_al_movil_detalle',
        'entrega_al_movil_en',
    ];

    protected function casts(): array
    {
        return [
            'leida_en' => 'datetime',
            'con_sonido' => 'boolean',
            'entrega_al_movil_en' => 'datetime',
        ];
    }

    public function destinatario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'destinatario_id');
    }

    /** @param  Builder<self>  $consulta */
    public function scopeDe(Builder $consulta, User $persona): void
    {
        $consulta->where('destinatario_id', $persona->id);
    }

    /** @param  Builder<self>  $consulta */
    public function scopeSinLeer(Builder $consulta): void
    {
        $consulta->whereNull('leida_en');
    }

    public function estaLeida(): bool
    {
        return $this->leida_en !== null;
    }

    /**
     * La dirección del panel a la que lleva el aviso, o null si no lleva
     * a ningún sitio.
     *
     * Se resuelve aquí y no en la interfaz: la interfaz no compone rutas a
     * mano, y así cambiar cómo se abre una ficha es tocar una línea.
     * `/marcas?abrir=<id>` es la misma entrada que ya usa el calendario.
     */
    public function enlaceEnElPanel(): ?string
    {
        // Varios recordatorios de marcas distintas: al panel, donde salen
        // juntos en «Para hoy». Con uno solo, el aviso va a su marca.
        if ($this->entidad_tipo === 'recordatorios') {
            return '/panel';
        }

        if ($this->entidad_id === null) {
            return null;
        }

        return match ($this->entidad_tipo) {
            'marca' => '/marcas?abrir='.$this->entidad_id,
            default => null,
        };
    }
}
