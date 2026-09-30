<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * ArchivoMedia — inventario de los ficheros subidos al servidor.
 * ---------------------------------------------------------------------
 * Sustituye al bucket "media" de Supabase Storage. Esta tabla lleva la
 * cuenta de qué hay, para qué se subió, quién lo hizo y en qué disco
 * vive. La subida en sí la hace App\Support\GuardadoDeArchivos, que es
 * donde están las reglas de qué se admite.
 *
 * DOS DISCOS, Y NO ES UN DETALLE
 *
 *   · Público (storage/app/public): logos, imágenes de la web, avatares
 *     y la galería de las propiedades. Los sirve nginx directamente y la
 *     URL es fija, porque están hechos para enseñarse.
 *   · Privado (storage/app/private): los adjuntos de la bitácora. Son de
 *     una marca, y una marca no la ve todo el equipo (regla 6). No tienen
 *     URL pública: se sirven con un enlace firmado que caduca y que solo
 *     recibe quien puede ver la marca (ver AdjuntoController).
 *
 * Guardar solo la ruta relativa y calcular la URL al vuelo permite
 * cambiar de dominio, pasar a HTTPS o mover el sitio a un CDN sin tener
 * que reescribir ninguna fila.
 */
class ArchivoMedia extends Model
{
    use HasUuids;

    protected $table = 'archivos_media';

    /** Para qué se subió cada fichero. Decide en qué disco vive y qué se admite. */
    public const PROPOSITO_LOGO_MARCA = 'logo_marca';
    public const PROPOSITO_CONTENIDO_WEB = 'contenido_web';
    public const PROPOSITO_AVATAR = 'avatar';
    public const PROPOSITO_GALERIA_PROPIEDAD = 'galeria_propiedad';
    public const PROPOSITO_ADJUNTO_COMENTARIO = 'adjunto_comentario';

    public const DISCO_PUBLICO = 'public';
    public const DISCO_PRIVADO = 'local';

    /**
     * Cuánto espera un adjunto subido a que se publique su entrada. Pasado
     * ese tiempo se da por abandonado (se quitó de la caja antes de enviar,
     * se cerró la ficha) y se borra. Ver `eliminarAdjuntosAbandonados()`.
     */
    private const HORAS_DE_GRACIA_DE_UN_ADJUNTO_SIN_ENTRADA = 48;

    protected $fillable = [
        'ruta_relativa',
        'disco',
        'ruta_miniatura',
        'nombre_original',
        'tipo_mime',
        'tamano_bytes',
        'proposito',
        'subido_por_id',
    ];

    protected function casts(): array
    {
        return [
            'tamano_bytes' => 'integer',
        ];
    }

    /**
     * Los campos calculados viajan siempre al cliente: la interfaz nunca
     * debería componer una URL a mano.
     */
    protected $appends = ['url_publica'];

    /* ================================================================ */
    /* Relaciones                                                       */
    /* ================================================================ */

