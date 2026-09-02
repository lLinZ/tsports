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

        $consulta = Marca::query()
            ->withCount('comentarios')
            // El checklist viaja con cada marca porque la tarjeta del
            // tablero enseña el pronóstico acumulado sin abrir la ficha.
            // Son dos consultas más para toda la página, no una por fila.
            ->with(['campana', 'propiedadesOfrecidas.propiedad'])
            ->buscarTexto($peticion->query('busqueda'))
            ->enEtapa($peticion->query('etapa'))
            ->deZona($peticion->query('zona'))
            ->deCampana($peticion->query('campana'))
            ->queOfrecenLaPropiedad($peticion->query('propiedad'))
            ->conInversion($peticion->query('invierte'));

        // Filtro por sector, si se pidió uno concreto.
        if ($sectorPedido = $peticion->query('sector')) {
            $consulta->where('sector', $sectorPedido);
        }

        // Filtro por responsable: admite el id de un vendedor o el valor
        // especial "sin_asignar" para ver los leads huérfanos.
        $responsablePedido = $peticion->query('vendedor');

        if ($responsablePedido === 'sin_asignar') {
            $consulta->whereNull('vendedor_asignado_id');
        } elseif (is_string($responsablePedido) && $responsablePedido !== '') {
            $consulta->where('vendedor_asignado_id', $responsablePedido);
        }

        $consulta = $this->aplicarOrden($consulta, (string) $peticion->query('orden', 'recientes'));

        // Paginación generosa: el tablero se pinta como cuadrícula y el
        // equipo prefiere desplazarse a saltar de página.
        $marcasPorPagina = min((int) $peticion->query('porPagina', 60), 200);

        return RecursoMarca::collection($consulta->paginate($marcasPorPagina));
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
