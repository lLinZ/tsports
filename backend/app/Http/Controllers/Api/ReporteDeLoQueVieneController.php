<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\TipoDeContacto;
use App\Http\Controllers\Controller;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Recordatorio;
use App\Models\User;
use App\Support\SiguientePasoDeLasMarcas;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * ReporteDeLoQueVieneController — lo planificado, día por día.
 * ---------------------------------------------------------------------
 * Desde el 2026-10-07, a petición de LinZ: el administrador tiene que
 * poder saber qué hay planificado la semana que viene, el mes que viene
 * o cuando sea, y sacarlo en un reporte. Hasta ahora eso estaba repartido
 * en tres sitios (el calendario de campañas, el «Para hoy» de cada quien
 * y los recordatorios de cada ficha) y ninguno enseñaba el del equipo.
 *
 * Junta, entre dos días, las dos cosas que el sistema sabe del futuro:
 *
 *   · LOS RECORDATORIOS de todo el equipo, con qué toca (llamada,
 *     WhatsApp, reunión, correo) y la hora si la tienen. Incluye los que
 *     deja «Contacté» como siguiente paso: es lo que convierte ese botón
 *     en la agenda del equipo.
 *   · LAS ACCIONES DE CAMPAÑA del calendario (eventos_de_campana).
 *
 * Y dos avisos para quien lo lee: lo ATRASADO (pendiente de antes del
 * periodo, que sigue sin hacerse) y cuántas marcas no tienen NADA por
 * delante (SiguientePasoDeLasMarcas, la misma cifra del resumen).
 *
 * EL PERIODO LO CALCULA EL SERVIDOR con el día de Caracas (regla 16):
 * «esta semana» es de hoy al domingo, «la próxima» de lunes a domingo,
 * «este mes» de hoy a fin de mes. Si lo decidiera el navegador, un
 * ordenador que no está en hora de Venezuela pediría otros días.
 *
 * LO QUE VE CADA QUIEN es lo de las marcas que ve (regla 6): la agencia
 * entera admin y comercial, su cartera el agente. Filtrar por persona es
 * de quien ve todas; un agente solo puede pedirse a sí mismo. Un
 * recordatorio de alguien que ya no puede ver su marca, o cuya cuenta
 * está desactivada, no sale: nadie lo va a hacer (Recordatorio::scopeDe).
 *
 * No se anota en la auditoría, igual que el pronóstico: no saca del
 * sistema ninguna conversación ni dato de contacto, solo lo que ya enseñan
 * el panel y las fichas. El PDF y la hoja de cálculo los arma el navegador
 * con esta misma respuesta.
 */
class ReporteDeLoQueVieneController extends Controller
{
    private const PERIODOS = ['esta_semana', 'proxima_semana', 'este_mes', 'proximo_mes', 'otro'];

    /** Un año como mucho: más allá, el reporte deja de ser una agenda. */
    private const MAXIMO_DE_DIAS = 366;

