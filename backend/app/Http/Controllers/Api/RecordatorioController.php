<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\TipoDeContacto;
use App\Http\Controllers\Controller;
use App\Http\Resources\RecursoRecordatorio;
use App\Models\Marca;
use App\Models\Recordatorio;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * RecordatorioController — los recordatorios de seguimiento.
 * ---------------------------------------------------------------------
 * Tres sitios los enseñan: la ficha de la marca (todos los suyos), la
 * tarjeta del tablero (el próximo de quien mira) y el panel («Para hoy» y
 * «Vencidos» de quien mira). El aviso de la mañana lo manda aparte el
 * comando `recordatorios:avisar-del-dia`.
 *
 * PERMISOS, que salen de los de la marca y no de una política propia:
 *
 *   · Verlos      → quien puede ver la marca.
 *   · Dejar uno, cumplirlo, posponerlo o borrarlo → quien puede editarla.
 *   · Dejárselo a OTRA persona → solo quien reparte el trabajo (admin y
 *     comercial), y solo a alguien que pueda ver esa marca: el
 *     recordatorio lleva dentro el nombre de la marca, y dárselo a una
 *     agente que no la lleva se lo filtraría (regla 6).
 *
 * Un día que ya pasó no se acepta, ni al crear ni al posponer: un
 * recordatorio para ayer nace vencido y no recuerda nada.
 *
 * Desde el 2026-10-07 llevan además QUÉ TOCA (llamada, WhatsApp, reunión
 * o correo) y, si se quiere, LA HORA. Los dos son opcionales y los dos
 * se pueden corregir después: es lo que lee el reporte «Lo que viene».
 */
class RecordatorioController extends Controller
{
    /** Hasta cuántos días por delante se enseñan en el panel. */
    private const DIAS_POR_DELANTE_EN_EL_PANEL = 7;

    /**
     * GET /api/marcas/{marca}/recordatorios
     * Los de la ficha: los pendientes de todo el equipo, y los cumplidos
     * de la última semana, para poder deshacer un cumplido por error.
     */
    public function deLaMarca(Marca $marca): AnonymousResourceCollection
    {
        $this->authorize('view', $marca);

        $desdeCuandoSeVeLoCumplido = now()->subDays(Recordatorio::DIAS_QUE_SE_VE_LO_CUMPLIDO);

        $recordatorios = $marca->recordatorios()
            ->with('persona')
            ->where(function ($consulta) use ($desdeCuandoSeVeLoCumplido): void {
                $consulta->whereNull('cumplido_en')
                    ->orWhere('cumplido_en', '>=', $desdeCuandoSeVeLoCumplido);
            })
            // Primero lo pendiente, por día; lo cumplido, debajo.
            ->orderByRaw('CASE WHEN cumplido_en IS NULL THEN 0 ELSE 1 END')
            ->orderBy('fecha')
            ->orderBy('hora')
            ->orderBy('created_at')
            ->get();

        // Todos son de esta marca: se cuelga la que ya está cargada en vez
        // de pedirla una vez por recordatorio.
        $recordatorios->each->setRelation('marca', $marca);

        return RecursoRecordatorio::collection($recordatorios);
    }

    /**
     * GET /api/recordatorios/mios
     * Lo del panel: lo vencido, lo de hoy y lo de los próximos días de
     * quien pregunta, en las marcas que todavía puede ver.
     */
    public function mios(Request $peticion): JsonResponse
    {
        /** @var User $yo */
        $yo = $peticion->user();

        $hoy = CarbonImmutable::today();

        $pendientes = Recordatorio::query()
            ->de($yo)
            ->pendientes()
            ->whereDate('fecha', '<=', $hoy->addDays(self::DIAS_POR_DELANTE_EN_EL_PANEL)->toDateString())
            ->with(['marca', 'persona'])
            ->orderBy('fecha')
            ->orderBy('hora')
            ->orderBy('created_at')
            ->get()
            ->groupBy(fn (Recordatorio $recordatorio): string => $recordatorio->cuando());

        $comoLista = fn (string $cuando) => RecursoRecordatorio::collection($pendientes->get($cuando, collect()))
            ->resolve($peticion);

        return response()->json([
            'vencidos' => $comoLista('vencido'),
            'paraHoy' => $comoLista('hoy'),
            'proximos' => $comoLista('proximo'),
        ]);
    }

    /**
     * POST /api/marcas/{marca}/recordatorios
     */
    public function store(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('update', $marca);

        $datos = $peticion->validate([
            'fecha' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.$this->hoy()],
            'hora' => ['nullable', 'date_format:H:i'],
            'nota' => ['nullable', 'string', 'max:300'],
            'tipo' => ['nullable', Rule::enum(TipoDeContacto::class)],
            'personaId' => ['nullable', 'uuid', Rule::exists('users', 'id')->where('activo', true)],
        ], $this->mensajes());

        /** @var User $quienLoDeja */
        $quienLoDeja = $peticion->user();

