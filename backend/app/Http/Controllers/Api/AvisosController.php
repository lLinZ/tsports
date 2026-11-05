<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AjusteDeAviso;
use App\Models\MensajeDeChat;
use App\Models\Notificacion;
use App\Models\RegistroActividad;
use App\Models\SuscripcionPush;
use App\Models\User;
use App\Support\AjustesDeAvisos;
use App\Support\Push;
use App\Support\TiempoReal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * AvisosController — la pantalla «Avisos» del administrador.
 * ---------------------------------------------------------------------
 * Desde el 2026-11-05 (propuesta «Panel de avisos», aprobada por LinZ).
 * Hasta entonces el sistema mandaba seis avisos y nadie podía ver cuáles
 * salían, a quién ni si llegaban. Tres respuestas:
 *
 *   · `index`  → cada canal, si funciona; y cada aviso, cuándo salta, a
 *     quién le llega, por dónde, cuántos salieron en 30 días y si está
 *     encendido.
 *   · `update` → encender o apagar un aviso, y en los de grupo, elegir a
 *     qué roles les llega. Lo que se puede elegir lo dice
 *     AjustesDeAvisos; nunca hay casilla para quien no puede ver la marca.
 *   · `envios` → el registro: cada aviso que salió y qué pasó en cada
 *     canal (Notificador y EnviarAvisoPush lo apuntan en la fila).
 *
 * SOLO EL ADMINISTRADOR (`UserPolicy::configurarAvisos`). Ver el registro
 * es ver los títulos de los avisos de otros: por eso no se abre a nadie
 * más, aunque cada quien siga leyendo solo SUS avisos en la campanita.
 */
class AvisosController extends Controller
{
    /** Los días que se pueden mirar en el registro. */
    private const DIAS_DEL_REGISTRO = [7, 30, 90];

    private const ENVIOS_POR_PAGINA = 50;

    /**
     * GET /api/avisos
     */
    public function index(): JsonResponse
    {
        $this->authorize('configurarAvisos', User::class);

        $ajustes = AjustesDeAvisos::vigentes();
        $hace30Dias = now()->subDays(30);

        $porTipo = Notificacion::query()
            ->where('created_at', '>=', $hace30Dias)
            ->groupBy('tipo')
            ->selectRaw('tipo, COUNT(*) as cantidad, MAX(created_at) as ultimo')
            ->get()
            ->keyBy('tipo');

        $mensajesDelChat = MensajeDeChat::query()
            ->where('tipo', '!=', MensajeDeChat::TIPO_SISTEMA)
            ->where('created_at', '>=', $hace30Dias);

        $avisos = collect(AjustesDeAvisos::TIPOS)->map(function (string $tipo) use ($ajustes, $porTipo, $mensajesDelChat): array {
            $esElChat = $tipo === AjustesDeAvisos::CHAT;
            $ajuste = $ajustes->ajusteDe($tipo);

            return [
                'tipo' => $tipo,
                'nombre' => AjustesDeAvisos::nombre($tipo),
                'cuandoSalta' => AjustesDeAvisos::cuandoSalta($tipo),
                'aQuienVa' => AjustesDeAvisos::aQuienVa($tipo),
                'destinatarios' => collect($ajustes->destinatarios($tipo))
                    ->map(fn (bool $llega, string $clave): array => [
                        'clave' => $clave,
                        'etiqueta' => AjustesDeAvisos::etiquetaDelDestinatario($clave),
                        'llega' => $llega,
                    ])
                    ->values(),
                // Lo que no se puede elegir, dicho con su motivo, para que
                // la pantalla lo enseñe bloqueado en vez de esconderlo.
                'bloqueados' => $tipo === Notificacion::TIPO_LEAD_NUEVO
                    ? [['etiqueta' => 'Agente', 'motivo' => 'no ve los leads sin dueño']]
                    : [],
                'canales' => [
                    'campanita' => AjustesDeAvisos::vaALaCampanita($tipo),
                    'pantalla' => true,
                    'movil' => true,
                    'sonido' => true,
                ],
                'activo' => $ajustes->estaActivo($tipo),
                'ultimos30Dias' => $esElChat
                    ? [
                        'cantidad' => (clone $mensajesDelChat)->count(),
                        'ultimoEn' => optional((clone $mensajesDelChat)->max('created_at'), fn ($momento) => \Carbon\CarbonImmutable::parse($momento)->toIso8601String()),
                    ]
                    : [
                        'cantidad' => (int) ($porTipo->get($tipo)?->cantidad ?? 0),
                        'ultimoEn' => optional($porTipo->get($tipo)?->ultimo, fn ($momento) => \Carbon\CarbonImmutable::parse($momento)->toIso8601String()),
                    ],
                'cambiadoPor' => $ajuste?->cambiado_por_nombre,
                'cambiadoEn' => $ajuste?->updated_at?->toIso8601String(),
            ];
        })->values();

        return response()->json([
            'canales' => $this->comoEstanLosCanales($hace30Dias),
            'avisos' => $avisos,
        ]);
    }

