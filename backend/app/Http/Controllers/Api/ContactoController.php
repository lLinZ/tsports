<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\TipoDeContacto;
use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoRecordatorio;
use App\Models\Marca;
use App\Models\Recordatorio;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\Notificador;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * ContactoController — el botón «Contacté» de la tarjeta.
 * ---------------------------------------------------------------------
 * Después de hablar con una marca había que hacer dos cosas en dos
 * sitios: escribirlo en la bitácora y, aparte, dejarse un recordatorio
 * para volver a llamar. La segunda se olvidaba, y así es como una marca
 * se enfría sin que nadie lo decida. Aquí van las dos de una vez:
 *
 *   · UNA ENTRADA EN LA BITÁCORA, con su tipo (llamada, WhatsApp, reunión
 *     o correo). Es una entrada como las demás: calienta la marca (regla
 *     26), avisa a quien avisa un comentario (regla 17) y se edita o se
 *     elimina igual (regla 19).
 *   · EL SIGUIENTE PASO, si se elige uno: un recordatorio para quien
 *     anota el contacto, para dentro de N días o para un día concreto.
 *     «No hace falta» es una respuesta válida (la marca dijo que no, o
 *     ya tiene una acción de campaña agendada).
 *     Desde el 2026-10-07 el siguiente paso dice también QUÉ toca y, si
 *     se quiere, A QUÉ HORA: después de una llamada se agenda una reunión
 *     el martes a las 10:00, y eso es lo que lee el reporte «Lo que
 *     viene». Sin elegir otro, toca lo mismo que se acaba de hacer.
 *   · EL RECORDATORIO QUE TOCABA, cumplido. Si se llamó porque hoy había
 *     que llamar, ese recordatorio ya está hecho: sin esto se quedaba en
 *     «Para hoy» junto al nuevo. La interfaz lo propone marcado cuando el
 *     próximo de quien anota es de hoy o está vencido.
 *
 * Los N días los cuenta el servidor desde el día de Caracas: la interfaz
 * dice «en 3 días» y no manda una fecha, porque el ordenador puede no
 * estar en hora de Venezuela (regla 27).
 *
 * Lo anota quien puede EDITAR la marca, no cualquiera que pueda verla:
 * deja un recordatorio, y los recordatorios son de quien la trabaja.
 */
class ContactoController extends Controller
{
    /** Hasta cuántos días por delante se acepta «retomar en N días». */
    private const MAXIMO_DE_DIAS_PARA_RETOMAR = 90;

