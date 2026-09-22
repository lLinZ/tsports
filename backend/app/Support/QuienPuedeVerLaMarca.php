<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Marca;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * QuienPuedeVerLaMarca — a quién se puede etiquetar en una bitácora.
 * ---------------------------------------------------------------------
 * Existe por un choque concreto entre dos cosas que ya estaban:
 *
 *   · La regla 6 dice que un agente solo ve las marcas que tiene
 *     asignadas.
 *   · Etiquetar a alguien le manda un aviso que lleva el nombre de la
 *     marca dentro.
 *
 * Si el selector de menciones ofreciera a todo el equipo, etiquetar a un
 * agente en una marca que no es suya le filtraría por la notificación
 * justo lo que la regla 6 le esconde. Así que la lista de a quién se
 * puede mencionar TIENE que salir de los permisos, y no de «el equipo».
 *
 * NO SE INVENTA NINGUNA REGLA NUEVA. Pregunta a `MarcaPolicy::view`, que
 * es la misma que decide si se puede abrir la ficha. Si mañana cambia
 * quién ve qué, esto cambia con ella sin tocarse (una regla, un sitio).
 *
 * Y se usa DOS VECES: para servir el selector, y otra vez al guardar el
 * comentario. La primera es comodidad; la segunda es la que manda,
 * porque el selector se puede saltar escribiendo la petición a mano.
 */
final class QuienPuedeVerLaMarca
{
    /**
     * Las personas activas que pueden ver esta marca, ordenadas por
     * nombre.
     *
     * Recorre las cuentas en PHP en vez de armar una consulta: el equipo
     * son once personas, la política ya está escrita y duplicarla en SQL
     * sería el segundo sitio donde la regla puede torcerse.
     *
     * @return Collection<int,User>
     */
    public static function lista(Marca $marca): Collection
    {
        return User::query()
            ->where('activo', true)
            ->orderBy('name')
            ->get()
            ->filter(fn (User $persona): bool => Gate::forUser($persona)->allows('view', $marca))
            ->values();
    }

    /**
     * De unos ids dados, los de quienes SÍ pueden ver la marca.
     *
     * Es lo que se llama al guardar un comentario con menciones. Los que
     * no pasen el filtro se descartan en silencio y a propósito: la
     * alternativa —un error— le diría a quien escribe «esa persona no
     * puede ver esta marca», que es información sobre la cartera de
     * otro. Mejor que la mención simplemente no exista.
     *
     * @param  list<string>  $idsPedidos
     * @return Collection<int,User>
     */
    public static function filtrar(Marca $marca, array $idsPedidos): Collection
    {
        if ($idsPedidos === []) {
            return collect();
        }

        return self::lista($marca)
            ->filter(fn (User $persona): bool => in_array($persona->id, $idsPedidos, true))
            ->values();
    }
}