    /**
     * GET /api/reportes/lo-que-viene?periodo=proxima_semana
     * GET /api/reportes/lo-que-viene?periodo=otro&desde=2026-10-12&hasta=2026-10-31&persona={uuid}
     */
    public function delPeriodo(Request $peticion): JsonResponse
    {
        $this->authorize('viewAny', Marca::class);

        /** @var User $yo */
        $yo = $peticion->user();
        $hoy = CarbonImmutable::today();

        $datos = $peticion->validate([
            'periodo' => ['sometimes', Rule::in(self::PERIODOS)],
            'desde' => ['required_if:periodo,otro', 'nullable', 'date_format:Y-m-d'],
            'hasta' => ['required_if:periodo,otro', 'nullable', 'date_format:Y-m-d', 'after_or_equal:desde'],
            'persona' => ['nullable', 'uuid'],
        ], [
            'periodo.in' => 'Ese periodo no existe.',
            'desde.required_if' => 'Elige desde qué día.',
            'hasta.required_if' => 'Elige hasta qué día.',
            'hasta.after_or_equal' => 'La fecha final no puede ser anterior a la inicial.',
        ]);

        $clave = $datos['periodo'] ?? 'esta_semana';
        [$desde, $hasta] = $this->rangoDelPeriodo($clave, $datos, $hoy);

        if ($desde->diffInDays($hasta) + 1 > self::MAXIMO_DE_DIAS) {
            throw ValidationException::withMessages([
                'hasta' => 'Como mucho se ve un año de una vez.',
            ]);
        }

        $persona = $this->personaPedida($datos['persona'] ?? null, $yo);
        $veTodas = $yo->rol->veTodasLasMarcas();

        $recordatorios = $this->recordatoriosEntre($yo, $persona, $desde, $hasta);
        $acciones = $this->accionesEntre($yo, $persona, $desde, $hasta);
        $atrasados = $this->atrasadosAntesDe($yo, $persona, $desde->min($hoy));

        return response()->json([
            'alcance' => $veTodas ? 'empresa' : 'personal',
            'generadoEn' => now()->toIso8601String(),
            'generadoPor' => $yo->nombreParaMostrar(),
            'periodo' => [
                'clave' => $clave,
                'desde' => $desde->toDateString(),
                'hasta' => $hasta->toDateString(),
                'etiqueta' => $this->etiquetaDelRango($desde, $hasta),
                'hoy' => $hoy->toDateString(),
            ],
            'persona' => $persona === null ? null : ['id' => $persona->id, 'nombre' => $persona->nombreParaMostrar()],
            'resumen' => $this->resumen($recordatorios, $acciones, $atrasados, $yo, $persona),
            'dias' => $this->diaPorDia($recordatorios, $acciones, $hoy),
            'atrasados' => $atrasados->map(fn (Recordatorio $recordatorio): array => $this->recordatorioComoFila($recordatorio, $hoy))->values()->all(),
            // Para el filtro por persona, solo a quien puede usarlo.
            'personas' => $veTodas ? $this->personasDelEquipo() : [],
        ]);
    }

    /* ------------------------------------------------------------------
     | El periodo y la persona
     |-----------------------------------------------------------------*/

    /**
     * @param  array<string,mixed>  $datos
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function rangoDelPeriodo(string $clave, array $datos, CarbonImmutable $hoy): array
    {
        return match ($clave) {
            'esta_semana' => [$hoy, $hoy->endOfWeek()->startOfDay()],
            'proxima_semana' => [$hoy->addWeek()->startOfWeek(), $hoy->addWeek()->endOfWeek()->startOfDay()],
            'este_mes' => [$hoy, $hoy->endOfMonth()->startOfDay()],
            'proximo_mes' => [$hoy->startOfMonth()->addMonthNoOverflow(), $hoy->startOfMonth()->addMonthNoOverflow()->endOfMonth()->startOfDay()],
            default => [
                CarbonImmutable::createFromFormat('Y-m-d', $datos['desde'])->startOfDay(),
                CarbonImmutable::createFromFormat('Y-m-d', $datos['hasta'])->startOfDay(),
            ],
        };
    }

    /**
     * La persona del filtro. Quien ve todas las marcas puede pedir la de
     * cualquiera; un agente, solo la suya: la agenda de otro no es suya
     * (regla 6).
     */
    private function personaPedida(?string $idDeLaPersona, User $yo): ?User
    {
        if ($idDeLaPersona === null) {
            return null;
        }

        if ($idDeLaPersona !== $yo->id && ! $yo->rol->veTodasLasMarcas()) {
            abort(403, 'Solo quien reparte el trabajo ve la agenda de otra persona.');
        }

        $persona = User::query()->find($idDeLaPersona);

        if ($persona === null) {
            throw ValidationException::withMessages(['persona' => 'Esa persona no existe.']);
        }

        return $persona;
    }

    /* ------------------------------------------------------------------
     | Lo que se lee de la base
     |-----------------------------------------------------------------*/

    /** @return Collection<int,Recordatorio> */
    private function recordatoriosEntre(User $yo, ?User $persona, CarbonImmutable $desde, CarbonImmutable $hasta): Collection
    {
        // whereDate y no whereBetween: SQLite guarda la fecha con su hora
        // (00:00:00) y el último día se quedaría fuera de la comparación.
        return $this->queVeQuienPregunta(
            Recordatorio::query()
                ->whereDate('fecha', '>=', $desde->toDateString())
                ->whereDate('fecha', '<=', $hasta->toDateString()),
            $yo,
            $persona,
        );
    }