    /**
     * POST /api/marcas/{marca}/contactos
     */
    public function store(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('update', $marca);

        $hoy = CarbonImmutable::today();

        $datos = $peticion->validate([
            'tipo' => ['required', Rule::enum(TipoDeContacto::class)],
            'cuerpo' => ['required', 'string', 'max:4000'],
            'retomarEnDias' => ['nullable', 'integer', 'min:1', 'max:'.self::MAXIMO_DE_DIAS_PARA_RETOMAR],
            'retomarEl' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:'.$hoy->toDateString(), 'prohibits:retomarEnDias'],
            'notaDelSiguientePaso' => ['nullable', 'string', 'max:300'],
            'tipoDelSiguientePaso' => ['nullable', Rule::enum(TipoDeContacto::class)],
            'horaDelSiguientePaso' => ['nullable', 'date_format:H:i'],
            'recordatorioCumplidoId' => ['nullable', 'uuid'],
        ], [
            'tipo.required' => 'Elige cómo fue el contacto.',
            'tipo.enum' => 'Ese tipo de contacto no existe.',
            'cuerpo.required' => 'Escribe en una línea qué se habló.',
            'cuerpo.max' => 'El texto es demasiado largo (máximo 4000 caracteres).',
            'retomarEnDias.max' => 'Como mucho se retoma dentro de '.self::MAXIMO_DE_DIAS_PARA_RETOMAR.' días; para más, elige el día.',
            'retomarEl.after_or_equal' => 'El siguiente paso tiene que ser para hoy o para un día por delante.',
            'retomarEl.prohibits' => 'Elige «en N días» o un día concreto, no las dos cosas.',
            'notaDelSiguientePaso.max' => 'La nota del siguiente paso puede tener como mucho :max caracteres.',
            'tipoDelSiguientePaso.enum' => 'Elige llamada, WhatsApp, reunión o correo para el siguiente paso.',
            'horaDelSiguientePaso.date_format' => 'La hora debe tener el formato HH:MM, por ejemplo 10:30.',
        ]);

        $texto = trim($datos['cuerpo']);

        if ($texto === '') {
            throw ValidationException::withMessages(['cuerpo' => 'Escribe en una línea qué se habló.']);
        }

        /** @var User $autor */
        $autor = $peticion->user();
        $tipo = TipoDeContacto::from($datos['tipo']);

        // Lo que toca después; si no se dice, lo mismo que se acaba de hacer.
        $tipoDelSiguientePaso = isset($datos['tipoDelSiguientePaso'])
            ? TipoDeContacto::from($datos['tipoDelSiguientePaso'])
            : $tipo;

        // El que se da por hecho tiene que ser de ESTA marca y estar
        // pendiente: con el id de otro se cumpliría algo ajeno.
        $recordatorioQueTocaba = null;

        if (isset($datos['recordatorioCumplidoId'])) {
            $recordatorioQueTocaba = $marca->recordatoriosPendientes()->whereKey($datos['recordatorioCumplidoId'])->first();

            if ($recordatorioQueTocaba === null) {
                throw ValidationException::withMessages([
                    'recordatorioCumplidoId' => 'Ese recordatorio ya no está pendiente en esta marca.',
                ]);
            }
        }

        $diaDelSiguientePaso = match (true) {
            isset($datos['retomarEl']) => $datos['retomarEl'],
            isset($datos['retomarEnDias']) => $hoy->addDays((int) $datos['retomarEnDias'])->toDateString(),
            default => null,
        };

        [$comentario, $recordatorio] = DB::transaction(function () use ($marca, $autor, $tipo, $texto, $diaDelSiguientePaso, $tipoDelSiguientePaso, $datos, $recordatorioQueTocaba): array {
            $recordatorioQueTocaba?->forceFill([
                'cumplido_en' => now(),
                'cumplido_por_nombre' => $autor->nombreParaMostrar(),
            ])->save();

            $entrada = $marca->comentarios()->create([
                'autor_id' => $autor->id,
                'autor_nombre' => $autor->nombreParaMostrar(),
                'cuerpo' => $texto,
                'tipo_de_contacto' => $tipo,
            ]);

            $siguientePaso = $diaDelSiguientePaso === null ? null : Recordatorio::create([
                'marca_id' => $marca->id,
                'persona_id' => $autor->id,
                'fecha' => $diaDelSiguientePaso,
                'hora' => $datos['horaDelSiguientePaso'] ?? null,
                'tipo' => $tipoDelSiguientePaso,
                'nota' => $this->notaDelSiguientePaso($datos['notaDelSiguientePaso'] ?? null, $tipoDelSiguientePaso),
                'creado_por_id' => $autor->id,
                'creado_por_nombre' => $autor->nombreParaMostrar(),
            ]);

            return [$entrada, $siguientePaso];
        });

        RegistroActividad::anotar(
            $autor,
            RegistroActividad::ACCION_COMENTO,
            'marca',
            $marca->id,
            'Anotó '.$tipo->conArticulo().' con '.$marca->nombre_marca,
        );

        // El mismo aviso que una entrada escrita a mano: es una entrada de
        // la bitácora, y a quien lleva la marca le interesa igual.
        app(Notificador::class)->avisarDeUnComentario(
            $marca,
            $autor,
            $tipo->etiqueta().': '.$comentario->cuerpo,
            false,
            collect(),
        );

        return response()->json([
            'comentarioId' => $comentario->id,
            'recordatorio' => $recordatorio === null
                ? null
                : (new RecursoRecordatorio($recordatorio->setRelation('marca', $marca)->load('persona')))->resolve($peticion),
        ], 201);
    }

    /** La nota escrita o, si no hay, la de lo que toca («Volver a llamar»). */
    private function notaDelSiguientePaso(?string $nota, TipoDeContacto $tipo): string
    {
        $limpia = trim((string) $nota);

        return $limpia === '' ? $tipo->notaDelSiguientePaso() : $limpia;
    }
}