        $persona = isset($datos['personaId'])
            ? User::query()->findOrFail($datos['personaId'])
            : $quienLoDeja;

        $this->comprobarQuePuedeDejarseloA($persona, $quienLoDeja, $marca);

        $recordatorio = Recordatorio::create([
            'marca_id' => $marca->id,
            'persona_id' => $persona->id,
            'fecha' => $datos['fecha'],
            'hora' => $datos['hora'] ?? null,
            'nota' => $this->notaLimpia($datos['nota'] ?? null),
            'tipo' => $datos['tipo'] ?? null,
            'creado_por_id' => $quienLoDeja->id,
            'creado_por_nombre' => $quienLoDeja->nombreParaMostrar(),
        ]);

        $recordatorio->setRelation('marca', $marca)->load('persona');

        return (new RecursoRecordatorio($recordatorio))->response()->setStatusCode(201);
    }

    /**
     * PATCH /api/recordatorios/{recordatorio}
     * Cumplirlo (o deshacerlo), posponerlo a otro día o corregir la nota,
     * la hora o qué toca.
     */
    public function update(Request $peticion, Recordatorio $recordatorio): RecursoRecordatorio
    {
        $recordatorio->loadMissing('marca');

        $this->authorize('update', $recordatorio->marca);

        $datos = $peticion->validate([
            'cumplido' => ['sometimes', 'boolean'],
            'fecha' => ['sometimes', 'date_format:Y-m-d', 'after_or_equal:'.$this->hoy()],
            'hora' => ['sometimes', 'nullable', 'date_format:H:i'],
            'nota' => ['sometimes', 'nullable', 'string', 'max:300'],
            'tipo' => ['sometimes', 'nullable', Rule::enum(TipoDeContacto::class)],
        ], $this->mensajes());

        /** @var User $quienLoCambia */
        $quienLoCambia = $peticion->user();

        if (array_key_exists('cumplido', $datos)) {
            $seCumple = (bool) $datos['cumplido'];

            $recordatorio->cumplido_en = $seCumple ? now() : null;
            $recordatorio->cumplido_por_nombre = $seCumple ? $quienLoCambia->nombreParaMostrar() : null;
        }

        if (array_key_exists('fecha', $datos)) {
            $recordatorio->fecha = $datos['fecha'];
            // Pospuesto, vuelve a tocarle el aviso de la mañana de su día.
            $recordatorio->avisado_en = null;
        }

        if (array_key_exists('nota', $datos)) {
            $recordatorio->nota = $this->notaLimpia($datos['nota']);
        }

        if (array_key_exists('hora', $datos)) {
            $recordatorio->hora = $datos['hora'];
        }

        if (array_key_exists('tipo', $datos)) {
            $recordatorio->tipo = $datos['tipo'];
        }

        $recordatorio->save();

        return new RecursoRecordatorio($recordatorio->load('persona'));
    }

    /**
     * DELETE /api/recordatorios/{recordatorio}
     */
    public function destroy(Recordatorio $recordatorio): JsonResponse
    {
        $recordatorio->loadMissing('marca');

        $this->authorize('update', $recordatorio->marca);

        $recordatorio->delete();

        return response()->json(['mensaje' => 'Recordatorio eliminado.']);
    }

    /* ------------------------------------------------------------------
     | Ayudantes
     |-----------------------------------------------------------------*/

    private function comprobarQuePuedeDejarseloA(User $persona, User $quienLoDeja, Marca $marca): void
    {
        if ($persona->id !== $quienLoDeja->id && ! $quienLoDeja->can('asignarVendedor', Marca::class)) {
            throw ValidationException::withMessages([
                'personaId' => 'Solo quien reparte el trabajo puede dejarle un recordatorio a otra persona.',
            ]);
        }

        if (! $persona->can('view', $marca)) {
            throw ValidationException::withMessages([
                'personaId' => $persona->nombreParaMostrar().' no lleva esta marca, así que no puede verla.',
            ]);
        }
    }

    /** El día de hoy en Caracas: lo que valida «no puede ser un día pasado». */
    private function hoy(): string
    {
        return CarbonImmutable::today()->toDateString();
    }

    private function notaLimpia(?string $nota): ?string
    {
        $limpia = trim((string) $nota);

        return $limpia === '' ? null : $limpia;
    }

    /** @return array<string,string> */
    private function mensajes(): array
    {
        return [
            'fecha.required' => 'Elige el día del recordatorio.',
            'fecha.date_format' => 'La fecha debe tener el formato AAAA-MM-DD.',
            'fecha.after_or_equal' => 'El recordatorio tiene que ser para hoy o para un día por delante.',
            'nota.max' => 'La nota puede tener como mucho :max caracteres.',
            'hora.date_format' => 'La hora debe tener el formato HH:MM, por ejemplo 10:30.',
            'tipo.enum' => 'Elige llamada, WhatsApp, reunión o correo.',
            'personaId.exists' => 'Esa persona ya no tiene una cuenta activa.',
        ];
    }
}