    /** @return Collection<int,Recordatorio> */
    private function atrasadosAntesDe(User $yo, ?User $persona, CarbonImmutable $limite): Collection
    {
        return $this->queVeQuienPregunta(
            Recordatorio::query()->pendientes()->whereDate('fecha', '<', $limite->toDateString()),
            $yo,
            $persona,
        );
    }

    /**
     * Las marcas que ve quien pregunta y, con filtro, los de esa persona.
     * Fuera los que nadie va a hacer: su persona ya no puede ver la marca
     * o su cuenta está desactivada (MarcaPolicy::view mira las dos cosas).
     *
     * @param  \Illuminate\Database\Eloquent\Builder<Recordatorio>  $consulta
     * @return Collection<int,Recordatorio>
     */
    private function queVeQuienPregunta($consulta, User $yo, ?User $persona): Collection
    {
        return $consulta
            ->whereIn('marca_id', Marca::query()->quePuedeVer($yo)->select('id'))
            ->when($persona !== null, fn ($deUnaPersona) => $deUnaPersona->where('persona_id', $persona->id))
            ->with(['marca:id,nombre_marca,logo_url,vendedor_asignado_id,vendedor_asignado_nombre', 'persona'])
            ->orderBy('fecha')
            ->orderBy('hora')
            ->orderBy('created_at')
            ->get()
            ->filter(fn (Recordatorio $recordatorio): bool => $recordatorio->marca !== null
                && $recordatorio->persona !== null
                && $recordatorio->persona->can('view', $recordatorio->marca))
            ->values();
    }

    /**
     * Las acciones de campaña del periodo. Con filtro por persona, las de
     * las marcas que lleva: una acción no es de nadie más que de su marca,
     * y la marca es de su agente (como en el calendario).
     *
     * @return Collection<int,EventoDeCampana>
     */
    private function accionesEntre(User $yo, ?User $persona, CarbonImmutable $desde, CarbonImmutable $hasta): Collection
    {
        return EventoDeCampana::query()
            ->whereIn('marca_id', Marca::query()->quePuedeVer($yo)->select('id'))
            ->whereDate('fecha', '>=', $desde->toDateString())
            ->whereDate('fecha', '<=', $hasta->toDateString())
            ->when($persona !== null, fn ($consulta) => $consulta->whereIn(
                'marca_id',
                Marca::query()->where('vendedor_asignado_id', $persona->id)->select('id'),
            ))
            ->with('marca:id,nombre_marca,logo_url,vendedor_asignado_id,vendedor_asignado_nombre')
            ->orderBy('fecha')
            ->orderBy('created_at')
            ->get()
            ->filter(fn (EventoDeCampana $accion): bool => $accion->marca !== null)
            ->values();
    }

    /** @return list<array{id:string,nombre:string,rol:string}> */
    private function personasDelEquipo(): array
    {
        return User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->map(fn (User $persona): array => [
                'id' => $persona->id,
                'nombre' => $persona->nombreParaMostrar(),
                'rol' => $persona->rol->etiqueta(),
            ])
            ->all();
    }

    /* ------------------------------------------------------------------
     | Cómo se cuenta
     |-----------------------------------------------------------------*/

