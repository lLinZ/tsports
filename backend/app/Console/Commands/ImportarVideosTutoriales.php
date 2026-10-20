<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\GuiaDeVideo;
use App\Enums\RolUsuario;
use App\Models\ArchivoMedia;
use App\Models\User;
use App\Models\VideoTutorial;
use App\Support\GuardadoDeArchivos;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * videos:importar — carga en el panel los vídeos tutoriales de una carpeta.
 * ---------------------------------------------------------------------
 *   php artisan videos:importar /ruta/a/la/carpeta
 *   php artisan videos:importar /ruta --quitar-los-demas
 *
 * La carpeta lleva los MP4, sus portadas y un `videos.json` con lo que
 * se enseña de cada uno (lo escribe informes/videos/herramientas/
 * manifiesto.mjs a partir de los guiones):
 *
 *   { "videos": [ { "clave": "agente-01", "guia": "agente", "orden": 1,
 *                   "titulo": "…", "descripcion": "…", "duracionSegundos": 146,
 *                   "fichero": "Agente-01-….mp4", "portada": "Agente-01-….jpg" } ] }
 *
 * LOS VÍDEOS NO VAN EN EL REPOSITORIO: pesan unos 200 MB y el repositorio
 * es público. Se copian a mano al servidor y se importan con esto.
 *
 * Volver a importar es seguro: un vídeo se reconoce por su `clave`, y si
 * el fichero es el mismo no se toca; si cambió (se volvió a grabar), se
 * guarda el nuevo y se borra el viejo. `--quitar-los-demas` borra los que
 * ya no están en el manifiesto.
 *
 * Los ficheros entran por GuardadoDeArchivos (regla 21), como todo, en el
 * disco privado: se sirven con enlace firmado a quien ve su serie.
 */
class ImportarVideosTutoriales extends Command
{
    protected $signature = 'videos:importar
        {carpeta : La carpeta con los MP4, sus portadas y videos.json}
        {--como= : Correo del administrador que figura como quien los subió (de partida, el primero)}
        {--quitar-los-demas : Borrar los vídeos que no estén en el manifiesto}';

    protected $description = 'Carga en la pantalla «Vídeos» los tutoriales de una carpeta';

    public function handle(GuardadoDeArchivos $guardado): int
    {
        $carpeta = rtrim((string) $this->argument('carpeta'), '/\\');
        $manifiesto = $carpeta.DIRECTORY_SEPARATOR.'videos.json';

        if (! is_file($manifiesto)) {
            $this->error("No encuentro {$manifiesto}.");

            return self::FAILURE;
        }

        $videos = json_decode((string) file_get_contents($manifiesto), true)['videos'] ?? null;

        if (! is_array($videos) || $videos === []) {
            $this->error('El manifiesto no trae ningún vídeo.');

            return self::FAILURE;
        }

        $quienSube = $this->quienLosSube();

        if ($quienSube === null) {
            $this->error('Hace falta un administrador activo (o uno válido en --como).');

            return self::FAILURE;
        }

        // Todo se comprueba antes de guardar nada: un manifiesto con un
        // fichero que falta no debe dejar la pantalla a medio cargar.
        foreach ($videos as $posicion => $datos) {
            $problema = $this->problemaCon($datos, $carpeta);

            if ($problema !== null) {
                $this->error('Vídeo '.($posicion + 1).": {$problema}");

                return self::FAILURE;
            }
        }

        $filas = [];

        foreach ($videos as $datos) {
            $filas[] = [$datos['clave'], $this->importar($datos, $carpeta, $guardado, $quienSube)];
        }

        if ($this->option('quitar-los-demas')) {
            $claves = array_column($videos, 'clave');

            VideoTutorial::query()->whereNotIn('clave', $claves)->get()
                ->each(function (VideoTutorial $sobrante) use (&$filas): void {
                    $sobrante->eliminarConSusArchivos();
                    $filas[] = [$sobrante->clave, 'quitado'];
                });
        }

        $this->table(['Vídeo', 'Qué pasó'], $filas);

        return self::SUCCESS;
    }

    private function quienLosSube(): ?User
    {
        $correo = $this->option('como');

        $consulta = User::query()->where('rol', RolUsuario::Admin->value)->where('activo', true);

        return $correo
            ? $consulta->where('email', mb_strtolower((string) $correo))->first()
            : $consulta->orderBy('created_at')->first();
    }

