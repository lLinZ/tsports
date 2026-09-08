<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Enums\InversionEnPatrocinios;
use App\Enums\RolUsuario;
use App\Models\Campana;
use App\Models\ComentarioMarca;
use App\Models\ContenidoSitio;
use App\Models\Marca;
use App\Models\User;
use App\Support\ContenidoWebPorDefecto;
use Illuminate\Database\Seeder;

/**
 * DatabaseSeeder — deja el sistema listo para usarse.
 * ---------------------------------------------------------------------
 * Se ejecuta con `php artisan db:seed` y hace tres cosas:
 *
 *   1. Crea la cuenta de administrador inicial, leyendo el correo y la
 *      contraseña de las variables de entorno ADMIN_EMAIL / ADMIN_PASSWORD.
 *      Esto es lo primero que hay que ejecutar en el VPS: sin ello no
 *      habría forma de entrar al panel.
 *
 *   2. Publica el contenido de fábrica de la web pública.
 *
 *   3. Solo fuera de producción, siembra unas cuantas marcas y usuarios
 *      de ejemplo para poder probar el tablero con datos dentro.
 *
 * Es idempotente: se puede volver a ejecutar sin duplicar nada.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $administrador = $this->crearAdministradorInicial();

        $this->publicarContenidoDeFabrica($administrador);

        // Ni el catálogo de productos IOP ni las campañas son datos de
        // prueba: son las propiedades que la agencia vende y las acciones
        // comerciales que está trabajando, así que se cargan también en
        // producción.
        $this->call(PropiedadesIopSeeder::class);
        $this->call(CampanasInicialesSeeder::class);

        if (! app()->isProduction()) {
            $this->sembrarDatosDeEjemplo();
        }
    }

    /**
     * Crea (o actualiza) la cuenta de administrador con la que se entra
     * por primera vez.
     */
    private function crearAdministradorInicial(): User
    {
        $correoDelAdministrador = mb_strtolower((string) env('ADMIN_EMAIL', 'admin@tssports.com'));
        $passwordDelAdministrador = (string) env('ADMIN_PASSWORD', 'CambiaEstaClave2026');

        $administrador = User::query()->firstOrNew(['email' => $correoDelAdministrador]);

        $esUnaCuentaNueva = ! $administrador->exists;

        $administrador->fill([
            'name' => (string) env('ADMIN_NAME', 'Administrador'),
            'rol' => RolUsuario::Admin->value,
            'activo' => true,
        ]);

        // La contraseña solo se fija al crear la cuenta. Si ya existía,
        // volver a sembrar no debe pisar la contraseña que la persona
        // haya elegido después.
        if ($esUnaCuentaNueva) {
            $administrador->password = $passwordDelAdministrador;
        }

        $administrador->save();

        $this->command?->info(
            $esUnaCuentaNueva
                ? "✔ Administrador creado: {$correoDelAdministrador}"
                : "· El administrador {$correoDelAdministrador} ya existía (contraseña sin tocar)"
        );

        return $administrador;
    }

    /** Deja la web pública con su contenido inicial. */
    private function publicarContenidoDeFabrica(User $administrador): void
    {
        $yaHayContenidoPublicado = ContenidoSitio::query()
            ->where('clave', ContenidoSitio::CLAVE_PRINCIPAL)
            ->exists();

        if ($yaHayContenidoPublicado) {
            $this->command?->info('· La web ya tenía contenido publicado (no se toca)');

            return;
        }

        ContenidoSitio::publicarNuevaVersion(
            ContenidoWebPorDefecto::comoArreglo(),
            $administrador,
            'Contenido inicial de fábrica',
        );

        $this->command?->info('✔ Contenido de fábrica publicado en la web');
    }

    /**
     * Datos de ejemplo para desarrollo: un comercial, dos vendedores y
     * unas marcas repartidas por zonas y fases, de modo que el tablero y
     * los gráficos se vean con contenido real desde el primer arranque.
     */
    private function sembrarDatosDeEjemplo(): void
    {
        if (Marca::query()->exists()) {
            $this->command?->info('· Ya había marcas cargadas (no se siembran ejemplos)');

            return;
        }

        $comercial = User::query()->firstOrCreate(
            ['email' => 'comercial@tssports.com'],
            [
                'name' => 'Lucía Comercial',
                'password' => 'demo12345',
                'rol' => RolUsuario::Comercial->value,
                'zona' => 'Caracas',
                'color_acento' => '#7c3aed',
            ],
        );

        $vendedorCaracas = User::query()->firstOrCreate(
            ['email' => 'vendedor.caracas@tssports.com'],
            [
                'name' => 'Andrés Pérez',
                'password' => 'demo12345',
                'rol' => RolUsuario::Vendedor->value,
                'zona' => 'Caracas',
                'color_acento' => '#2563eb',
            ],
        );

        $vendedorOriente = User::query()->firstOrCreate(
            ['email' => 'vendedor.oriente@tssports.com'],
            [
                'name' => 'María Salazar',
                'password' => 'demo12345',
                'rol' => RolUsuario::Vendedor->value,
                'zona' => 'Oriente',
                'color_acento' => '#16c79a',
            ],
        );

        $marcasDeEjemplo = [
            [
                'nombre_marca' => 'Refrescos del Caribe',
                'sector' => 'Bebidas',
                'zona' => 'Caracas',
                'persona_contacto' => 'Rodrigo Salas',
                'cargo_contacto' => 'Gerente de mercadeo',
                'email_contacto' => 'rodrigo@refrescoscaribe.com',
                'telefono_contacto' => '+58 412 555 0101',
                'logo_url' => 'https://placehold.co/200x200/1b9aaa/ffffff?text=RC',
                'via_prospeccion' => 'Supermercado',
                'invierte_actualmente' => InversionEnPatrocinios::Si->value,
                'fase_aproximacion_completada' => true,
                'via_aproximacion' => 'WhatsApp',
                'fase_propuesta_completada' => true,
                'descripcion_propuesta' => 'Patrocinio principal de la temporada 2026, con presencia en camiseta y activaciones en estadio.',
                'valor_anual_usd' => 48000,
                'vendedor' => $vendedorCaracas,
            ],
            [
                'nombre_marca' => 'Telecom Andina',
                'sector' => 'Telecomunicaciones',
                'zona' => 'Andes-Zulia',
                'persona_contacto' => 'Paula Nieto',
                'cargo_contacto' => 'Directora de marca',
                'email_contacto' => 'paula.nieto@telecomandina.com',
                'logo_url' => 'https://placehold.co/200x200/2563eb/ffffff?text=TA',
                'via_prospeccion' => 'Valla local',
                'invierte_actualmente' => InversionEnPatrocinios::Si->value,
                'fase_aproximacion_completada' => true,
                'via_aproximacion' => 'Conocido',
                'fase_propuesta_completada' => false,
                'valor_anual_usd' => 0,
                'vendedor' => $comercial,
            ],
            [
                'nombre_marca' => 'Deportivo Oriente Store',
                'sector' => 'Retail',
                'zona' => 'Oriente',
                'persona_contacto' => 'Jesús Márquez',
                'cargo_contacto' => 'Dueño',
                'email_contacto' => 'jesus@deportivooriente.com',
                'logo_url' => 'https://placehold.co/200x200/16c79a/ffffff?text=DO',
                'via_prospeccion' => 'Instagram',
                'invierte_actualmente' => InversionEnPatrocinios::No->value,
                'fase_aproximacion_completada' => true,
                'via_aproximacion' => 'Conocido',
                'vendedor' => $vendedorOriente,
            ],
            [
                'nombre_marca' => 'Banco Metropolitano',
                'sector' => 'Banca y finanzas',
                'zona' => 'Caracas',
                'persona_contacto' => 'Elena Ruiz',
                'cargo_contacto' => 'Gerente de patrocinios',
                'email_contacto' => 'eruiz@bancometro.com',
                'logo_url' => 'https://placehold.co/200x200/0a1f3c/ffffff?text=BM',
                'via_prospeccion' => 'Evento local',
                'invierte_actualmente' => InversionEnPatrocinios::Si->value,
                'fase_aproximacion_completada' => true,
                'via_aproximacion' => 'Conocido',
                'fase_propuesta_completada' => true,
                'descripcion_propuesta' => 'Naming rights del torneo juvenil y activación digital durante seis meses.',
                'valor_anual_usd' => 96000,
                'vendedor' => $comercial,
            ],
            [
                // A propósito incompleta: sirve para ver cómo se muestra
                // una marca a la que le faltan datos de prospección.
                'nombre_marca' => 'Snacks Lara',
                'sector' => 'Alimentos',
                'zona' => 'Lara',
                'via_prospeccion' => 'Radio',
                'vendedor' => null,
            ],
        ];

        foreach ($marcasDeEjemplo as $datosDeLaMarca) {
            $vendedorAsignado = $datosDeLaMarca['vendedor'];
            unset($datosDeLaMarca['vendedor']);

            $marca = new Marca($datosDeLaMarca);
            $marca->registrada_por_id = $comercial->id;
            $marca->registrada_por_nombre = $comercial->nombreParaMostrar();

            if ($vendedorAsignado instanceof User) {
                $marca->vendedor_asignado_id = $vendedorAsignado->id;
                $marca->vendedor_asignado_nombre = $vendedorAsignado->nombreParaMostrar();
            }

            $marca->save();
        }

        // Un par de comentarios para que la bitácora no salga vacía.
        $primeraMarca = Marca::query()->where('nombre_marca', 'Refrescos del Caribe')->first();

        if ($primeraMarca !== null) {
            ComentarioMarca::create([
                'marca_id' => $primeraMarca->id,
                'autor_id' => $comercial->id,
                'autor_nombre' => $comercial->nombreParaMostrar(),
                'cuerpo' => 'Enviada la propuesta por correo. Quedaron en responder la semana que viene.',
            ]);

            ComentarioMarca::create([
                'marca_id' => $primeraMarca->id,
                'autor_id' => $vendedorCaracas->id,
                'autor_nombre' => $vendedorCaracas->nombreParaMostrar(),
                'cuerpo' => 'Confirmado: quieren añadir presencia en la valla del estadio. Ajusto el importe.',
            ]);
        }

        $this->command?->info('✔ Datos de ejemplo sembrados (3 usuarios de prueba + 5 marcas)');
        $this->command?->warn('  Contraseña de los usuarios de prueba: demo12345');
    }
}
