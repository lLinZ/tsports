<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AccesoDeInvitados;
use App\Models\ArchivoDePropiedad;
use App\Models\Campana;
use App\Models\CierreDeMes;
use App\Models\ComentarioMarca;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\ReaccionDeComentario;
use App\Models\Sector;
use App\Models\User;
use App\Support\CambiosEnVivo;
use Illuminate\Database\Eloquent\Model;

/**
 * ObservadorDeCambiosEnVivo — anota en CambiosEnVivo lo que se guarda o
 * se borra.
 * ---------------------------------------------------------------------
 * Se engancha a los modelos que se ven en las pantallas del panel (la
 * lista está en AppServiceProvider). Solo ANOTA: el envío se hace una
 * vez, al terminar la petición.
 *
 * Lo que NO ve un observador: las escrituras hechas con el constructor
 * de consultas (`Marca::where(...)->update()`), los `sync()` de tablas
 * intermedias y los borrados en cascada de la base. No hace falta
 * cubrirlos uno a uno porque siempre van con otro cambio que sí se ve en
 * la misma petición (renombrar un sector arrastra sus marcas, pero el
 * sector sí se guarda), y el navegador sabe qué pantallas dependen de
 * cada cosa: un aviso de `sectores` también refresca el tablero.
 */
final class ObservadorDeCambiosEnVivo
{
    /**
     * Lo que se ve de una persona en otras pantallas: su nombre en las
     * tarjetas, su rol y su zona en Equipo, si puede entrar. Lo demás
     * (el latido del chat, el tema, la contraseña) no cambia nada que
     * vean los demás, y avisar de eso sería avisar cada medio minuto.
     */
    private const LO_QUE_SE_VE_DE_UNA_PERSONA = ['name', 'email', 'rol', 'zona', 'activo', 'color_acento', 'url_avatar'];

    public function __construct(private readonly CambiosEnVivo $cambios) {}

    public function saved(Model $modelo): void
    {
        $this->anotar($modelo);
    }

    public function deleted(Model $modelo): void
    {
        $this->anotar($modelo, seBorro: true);
    }

    private function anotar(Model $modelo, bool $seBorro = false): void
    {
        match (true) {
            $modelo instanceof Marca => $this->cambios->enLaMarca(
                $modelo->id,
                CambiosEnVivo::MARCA,
                // La foto hace falta si se borró: al enviar ya no está.
                clone $modelo,
                $this->quienLaLlevabaAntes($modelo),
            ),
            $modelo instanceof PropiedadDeMarca,
            $modelo instanceof EventoDeCampana => $this->cambios->enLaMarca($modelo->marca_id),
            $modelo instanceof ComentarioMarca => $this->cambios->enLaMarca($modelo->marca_id, CambiosEnVivo::BITACORA),
            $modelo instanceof ReaccionDeComentario => $this->cambios->enElComentario($modelo->comentario_id),
            $modelo instanceof Propiedad,
            $modelo instanceof ArchivoDePropiedad,
            $modelo instanceof AccesoDeInvitados => $this->cambios->paraTodoElEquipo(CambiosEnVivo::PROPIEDADES),
            $modelo instanceof Campana => $this->cambios->paraTodoElEquipo(CambiosEnVivo::CAMPANAS),
            $modelo instanceof Sector => $this->cambios->paraTodoElEquipo(CambiosEnVivo::SECTORES),
            $modelo instanceof CierreDeMes => $this->cambios->paraTodoElEquipo(CambiosEnVivo::CIERRES_DE_MES),
            $modelo instanceof User => $this->siSeVeDesdeFuera($modelo, $seBorro),
            default => null,
        };
    }

    /**
     * El agente que la llevaba, si esta vez cambió. En el evento `saved`
     * los valores de antes siguen en getOriginal(): Eloquent los pone al
     * día justo después.
     */
    private function quienLaLlevabaAntes(Marca $marca): ?string
    {
        if (! $marca->wasChanged('vendedor_asignado_id')) {
            return null;
        }

        $anterior = $marca->getOriginal('vendedor_asignado_id');

        return is_string($anterior) ? $anterior : null;
    }

    private function siSeVeDesdeFuera(User $persona, bool $seBorro): void
    {
        if ($seBorro || $persona->wasRecentlyCreated || $persona->wasChanged(self::LO_QUE_SE_VE_DE_UNA_PERSONA)) {
            $this->cambios->paraTodoElEquipo(CambiosEnVivo::EQUIPO);
        }
    }
}