    /**
     * PUT /api/avisos/{tipo}
     */
    public function update(Request $peticion, string $tipo): JsonResponse
    {
        $this->authorize('configurarAvisos', User::class);

        abort_unless(AjustesDeAvisos::existe($tipo), 404, 'Ese aviso no existe.');

        $elegibles = AjustesDeAvisos::destinatariosElegibles($tipo);

        $datos = $peticion->validate(
            [
                'activo' => ['required', 'boolean'],
                'destinatarios' => [$elegibles === [] ? 'prohibited' : 'nullable', 'array'],
                'destinatarios.*' => ['boolean'],
            ],
            [
                'activo.*' => 'Indica si el aviso queda encendido o apagado.',
                'destinatarios.prohibited' => 'Este aviso va a la persona de la que se trata: no hay a quién elegir.',
                'destinatarios.*' => 'Indica a quién le llega con sí o no.',
            ],
        );

        // Una casilla que no existe se rechaza: así no se puede poner a un
        // agente en el lead escribiendo la petición a mano (regla 6).
        $sobran = array_diff(array_keys($datos['destinatarios'] ?? []), $elegibles);
        abort_if($sobran !== [], 422, 'A ese aviso no se le puede añadir: '.implode(', ', $sobran).'.');

        $antes = AjustesDeAvisos::vigentes();
        /** @var User $quien */
        $quien = $peticion->user();

        $destinatarios = $elegibles === []
            ? null
            : array_merge($antes->destinatarios($tipo), array_map('boolval', $datos['destinatarios'] ?? []));

        AjusteDeAviso::query()->updateOrCreate(['tipo' => $tipo], [
            'activo' => (bool) $datos['activo'],
            'destinatarios' => $destinatarios,
            'cambiado_por_nombre' => $quien->nombreParaMostrar(),
        ]);

        $nombre = AjustesDeAvisos::nombre($tipo);
        $estabaActivo = $antes->estaActivo($tipo);
        $descripcion = match (true) {
            $estabaActivo && ! $datos['activo'] => "Apagó el aviso «{$nombre}»",
            ! $estabaActivo && $datos['activo'] => "Encendió el aviso «{$nombre}»",
            default => "Cambió a quién le llega el aviso «{$nombre}»",
        };

        RegistroActividad::anotar(
            $quien,
            RegistroActividad::ACCION_ACTUALIZO,
            'aviso',
            null,
            $descripcion,
            [
                'antes' => ['activo' => $estabaActivo, 'destinatarios' => $antes->destinatarios($tipo)],
                'despues' => ['activo' => (bool) $datos['activo'], 'destinatarios' => $destinatarios ?? []],
            ],
        );

        return $this->index();
    }

