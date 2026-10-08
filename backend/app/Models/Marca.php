<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\EstadoDeMarca;
use App\Enums\InversionEnPatrocinios;
use App\Enums\MotivoDeMovimiento;
use App\Enums\OrigenMarca;
use App\Support\EstadoDeLasMarcas;
use App\Support\SiguientePasoDeLasMarcas;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Marca — una oportunidad de patrocinio dentro del CRM.
 * ---------------------------------------------------------------------
 * Cada fila es una empresa a la que el equipo quiere venderle un
 * patrocinio, con su ficha de contacto y el avance del proceso.
 *
 * Reglas de negocio que este modelo garantiza por sí solo:
 *
 *  · La fase de PROSPECCIÓN nunca se marca a mano: se recalcula cada vez
 *    que se guarda, y está completa cuando la marca tiene nombre, logo,
 *    persona de contacto, cargo y email. Así el indicador no puede
 *    mentir, que es lo que ocurría cuando era una casilla manual.
 *
 *  · El VALOR solo cuenta si hay propuesta enviada. Sin propuesta el
 *    importe se pone a cero, para que el total del pipeline no infle
 *    cifras de marcas con las que aún no se ha hablado de dinero.
 *
 *  · El ÚLTIMO MOVIMIENTO solo avanza con lo que de verdad mueve una
 *    marca (alta, fase, valor de la propuesta). Corregir el teléfono o el
 *    logo no lo toca. De él sale si está caliente, tibia o fría.
 *
 * @property string $id
 * @property OrigenMarca $origen
 * @property InversionEnPatrocinios $invierte_actualmente
 */
class Marca extends Model
{
    use HasUuids;

    protected $table = 'marcas';

    protected $fillable = [
        'nombre_marca',
        'sector',
        'logo_url',
        'zona',
        'campana_id',
        'fecha_campana',
        'invierte_actualmente',
        'via_prospeccion',
        'persona_contacto',
        'cargo_contacto',
        'email_contacto',
        'telefono_contacto',
        'notas',
        'fase_aproximacion_completada',
        'via_aproximacion',
        'fase_propuesta_completada',
        'descripcion_propuesta',
        'valor_anual_usd',
        'registrada_por_id',
        'registrada_por_nombre',
        'vendedor_asignado_id',
        'vendedor_asignado_nombre',
        'origen',
    ];

    protected function casts(): array
    {
        return [
            'fase_prospeccion_completada' => 'boolean',
            'fase_aproximacion_completada' => 'boolean',
            'fase_propuesta_completada' => 'boolean',
            'valor_anual_usd' => 'decimal:2',
            // Solo el día: el equipo planifica por jornadas, no por horas.
            'fecha_campana' => 'date',
            'invierte_actualmente' => InversionEnPatrocinios::class,
            'origen' => OrigenMarca::class,
            'ultimo_movimiento_en' => 'datetime',
            'ultimo_movimiento_motivo' => MotivoDeMovimiento::class,
            'estado_fijado' => EstadoDeMarca::class,
            'estado_fijado_en' => 'datetime',
        ];
    }

    /**
     * Los campos cuyo cambio cuenta como «se marcó una fase». La
     * prospección entra aunque no se marque a mano: completarla (o
     * perderla) también es moverse en esa fase.
     */
    private const CAMPOS_DE_FASE = [
        'fase_prospeccion_completada',
        'fase_aproximacion_completada',
        'fase_propuesta_completada',
    ];

    /**
     * Lo que se calculó del estado en la misma consulta (ver
     * `scopeConEstado`), o null si esta marca todavía no lo tiene.
     *
     * @var array{automatico: EstadoDeMarca, proximaAccionEl: ?string, ultimaAccionEl: ?string}|null
     */
    private ?array $estadoCalculado = null;

