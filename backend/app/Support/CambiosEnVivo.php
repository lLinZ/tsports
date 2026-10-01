<?php

declare(strict_types=1);

namespace App\Support;

use App\Events\CambioEnLosDatos;
use App\Models\ComentarioMarca;
use App\Models\Marca;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * CambiosEnVivo — junta lo que cambió en una petición y lo avisa al final.
 * ---------------------------------------------------------------------
 * Desde el 2026-09-30 las pantallas del panel se ponen al día solas
 * cuando otra persona cambia algo (regla 22 del CLAUDE.md). Esta clase
 * es la que decide qué se avisa y a quién.
 *
 * CÓMO LLEGA AQUÍ CADA CAMBIO
 * No lo llaman los controladores: lo anota ObservadorDeCambiosEnVivo al
 * guardarse o borrarse un modelo. Así no hay camino que se quede fuera
 * —la ficha, el tablero, un lead de la web, el importador— ni un
 * controlador nuevo que se olvide de avisar.
 *
 * UNA SEÑAL POR PETICIÓN, CON LA RESPUESTA YA ENTREGADA
 * Guardar la ficha de una marca toca la marca, sus líneas del checklist
 * y quizá un evento de campaña: serían tres avisos del mismo cambio. Aquí
 * se juntan y se envían una vez, al terminar la petición
 * (`app()->terminating`, ver AppServiceProvider). Con PHP-FPM eso pasa
 * después de entregar la respuesta, así que quien guardó no espera por
 * esto. En el trabajador de colas se envía al acabar cada trabajo.
 *
 * A QUIÉN
 *   · Lo de una marca (`marca`, `bitacora`), solo a quien puede verla:
 *     lo decide MarcaPolicy::view, la misma que abre la ficha (una
 *     regla, un sitio). Un agente no se entera ni del id de una marca
 *     ajena. Si la marca cambió de agente, el anterior también recibe el
 *     aviso: es lo que hace que desaparezca de su tablero.
 *   · Lo del catálogo (`propiedades`, `campanas`, `sectores`, `equipo`),
 *     a todo el equipo activo: lo ven todos.
 *   · Los cierres de mes (`cierres`), solo a quien los ve: admin y
 *     comercial. A un agente no le serviría de nada.
 * Quien recibe exactamente lo mismo va en un solo envío con varios
 * canales, y de normal sale uno por petición.
 *
 * Si el tiempo real está apagado no se anota nada. Si Reverb no contesta,
 * se deja escrito en el registro y ya está: las pantallas se ponen al día
 * igual la próxima vez que pidan sus datos.
 */
final class CambiosEnVivo
{
    /** Algo de la marca: sus datos, su checklist, su historial de campañas. */
    public const MARCA = 'marca';

    /** Su bitácora: comentarios, respuestas, reacciones. */
    public const BITACORA = 'bitacora';

    public const PROPIEDADES = 'propiedades';

    public const CAMPANAS = 'campanas';

    public const SECTORES = 'sectores';

    public const EQUIPO = 'equipo';

    /** Los reportes de cierre de mes. Solo los ve admin y comercial. */
    public const CIERRES_DE_MES = 'cierres';

    /**
     * Pasado este número de marcas en una sola petición (el importador,
     * un cambio masivo) se avisa «cambiaron las marcas» sin decir cuáles.
     * Es lo mismo para quien lo recibe —vuelve a pedir su tablero— y el
     * mensaje no crece sin límite.
     */
    private const MAXIMO_DE_MARCAS_POR_AVISO = 50;

    /**
     * @var array<string, array{entidades: array<string,true>, foto: ?Marca, otrosQueLaVeian: array<string,true>}>
     */
    private array $marcas = [];

    /** @var array<string,true> comentarios cuya marca se busca al enviar */
    private array $comentarios = [];

    /** @var array<string,true> */
    private array $delCatalogo = [];

    /**
     * Cambió algo de una marca.
     *
     * @param  Marca|null  $foto  la marca tal como estaba, para cuando se
     *                            borró y ya no se puede volver a leer
     * @param  string|null  $idDeQuienLaLlevaba  el agente anterior, si cambió
     */
    public function enLaMarca(
        string $idDeLaMarca,
        string $entidad = self::MARCA,
        ?Marca $foto = null,
        ?string $idDeQuienLaLlevaba = null,
    ): void {
        if (! TiempoReal::estaActivo()) {
            return;
        }

        $this->marcas[$idDeLaMarca] ??= ['entidades' => [], 'foto' => null, 'otrosQueLaVeian' => []];
        $this->marcas[$idDeLaMarca]['entidades'][$entidad] = true;

        if ($foto !== null) {
            $this->marcas[$idDeLaMarca]['foto'] = $foto;
        }

        if ($idDeQuienLaLlevaba !== null) {
            $this->marcas[$idDeLaMarca]['otrosQueLaVeian'][$idDeQuienLaLlevaba] = true;
        }
    }

    /**
     * Cambió algo colgado de un comentario (una reacción). Su marca se
     * busca al enviar, todas de una vez.
     */
    public function enElComentario(string $idDelComentario): void
    {
        if (TiempoReal::estaActivo()) {
            $this->comentarios[$idDelComentario] = true;
        }
    }