    /**
     * GET /api/avisos/envios?persona=…&tipo=…&dias=7&resultado=sin_llegar&page=2
     */
    public function envios(Request $peticion): JsonResponse
    {
        $this->authorize('configurarAvisos', User::class);

        $datos = $peticion->validate([
            'persona' => ['nullable', 'uuid'],
            'tipo' => ['nullable', Rule::in(array_diff(AjustesDeAvisos::TIPOS, [AjustesDeAvisos::CHAT]))],
            'dias' => ['nullable', 'integer', Rule::in(self::DIAS_DEL_REGISTRO)],
            'resultado' => ['nullable', Rule::in(['todos', 'sin_llegar'])],
        ]);

        $dias = (int) ($datos['dias'] ?? self::DIAS_DEL_REGISTRO[0]);
        $desde = now()->subDays($dias);

        $delPeriodo = Notificacion::query()->where('created_at', '>=', $desde);

        $consulta = (clone $delPeriodo)
            ->with('destinatario:id,name')
            ->when($datos['persona'] ?? null, fn ($filtro, $persona) => $filtro->where('destinatario_id', $persona))
            ->when($datos['tipo'] ?? null, fn ($filtro, $tipo) => $filtro->where('tipo', $tipo))
            ->when(($datos['resultado'] ?? 'todos') === 'sin_llegar', fn ($filtro) => $filtro
                ->whereNull('leida_en')
                ->where(fn ($sinEntregar) => $sinEntregar
                    ->whereNull('entrega_al_movil')
                    ->orWhere('entrega_al_movil', '!=', Notificacion::MOVIL_ENTREGADO)))
            // Desempate por id: dos avisos del mismo instante (un lead que
            // va a tres personas) no pueden cambiar de orden entre páginas.
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        $pagina = $consulta->paginate(self::ENVIOS_POR_PAGINA);

        $total = (clone $delPeriodo)->count();
        $leidosOEntregados = (clone $delPeriodo)
            ->where(fn ($llegaron) => $llegaron->whereNotNull('leida_en')->orWhere('entrega_al_movil', Notificacion::MOVIL_ENTREGADO))
            ->count();

        return response()->json([
            'data' => collect($pagina->items())->map(fn (Notificacion $notificacion): array => [
                'id' => $notificacion->id,
                'creadaEn' => $notificacion->created_at?->toIso8601String(),
                'tipo' => $notificacion->tipo,
                'titulo' => $notificacion->titulo,
                'cuerpo' => $notificacion->cuerpo,
                'destinatario' => $notificacion->destinatario === null ? null : [
                    'id' => $notificacion->destinatario->id,
                    'nombre' => $notificacion->destinatario->nombreParaMostrar(),
                ],
                'enPantalla' => $notificacion->entrega_en_pantalla,
                'alMovil' => $notificacion->entrega_al_movil,
                'alMovilDetalle' => $notificacion->entrega_al_movil_detalle,
                'leidaEn' => $notificacion->leida_en?->toIso8601String(),
            ])->values(),
            'meta' => [
                'total' => $pagina->total(),
                'current_page' => $pagina->currentPage(),
                'last_page' => $pagina->lastPage(),
            ],
            'resumen' => [
                'dias' => $dias,
                'total' => $total,
                'porcentajeLeidosOEntregados' => $total > 0 ? round($leidosOEntregados * 100 / $total, 1) : null,
                'fallaronAlMovil' => (clone $delPeriodo)->where('entrega_al_movil', Notificacion::MOVIL_FALLO)->count(),
                'personasSinMovil' => $this->personasSinMovil(),
            ],
            // Para el filtro por persona: el equipo activo.
            'personas' => User::query()
                ->where('activo', true)
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (User $persona): array => ['id' => $persona->id, 'nombre' => $persona->nombreParaMostrar()])
                ->values(),
        ]);
    }

    /**
     * Si cada canal está funcionando, sin abrir el servidor.
     *
     * @return array<string, mixed>
     */
    private function comoEstanLosCanales(\DateTimeInterface $hace30Dias): array
    {
        $ultimoAvisoDeLaManana = Notificacion::query()
            ->where('tipo', Notificacion::TIPO_RECORDATORIOS_DEL_DIA)
            ->max('created_at');

        $personasDeEsaManana = $ultimoAvisoDeLaManana === null
            ? 0
            : Notificacion::query()
                ->where('tipo', Notificacion::TIPO_RECORDATORIOS_DEL_DIA)
                ->whereDate('created_at', \Carbon\CarbonImmutable::parse($ultimoAvisoDeLaManana)->toDateString())
                ->distinct()
                ->count('destinatario_id');

        return [
            'campanita' => [
                'guardados30Dias' => Notificacion::query()->where('created_at', '>=', $hace30Dias)->count(),
            ],
            'pantalla' => [
                'activo' => TiempoReal::estaActivo(),
                // «En línea» es tener el panel a la vista (regla 20).
                'conectadosAhora' => User::query()->where('activo', true)->where('en_linea_hasta', '>', now())->count(),
            ],
            'movil' => [
                'activo' => Push::estaActivo(),
                'dispositivos' => SuscripcionPush::query()->count(),
                'personas' => SuscripcionPush::query()->distinct()->count('usuario_id'),
                'personasSinMovil' => $this->personasSinMovil(),
                'ultimoEnvioEn' => optional(SuscripcionPush::query()->max('ultimo_envio_en'), fn ($momento) => \Carbon\CarbonImmutable::parse($momento)->toIso8601String()),
            ],
            'manana' => [
                'ultimaVezEn' => optional($ultimoAvisoDeLaManana, fn ($momento) => \Carbon\CarbonImmutable::parse($momento)->toIso8601String()),
                'personas' => $personasDeEsaManana,
            ],
        ];
    }

    /** Cuentas activas sin ningún dispositivo con los avisos al móvil. */
    private function personasSinMovil(): int
    {
        return User::query()
            ->where('activo', true)
            ->whereNotIn('id', SuscripcionPush::query()->select('usuario_id'))
            ->count();
    }
}