    /**
     * Campos obligatorios para dar la prospección por cerrada. Se declara
     * como constante para que la interfaz pueda pedir la misma lista al
     * backend y las dos partes nunca discrepen sobre "qué falta".
     */
    public const CAMPOS_OBLIGATORIOS_DE_PROSPECCION = [
        'nombre_marca' => 'nombre de la marca',
        'logo_url' => 'logo',
        'persona_contacto' => 'persona de contacto',
        'cargo_contacto' => 'cargo',
        'email_contacto' => 'email',
    ];

    /**
     * Al guardar recalculamos los campos derivados. Ponerlo en el modelo
     * y no en el controlador asegura que la regla también se cumpla
     * cuando la marca nace de un seeder o de la importación de Supabase.
     */
    protected static function booted(): void
    {
        static::saving(function (Marca $marca): void {
            $marca->fase_prospeccion_completada = $marca->tieneLaProspeccionCompleta();

            // Sin propuesta enviada no hay importe que contar.
            if (! $marca->fase_propuesta_completada) {
                $marca->valor_anual_usd = 0;
            }

            // Va después de lo anterior a propósito: la prospección se
            // acaba de recalcular, y completarla es un cambio de fase.
            $marca->anotarElMovimientoSiLoHay();
        });
    }

    /**
     * Apunta que la marca se movió, si lo que se está guardando es un
     * movimiento. Una edición que solo corrige datos de contacto no lo es.
     */
    private function anotarElMovimientoSiLoHay(): void
    {
        $motivo = match (true) {
            ! $this->exists => MotivoDeMovimiento::Alta,
            $this->isDirty(self::CAMPOS_DE_FASE) => MotivoDeMovimiento::Fase,
            $this->isDirty('valor_anual_usd') => MotivoDeMovimiento::Valor,
            default => null,
        };

        if ($motivo === null) {
            return;
        }

        $this->ultimo_movimiento_en = now();
        $this->ultimo_movimiento_motivo = $motivo;
    }

    /**
     * Apunta un movimiento que ocurrió FUERA de la ficha: un comentario o
     * una acción de campaña. Lo llaman esos modelos al crearse.
     *
     * Solo avanza: si la marca ya tiene un movimiento más reciente, no se
     * toca. Así un comentario importado con su fecha antigua no le quita
     * el sitio a lo que se hizo ayer. La actividad nunca enfría.
     *
     * Se escribe directamente en la tabla, sin pasar por `save()`: no hay
     * nada más de la marca que recalcular, y quien la creó ya avisa a las
     * pantallas por su cuenta (ObservadorDeCambiosEnVivo).
     */
    public static function anotarMovimiento(
        string $idDeLaMarca,
        CarbonInterface $instante,
        MotivoDeMovimiento $motivo,
    ): void {
        self::query()
            ->whereKey($idDeLaMarca)
            ->where(function (Builder $consulta) use ($instante): void {
                $consulta->whereNull('ultimo_movimiento_en')
                    ->orWhere('ultimo_movimiento_en', '<', $instante);
            })
            ->toBase()
            ->update([
                'ultimo_movimiento_en' => $instante,
                'ultimo_movimiento_motivo' => $motivo->value,
            ]);
    }

    /* ------------------------------------------------------------------
     | Relaciones
     |-----------------------------------------------------------------*/

