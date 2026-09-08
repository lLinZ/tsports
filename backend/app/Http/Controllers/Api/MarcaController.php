<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\OrigenMarca;
use App\Http\Controllers\Controller;
use App\Http\Requests\GuardarMarcaRequest;
use App\Http\Resources\RecursoMarca;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\RegistroActividad;
use App\Models\User;
use App\Support\RegistradorDeEventosDeCampana;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * MarcaController — el tablero de marcas del CRM.
 * ---------------------------------------------------------------------
 * Reemplaza a todas las llamadas que `crm.js` hacía contra la tabla
 * `deals` de Supabase. La diferencia de fondo con aquella versión es que
 * aquí los permisos se comprueban ANTES de tocar la base de datos y
 * devuelven un 403 explícito.
 *
 * En Supabase, cuando la política de seguridad filtraba una fila, el
 * update simplemente afectaba a cero filas y respondía "correcto": la
 * interfaz cantaba "Guardado ✔" sin haber guardado nada. Ese fallo, que
 * costó bastante depurar, aquí no puede repetirse.
 */
class MarcaController extends Controller
{
    /**
     * GET /api/marcas
     * Listado del tablero, con búsqueda, filtros y orden.
     */
    public function index(Request $peticion): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Marca::class);

        /** @var User $usuarioQueMira */
        $usuarioQueMira = $peticion->user();

        $consulta = Marca::query()
            // Un agente solo recibe su cartera. Se acota aquí, en la
            // consulta, y no al pintar: así las marcas de sus compañeros
            // ni siquiera salen del servidor.
            //
            // Por ID y no por nombre: esto decide quién ve qué, y el
            // nombre se repite entre personas (ver `laMarcaEsSuya`). Una
            // marca que lleve su nombre sin su id no le llega, y está
            // bien que no le llegue: es trabajo sin asignar.
            ->when(
                ! $usuarioQueMira->rol->veTodasLasMarcas(),
                fn ($subconsulta) => $subconsulta->where(
                    'vendedor_asignado_id',
                    $usuarioQueMira->id,
                ),
            )
            ->withCount('comentarios')
            // El checklist viaja con cada marca porque la tarjeta del
            // tablero enseña el pronóstico acumulado sin abrir la ficha.
            // Son dos consultas más para toda la página, no una por fila.
            ->with(['campana', 'propiedadesOfrecidas.propiedad'])
            ->buscarTexto($peticion->query('busqueda'))
            ->enEtapa($peticion->query('etapa'))
            // Filtro por una fase suelta. Es el que usan los contadores
            // del panel al pulsarlos: cuentan lo mismo que este filtra.
            ->conLaFase($peticion->query('fase'))
            ->deVendedor($peticion->query('vendedor'))
            ->deZona($peticion->query('zona'))
            ->deCampana($peticion->query('campana'))
            ->queOfrecenLaPropiedad($peticion->query('propiedad'))
            ->conInversion($peticion->query('invierte'));

        // Filtro por sector, si se pidió uno concreto.
        if ($sectorPedido = $peticion->query('sector')) {
            $consulta->where('sector', $sectorPedido);
        }

        $consulta = $this->aplicarOrden($consulta, (string) $peticion->query('orden', 'recientes'));

        // Paginación generosa: el tablero se pinta como cuadrícula y el
        // equipo prefiere desplazarse a saltar de página.
        $marcasPorPagina = min((int) $peticion->query('porPagina', 60), 200);

        return RecursoMarca::collection($consulta->paginate($marcasPorPagina));
    }

    /**
     * GET /api/marcas/agentes
     * Quién puede salir en el filtro por agente del tablero.
     *
     * Es quien REALMENTE lleva marcas —tenga el rol que tenga y aunque su
     * cuenta ya no exista— más todas las cuentas activas, con cero. Antes
     * la lista salía de los vendedores activos, y eso dejaba fuera del
     * desplegable las marcas asignadas a un admin, a un comercial o a
     * alguien desactivado: no había forma de pedirlas por nadie y parecía
     * que el filtro las perdía.
     *
     * Cada persona viene con su total, para que al elegirla se pueda
     * comprobar de un vistazo que el tablero devuelve esa misma cifra.
     */
    public function agentes(): JsonResponse
    {
        // Es información de toda la cartera —quién lleva cuánto—, así que
        // la pide quien reparte el trabajo, no cualquiera con sesión. Un
        // agente que llamara a esta ruta a mano se llevaría el reparto
        // completo del equipo.
        $this->authorize('asignarVendedor', Marca::class);

        // Lo que hay escrito en las marcas, agrupado por persona. Se
        // agrupa por NOMBRE y no por id para que dos cuentas de la misma
        // persona —o una fila con el nombre y sin id— salgan como una
        // sola entrada, que es como lo entiende el equipo.
        //
        // La agrupación se normaliza en SQL (minúsculas y sin espacios
        // sobrantes) y no en PHP: MySQL compara sin distinguir mayúsculas
        // y SQLite sí, así que agrupar por la columna tal cual daría una
        // lista distinta en el servidor y en las pruebas. Además, un
        // «daymar marcano» escrito a mano tiene que sumar con su
        // «Daymar Marcano», no salir aparte con su propio contador.
        //
        // Se consulta con `DB::table` y el identificador NO se llama
        // `id`: Eloquent castea al tipo de la clave primaria cualquier
        // columna que llegue con ese alias, y en una tabla de clave
        // entera eso convierte un UUID en un número. Aquí `marcas` tiene
        // clave UUID y no mordía, pero la misma línea copiada en la
        // auditoría dejó su desplegable inservible; no se deja el patrón
        // suelto en el código para que no vuelva a copiarse.
        $asignadas = DB::table('marcas')
            ->selectRaw('LOWER(TRIM(vendedor_asignado_nombre)) as clave')
            // De las variantes escritas se enseña la primera por orden,
            // que con las mayúsculas delante es la bien escrita.
            ->selectRaw('MIN(TRIM(vendedor_asignado_nombre)) as nombre')
            ->selectRaw('MIN(vendedor_asignado_id) as vendedor_id')
            ->selectRaw('COUNT(*) as total')
            ->whereNotNull('vendedor_asignado_nombre')
            ->where('vendedor_asignado_nombre', '!=', '')
            ->groupBy('clave')
            ->get()
            ->keyBy(fn ($fila): string => (string) $fila->clave);

        // Cuando hay cuenta, el nombre bueno es el de la cuenta: es el
        // que se ve en el resto del sistema y el que se actualiza si esa
        // persona se cambia el nombre.
        $cuentas = User::query()
            ->whereIn('id', $asignadas->pluck('vendedor_id')->filter()->all())
            ->get()
            ->keyBy('id');

        $agentes = $asignadas->map(static function ($fila) use ($cuentas): array {
            $cuenta = $fila->vendedor_id === null ? null : $cuentas->get($fila->vendedor_id);

            return [
                // El id sirve para que el filtro siga viajando por id
                // cuando existe cuenta; si no la hay, viaja el nombre.
                'id' => $fila->vendedor_id ?: (string) $fila->nombre,
                'nombre' => $cuenta?->nombreParaMostrar() ?? (string) $fila->nombre,
                'totalMarcas' => (int) $fila->total,
                'tieneCuenta' => $cuenta !== null,
            ];
        })->values()->all();

        // Las cuentas activas que aún no llevan ninguna marca también
        // salen, con cero. Y salen TODAS, no solo las de rol vendedor:
        // una marca se puede asignar a cualquier cuenta, así que limitar
        // la lista por rol es lo que dejaba marcas imposibles de pedir.
        // Que alguien falte del desplegable se lee como un fallo; verlo
        // con un cero contesta la pregunta.
        $cuentasSinMarcas = User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->reject(fn (User $usuario): bool => $asignadas->has(
                mb_strtolower(trim($usuario->nombreParaMostrar())),
            ))
            ->map(static fn (User $usuario): array => [
                'id' => $usuario->id,
                'nombre' => $usuario->nombreParaMostrar(),
                'totalMarcas' => 0,
                'tieneCuenta' => true,
            ])
            ->values()
            ->all();

        $todos = array_merge($agentes, $cuentasSinMarcas);

        usort($todos, static fn (array $uno, array $otro): int => strcasecmp($uno['nombre'], $otro['nombre']));

        return response()->json([
            'data' => $todos,
            // Las que no tienen ni id ni nombre: el montón sin dueño.
            'sinAsignar' => Marca::query()->deVendedor('sin_asignar')->count(),
        ]);
    }

    /**
     * GET /api/marcas/{marca}
     * Ficha completa, con la bitácora incluida.
     */
    public function show(Marca $marca): RecursoMarca
    {
        $this->authorize('view', $marca);

        $marca->load([
            'comentarios' => fn ($consulta) => $consulta->orderBy('created_at'),
            'campana',
            'propiedadesOfrecidas.propiedad',
            // El historial de acciones solo se carga aquí, en la ficha:
            // en el listado del tablero crecería sin freno y allí no se
            // enseña.
            // Con su marca: la política la consulta para decidir si se
            // puede corregir cada acción, y sin esto sería una consulta
            // por evento.
            'eventosDeCampana.marca',
        ]);

        return new RecursoMarca($marca);
    }

    /**
     * POST /api/marcas
     * Alta de una marca nueva desde el CRM.
     */
    public function store(GuardarMarcaRequest $peticion): JsonResponse
    {
        $this->authorize('create', Marca::class);

        /** @var User $usuarioQueRegistra */
        $usuarioQueRegistra = $peticion->user();

        $marca = new Marca($peticion->datosParaElModelo());

        // Quién la dio de alta queda grabado y no se cambia después.
        $marca->registrada_por_id = $usuarioQueRegistra->id;
        $marca->registrada_por_nombre = $usuarioQueRegistra->nombreParaMostrar();
        $marca->origen = OrigenMarca::Manual;

        // La zona se hereda de quien registra, salvo que se envíe una.
        if (($marca->zona ?? '') === '') {
            $marca->zona = $usuarioQueRegistra->zona;
        }

        $this->aplicarAsignacionDeVendedor($marca, $peticion, $usuarioQueRegistra);

        // La ficha y su checklist se guardan a la vez o no se guarda
        // nada. Sin esto, una propiedad rechazada por permisos dejaría
        // la marca ya creada, y quien reintentase el alta se encontraría
        // con la misma marca dos veces.
        DB::transaction(function () use ($marca, $peticion, $usuarioQueRegistra): void {
            $marca->save();

            $this->sincronizarElChecklistDePropiedades($marca, $peticion, $usuarioQueRegistra);

            // Si nace con campaña y fecha, esa es su primera acción y
            // abre el historial de la marca.
            RegistradorDeEventosDeCampana::anotarSiLaAccionEsNueva($marca, $usuarioQueRegistra);
        });

        RegistroActividad::anotar(
            $usuarioQueRegistra,
            RegistroActividad::ACCION_CREO,
            'marca',
            $marca->id,
            'Registró la marca '.$marca->nombre_marca,
        );

        $marca->load(['campana', 'propiedadesOfrecidas.propiedad', 'eventosDeCampana.marca']);

        return (new RecursoMarca($marca))->response()->setStatusCode(201);
    }

    /**
     * PUT /api/marcas/{marca}
     * Edición de la ficha.
     */
    public function update(GuardarMarcaRequest $peticion, Marca $marca): RecursoMarca
    {
        $this->authorize('update', $marca);

        /** @var User $usuarioQueEdita */
        $usuarioQueEdita = $peticion->user();

        $valoresAnteriores = $marca->only([
            'nombre_marca', 'zona', 'sector', 'campana_id',
            'fase_aproximacion_completada', 'fase_propuesta_completada',
            'valor_anual_usd', 'vendedor_asignado_id',
        ]);

        $marca->fill($peticion->datosParaElModelo());

        // Marcas antiguas que quedaron sin zona la heredan al editarlas.
        if (($marca->zona ?? '') === '' && ($usuarioQueEdita->zona ?? '') !== '') {
            $marca->zona = $usuarioQueEdita->zona;
        }

        $this->aplicarAsignacionDeVendedor($marca, $peticion, $usuarioQueEdita);

        // Igual que en el alta: o entra todo, o no entra nada. Una
        // propiedad rechazada no puede dejar guardado a medias el resto
        // de la ficha.
        DB::transaction(function () use ($marca, $peticion, $usuarioQueEdita): void {
            $marca->save();

            $this->sincronizarElChecklistDePropiedades($marca, $peticion, $usuarioQueEdita);

            // Solo deja rastro si la acción cambió de verdad: guardar la
            // ficha tras corregir un teléfono no debe repetir la línea.
            RegistradorDeEventosDeCampana::anotarSiLaAccionEsNueva($marca, $usuarioQueEdita);
        });

        RegistroActividad::anotar(
            $usuarioQueEdita,
            RegistroActividad::ACCION_ACTUALIZO,
            'marca',
            $marca->id,
            'Editó la marca '.$marca->nombre_marca,
            ['antes' => $valoresAnteriores, 'despues' => $marca->only(array_keys($valoresAnteriores))],
        );

        return new RecursoMarca(
            $marca->fresh()->load(['campana', 'propiedadesOfrecidas.propiedad', 'eventosDeCampana.marca']),
        );
    }

    /**
     * PATCH /api/marcas/{marca}/fase
     * Marca o desmarca una fase desde la propia tarjeta del tablero, sin
     * abrir la ficha. Es el gesto más frecuente del día a día.
     */
    public function alternarFase(Request $peticion, Marca $marca): RecursoMarca
    {
        $this->authorize('update', $marca);

        $datos = $peticion->validate([
            'fase' => ['required', 'in:aproximacion,propuesta'],
            'completada' => ['required', 'boolean'],
        ]);

        $seQuiereCompletar = (bool) $datos['completada'];

        // La prospección no aparece aquí a propósito: se calcula sola a
        // partir de los datos de la ficha y no se puede forzar.
        if ($datos['fase'] === 'aproximacion') {
            if ($seQuiereCompletar && trim((string) $marca->via_aproximacion) === '') {
                throw ValidationException::withMessages([
                    'fase' => 'Abre la ficha e indica la vía de la aproximación antes de marcarla.',
                ]);
            }

            $marca->fase_aproximacion_completada = $seQuiereCompletar;
        } else {
            if ($seQuiereCompletar && trim((string) $marca->descripcion_propuesta) === '') {
                throw ValidationException::withMessages([
                    'fase' => 'Abre la ficha y describe la propuesta antes de marcarla.',
                ]);
            }

            $marca->fase_propuesta_completada = $seQuiereCompletar;
        }

        /** @var User $usuarioQueActua */
        $usuarioQueActua = $peticion->user();

        // Tocar una marca sin dueño equivale a adoptarla.
        $this->adoptarSiEstaSinDuenio($marca, $usuarioQueActua);

        $marca->save();

        RegistroActividad::anotar(
            $usuarioQueActua,
            RegistroActividad::ACCION_ACTUALIZO,
            'marca',
            $marca->id,
            sprintf(
                '%s la fase de %s en %s',
                $seQuiereCompletar ? 'Completó' : 'Reabrió',
                $datos['fase'],
                $marca->nombre_marca,
            ),
        );

        return new RecursoMarca(
            $marca->fresh()->load(['campana', 'propiedadesOfrecidas.propiedad', 'eventosDeCampana.marca']),
        );
    }

    /**
     * POST /api/marcas/{marca}/acciones-de-campana
     * Anota una acción de campaña en el calendario al momento, sin pasar
     * por el resto de la ficha.
     *
     * Nace de cómo se trabaja de verdad: quien acaba de visitar a una
     * marca quiere dejarlo apuntado y seguir. Antes había que elegir la
     * campaña, poner el día y pulsar "Guardar cambios" —que valida y
     * guarda la ficha entera—, y no se entendía que apuntar una visita
     * dependiera de que el resto del formulario estuviera correcto.
     *
     * Se queda aquí y no en EventoDeCampanaController porque esto no es
     * corregir un evento suelto: es asignarle una campaña a la marca, con
     * su fecha, que es justo lo que hace la ficha al guardar. El evento
     * sale de ahí como consecuencia (regla 13 del CLAUDE.md) y lo crea el
     * mismo registrador, para que los dos caminos no se separen nunca.
     */
    public function anotarAccionDeCampana(Request $peticion, Marca $marca): RecursoMarca
    {
        $this->authorize('update', $marca);

        $datos = $peticion->validate([
            'campanaId' => ['required', 'uuid', Rule::exists('campanas', 'id')],
            'fecha' => ['required', 'date_format:Y-m-d'],
        ], [
            'campanaId.required' => 'Elige la campaña de esta acción.',
            'campanaId.exists' => 'Esa campaña ya no existe.',
            'fecha.required' => 'Indica el día en que se hace la acción.',
            'fecha.date_format' => 'La fecha debe tener el formato AAAA-MM-DD.',
        ]);

        /** @var User $usuarioQueActua */
        $usuarioQueActua = $peticion->user();

        $marca->campana_id = $datos['campanaId'];
        $marca->fecha_campana = $datos['fecha'];

        // Tocar una marca sin dueño equivale a adoptarla (regla 5).
        $this->adoptarSiEstaSinDuenio($marca, $usuarioQueActua);

        $eventoAnotado = null;

        DB::transaction(function () use ($marca, $usuarioQueActua, &$eventoAnotado): void {
            $marca->save();

            $eventoAnotado = RegistradorDeEventosDeCampana::anotarSiLaAccionEsNueva(
                $marca,
                $usuarioQueActua,
            );
        });

        // Solo se deja rastro si de verdad se anotó algo. Repetir el
        // gesto con la misma campaña y la misma fecha no es una acción
        // nueva, y llenar la auditoría de líneas idénticas solo estorba
        // a quien luego tenga que leerla.
        if ($eventoAnotado !== null) {
            RegistroActividad::anotar(
                $usuarioQueActua,
                RegistroActividad::ACCION_ACTUALIZO,
                'marca',
                $marca->id,
                sprintf(
                    'Anotó en el calendario "%s" del %s para %s',
                    $eventoAnotado->campana_nombre,
                    $datos['fecha'],
                    $marca->nombre_marca,
                ),
            );
        }

        return new RecursoMarca(
            $marca->fresh()->load(['campana', 'propiedadesOfrecidas.propiedad', 'eventosDeCampana.marca']),
        );
    }

    /**
     * PATCH /api/marcas/{marca}/vendedor
     * Cambia el vendedor asignado desde la propia tarjeta del tablero.
     *
     * Es un permiso distinto del de editar la marca: reparte trabajo, y
     * eso lo hacen admin y comercial (regla 6). Un vendedor puede editar
     * la marca que tiene asignada pero no puede pasársela a otro ni
     * quitársela a nadie, así que aquí se pregunta por `asignarVendedor`
     * y no por `update`.
     */
    public function asignarVendedor(Request $peticion, Marca $marca): RecursoMarca
    {
        $this->authorize('asignarVendedor', Marca::class);

        $datos = $peticion->validate([
            // Se admite null a propósito: dejar una marca sin dueño es un
            // estado legítimo — así vuelve al montón del que cualquiera
            // puede adoptarla.
            'vendedorAsignadoId' => ['present', 'nullable', 'uuid', Rule::exists('users', 'id')],
        ], [
            'vendedorAsignadoId.exists' => 'Esa persona ya no tiene cuenta en el sistema.',
        ]);

        $idDelVendedor = $datos['vendedorAsignadoId'] ?: null;
        $nombreAnterior = $marca->vendedor_asignado_nombre;

        $marca->vendedor_asignado_id = $idDelVendedor;
        $marca->vendedor_asignado_nombre = $idDelVendedor === null
            ? null
            : User::query()->find($idDelVendedor)?->nombreParaMostrar();

        $marca->save();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ACTUALIZO,
            'marca',
            $marca->id,
            sprintf(
                '%s en %s: %s → %s',
                $idDelVendedor === null ? 'Quitó el agente' : 'Asignó agente',
                $marca->nombre_marca,
                $nombreAnterior ?? 'sin asignar',
                $marca->vendedor_asignado_nombre ?? 'sin asignar',
            ),
        );

        return new RecursoMarca(
            $marca->fresh()->load(['campana', 'propiedadesOfrecidas.propiedad', 'eventosDeCampana.marca']),
        );
    }

    /**
     * DELETE /api/marcas/{marca}
     * Borra la marca y, en cascada, su bitácora.
     */
    public function destroy(Request $peticion, Marca $marca): JsonResponse
    {
        $this->authorize('delete', $marca);

        $nombreDeLaMarcaBorrada = $marca->nombre_marca;

        $marca->delete();

        RegistroActividad::anotar(
            $peticion->user(),
            RegistroActividad::ACCION_ELIMINO,
            'marca',
            $marca->id,
            'Eliminó la marca '.$nombreDeLaMarcaBorrada,
        );

        return response()->json(['mensaje' => 'Marca eliminada.']);
    }

    /* ------------------------------------------------------------------
     | Ayudantes privados
     |-----------------------------------------------------------------*/

    /**
     * Decide qué vendedor queda asignado a la marca.
     *
     * Reglas:
     *   · Admin y comercial eligen a quien quieran desde el selector.
     *   · Un vendedor que registra una marca se la queda: si no, por
     *     permisos no podría volver a editar lo que acaba de crear.
     *   · Cualquiera que trabaje una marca sin dueño la adopta.
     */
    private function aplicarAsignacionDeVendedor(
        Marca $marca,
        GuardarMarcaRequest $peticion,
        User $usuarioQueActua,
    ): void {
        if ($usuarioQueActua->can('asignarVendedor', Marca::class) && $peticion->has('vendedorAsignadoId')) {
            $idDelVendedorElegido = $peticion->input('vendedorAsignadoId') ?: null;

            $marca->vendedor_asignado_id = $idDelVendedorElegido;
            $marca->vendedor_asignado_nombre = $idDelVendedorElegido === null
                ? null
                : User::query()->find($idDelVendedorElegido)?->nombreParaMostrar();

            return;
        }

        $this->adoptarSiEstaSinDuenio($marca, $usuarioQueActua);
    }

    /**
     * Deja el checklist de propiedades de la marca igual que lo envió la
     * ficha: añade las nuevas, actualiza los pronósticos de las que ya
     * estaban y quita las que se desmarcaron.
     *
     * Dos decisiones que conviene tener presentes:
     *
     *   · Si la petición no trae la clave `propiedades`, el checklist se
     *     queda como estaba. Guardar una ficha desde un cliente que no
     *     sepa de propiedades no puede borrar el trabajo de prospección.
     *
     *   · Solo se comprueba el permiso al AÑADIR una propiedad. Quitar o
     *     corregir el pronóstico de una que ya estaba puesta lo puede
     *     hacer cualquiera que pueda editar la marca: si no, una
     *     propiedad reasignada dejaría la ficha bloqueada para siempre.
     */
    private function sincronizarElChecklistDePropiedades(
        Marca $marca,
        GuardarMarcaRequest $peticion,
        User $usuarioQueActua,
    ): void {
        if (! $peticion->traeElChecklistDePropiedades()) {
            return;
        }

        $checklistEnviado = $peticion->checklistDePropiedades();

        $lineasQueYaExistian = $marca->propiedadesOfrecidas()
            ->get()
            ->keyBy('propiedad_id');

        $propiedadesEnviadas = Propiedad::query()
            ->with('prospectores')
            ->whereIn('id', array_keys($checklistEnviado))
            ->get()
            ->keyBy('id');

        foreach ($checklistEnviado as $idDeLaPropiedad => $datosDeLaLinea) {
            $lineaExistente = $lineasQueYaExistian->get($idDeLaPropiedad);

            if ($lineaExistente !== null) {
                $lineaExistente->fill($datosDeLaLinea)->save();

                continue;
            }

            $propiedad = $propiedadesEnviadas->get($idDeLaPropiedad);

            if ($propiedad === null) {
                continue; // La validación `exists` ya se habrá quejado.
            }

            // Una propiedad reservada a otras personas no se puede colar
            // en una ficha. Se responde como error del campo y no como un
            // 403 seco, para que la interfaz pueda señalar la casilla.
            if (! $usuarioQueActua->can('ofrecer', $propiedad)) {
                throw ValidationException::withMessages([
                    'propiedades' => sprintf(
                        'La propiedad %s no está asignada a ti, así que no puedes ofrecerla.',
                        $propiedad->nombre,
                    ),
                ]);
            }

            $marca->propiedadesOfrecidas()->create([
                'propiedad_id' => $idDeLaPropiedad,
                ...$datosDeLaLinea,
            ]);
        }

        // Lo que ya no viene en el checklist se quita.
        $idsQueSiguenMarcadas = array_keys($checklistEnviado);

        $lineasQueYaExistian
            ->reject(fn ($linea): bool => in_array($linea->propiedad_id, $idsQueSiguenMarcadas, true))
            ->each(fn ($linea) => $linea->delete());

        // La relación cargada antes se queda vieja tras estos cambios; se
        // olvida para que quien la vuelva a leer traiga lo recién escrito.
        $marca->unsetRelation('propiedadesOfrecidas');
    }

    /**
     * Los leads que entran por el formulario web nacen sin dueño. El
     * primero del equipo que los trabaja se los queda, para que no se
     * queden en tierra de nadie.
     */
    private function adoptarSiEstaSinDuenio(Marca $marca, User $usuarioQueActua): void
    {
        if (! $marca->estaSinDuenio()) {
            return;
        }

        $marca->vendedor_asignado_id = $usuarioQueActua->id;
        $marca->vendedor_asignado_nombre = $usuarioQueActua->nombreParaMostrar();
    }

    /**
     * Traduce el criterio de orden que envía la interfaz a una cláusula
     * SQL. Cualquier valor no reconocido cae en "más recientes".
     */
    private function aplicarOrden(mixed $consulta, string $criterioDeOrden): mixed
    {
        return match ($criterioDeOrden) {
            'valor_desc' => $consulta->orderByDesc('valor_anual_usd'),
            'valor_asc' => $consulta->orderBy('valor_anual_usd'),
            'nombre' => $consulta->orderBy('nombre_marca'),
            'antiguas' => $consulta->orderBy('created_at'),
            default => $consulta->orderByDesc('created_at'),
        };
    }
}