    /**
     * @param  Collection<int,Recordatorio>  $recordatorios
     * @param  Collection<int,EventoDeCampana>  $acciones
     * @param  Collection<int,Recordatorio>  $atrasados
     * @return array<string,mixed>
     */
    private function resumen(Collection $recordatorios, Collection $acciones, Collection $atrasados, User $yo, ?User $persona): array
    {
        $porHacer = $recordatorios->reject(fn (Recordatorio $recordatorio): bool => $recordatorio->estaCumplido());

        $porTipo = collect(TipoDeContacto::cases())
            ->map(fn (TipoDeContacto $tipo): array => [
                'tipo' => $tipo->value,
                'etiqueta' => $tipo->etiqueta(),
                'total' => $porHacer->filter(fn (Recordatorio $recordatorio): bool => $recordatorio->tipo === $tipo)->count(),
            ])
            ->push([
                'tipo' => null,
                'etiqueta' => 'Otros recordatorios',
                'total' => $porHacer->whereNull('tipo')->count(),
            ])
            ->values()
            ->all();

        $marcasDelPeriodo = $recordatorios->pluck('marca_id')->merge($acciones->pluck('marca_id'))->unique();

        // Sin siguiente paso: la cifra del resumen, con el mismo corte por
        // persona que «Carga por agente» (las marcas que lleva).
        [$condicion, $valores] = SiguientePasoDeLasMarcas::faltaSql();
        $sinSiguientePaso = Marca::query()
            ->quePuedeVer($yo)
            ->when($persona !== null, fn ($consulta) => $consulta->where('vendedor_asignado_id', $persona->id))
            ->whereRaw($condicion, $valores)
            ->count();

        return [
            'porHacer' => $porHacer->count(),
            'hechos' => $recordatorios->count() - $porHacer->count(),
            'acciones' => $acciones->count(),
            'atrasados' => $atrasados->count(),
            'marcas' => $marcasDelPeriodo->count(),
            'sinSiguientePaso' => $sinSiguientePaso,
            'porTipo' => $porTipo,
            'porPersona' => $this->porPersona($porHacer, $acciones, $atrasados),
        ];
    }

    /**
     * Quién tiene qué: lo suyo por hacer, por tipo; las acciones de las
     * marcas que lleva, y lo que tiene atrasado. De más a menos trabajo.
     *
     * @param  Collection<int,Recordatorio>  $porHacer
     * @param  Collection<int,EventoDeCampana>  $acciones
     * @param  Collection<int,Recordatorio>  $atrasados
     * @return list<array<string,mixed>>
     */
    private function porPersona(Collection $porHacer, Collection $acciones, Collection $atrasados): array
    {
        $filas = [];

        $fila = function (?string $id, string $nombre) use (&$filas): string {
            $clave = $id ?? 'sin-agente';
            $filas[$clave] ??= [
                'personaId' => $id,
                'nombre' => $nombre,
                'porHacer' => 0,
                'porTipo' => array_fill_keys(array_map(fn (TipoDeContacto $tipo): string => $tipo->value, TipoDeContacto::cases()), 0),
                'acciones' => 0,
                'atrasados' => 0,
            ];

            return $clave;
        };

        foreach ($porHacer as $recordatorio) {
            $clave = $fila($recordatorio->persona_id, $recordatorio->persona->nombreParaMostrar());
            $filas[$clave]['porHacer']++;

            if ($recordatorio->tipo !== null) {
                $filas[$clave]['porTipo'][$recordatorio->tipo->value]++;
            }
        }

        foreach ($acciones as $accion) {
            $clave = $fila(
                $accion->marca->vendedor_asignado_id,
                $accion->marca->vendedor_asignado_nombre ?: 'Sin agente',
            );
            $filas[$clave]['acciones']++;
        }

        foreach ($atrasados as $recordatorio) {
            $clave = $fila($recordatorio->persona_id, $recordatorio->persona->nombreParaMostrar());
            $filas[$clave]['atrasados']++;
        }

        return collect($filas)
            ->sortBy([
                fn (array $una, array $otra): int => ($otra['porHacer'] + $otra['acciones']) <=> ($una['porHacer'] + $una['acciones']),
                fn (array $una, array $otra): int => strcasecmp($una['nombre'], $otra['nombre']),
            ])
            ->values()
            ->all();
    }