    public function registradaPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registrada_por_id');
    }

    public function vendedorAsignado(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendedor_asignado_id');
    }

    public function comentarios(): HasMany
    {
        return $this->hasMany(ComentarioMarca::class, 'marca_id');
    }

    /** Los recordatorios de seguimiento de todo el equipo con esta marca. */
    public function recordatorios(): HasMany
    {
        return $this->hasMany(Recordatorio::class, 'marca_id');
    }

    /**
     * Los que siguen pendientes, del más cercano al más lejano. El tablero
     * los carga acotados a quien mira, para enseñar en la tarjeta su
     * próximo recordatorio.
     */
    public function recordatoriosPendientes(): HasMany
    {
        return $this->recordatorios()
            ->whereNull('cumplido_en')
            ->orderBy('fecha')
            // Dentro del día, primero lo que no tiene hora («ese día») y
            // después por hora: NULL va delante en MariaDB y en SQLite.
            ->orderBy('hora')
            ->orderBy('created_at');
    }

    /** Campaña comercial dentro de la que se trabaja esta marca. */
    public function campana(): BelongsTo
    {
        return $this->belongsTo(Campana::class, 'campana_id');
    }

    /**
     * El historial de acciones de campaña de esta marca.
     *
     * Las columnas `campana_id` y `fecha_campana` guardan la acción EN
     * CURSO —la que se ve y se edita en la ficha—; esto es todo lo que
     * se ha hecho con la marca a lo largo del tiempo, y es lo que
     * alimenta tanto el calendario como el historial de la ficha.
     *
     * De la más reciente a la más antigua: al abrir una marca interesa
     * primero lo último que se hizo con ella.
     */
    public function eventosDeCampana(): HasMany
    {
        return $this->hasMany(EventoDeCampana::class, 'marca_id')
            ->orderByDesc('fecha')
            ->orderByDesc('created_at');
    }

    /**
     * Vuelve a fijar la acción en curso a partir del historial.
     *
     * `campana_id` y `fecha_campana` guardan la acción vigente —lo que
     * se ve en la ficha y lo que se filtra en el tablero—, y el
     * historial es el registro completo. Al corregir o borrar un evento
     * las dos cosas pueden separarse: si se borra justo el más reciente,
     * la marca seguiría apuntando a una acción que ya no existe.
     *
     * Aquí se restablece la regla: la acción en curso de una marca es
     * siempre su evento más reciente, y si se queda sin historial, se
     * queda sin acción.
     */
    public function sincronizarAccionEnCursoConSuHistorial(): void
    {
        // Se consulta la relación de nuevo en vez de usar la que pudiera
        // estar cargada en memoria: si acaba de borrarse un evento, la
        // copia cargada todavía lo incluiría.
        $eventoMasReciente = $this->eventosDeCampana()->first();

        $this->campana_id = $eventoMasReciente?->campana_id;
        $this->fecha_campana = $eventoMasReciente?->fecha;

        $this->save();
    }

    /**
     * El checklist de prospección: qué propiedades (productos IOP) se le
     * están ofreciendo a esta marca y cuánto pronostica venderle el
     * vendedor de cada una.
     */
    public function propiedadesOfrecidas(): HasMany
    {
        return $this->hasMany(PropiedadDeMarca::class, 'marca_id');
    }

    /* ------------------------------------------------------------------
     | Reglas de negocio
     |-----------------------------------------------------------------*/

    /**
     * Lista legible de los datos que le faltan a la marca para cerrar la
     * prospección. Devuelve un arreglo vacío cuando ya está completa.
     *
     * @return list<string>
     */
    public function datosQueFaltanParaProspeccion(): array
    {
        $datosFaltantes = [];

        foreach (self::CAMPOS_OBLIGATORIOS_DE_PROSPECCION as $columna => $etiquetaLegible) {
            if (trim((string) $this->{$columna}) === '') {
                $datosFaltantes[] = $etiquetaLegible;
            }
        }

        return $datosFaltantes;
    }

    public function tieneLaProspeccionCompleta(): bool
    {
        return $this->datosQueFaltanParaProspeccion() === [];
    }

    /**
     * Una marca sin vendedor asignado está "sin dueño". Es el caso de los
     * leads que llegan por el formulario público: el primero del equipo
     * que los trabaje se los queda.
     */
    public function estaSinDuenio(): bool
    {
        return $this->vendedor_asignado_id === null;
    }

    /**
     * Suma de los pronósticos (OVP) de todas las propiedades que se le
     * están ofreciendo a esta marca.
     *
     * Ojo con la diferencia respecto a `valor_anual_usd`: aquel es el
     * importe de la propuesta ya enviada, y este es lo que el vendedor
     * cree que va a vender dentro de los productos IOP. Son dos cifras
     * distintas y el tablero no las mezcla nunca.
     */
    public function ovpTotal(): float
    {
        return (float) $this->propiedadesOfrecidas->sum(
            fn (PropiedadDeMarca $lineaDelChecklist): float => (float) $lineaDelChecklist->ovp_usd,
        );
    }

    /**
     * Etapa resumida para los filtros del tablero. No es una columna: se
     * deriva de las tres fases, que son independientes entre sí.
     */
    public function etapaResumida(): string
    {
        $laProspeccionEstaLista = $this->tieneLaProspeccionCompleta();

        if ($this->fase_aproximacion_completada && $laProspeccionEstaLista && $this->fase_propuesta_completada) {
            return 'completa';
        }

        if ($this->fase_propuesta_completada) {
            return 'propuesta';
        }

        if ($laProspeccionEstaLista) {
            return 'prospeccion';
        }

        if ($this->fase_aproximacion_completada) {
            return 'aproximacion';
        }

        return 'sin_iniciar';
    }

    /* ------------------------------------------------------------------
     | Caliente, tibia o fría (la fórmula está en EstadoDeLasMarcas)
     |-----------------------------------------------------------------*/

    /** El estado que se enseña: el fijado a mano, o si no, el calculado. */
    public function estado(): EstadoDeMarca
    {
        return $this->estado_fijado ?? $this->estadoAutomatico();
    }

    /** El que diría el sistema si nadie lo hubiera fijado. */
    public function estadoAutomatico(): EstadoDeMarca
    {
        return $this->estadoCalculado()['automatico'];
    }

    /** La próxima acción de campaña (hoy o por delante), como día. */
    public function proximaAccionEl(): ?string
    {
        return $this->estadoCalculado()['proximaAccionEl'];
    }

    /**
     * Cuándo se movió la marca por última vez y por qué.
     *
     * Es el más reciente entre lo apuntado en la marca y la última acción
     * de campaña ya pasada: una visita agendada hace un mes para ayer es
     * un movimiento de ayer, aunque se anotara hace un mes.
     *
     * @return array{el: CarbonImmutable, motivo: MotivoDeMovimiento}
     */
    public function ultimoMovimiento(): array
    {
        $apuntado = CarbonImmutable::instance($this->ultimo_movimiento_en ?? $this->created_at ?? now());

        $ultimaAccion = $this->estadoCalculado()['ultimaAccionEl'];

        if ($ultimaAccion !== null) {
            $diaDeLaAccion = CarbonImmutable::createFromFormat('Y-m-d', $ultimaAccion)->startOfDay();

            if ($diaDeLaAccion->greaterThan($apuntado->startOfDay())) {
                return ['el' => $diaDeLaAccion, 'motivo' => MotivoDeMovimiento::AccionDeCampana];
            }
        }

        return [
            'el' => $apuntado,
            'motivo' => $this->ultimo_movimiento_motivo ?? MotivoDeMovimiento::Alta,
        ];
    }

    /**
     * Olvida el estado calculado. Lo llama quien acaba de cambiar algo que
     * lo mueve y va a devolver esta misma marca.
     */
    public function olvidarElEstadoCalculado(): void
    {
        $this->estadoCalculado = null;
        unset($this->attributes['estado_automatico'], $this->attributes['proxima_accion_el'], $this->attributes['ultima_accion_el']);
    }

    /**
     * Lo que se calculó en SQL junto a la marca.
     *
     * El tablero lo trae en la misma consulta del listado
     * (`scopeConEstado`). Una marca que llega sin ello —la ficha, la
     * respuesta de un guardado— lo pide en una consulta aparte, con la
     * MISMA fórmula: nunca se recalcula en PHP.
     *
     * @return array{automatico: EstadoDeMarca, proximaAccionEl: ?string, ultimaAccionEl: ?string}
     */
    private function estadoCalculado(): array
    {
        if ($this->estadoCalculado !== null) {
            return $this->estadoCalculado;
        }

        $fila = array_key_exists('estado_automatico', $this->attributes)
            ? $this->attributes
            : (array) self::query()->conEstado()->whereKey($this->getKey())->toBase()->first();

        return $this->estadoCalculado = [
            'automatico' => EstadoDeMarca::tryFrom((string) ($fila['estado_automatico'] ?? '')) ?? EstadoDeMarca::Fria,
            // MySQL devuelve el día; SQLite, el día con la hora a cero.
            'proximaAccionEl' => isset($fila['proxima_accion_el']) ? substr((string) $fila['proxima_accion_el'], 0, 10) : null,
            'ultimaAccionEl' => isset($fila['ultima_accion_el']) ? substr((string) $fila['ultima_accion_el'], 0, 10) : null,
        ];
    }

    /* ------------------------------------------------------------------
     | Scopes de consulta (los usa el listado del tablero)
     |-----------------------------------------------------------------*/

    /**
     * Trae, junto a cada marca, lo necesario para pintar su estado: el
     * calculado (sin contar lo fijado a mano), su próxima acción y su
     * última acción ya pasada. Todo en la misma consulta, para que un
     * tablero de sesenta tarjetas no haga sesenta consultas más.
     */
    public function scopeConEstado(Builder $consulta, ?EstadoDeLasMarcas $estados = null): Builder
    {
        $estados ??= EstadoDeLasMarcas::conLosUmbralesVigentes();
        $hoy = $estados->hoy()->format('Y-m-d');

        // `selectRaw` sobre una consulta sin columnas elegidas dejaría
        // SOLO la columna nueva, sin los datos de la marca.
        if ($consulta->getQuery()->columns === null) {
            $consulta->select('marcas.*');
        }

        [$columnaDelEstado, $valores] = $estados->columnaSql(contandoLoFijado: false);

        return $consulta
            ->selectRaw("{$columnaDelEstado} as estado_automatico", $valores)
            ->selectSub(
                DB::table('eventos_de_campana')
                    ->selectRaw('MIN(fecha)')
                    ->whereColumn('eventos_de_campana.marca_id', 'marcas.id')
                    ->where('fecha', '>=', $hoy),
                'proxima_accion_el',
            )
            ->selectSub(
                DB::table('eventos_de_campana')
                    ->selectRaw('MAX(fecha)')
                    ->whereColumn('eventos_de_campana.marca_id', 'marcas.id')
                    ->where('fecha', '<', $hoy),
                'ultima_accion_el',
            );
    }

    /**
     * Filtra por estado contando lo fijado a mano, que es lo que se ve en
     * la tarjeta y lo que se espera encontrar al filtrar.
     */
    public function scopeEnEstado(Builder $consulta, ?string $estado, ?EstadoDeLasMarcas $estados = null): Builder
    {
        if (EstadoDeMarca::tryFrom((string) $estado) === null) {
            return $consulta;
        }

        $estados ??= EstadoDeLasMarcas::conLosUmbralesVigentes();
        [$columnaDelEstado, $valores] = $estados->columnaSql();

        return $consulta->whereRaw("({$columnaDelEstado}) = ?", [...$valores, $estado]);
    }

    /**
     * Solo las marcas que esta persona puede ver: todas para quien
     * reparte, su cartera para el agente.
     *
     * Es la misma regla que `MarcaPolicy::view`, pasada a SQL para los
     * listados, donde preguntar a la política fila por fila no escala. La
     * usan el tablero y el buscador corto de marcas (chat, reportes).
     *
     * Por ID y no por nombre: el nombre se repite entre personas y se
     * puede editar (ver `User::laMarcaEsSuya`). Una marca que lleve el
     * nombre del agente sin su id no le llega, y está bien: es trabajo
     * sin asignar.
     */
    public function scopeQuePuedeVer(Builder $consulta, User $persona): Builder
    {
        if ($persona->rol->veTodasLasMarcas()) {
            return $consulta;
        }

        return $consulta->where('vendedor_asignado_id', $persona->id);
    }

    /** Busca por nombre de marca, persona de contacto o email. */
    public function scopeBuscarTexto(Builder $consulta, ?string $textoBuscado): Builder
    {
        $textoLimpio = trim((string) $textoBuscado);

        if ($textoLimpio === '') {
            return $consulta;
        }

        $patronDeBusqueda = '%' . $textoLimpio . '%';

        return $consulta->where(function (Builder $subconsulta) use ($patronDeBusqueda): void {
            $subconsulta->where('nombre_marca', 'like', $patronDeBusqueda)
                ->orWhere('persona_contacto', 'like', $patronDeBusqueda)
                ->orWhere('email_contacto', 'like', $patronDeBusqueda);
        });
    }

    /** Filtra por zona; el valor especial "sin_zona" trae las huérfanas. */
    public function scopeDeZona(Builder $consulta, ?string $zona): Builder
    {
        if ($zona === null || $zona === '') {
            return $consulta;
        }

        if ($zona === 'sin_zona') {
            return $consulta->where(function (Builder $subconsulta): void {
                $subconsulta->whereNull('zona')->orWhere('zona', '');
            });
        }

        return $consulta->where('zona', $zona);
    }

    /**
     * Filtra por el agente que lleva la marca.
     *
     * La promesa de este filtro es simple: al elegir a una persona salen
     * SUS marcas, todas. Cumplirla pide algo más que comparar el id,
     * porque una marca puede llevar el nombre de alguien y no su id:
     *
     *   · Filas con el nombre escrito y el id vacío. Es el caso REAL y
     *     el que motivó esto: la migración las dejó así cuando el
     *     vendedor de la fila antigua no correspondía a ninguna cuenta
     *     nueva. Antonio filtró por una agente, vio 1 marca de las
     *     varias que lleva, y estas eran las que faltaban.
     *   · Cuentas duplicadas. Si a la misma persona se le llegara a
     *     crear la cuenta dos veces, sus marcas quedarían repartidas
     *     entre dos ids. No consta que ocurra en el equipo; el mismo
     *     criterio lo cubre sin coste, así que se deja dicho.
     *
     * En los dos casos la marca es suya para el equipo, así que también
     * se busca por el nombre que quedó grabado en la fila. Comparar
     * nombres tiene un riesgo asumido —dos personas distintas llamadas
     * igual se mezclarían—, y se acepta a sabiendas: en un equipo de
     * siete personas ese choque no ocurre, y la alternativa es lo que
     * pasaba antes, que era perder marcas sin avisar.
     *
     * El valor puede ser el id de una cuenta o directamente un nombre,
     * para que el desplegable pueda ofrecer también a quien aparece
     * escrito en las marcas pero ya no tiene cuenta.
     */
    public function scopeDeVendedor(Builder $consulta, ?string $vendedor): Builder
    {
        $valorLimpio = trim((string) $vendedor);

        if ($valorLimpio === '') {
            return $consulta;
        }

        // Sin dueño de verdad: ni id ni nombre. Una fila con el nombre
        // puesto ya no cuenta como huérfana, porque ahora sale al
        // filtrar por esa persona.
        if ($valorLimpio === 'sin_asignar') {
            return $consulta->whereNull('vendedor_asignado_id')
                ->where(function (Builder $subconsulta): void {
                    $subconsulta->whereNull('vendedor_asignado_nombre')
                        ->orWhere('vendedor_asignado_nombre', '');
                });
        }

        $usuario = User::query()->find($valorLimpio);

        // Si llega un nombre en vez de un id —la opción que ofrece el
        // desplegable para quien ya no tiene cuenta— se busca solo por él.
        $nombreBuscado = $usuario?->nombreParaMostrar() ?? $valorLimpio;

        return $consulta->where(function (Builder $subconsulta) use ($usuario, $nombreBuscado): void {
            if ($usuario !== null) {
                $subconsulta->orWhere('vendedor_asignado_id', $usuario->id);
            }

            $subconsulta->orWhereRaw(
                'LOWER(TRIM(vendedor_asignado_nombre)) = ?',
                [mb_strtolower(trim($nombreBuscado))],
            );
        });
    }

    /**
     * Qué campañas ha tenido cada marca: una fila por pareja
     * (marca_id, campana_id), sin repetir.
     *
     * UNA MARCA TIENE UNA CAMPAÑA SI LA TIENE PUESTA O SI LA TUVO ALGUNA
     * VEZ. Lo pidió así el equipo el 2026-10-01: lo que se quiere saber es
     * a cuántas marcas llegó cada campaña, no cuántas la llevan hoy. Hasta
     * ese día el panel enseñaba dos cifras («N ahora» y «N alcanzadas») y
     * la pantalla de campañas solo la primera, con lo que una campaña con
     * cinco marcas trabajadas decía cuatro.
     *
     * Salen de dos sitios porque ninguno basta solo:
     *
     *   · `marcas.campana_id` es una sola casilla y guarda la última
     *     campaña: al ponerle otra, la marca desaparece de la anterior.
     *   · `eventos_de_campana` es el historial, pero hay marcas con la
     *     casilla puesta y ninguna acción anotada (las importadas, o las
     *     de antes de que existiera el historial).
     *
     * Por id y no por nombre: una campaña renombrada sigue trayendo sus
     * acciones viejas, que conservan el nombre antiguo dentro del evento
     * (regla 13). El UNION ya quita las parejas repetidas: dos acciones de
     * la misma campaña en la misma marca cuentan una marca.
     */
    public static function campanasQueHaTenido(): QueryBuilder
    {
        return DB::table('marcas')
            ->select('id as marca_id', 'campana_id')
            ->whereNotNull('campana_id')
            ->union(
                DB::table('eventos_de_campana')
                    ->select('marca_id', 'campana_id')
                    ->whereNotNull('campana_id'),
            );
    }

    /**
     * Filtra por campaña: las marcas que la tienen o la tuvieron (ver
     * `campanasQueHaTenido`). "sin_campana" trae las que no han tenido
     * ninguna nunca.
     */
    public function scopeDeCampana(Builder $consulta, ?string $idDeLaCampana): Builder
    {
        if ($idDeLaCampana === null || $idDeLaCampana === '') {
            return $consulta;
        }

        if ($idDeLaCampana === 'sin_campana') {
            return $consulta->whereNotIn(
                'marcas.id',
                DB::query()->fromSub(self::campanasQueHaTenido(), 'parejas')->select('parejas.marca_id'),
            );
        }

        return $consulta->whereIn(
            'marcas.id',
            DB::query()
                ->fromSub(self::campanasQueHaTenido(), 'parejas')
                ->where('parejas.campana_id', $idDeLaCampana)
                ->select('parejas.marca_id'),
        );
    }

    /**
     * Las acciones de campaña programadas dentro de un rango de fechas.
     *
     * Es la consulta que alimenta el calendario del panel. Se exige que
     * la marca tenga campaña además de fecha: una fecha suelta sin
     * campaña no es un evento que se pueda pintar ni etiquetar, y no
     * debería existir (el servidor limpia la una cuando falta la otra),
     * pero comprobarlo aquí evita que un dato torcido salga en blanco
     * en medio del calendario.
     */
    public function scopeConAccionEntre(
        Builder $consulta,
        string $desde,
        string $hasta,
    ): Builder {
        return $consulta
            ->whereNotNull('campana_id')
            ->whereNotNull('fecha_campana')
            ->whereBetween('fecha_campana', [$desde, $hasta]);
    }

    /**
     * Filtra las marcas a las que se les está ofreciendo una propiedad
     * concreta. Es lo que abre el informe de propiedades del resumen al
     * pulsar una de sus barras.
     */
    public function scopeQueOfrecenLaPropiedad(Builder $consulta, ?string $idDeLaPropiedad): Builder
    {
        if ($idDeLaPropiedad === null || $idDeLaPropiedad === '') {
            return $consulta;
        }

        return $consulta->whereHas(
            'propiedadesOfrecidas',
            fn (Builder $subconsulta) => $subconsulta->where('propiedad_id', $idDeLaPropiedad),
        );
    }

    /** Filtra por si la marca invierte hoy en marketing deportivo. */
    public function scopeConInversion(Builder $consulta, ?string $inversion): Builder
    {
        if ($inversion === null || $inversion === '') {
            return $consulta;
        }

        return $consulta->where('invierte_actualmente', $inversion);
    }

    /**
     * `?siguientePaso=sin`: las que no tienen ni un recordatorio pendiente
     * ni una acción de campaña por delante. La condición es la de
     * SiguientePasoDeLasMarcas, la misma con la que cuenta el resumen.
     */
    public function scopeSinSiguientePaso(Builder $consulta, ?string $filtro): Builder
    {
        if ($filtro !== SiguientePasoDeLasMarcas::FILTRO_SIN) {
            return $consulta;
        }

        [$falta, $valores] = SiguientePasoDeLasMarcas::faltaSql();

        return $consulta->whereRaw($falta, $valores);
    }

    /** Filtra por la etapa resumida, replicando en SQL etapaResumida(). */
    public function scopeEnEtapa(Builder $consulta, ?string $etapa): Builder
    {
        return match ($etapa) {
            'completa' => $consulta->where('fase_aproximacion_completada', true)
                ->where('fase_prospeccion_completada', true)
                ->where('fase_propuesta_completada', true),

            'propuesta' => $consulta->where('fase_propuesta_completada', true),

            'prospeccion' => $consulta->where('fase_prospeccion_completada', true)
                ->where('fase_propuesta_completada', false),

            'aproximacion' => $consulta->where('fase_aproximacion_completada', true)
                ->where('fase_prospeccion_completada', false)
                ->where('fase_propuesta_completada', false),

            'sin_iniciar' => $consulta->where('fase_aproximacion_completada', false)
                ->where('fase_prospeccion_completada', false)
                ->where('fase_propuesta_completada', false),

            default => $consulta,
        };
    }

    /**
     * Filtra por UNA fase marcada, sin mirar las otras dos.
     *
     * No es lo mismo que `enEtapa()`, y la diferencia es justo la que
     * hacía falta para poder pulsar los contadores del panel:
     *
     *   · `enEtapa('aproximacion')` reparte las marcas en cajones que no
     *     se pisan, y allí «aproximación» significa «y todavía NO hay
     *     propuesta enviada».
     *   · `conLaFase('aproximacion')` contesta «¿tiene esa casilla
     *     marcada?», que es exactamente lo que cuenta el contador del
     *     panel.
     *
     * Los dos criterios son legítimos y cada uno tiene su sitio: el
     * selector de avance del tablero usa el primero, para que una marca
     * no aparezca en dos filtros a la vez; los contadores usan el
     * segundo, porque miden el trabajo hecho en cada fase aunque la
     * marca haya seguido avanzando. Si al pulsar «88 en aproximación» se
     * filtrase por etapa saldrían menos de 88, y el tablero parecería
     * estar mintiendo en una de las dos pantallas.
     */
    public function scopeConLaFase(Builder $consulta, ?string $fase): Builder
    {
        return match ($fase) {
            'aproximacion' => $consulta->where('fase_aproximacion_completada', true),
            'prospeccion' => $consulta->where('fase_prospeccion_completada', true),
            'propuesta' => $consulta->where('fase_propuesta_completada', true),

            default => $consulta,
        };
    }
}