    public function subidoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subido_por_id');
    }

    /**
     * La entrada de la bitácora que lo lleva adjunto, si es un adjunto.
     * Es una relación de muchos a muchos solo por la forma de la tabla
     * puente: un fichero es de una entrada como mucho.
     *
     * @return BelongsToMany<ComentarioMarca,self>
     */
    public function comentarios(): BelongsToMany
    {
        return $this->belongsToMany(ComentarioMarca::class, 'adjuntos_de_comentario', 'archivo_media_id', 'comentario_id');
    }

    /** Su sitio en la galería de una propiedad, si es de una galería. */
    public function enLaGaleria(): HasOne
    {
        return $this->hasOne(ArchivoDePropiedad::class, 'archivo_media_id');
    }

    /* ================================================================ */
    /* Qué es                                                           */
    /* ================================================================ */

    public function esImagen(): bool
    {
        return str_starts_with($this->tipo_mime, 'image/');
    }

    /**
     * «imagen» o «documento». Es lo único que la interfaz necesita saber
     * para decidir si lo pinta o le pone un icono.
     */
    public function tipo(): string
    {
        return $this->esImagen() ? 'imagen' : 'documento';
    }

    public function esPrivado(): bool
    {
        return $this->disco === self::DISCO_PRIVADO;
    }

    /* ================================================================ */
    /* Direcciones                                                      */
    /* ================================================================ */

    /**
     * URL absoluta desde la que el navegador puede pedir el fichero.
     *
     * Null para lo privado: un adjunto de la bitácora no tiene dirección
     * pública, y devolver una que no funciona sería peor que no devolver
     * nada. Para esos está `enlaceFirmado()`.
     */
    public function getUrlPublicaAttribute(): ?string
    {
        if ($this->esPrivado()) {
            return null;
        }

        return Storage::disk($this->disco)->url($this->ruta_relativa);
    }

    /** La versión pequeña, si el navegador pudo hacerla al subir. */
    public function urlDeLaMiniatura(): ?string
    {
        if ($this->esPrivado() || $this->ruta_miniatura === null) {
            return null;
        }

        return Storage::disk($this->disco)->url($this->ruta_miniatura);
    }

    /**
     * Enlace temporal a un fichero privado.
     *
     * Solo lo genera el servidor, y solo dentro de una respuesta a quien
     * ya puede ver lo que el fichero acompaña. Con eso basta: el enlace
     * no necesita sesión (una etiqueta <img> no manda el token) y la
     * firma impide fabricarlo o alargarlo.
     *
     * CADUCA A DÍA FIJO, no a tantas horas de pedirlo: todos los enlaces
     * que se generan en un mismo día son idénticos, así que el navegador
     * puede reutilizar lo que ya descargó en vez de bajarlo otra vez cada
     * vez que se abre la ficha. Duran entre 24 y 48 horas.
     *
     * @param  'original'|'miniatura'|'descarga'  $variante
     */
    public function enlaceFirmado(string $variante = 'original'): ?string
    {
        if (! $this->esPrivado()) {
            return null;
        }

        if ($variante === 'miniatura' && $this->ruta_miniatura === null) {
            return null;
        }

        $parametros = ['archivo' => $this->id];

        if ($variante !== 'original') {
            $parametros['variante'] = $variante;
        }

        return URL::temporarySignedRoute(
            'adjuntos.ver',
            CarbonImmutable::now('UTC')->startOfDay()->addDays(2),
            $parametros,
            absolute: false,
        );
    }

    /* ================================================================ */
    /* Borrar                                                           */
    /* ================================================================ */

    /** Borra el fichero (y su miniatura) del disco además de la fila. */
    public function eliminarConSuFichero(): void
    {
        Storage::disk($this->disco)->delete(array_values(array_filter([
            $this->ruta_relativa,
            $this->ruta_miniatura,
        ])));

        $this->delete();
    }

    /**
     * Adjuntos que se subieron y nunca llegaron a una entrada.
     *
     * Pasa cuando alguien adjunta algo y lo quita de la caja antes de
     * enviar, o cierra la ficha a medias. Se barren al subir el siguiente
     * adjunto, que es un momento que ocurre solo y a menudo: así no hace
     * falta un programador de tareas en el servidor, que no lo hay.
     */
    public static function eliminarAdjuntosAbandonados(): int
    {
        $abandonados = self::query()
            ->where('proposito', self::PROPOSITO_ADJUNTO_COMENTARIO)
            ->where('created_at', '<', now()->subHours(self::HORAS_DE_GRACIA_DE_UN_ADJUNTO_SIN_ENTRADA))
            ->whereDoesntHave('comentarios')
            ->limit(200)
            ->get();

        $abandonados->each->eliminarConSuFichero();

        return $abandonados->count();
    }

    /**
     * Los adjuntos que esta persona ha subido y todavía no están en
     * ninguna entrada: los únicos que puede colgar de un comentario suyo.
     *
     * @param  Builder<self>  $consulta
     */
    public function scopeAdjuntosSueltosDe(Builder $consulta, User $persona): void
    {
        $consulta->where('proposito', self::PROPOSITO_ADJUNTO_COMENTARIO)
            ->where('subido_por_id', $persona->id)
            ->whereDoesntHave('comentarios');
    }
}