    /** Lo que impide importar ese vídeo, o null si está bien. */
    private function problemaCon(mixed $datos, string $carpeta): ?string
    {
        if (! is_array($datos)) {
            return 'no es un objeto.';
        }

        foreach (['clave', 'guia', 'titulo', 'fichero'] as $campo) {
            if (! is_string($datos[$campo] ?? null) || trim($datos[$campo]) === '') {
                return "le falta «{$campo}».";
            }
        }

        if (GuiaDeVideo::tryFrom($datos['guia']) === null) {
            return "la guía «{$datos['guia']}» no existe (".implode(', ', GuiaDeVideo::valores()).').';
        }

        foreach (array_filter([$datos['fichero'], $datos['portada'] ?? null]) as $nombre) {
            // Solo el nombre: el manifiesto no puede apuntar fuera de la carpeta.
            if ($nombre !== basename($nombre) || ! is_file($carpeta.DIRECTORY_SEPARATOR.$nombre)) {
                return "no encuentro «{$nombre}» en la carpeta.";
            }
        }

        $peso = filesize($carpeta.DIRECTORY_SEPARATOR.$datos['fichero']);

        if ($peso > GuardadoDeArchivos::TAMANO_MAXIMO_DE_VIDEO_KB * 1024) {
            return "«{$datos['fichero']}» pesa más de ".(GuardadoDeArchivos::TAMANO_MAXIMO_DE_VIDEO_KB / 1024).' MB.';
        }

        return null;
    }

    /** Crea o pone al día un vídeo. Devuelve qué pasó, para la tabla final. */
    private function importar(array $datos, string $carpeta, GuardadoDeArchivos $guardado, User $quienSube): string
    {
        $video = VideoTutorial::query()->with(['archivo', 'portada'])->where('clave', $datos['clave'])->first();

        $rutaDelVideo = $carpeta.DIRECTORY_SEPARATOR.$datos['fichero'];
        $rutaDeLaPortada = isset($datos['portada']) ? $carpeta.DIRECTORY_SEPARATOR.$datos['portada'] : null;

        $videoNuevo = $this->esOtroFichero($video?->archivo, $rutaDelVideo)
            ? $this->guardar($rutaDelVideo, $guardado, $quienSube)
            : null;
        $portadaNueva = $rutaDeLaPortada !== null && $this->esOtroFichero($video?->portada, $rutaDeLaPortada)
            ? $this->guardar($rutaDeLaPortada, $guardado, $quienSube)
            : null;

        $sobran = [];

        DB::transaction(function () use (&$video, &$sobran, $datos, $videoNuevo, $portadaNueva): void {
            $video ??= new VideoTutorial(['clave' => $datos['clave']]);

            if ($videoNuevo !== null && $video->archivo !== null) {
                $sobran[] = $video->archivo;
            }
            if ($portadaNueva !== null && $video->portada !== null) {
                $sobran[] = $video->portada;
            }

            $video->fill([
                'guia' => $datos['guia'],
                'orden' => (int) ($datos['orden'] ?? 0),
                'titulo' => trim($datos['titulo']),
                'descripcion' => isset($datos['descripcion']) ? trim((string) $datos['descripcion']) : null,
                'duracion_segundos' => (int) ($datos['duracionSegundos'] ?? 0),
            ]);

            if ($videoNuevo !== null) {
                $video->archivo_media_id = $videoNuevo->id;
            }
            if ($portadaNueva !== null) {
                $video->portada_media_id = $portadaNueva->id;
            }

            $video->save();
        });

        // Los ficheros viejos, después de que la fila apunte a los nuevos.
        foreach ($sobran as $viejo) {
            $viejo->eliminarConSuFichero();
        }

        return match (true) {
            $video->wasRecentlyCreated => 'nuevo',
            $videoNuevo !== null => 'vídeo nuevo',
            $portadaNueva !== null => 'portada nueva',
            $video->wasChanged() => 'datos al día',
            default => 'sin cambios',
        };
    }

    private function guardar(string $ruta, GuardadoDeArchivos $guardado, User $quienSube): ArchivoMedia
    {
        return $guardado->guardar(
            new UploadedFile($ruta, basename($ruta), null, null, true),
            ArchivoMedia::PROPOSITO_VIDEO_TUTORIAL,
            $quienSube,
        );
    }

    /** ¿Hay que guardar el fichero? Sí, si no había o si su contenido es otro. */
    private function esOtroFichero(?ArchivoMedia $guardado, string $ruta): bool
    {
        if ($guardado === null) {
            return true;
        }

        $disco = Storage::disk($guardado->disco);

        if (! $disco->exists($guardado->ruta_relativa) || $guardado->tamano_bytes !== filesize($ruta)) {
            return true;
        }

        return sha1_file($disco->path($guardado->ruta_relativa)) !== sha1_file($ruta);
    }
}