    /** Cambió algo del catálogo, que ve todo el equipo. */
    public function paraTodoElEquipo(string $entidad): void
    {
        if (TiempoReal::estaActivo()) {
            $this->delCatalogo[$entidad] = true;
        }
    }

    /** Olvida lo anotado sin enviarlo. */
    public function descartar(): void
    {
        $this->marcas = [];
        $this->comentarios = [];
        $this->delCatalogo = [];
    }

    /**
     * Envía lo anotado y empieza de cero.
     *
     * Se vacía ANTES de enviar: si algo falla a mitad, lo de esta
     * petición no se arrastra a la siguiente del mismo proceso.
     */
    public function enviar(): void
    {
        if ($this->marcas === [] && $this->comentarios === [] && $this->delCatalogo === []) {
            return;
        }

        [$marcas, $comentarios, $delCatalogo] = [$this->marcas, $this->comentarios, $this->delCatalogo];
        $this->descartar();

        if (! TiempoReal::estaActivo()) {
            return;
        }

        try {
            foreach ($this->agruparPorDestinatarios($marcas, $comentarios, $delCatalogo) as $envio) {
                $evento = new CambioEnLosDatos($envio['destinatarios'], $envio['cambios']);

                // La pestaña que hizo el cambio ya refresca lo suyo.
                $evento->dontBroadcastToCurrentUser();

                // event() y no broadcast(), por lo mismo que en el
                // Notificador: así un fallo salta en esta línea, dentro
                // del try.
                event($evento);
            }
        } catch (Throwable $error) {
            Log::warning('No se pudieron avisar los cambios en vivo; las pantallas se pondrán al día al volver a pedir sus datos.', [
                'error' => $error->getMessage(),
            ]);
        }
    }

    /**
     * @param  array<string, array{entidades: array<string,true>, foto: ?Marca, otrosQueLaVeian: array<string,true>}>  $marcas
     * @param  array<string,true>  $comentarios
     * @param  array<string,true>  $delCatalogo
     * @return list<array{destinatarios: list<string>, cambios: list<array{entidad:string,id:?string}>}>
     */
    private function agruparPorDestinatarios(array $marcas, array $comentarios, array $delCatalogo): array
    {
        if ($comentarios !== []) {
            $marcasDeLosComentarios = ComentarioMarca::query()
                ->whereKey(array_keys($comentarios))
                ->pluck('marca_id');

            foreach ($marcasDeLosComentarios as $idDeLaMarca) {
                $marcas[$idDeLaMarca] ??= ['entidades' => [], 'foto' => null, 'otrosQueLaVeian' => []];
                $marcas[$idDeLaMarca]['entidades'][self::BITACORA] = true;
            }
        }

        // El equipo son once personas: se recorre en PHP con la política
        // de verdad, como hace QuienPuedeVerLaMarca.
        $equipo = User::query()->where('activo', true)->get();

        /** @var Collection<string,Marca> $marcasQueSiguen */
        $marcasQueSiguen = Marca::query()->whereKey(array_keys($marcas))->get()->keyBy('id');

        /** @var array<string, list<array{entidad:string,id:?string}>> $cambiosPorPersona */
        $cambiosPorPersona = [];

        foreach ($equipo as $persona) {
            $cambios = [];

            foreach (array_keys($delCatalogo) as $entidad) {
                if ($entidad === self::CIERRES_DE_MES && ! $persona->rol->veLosCierresDeMes()) {
                    continue;
                }

                $cambios[] = ['entidad' => $entidad, 'id' => null];
            }

            $cambiosDeMarcas = [];

            foreach ($marcas as $idDeLaMarca => $anotado) {
                // Borrada, ya no se puede leer: vale cómo estaba.
                $marca = $marcasQueSiguen->get($idDeLaMarca) ?? $anotado['foto'];

                if ($marca === null) {
                    continue;
                }

                $laVe = Gate::forUser($persona)->allows('view', $marca)
                    || isset($anotado['otrosQueLaVeian'][$persona->id]);

                if (! $laVe) {
                    continue;
                }

                foreach (array_keys($anotado['entidades']) as $entidad) {
                    $cambiosDeMarcas[] = ['entidad' => $entidad, 'id' => (string) $idDeLaMarca];
                }
            }

            if (count($cambiosDeMarcas) > self::MAXIMO_DE_MARCAS_POR_AVISO) {
                $cambiosDeMarcas = [
                    ['entidad' => self::MARCA, 'id' => null],
                    ['entidad' => self::BITACORA, 'id' => null],
                ];
            }

            $cambios = [...$cambios, ...$cambiosDeMarcas];

            if ($cambios !== []) {
                $cambiosPorPersona[$persona->id] = $cambios;
            }
        }

        // Quien recibe exactamente lo mismo, en un solo envío.
        $envios = [];

        foreach ($cambiosPorPersona as $idDePersona => $cambios) {
            $clave = json_encode($cambios, JSON_THROW_ON_ERROR);

            $envios[$clave] ??= ['destinatarios' => [], 'cambios' => $cambios];
            $envios[$clave]['destinatarios'][] = (string) $idDePersona;
        }

        return array_values($envios);
    }
}
