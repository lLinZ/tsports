<?php

/**
 * Migración: `eventos_de_campana` — el historial de acciones por marca.
 * ---------------------------------------------------------------------
 * Cada fila es UNA acción de campaña sobre UNA marca en UN día: "el 10
 * de septiembre se visitó a Azúcar la Pastora", "el 20 se la invitó a
 * Sportbiz".
 *
 * POR QUÉ UNA TABLA Y NO LAS COLUMNAS DE `marcas`
 * Con `campana_id` y `fecha_campana` en la propia marca solo cabe una
 * acción: al asignar la segunda, la primera se pierde sin dejar rastro.
 * Y el trabajo comercial es justo lo contrario — a una marca se la
 * visita, luego se le manda material y más tarde se la invita a un
 * evento. Ese recorrido es lo que hay que poder consultar.
 *
 * Las columnas de `marcas` se quedan como "la acción en curso" (lo que
 * se ve y se edita en la ficha); esta tabla es el registro histórico y
 * es lo que alimenta el calendario, porque es la única que puede
 * devolver varias acciones de la misma marca en semanas distintas.
 *
 * Quién la registró se guarda con nombre además de con id: si esa
 * persona se da de baja, el historial debe seguir diciendo quién anotó
 * cada cosa.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('eventos_de_campana', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();

            // Si se borra la marca, su historial se va con ella: son
            // acciones sobre esa marca y no significan nada sin ella.
            $tabla->foreignUuid('marca_id')
                  ->constrained('marcas')->cascadeOnDelete();

            // Si se borra la campaña, el evento SÍ sobrevive: que alguien
            // deje de usar "Visita presencial" no borra las visitas que
            // se hicieron. Por eso se guarda también el nombre.
            $tabla->foreignUuid('campana_id')->nullable()
                  ->constrained('campanas')->nullOnDelete();
            $tabla->string('campana_nombre');
            $tabla->string('campana_color', 9)->default('#1b9aaa');

            // El día en que se hace la acción. Sin hora: se planifica por
            // jornadas y una hora obligaría a decidir una zona horaria
            // que nadie va a mirar.
            $tabla->date('fecha');

            $tabla->text('nota')->nullable();

            $tabla->foreignUuid('registrado_por_id')->nullable()
                  ->constrained('users')->nullOnDelete();
            $tabla->string('registrado_por_nombre')->nullable();

            $tabla->timestamps();

            // El calendario pregunta siempre por un rango de fechas.
            $tabla->index('fecha');
            // Y la ficha, por el historial de una marca en orden.
            $tabla->index(['marca_id', 'fecha']);
            $tabla->index('campana_id');
        });

        // Las acciones que ya se habían asignado con las columnas de
        // `marcas` pasan a ser el primer evento de su historial, para no
        // empezar el registro con un hueco.
        $this->trasladarLasAccionesYaAsignadas();
    }

    /**
     * Copia a la tabla nueva las marcas que ya tenían campaña y fecha.
     *
     * Se hace con consultas directas y no con los modelos a propósito:
     * una migración tiene que seguir funcionando dentro de un año, y los
     * modelos para entonces pueden tener otras reglas, otros campos o
     * eventos de guardado que aquí no queremos disparar.
     */
    private function trasladarLasAccionesYaAsignadas(): void
    {
        $yaAsignadas = \DB::table('marcas')
            ->join('campanas', 'marcas.campana_id', '=', 'campanas.id')
            ->whereNotNull('marcas.campana_id')
            ->whereNotNull('marcas.fecha_campana')
            ->select([
                'marcas.id as marca_id',
                'marcas.campana_id',
                'marcas.fecha_campana',
                'marcas.registrada_por_id',
                'marcas.registrada_por_nombre',
                'campanas.nombre as campana_nombre',
                'campanas.color as campana_color',
            ])
            ->get();

        foreach ($yaAsignadas as $marca) {
            \DB::table('eventos_de_campana')->insert([
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'marca_id' => $marca->marca_id,
                'campana_id' => $marca->campana_id,
                'campana_nombre' => $marca->campana_nombre,
                'campana_color' => $marca->campana_color,
                'fecha' => $marca->fecha_campana,
                'nota' => null,
                'registrado_por_id' => $marca->registrada_por_id,
                'registrado_por_nombre' => $marca->registrada_por_nombre,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('eventos_de_campana');
    }
};