    /**
     * Los días que tienen algo, en orden. Dentro de cada uno, primero las
     * acciones de campaña (son «de todo el día»), después lo que no tiene
     * hora y por último lo que sí, de la más temprana a la más tarde.
     *
     * @param  Collection<int,Recordatorio>  $recordatorios
     * @param  Collection<int,EventoDeCampana>  $acciones
     * @return list<array<string,mixed>>
     */
    private function diaPorDia(Collection $recordatorios, Collection $acciones, CarbonImmutable $hoy): array
    {
        $porDia = [];

        foreach ($acciones as $accion) {
            $porDia[$accion->fecha->toDateString()][] = $this->accionComoFila($accion);
        }

        // Ya vienen ordenados por día y hora (sin hora, delante).
        foreach ($recordatorios as $recordatorio) {
            $porDia[$recordatorio->fecha->toDateString()][] = $this->recordatorioComoFila($recordatorio, $hoy);
        }

        ksort($porDia);

        $dias = [];

        foreach ($porDia as $fecha => $cosas) {
            $dia = CarbonImmutable::createFromFormat('Y-m-d', $fecha)->startOfDay();

            $dias[] = [
                'fecha' => $fecha,
                // «lunes 12 de octubre»: redactado aquí para que la
                // pantalla, el PDF y la hoja digan lo mismo.
                'etiqueta' => $dia->locale('es')->isoFormat('dddd D [de] MMMM'),
                'esHoy' => $dia->isSameDay($hoy),
                'cosas' => $cosas,
            ];
        }

        return $dias;
    }

    /** @return array<string,mixed> */
    private function recordatorioComoFila(Recordatorio $recordatorio, CarbonImmutable $hoy): array
    {
        return [
            'clase' => 'recordatorio',
            'id' => $recordatorio->id,
            'fecha' => $recordatorio->fecha->toDateString(),
            'hora' => $recordatorio->hora,
            'tipo' => $recordatorio->tipo === null ? null : [
                'valor' => $recordatorio->tipo->value,
                'etiqueta' => $recordatorio->tipo->etiqueta(),
            ],
            'nota' => $recordatorio->nota,
            'cumplido' => $recordatorio->estaCumplido(),
            'cumplidoPorNombre' => $recordatorio->cumplido_por_nombre,
            // Lo que ya tenía que estar hecho y no lo está.
            'vencido' => ! $recordatorio->estaCumplido() && $recordatorio->fecha->lessThan($hoy),
            'persona' => [
                'id' => $recordatorio->persona_id,
                'nombre' => $recordatorio->persona->nombreParaMostrar(),
            ],
            'creadoPorNombre' => $recordatorio->creado_por_nombre,
            'marca' => $this->marcaComoFila($recordatorio->marca),
        ];
    }

    /** @return array<string,mixed> */
    private function accionComoFila(EventoDeCampana $accion): array
    {
        return [
            'clase' => 'campana',
            'id' => $accion->id,
            'fecha' => $accion->fecha->toDateString(),
            'hora' => null,
            'campana' => [
                'nombre' => $accion->campana_nombre,
                'color' => $accion->campana_color ?: '#94a3b8',
            ],
            'nota' => $accion->nota,
            'agenteNombre' => $accion->marca->vendedor_asignado_nombre,
            'registradoPorNombre' => $accion->registrado_por_nombre,
            'marca' => $this->marcaComoFila($accion->marca),
        ];
    }

    /** @return array{id:string,nombre:string,logoUrl:?string} */
    private function marcaComoFila(Marca $marca): array
    {
        return [
            'id' => $marca->id,
            'nombre' => $marca->nombre_marca,
            'logoUrl' => $marca->logo_url,
        ];
    }

    /**
     * «del 12 al 18 de octubre de 2026», «del 28 de octubre al 3 de
     * noviembre de 2026» o «el 12 de octubre de 2026».
     */
    private function etiquetaDelRango(CarbonImmutable $desde, CarbonImmutable $hasta): string
    {
        $mesDe = fn (CarbonImmutable $dia): string => $dia->locale('es')->monthName;

        if ($desde->isSameDay($hasta)) {
            return sprintf('el %d de %s de %d', $desde->day, $mesDe($desde), $desde->year);
        }

        if ($desde->year !== $hasta->year) {
            return sprintf(
                'del %d de %s de %d al %d de %s de %d',
                $desde->day, $mesDe($desde), $desde->year,
                $hasta->day, $mesDe($hasta), $hasta->year,
            );
        }

        if ($desde->month !== $hasta->month) {
            return sprintf(
                'del %d de %s al %d de %s de %d',
                $desde->day, $mesDe($desde),
                $hasta->day, $mesDe($hasta), $hasta->year,
            );
        }

        return sprintf('del %d al %d de %s de %d', $desde->day, $hasta->day, $mesDe($hasta), $hasta->year);
    }
}
