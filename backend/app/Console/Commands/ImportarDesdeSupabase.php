<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\InversionEnPatrocinios;
use App\Enums\OrigenMarca;
use App\Enums\RolUsuario;
use App\Models\ComentarioMarca;
use App\Models\ContenidoSitio;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * ImportarDesdeSupabase — trae los datos del sistema anterior.
 * ---------------------------------------------------------------------
 * Lee los ficheros JSON exportados desde Supabase y los vuelca en las
 * tablas nuevas, traduciendo por el camino los nombres de columna
 * (deals → marcas, brand → nombre_marca, y así con todos).
 *
 * CÓMO EXPORTAR DESDE SUPABASE
 *   En el SQL Editor, una consulta por tabla, y "Download JSON":
 *     select * from public.profiles;        →  profiles.json
 *     select * from public.deals;           →  deals.json
 *     select * from public.deal_comments;   →  deal_comments.json
 *     select * from public.site_content;    →  site_content.json
 *   Se dejan los cuatro ficheros en una carpeta y se pasa su ruta.
 *
 * CÓMO EJECUTAR
 *   php artisan tsports:importar-supabase --carpeta=storage/app/import
 *   php artisan tsports:importar-supabase --carpeta=... --simular
 *
 * Los identificadores UUID se conservan tal cual, así que las
 * referencias entre marcas, usuarios y comentarios siguen encajando sin
 * necesidad de ninguna tabla de equivalencias.
 *
 * IMPORTANTE — CONTRASEÑAS: Supabase no exporta las contraseñas (están
 * cifradas y son suyas). A cada usuario importado se le asigna una
 * temporal y hay que comunicársela, o pedirle que la cambie al entrar.
 */
class ImportarDesdeSupabase extends Command
{
    protected $signature = 'tsports:importar-supabase
                            {--carpeta= : Carpeta con los .json exportados de Supabase}
                            {--simular : Muestra lo que haría sin escribir nada en la base de datos}
                            {--password-temporal=CambiaEstaClave2026 : Contraseña que se asigna a los usuarios importados}';

    protected $description = 'Importa usuarios, marcas, comentarios y contenido web exportados desde Supabase';

    /** Cuenta de lo importado, para el resumen final. */
    private array $totalesImportados = [
        'usuarios' => 0,
        'marcas' => 0,
        'comentarios' => 0,
        'contenido' => 0,
    ];

