<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\Campana;
use App\Models\EventoDeCampana;
use App\Models\Marca;
use App\Models\Propiedad;
use App\Models\User;
use App\Policies\CampanaPolicy;
use App\Policies\EventoDeCampanaPolicy;
use App\Policies\MarcaPolicy;
use App\Policies\PropiedadPolicy;
use App\Policies\UserPolicy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Gate;
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
 */
class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Gate::policy(Marca::class, MarcaPolicy::class);
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Propiedad::class, PropiedadPolicy::class);
        Gate::policy(Campana::class, CampanaPolicy::class);
        Gate::policy(EventoDeCampana::class, EventoDeCampanaPolicy::class);

        // Comprobaciones estrictas de Eloquent, solo fuera de producción.
        Model::shouldBeStrict(! $this->app->isProduction());

        // Detrás del nginx del VPS el tráfico entra por HTTPS: hay que
        // decírselo a Laravel o generaría URLs con http:// y el navegador
        // bloquearía las imágenes por contenido mixto.
        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }
    }
}
