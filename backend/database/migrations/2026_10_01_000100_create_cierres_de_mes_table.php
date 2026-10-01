<?php

/**
 * Migración: los reportes de «Cierre de mes».
 * ---------------------------------------------------------------------
 * Al acabar cada mes el comercial prepara un reporte (un PDF, un Excel,
 * una presentación) y desde el 2026-10-01 lo sube al panel, donde quedan
 * ordenados por mes. Cada fila es UN documento: en un mismo mes puede
 * haber varios, uno por persona o por tema.
 *
 *   · `mes` es el primer día del mes AL QUE CORRESPONDE el reporte, no el
 *     día en que se subió: el de septiembre se sube en octubre. Va como
 *     fecha y no como texto para poder ordenar y agrupar en la base.
 *   · El fichero vive en `archivos_media`, en el disco PRIVADO, y lo
 *     guarda GuardadoDeArchivos como cualquier otro (regla 21). Se borra
 *     con el cierre.
 *   · `subido_por_nombre` es una copia: si la cuenta se da de baja, el
 *     archivo sigue diciendo quién lo subió.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cierres_de_mes', function (Blueprint $tabla) {
            $tabla->uuid('id')->primary();
            $tabla->date('mes');
            $tabla->string('titulo', 160);
            $tabla->text('notas')->nullable();
            $tabla->foreignUuid('archivo_media_id')->constrained('archivos_media')->cascadeOnDelete();
            $tabla->foreignUuid('subido_por_id')->nullable()->constrained('users')->nullOnDelete();
            $tabla->string('subido_por_nombre')->nullable();
            $tabla->timestamps();

            $tabla->index(['mes', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cierres_de_mes');
    }
};
