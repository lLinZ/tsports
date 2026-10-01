<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\AccesoDeInvitados;
use App\Models\ArchivoDePropiedad;
use App\Models\Campana;
use App\Models\CierreDeMes;
use App\Models\ComentarioMarca;
use App\Models\Conversacion;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Notificacion;
use App\Models\Propiedad;
use App\Models\PropiedadDeMarca;
use App\Models\ReaccionDeComentario;
use App\Models\Sector;
use App\Models\User;
use App\Observers\ObservadorDeCambiosEnVivo;
use App\Policies\CampanaPolicy;
use App\Policies\CierreDeMesPolicy;
use App\Policies\ConversacionPolicy;
use App\Policies\EventoDeCampanaPolicy;
use App\Policies\MarcaPolicy;
use App\Policies\NotificacionPolicy;
use App\Policies\PropiedadPolicy;
use App\Policies\SectorPolicy;
use App\Policies\UserPolicy;
use App\Support\CambiosEnVivo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

/**
 * AppServiceProvider — ajustes globales de la aplicación.
 * ---------------------------------------------------------------------
 * Tres cosas, todas pensadas para que los errores salten pronto y en
 * desarrollo, no tarde y en producción:
 *
 *   1. Se registran las políticas de autorización de forma explícita.
 *      Laravel las descubriría solo por convención de nombres, pero
 *      dejarlas escritas hace evidente qué modelo protege cada una.
 *
 *   2. `preventLazyLoading` avisa en desarrollo cuando una vista provoca
 *      una consulta por fila (el clásico problema N+1). En producción se
 *      queda callado para no tumbar el servicio por un aviso.
 *
 *   3. `shouldBeStrict` obliga además a que asignar un atributo que no
 *      existe sea un error, en vez de perderse en silencio.
 *
 * Y una cuarta, desde el 2026-09-30: se enganchan los modelos que se ven
 * en el panel a ObservadorDeCambiosEnVivo, y lo que anotan se envía al
 * terminar cada petición y cada trabajo de la cola (regla 22).
 */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Uno por petición: junta todo lo que cambió en ella.
        $this->app->singleton(CambiosEnVivo::class);
    }

    public function boot(): void
    {
        Gate::policy(Marca::class, MarcaPolicy::class);
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Propiedad::class, PropiedadPolicy::class);
        Gate::policy(Campana::class, CampanaPolicy::class);
        Gate::policy(EventoDeCampana::class, EventoDeCampanaPolicy::class);
        Gate::policy(Sector::class, SectorPolicy::class);
        Gate::policy(Notificacion::class, NotificacionPolicy::class);
        Gate::policy(Conversacion::class, ConversacionPolicy::class);
        Gate::policy(CierreDeMes::class, CierreDeMesPolicy::class);

        // Comprobaciones estrictas de Eloquent, solo fuera de producción.
        Model::shouldBeStrict(! $this->app->isProduction());

        $this->avisarDeLosCambiosEnVivo();

        // Detrás del nginx del VPS el tráfico entra por HTTPS: hay que
        // decírselo a Laravel o generaría URLs con http:// y el navegador
        // bloquearía las imágenes por contenido mixto.
        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }
    }

    /**
     * Las pantallas del panel se ponen al día solas (regla 22).
     *
     * Los modelos de la lista son los que se ven en alguna pantalla. Lo
     * que se anota durante una petición sale una vez, al terminar: con
     * PHP-FPM, ya con la respuesta entregada. En el trabajador de colas no
     * hay «final de la petición», así que se envía al acabar cada trabajo.
     */
    private function avisarDeLosCambiosEnVivo(): void
    {
        $modelosQueSeVenEnElPanel = [
            Marca::class,
            PropiedadDeMarca::class,
            EventoDeCampana::class,
            ComentarioMarca::class,
            ReaccionDeComentario::class,
            Propiedad::class,
            ArchivoDePropiedad::class,
            AccesoDeInvitados::class,
            Campana::class,
            Sector::class,
            User::class,
            CierreDeMes::class,
        ];

        foreach ($modelosQueSeVenEnElPanel as $modelo) {
            $modelo::observe(ObservadorDeCambiosEnVivo::class);
        }

        $enviar = fn () => $this->app->make(CambiosEnVivo::class)->enviar();

        $this->app->terminating($enviar);
        Queue::after($enviar);
    }
}