    public function handle(): int
    {
        $carpetaDeImportacion = (string) ($this->option('carpeta') ?: base_path('storage/app/import'));
        $esSimulacion = (bool) $this->option('simular');

        if (! is_dir($carpetaDeImportacion)) {
            $this->error("No existe la carpeta: {$carpetaDeImportacion}");
            $this->line('Crea la carpeta y deja dentro los .json exportados de Supabase.');

            return self::FAILURE;
        }

        $this->info('Importando desde: '.$carpetaDeImportacion);

        if ($esSimulacion) {
            $this->warn('MODO SIMULACIÓN: no se escribirá nada en la base de datos.');
        }

        // Todo dentro de una transacción: si algo falla a mitad, la base
        // de datos se queda como estaba en vez de a medio importar.
        DB::beginTransaction();

        try {
            $this->importarUsuarios($carpetaDeImportacion);
            $this->importarMarcas($carpetaDeImportacion);
            $this->importarComentarios($carpetaDeImportacion);
            $this->importarContenidoWeb($carpetaDeImportacion);

            if ($esSimulacion) {
                DB::rollBack();
                $this->warn('Simulación terminada: se deshizo todo.');
            } else {
                DB::commit();
            }
        } catch (\Throwable $error) {
            DB::rollBack();

            $this->error('La importación falló y se deshizo por completo:');
            $this->error($error->getMessage());

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Resumen de la importación');
        $this->table(
            ['Qué', 'Cuántos'],
            [
                ['Usuarios', $this->totalesImportados['usuarios']],
                ['Marcas', $this->totalesImportados['marcas']],
                ['Comentarios', $this->totalesImportados['comentarios']],
                ['Versiones de contenido web', $this->totalesImportados['contenido']],
            ],
        );

        if (! $esSimulacion && $this->totalesImportados['usuarios'] > 0) {
            $this->newLine();
            $this->warn('Los usuarios importados tienen esta contraseña temporal:');
            $this->line('   '.$this->option('password-temporal'));
            $this->warn('Pídeles que la cambien la primera vez que entren.');
        }

        return self::SUCCESS;
    }

    /**
     * `profiles` de Supabase → tabla `users`.
     * El correo llegaba a veces con mayúsculas; se normaliza al importar
     * porque era la causa de que alguna cuenta no pudiese entrar.
     */
    private function importarUsuarios(string $carpeta): void
    {
        $perfiles = $this->leerJson($carpeta, 'profiles.json');

        if ($perfiles === null) {
            return;
        }

        $passwordTemporal = (string) $this->option('password-temporal');

        foreach ($perfiles as $perfil) {
            $correoNormalizado = mb_strtolower(trim((string) ($perfil['email'] ?? '')));

            if ($correoNormalizado === '') {
                $this->warn('  · Perfil sin correo, se omite: '.($perfil['id'] ?? '?'));

                continue;
            }

            $usuario = User::query()->firstOrNew(['email' => $correoNormalizado]);

            // Se conserva el UUID original para que las marcas y los
            // comentarios sigan apuntando a la persona correcta.
            if (! $usuario->exists && ! empty($perfil['id'])) {
                $usuario->id = (string) $perfil['id'];
            }

            $usuario->name = trim((string) ($perfil['name'] ?? '')) ?: Str::before($correoNormalizado, '@');
            $usuario->zona = $this->limpiarTexto($perfil['zona'] ?? null);

            // El rol viaja igual; si trae algo raro, cae a comercial.
            $rolOriginal = (string) ($perfil['role'] ?? 'comercial');
            $usuario->rol = RolUsuario::tryFrom($rolOriginal) ?? RolUsuario::Comercial;

            $usuario->activo = true;

            if (! $usuario->exists) {
                $usuario->password = $passwordTemporal;
            }

            $usuario->save();

            $this->totalesImportados['usuarios']++;
        }

        $this->info('  ✔ Usuarios: '.$this->totalesImportados['usuarios']);
    }

    /**
     * `deals` de Supabase → tabla `marcas`.
     * Aquí está el grueso de la traducción de nombres de columna.
     */
    private function importarMarcas(string $carpeta): void
    {
        $oportunidades = $this->leerJson($carpeta, 'deals.json');

        if ($oportunidades === null) {
            return;
        }

        foreach ($oportunidades as $oportunidad) {
            $identificador = (string) ($oportunidad['id'] ?? Str::uuid());

            $marca = Marca::query()->find($identificador) ?? new Marca();

            if (! $marca->exists) {
                $marca->id = $identificador;
            }

            // --- Identificación ---
            $marca->nombre_marca = trim((string) ($oportunidad['brand'] ?? '')) ?: '(sin nombre)';
            $marca->sector = $this->limpiarTexto($oportunidad['sector'] ?? null);
            $marca->logo_url = $this->limpiarTexto($oportunidad['logo'] ?? null);
            $marca->zona = $this->limpiarTexto($oportunidad['zona'] ?? null);
            $marca->via_prospeccion = $this->limpiarTexto($oportunidad['prospeccion_via'] ?? null);

            // En Supabase el campo `invierte` era '' | 'si' | 'no'; la
            // cadena vacía pasa a ser "desconocido", que es explícito.
            $marca->invierte_actualmente = match ((string) ($oportunidad['invierte'] ?? '')) {
                'si' => InversionEnPatrocinios::Si->value,
                'no' => InversionEnPatrocinios::No->value,
                default => InversionEnPatrocinios::Desconocido->value,
            };

            // --- Contacto ---
            $marca->persona_contacto = $this->limpiarTexto($oportunidad['contact'] ?? null);
            $marca->cargo_contacto = $this->limpiarTexto($oportunidad['cargo'] ?? null);
            $marca->email_contacto = $this->limpiarTexto($oportunidad['email'] ?? null);
            $marca->telefono_contacto = $this->limpiarTexto($oportunidad['phone'] ?? null);
            $marca->notas = $this->limpiarTexto($oportunidad['notes'] ?? null);

            // --- Fases ---
            // st_prospeccion no se copia: el modelo la recalcula sola al
            // guardar, que es justo lo que arregla los datos torcidos.
            $marca->fase_aproximacion_completada = (bool) ($oportunidad['st_aproximacion'] ?? false);
            $marca->via_aproximacion = $this->limpiarTexto($oportunidad['aprox_via'] ?? null);
            $marca->fase_propuesta_completada = (bool) ($oportunidad['st_propuesta'] ?? false);
            $marca->descripcion_propuesta = $this->limpiarTexto($oportunidad['propuesta_desc'] ?? null);
            $marca->valor_anual_usd = (float) ($oportunidad['value'] ?? 0);

            // --- Responsables ---
            // `owner` pasa a ser quien la registró; `assigned_to` sigue
            // siendo el vendedor que la trabaja.
            $marca->registrada_por_id = $this->idDeUsuarioSiExiste($oportunidad['owner'] ?? null);
            $marca->registrada_por_nombre = $this->limpiarTexto($oportunidad['owner_name'] ?? null);
            $marca->vendedor_asignado_id = $this->idDeUsuarioSiExiste($oportunidad['assigned_to'] ?? null);
            $marca->vendedor_asignado_nombre = $this->limpiarTexto($oportunidad['assigned_name'] ?? null);

            $marca->origen = ((string) ($oportunidad['source'] ?? 'manual')) === 'web'
                ? OrigenMarca::Web->value
                : OrigenMarca::Manual->value;

            $marca->save();

            // Las fechas originales se restauran después de guardar, para
            // que el histórico del tablero no se venga entero a hoy.
            $this->restaurarFechasOriginales($marca, $oportunidad);

            $this->totalesImportados['marcas']++;
        }

        $this->info('  ✔ Marcas: '.$this->totalesImportados['marcas']);
    }

    /** `deal_comments` de Supabase → tabla `comentarios_marca`. */
    private function importarComentarios(string $carpeta): void
    {
        $comentarios = $this->leerJson($carpeta, 'deal_comments.json');

        if ($comentarios === null) {
            return;
        }

        foreach ($comentarios as $comentarioOriginal) {
            $idDeLaMarca = (string) ($comentarioOriginal['deal_id'] ?? '');

            // Un comentario cuya marca ya no existe no se puede importar.
            if ($idDeLaMarca === '' || ! Marca::query()->whereKey($idDeLaMarca)->exists()) {
                continue;
            }

            $identificador = (string) ($comentarioOriginal['id'] ?? Str::uuid());

            $comentario = ComentarioMarca::query()->find($identificador) ?? new ComentarioMarca();

            if (! $comentario->exists) {
                $comentario->id = $identificador;
            }

            $comentario->marca_id = $idDeLaMarca;
            $comentario->autor_id = $this->idDeUsuarioSiExiste($comentarioOriginal['author'] ?? null);
            $comentario->autor_nombre = $this->limpiarTexto($comentarioOriginal['author_name'] ?? null);
            $comentario->cuerpo = (string) ($comentarioOriginal['body'] ?? '');

            $comentario->save();

            $this->restaurarFechasOriginales($comentario, $comentarioOriginal);

            $this->totalesImportados['comentarios']++;
        }

        $this->info('  ✔ Comentarios: '.$this->totalesImportados['comentarios']);
    }

    /**
     * `site_content` de Supabase → tabla `contenido_sitio`.
     *
     * El JSON antiguo usaba claves en inglés (colors, images, texts...)
     * y las nuevas están en español, así que se traduce la estructura.
     * Lo que no se reconozca se conserva igualmente bajo la clave
     * `_importadoSinTraducir`, para no perder nada por el camino.
     */
    private function importarContenidoWeb(string $carpeta): void
    {
        $filasDeContenido = $this->leerJson($carpeta, 'site_content.json');

        if ($filasDeContenido === null || $filasDeContenido === []) {
            return;
        }

        $contenidoAntiguo = $filasDeContenido[0]['content'] ?? null;

        if (! is_array($contenidoAntiguo)) {
            $this->warn('  · site_content.json no traía un documento legible; se omite.');

            return;
        }

        $contenidoTraducido = [
            'colores' => [
                'azulPrincipal' => $contenidoAntiguo['colors']['navy'] ?? null,
                'azulSecundario' => $contenidoAntiguo['colors']['navy2'] ?? null,
                'acento' => $contenidoAntiguo['colors']['accent'] ?? null,
                'acentoVerde' => $contenidoAntiguo['colors']['accent2'] ?? null,
                'fondoAlterno' => $contenidoAntiguo['colors']['bgAlt'] ?? null,
            ],
            'imagenes' => [
                'hero' => $contenidoAntiguo['images']['hero'] ?? null,
                'heroVideo' => $contenidoAntiguo['images']['heroVideo'] ?? null,
                'nosotros' => $contenidoAntiguo['images']['about'] ?? null,
                'llamadaAccion' => $contenidoAntiguo['images']['cta'] ?? null,
            ],
            'contacto' => $contenidoAntiguo['contact'] ?? null,
            // Los textos se guardan aparte: sus claves cambiaron de nombre
            // (hero.eyebrow → hero.antetitulo) y traducirlas una a una
            // daría más trabajo que volver a escribirlas desde el panel.
            '_importadoSinTraducir' => [
                'textos' => $contenidoAntiguo['texts'] ?? null,
                'servicios' => $contenidoAntiguo['services'] ?? null,
                'proyectos' => $contenidoAntiguo['projects'] ?? null,
                'equipo' => $contenidoAntiguo['team'] ?? null,
                'aliados' => $contenidoAntiguo['allies'] ?? null,
            ],
        ];

        // Se quitan las claves que llegaron vacías para que el contenido
        // de fábrica pueda rellenar esos huecos.
        $contenidoTraducido = $this->quitarValoresNulos($contenidoTraducido);

        ContenidoSitio::publicarNuevaVersion(
            $contenidoTraducido,
            null,
            'Importado desde Supabase',
        );

        $this->totalesImportados['contenido']++;
        $this->info('  ✔ Contenido web importado');
        $this->warn('    Los textos, servicios y proyectos quedaron bajo "_importadoSinTraducir".');
        $this->warn('    Revísalos en el panel: la estructura de claves cambió de nombre.');
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    /**
     * Lee un fichero JSON de la carpeta de importación. Si no existe,
     * avisa y sigue: puede que solo se quiera importar una parte.
     */
    private function leerJson(string $carpeta, string $nombreDelFichero): ?array
    {
        $rutaCompleta = rtrim($carpeta, '/\\').DIRECTORY_SEPARATOR.$nombreDelFichero;

        if (! is_file($rutaCompleta)) {
            $this->warn("  · No se encontró {$nombreDelFichero}, se omite.");

            return null;
        }

        $contenidoDelFichero = (string) file_get_contents($rutaCompleta);
        $datosDecodificados = json_decode($contenidoDelFichero, true);

        if (! is_array($datosDecodificados)) {
            $this->warn("  · {$nombreDelFichero} no contiene un JSON válido, se omite.");

            return null;
        }

        return $datosDecodificados;
    }

    /** Devuelve el id solo si ese usuario existe ya en la base nueva. */
    private function idDeUsuarioSiExiste(mixed $identificador): ?string
    {
        $idComoTexto = trim((string) $identificador);

        if ($idComoTexto === '') {
            return null;
        }

        return User::query()->whereKey($idComoTexto)->exists() ? $idComoTexto : null;
    }

    /** Convierte cadenas vacías en null, que es lo que espera el modelo. */
    private function limpiarTexto(mixed $valor): ?string
    {
        $textoLimpio = trim((string) $valor);

        return $textoLimpio === '' ? null : $textoLimpio;
    }

    /**
     * Devuelve a la fila sus fechas originales de Supabase.
     *
     * Se hace con una consulta directa y no con el modelo porque Eloquent
     * sobrescribiría `updated_at` con la fecha de hoy al guardar, y el
     * histórico del tablero perdería todo el sentido.
     */
    private function restaurarFechasOriginales(Marca|ComentarioMarca $registro, array $filaOriginal): void
    {
        $fechaDeCreacion = $filaOriginal['created_at'] ?? null;
        $fechaDeActualizacion = $filaOriginal['updated_at'] ?? $fechaDeCreacion;

        if ($fechaDeCreacion === null) {
            return;
        }

        DB::table($registro->getTable())
            ->where('id', $registro->getKey())
            ->update([
                'created_at' => $this->comoFechaDeBaseDeDatos($fechaDeCreacion),
                'updated_at' => $this->comoFechaDeBaseDeDatos($fechaDeActualizacion),
            ]);
    }

    /**
     * Traduce la marca de tiempo de Supabase al formato de la columna.
     *
     * Supabase entrega ISO 8601 con microsegundos y desplazamiento
     * horario ('2026-08-05T23:59:34.814326+00:00'). SQLite lo aceptaba
     * porque guarda las fechas como texto, pero MySQL lo rechaza con un
     * error 1292 y tumba la importación entera. Se normaliza además a la
     * zona horaria de la aplicación, para que estas filas se ordenen en
     * el mismo huso que las que escribe Eloquent.
     */
    private function comoFechaDeBaseDeDatos(mixed $marcaDeTiempo): ?string
    {
        if (trim((string) $marcaDeTiempo) === '') {
            return null;
        }

        return Carbon::parse((string) $marcaDeTiempo)
            ->setTimezone(config('app.timezone'))
            ->format('Y-m-d H:i:s');
    }

    /** Elimina en profundidad las claves cuyo valor es null. */
    private function quitarValoresNulos(array $arreglo): array
    {
        $resultado = [];

        foreach ($arreglo as $clave => $valor) {
            if ($valor === null) {
                continue;
            }

            $resultado[$clave] = is_array($valor) ? $this->quitarValoresNulos($valor) : $valor;
        }

        return $resultado;
    }
}
