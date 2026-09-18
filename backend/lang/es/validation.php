<?php

declare(strict_types=1);

/**
 * lang/es/validation.php — los mensajes de validación en español.
 * ---------------------------------------------------------------------
 * El sistema corre con APP_LOCALE=es y APP_FALLBACK_LOCALE=es, y Laravel
 * solo trae de fábrica los mensajes en inglés. Sin este fichero, una
 * regla que no tuviera mensaje propio en su FormRequest no salía ni en
 * inglés: salía la CLAVE, tal cual, en el aviso de la pantalla. Así se
 * vio «validation.max.string» al crear una propiedad con un logo pegado
 * desde Google Imágenes.
 *
 * Los mensajes propios de cada petición (`messages()` de los
 * FormRequest) siguen mandando: esto solo cubre lo que no tiene uno.
 * Las claves son las del validation.php de Laravel, y la prueba
 * MensajesDeValidacionTest avisa si una versión nueva trae alguna regla
 * que aquí no está.
 *
 * Las tres frases que Laravel arma aparte («(and 1 more error)» y
 * compañía) no son de este fichero: van en lang/es.json.
 * ---------------------------------------------------------------------
 */

// Casi siempre es una imagen pegada como texto: «Copiar dirección de la
// imagen» en Google Imágenes da un data:image/…;base64 de miles de
// caracteres. El campo de imagen ya las sube solo, pero si alguna llega
// hasta aquí, el mensaje tiene que decir qué hacer y no cuántos
// caracteres caben.
$direccionDeImagenDemasiadoLarga =
    'Esa dirección de imagen es demasiado larga para guardarla. Sube la imagen con «Subir imagen».';

return [

    'accepted' => 'El campo :attribute debe aceptarse.',
    'accepted_if' => 'El campo :attribute debe aceptarse cuando :other es :value.',
    'active_url' => 'El campo :attribute debe ser una URL válida.',
    'after' => 'El campo :attribute debe ser una fecha posterior a :date.',
    'after_or_equal' => 'El campo :attribute debe ser una fecha igual o posterior a :date.',
    'alpha' => 'El campo :attribute solo puede contener letras.',
    'alpha_dash' => 'El campo :attribute solo puede contener letras, números, guiones y guiones bajos.',
    'alpha_num' => 'El campo :attribute solo puede contener letras y números.',
    'any_of' => 'El campo :attribute no es válido.',
    'array' => 'El campo :attribute debe ser una lista.',
    'ascii' => 'El campo :attribute solo puede contener letras y números sin tildes, y símbolos básicos.',
    'before' => 'El campo :attribute debe ser una fecha anterior a :date.',
    'before_or_equal' => 'El campo :attribute debe ser una fecha igual o anterior a :date.',
    'between' => [
        'array' => 'El campo :attribute debe tener entre :min y :max elementos.',
        'file' => 'El campo :attribute debe pesar entre :min y :max kilobytes.',
        'numeric' => 'El campo :attribute debe estar entre :min y :max.',
        'string' => 'El campo :attribute debe tener entre :min y :max caracteres.',
    ],
    'boolean' => 'El campo :attribute debe ser sí o no.',
    'can' => 'El campo :attribute contiene un valor no permitido.',
    'confirmed' => 'La confirmación de :attribute no coincide.',
    'contains' => 'Al campo :attribute le falta un valor obligatorio.',
    'current_password' => 'La contraseña no es correcta.',
    'date' => 'El campo :attribute debe ser una fecha válida.',
    'date_equals' => 'El campo :attribute debe ser la fecha :date.',
    'date_format' => 'El campo :attribute debe tener el formato :format.',
    'decimal' => 'El campo :attribute debe tener :decimal decimales.',
    'declined' => 'El campo :attribute debe rechazarse.',
    'declined_if' => 'El campo :attribute debe rechazarse cuando :other es :value.',
    'different' => 'El campo :attribute y :other deben ser distintos.',
    'digits' => 'El campo :attribute debe tener :digits dígitos.',
    'digits_between' => 'El campo :attribute debe tener entre :min y :max dígitos.',
    'dimensions' => 'La imagen de :attribute no tiene unas dimensiones válidas.',
    'distinct' => 'El campo :attribute tiene un valor repetido.',
    'doesnt_contain' => 'El campo :attribute no puede contener ninguno de estos valores: :values.',
    'doesnt_end_with' => 'El campo :attribute no puede terminar en ninguno de estos valores: :values.',
    'doesnt_start_with' => 'El campo :attribute no puede empezar por ninguno de estos valores: :values.',
    'email' => 'El campo :attribute debe ser un correo válido.',
    'encoding' => 'El campo :attribute debe estar codificado en :encoding.',
    'ends_with' => 'El campo :attribute debe terminar en uno de estos valores: :values.',
    'enum' => 'El valor elegido en :attribute no es válido.',
    'exists' => 'El valor elegido en :attribute no es válido.',
    'extensions' => 'El campo :attribute debe tener una de estas extensiones: :values.',
    'file' => 'El campo :attribute debe ser un fichero.',
    'filled' => 'El campo :attribute no puede quedar vacío.',
    'gt' => [
        'array' => 'El campo :attribute debe tener más de :value elementos.',
        'file' => 'El campo :attribute debe pesar más de :value kilobytes.',
        'numeric' => 'El campo :attribute debe ser mayor que :value.',
        'string' => 'El campo :attribute debe tener más de :value caracteres.',
    ],
    'gte' => [
        'array' => 'El campo :attribute debe tener :value elementos o más.',
        'file' => 'El campo :attribute debe pesar :value kilobytes o más.',
        'numeric' => 'El campo :attribute debe ser mayor o igual que :value.',
        'string' => 'El campo :attribute debe tener :value caracteres o más.',
    ],
    'hex_color' => 'El campo :attribute debe ser un color hexadecimal válido.',
    'image' => 'El campo :attribute debe ser una imagen.',
    'in' => 'El valor elegido en :attribute no es válido.',
    'in_array' => 'El campo :attribute debe existir en :other.',
    'in_array_keys' => 'El campo :attribute debe contener al menos una de estas claves: :values.',
    'integer' => 'El campo :attribute debe ser un número entero.',
    'ip' => 'El campo :attribute debe ser una dirección IP válida.',
    'ipv4' => 'El campo :attribute debe ser una dirección IPv4 válida.',
    'ipv6' => 'El campo :attribute debe ser una dirección IPv6 válida.',
    'json' => 'El campo :attribute debe ser un texto JSON válido.',
    'list' => 'El campo :attribute debe ser una lista.',
    'lowercase' => 'El campo :attribute debe ir en minúsculas.',
    'lt' => [
        'array' => 'El campo :attribute debe tener menos de :value elementos.',
        'file' => 'El campo :attribute debe pesar menos de :value kilobytes.',
        'numeric' => 'El campo :attribute debe ser menor que :value.',
        'string' => 'El campo :attribute debe tener menos de :value caracteres.',
    ],
    'lte' => [
        'array' => 'El campo :attribute no puede tener más de :value elementos.',
        'file' => 'El campo :attribute debe pesar :value kilobytes o menos.',
        'numeric' => 'El campo :attribute debe ser menor o igual que :value.',
        'string' => 'El campo :attribute debe tener :value caracteres o menos.',
    ],
    'mac_address' => 'El campo :attribute debe ser una dirección MAC válida.',
    'max' => [
        'array' => 'El campo :attribute no puede tener más de :max elementos.',
        'file' => 'El campo :attribute no puede pesar más de :max kilobytes.',
        'numeric' => 'El campo :attribute no puede ser mayor que :max.',
        'string' => 'El campo :attribute no puede tener más de :max caracteres.',
    ],
    'max_digits' => 'El campo :attribute no puede tener más de :max dígitos.',
    'mimes' => 'El campo :attribute debe ser un fichero de tipo: :values.',
    'mimetypes' => 'El campo :attribute debe ser un fichero de tipo: :values.',
    'min' => [
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
        'file' => 'El campo :attribute debe pesar al menos :min kilobytes.',
        'numeric' => 'El campo :attribute debe ser como mínimo :min.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
    ],
    'min_digits' => 'El campo :attribute debe tener al menos :min dígitos.',
    'missing' => 'El campo :attribute no debe enviarse.',
    'missing_if' => 'El campo :attribute no debe enviarse cuando :other es :value.',
    'missing_unless' => 'El campo :attribute no debe enviarse salvo que :other sea :value.',
    'missing_with' => 'El campo :attribute no debe enviarse cuando :values está presente.',
    'missing_with_all' => 'El campo :attribute no debe enviarse cuando :values están presentes.',
    'multiple_of' => 'El campo :attribute debe ser múltiplo de :value.',
    'not_in' => 'El valor elegido en :attribute no es válido.',
    'not_regex' => 'El formato del campo :attribute no es válido.',
    'numeric' => 'El campo :attribute debe ser un número.',
    'password' => [
        'letters' => 'El campo :attribute debe contener al menos una letra.',
        'mixed' => 'El campo :attribute debe contener al menos una mayúscula y una minúscula.',
        'numbers' => 'El campo :attribute debe contener al menos un número.',
        'symbols' => 'El campo :attribute debe contener al menos un símbolo.',
        'uncompromised' => 'Ese valor de :attribute ha aparecido en una filtración de datos. Elige otro.',
    ],
    'present' => 'El campo :attribute debe estar presente.',
    'present_if' => 'El campo :attribute debe estar presente cuando :other es :value.',
    'present_unless' => 'El campo :attribute debe estar presente salvo que :other sea :value.',
    'present_with' => 'El campo :attribute debe estar presente cuando :values está presente.',
    'present_with_all' => 'El campo :attribute debe estar presente cuando :values están presentes.',
    'prohibited' => 'El campo :attribute no está permitido.',
    'prohibited_if' => 'El campo :attribute no está permitido cuando :other es :value.',
    'prohibited_if_accepted' => 'El campo :attribute no está permitido cuando se acepta :other.',
    'prohibited_if_declined' => 'El campo :attribute no está permitido cuando se rechaza :other.',
    'prohibited_unless' => 'El campo :attribute no está permitido salvo que :other esté en :values.',
    'prohibits' => 'El campo :attribute impide que :other esté presente.',
    'regex' => 'El formato del campo :attribute no es válido.',
    'required' => 'El campo :attribute es obligatorio.',
    'required_array_keys' => 'El campo :attribute debe incluir: :values.',
    'required_if' => 'El campo :attribute es obligatorio cuando :other es :value.',
    'required_if_accepted' => 'El campo :attribute es obligatorio cuando se acepta :other.',
    'required_if_declined' => 'El campo :attribute es obligatorio cuando se rechaza :other.',
    'required_unless' => 'El campo :attribute es obligatorio salvo que :other esté en :values.',
    'required_with' => 'El campo :attribute es obligatorio cuando :values está presente.',
    'required_with_all' => 'El campo :attribute es obligatorio cuando :values están presentes.',
    'required_without' => 'El campo :attribute es obligatorio cuando :values no está presente.',
    'required_without_all' => 'El campo :attribute es obligatorio cuando no está presente ninguno de estos: :values.',
    'same' => 'El campo :attribute debe coincidir con :other.',
    'size' => [
        'array' => 'El campo :attribute debe contener :size elementos.',
        'file' => 'El campo :attribute debe pesar :size kilobytes.',
        'numeric' => 'El campo :attribute debe ser :size.',
        'string' => 'El campo :attribute debe tener :size caracteres.',
    ],
    'starts_with' => 'El campo :attribute debe empezar por uno de estos valores: :values.',
    'string' => 'El campo :attribute debe ser texto.',
    'timezone' => 'El campo :attribute debe ser una zona horaria válida.',
    'unique' => 'Ese valor de :attribute ya está en uso.',
    'uploaded' => 'No se pudo subir el fichero de :attribute.',
    'uppercase' => 'El campo :attribute debe ir en mayúsculas.',
    'url' => 'El campo :attribute debe ser una URL válida.',
    'ulid' => 'El campo :attribute debe ser un ULID válido.',
    'uuid' => 'El campo :attribute debe ser un UUID válido.',

    /*
     | Mensajes para un campo concreto, valgan para la petición que valgan.
     | Van aquí y no en cada FormRequest porque el mismo campo se repite
     | en varias (el logo está en la marca y en la propiedad).
     */
    'custom' => [
        'logoUrl' => ['max' => $direccionDeImagenDemasiadoLarga],
        'urlAvatar' => ['max' => $direccionDeImagenDemasiadoLarga],
    ],

    /*
     | El nombre legible de cada campo de la API. Los campos llegan en
     | camelCase, y sin esto Laravel hablaría de «logo url» o de «vendedor
     | asignado id».
     */
    'attributes' => [
        'accion' => 'acción',
        'activa' => 'activa',
        'activo' => 'activo',
        'archivo' => 'archivo',
        'asignadaATodos' => 'disponible para todo el equipo',
        'campanaId' => 'campaña',
        'cargoContacto' => 'cargo',
        'color' => 'color',
        'colorAcento' => 'color de acento',
        'completada' => 'completada',
        'contenido' => 'contenido',
        'cuerpo' => 'comentario',
        'descripcion' => 'descripción',
        'descripcionPropuesta' => 'descripción de la propuesta',
        'desde' => 'desde',
        'destinatario' => 'destinatario',
        'email' => 'correo',
        'emailContacto' => 'correo del contacto',
        'empresa' => 'empresa',
        'entidad' => 'tipo de registro',
        'fase' => 'fase',
        'faseAproximacionCompletada' => 'aproximación',
        'fasePropuestaCompletada' => 'propuesta',
        'fecha' => 'fecha',
        'fechaCampana' => 'día de la acción',
        'fechaFin' => 'fecha de fin',
        'fechaInicio' => 'fecha de inicio',
        'hasta' => 'hasta',
        'invierteActualmente' => 'inversión en patrocinios',
        'logoUrl' => 'logo',
        'mensaje' => 'mensaje',
        'montoTotalUsd' => 'monto total (MTP)',
        'nombre' => 'nombre',
        'nombreMarca' => 'nombre de la marca',
        'nota' => 'nota',
        'notaDeCambio' => 'nota del cambio',
        'notas' => 'notas',
        'orden' => 'orden',
        'password' => 'contraseña',
        'passwordActual' => 'contraseña actual',
        'passwordNueva' => 'contraseña nueva',
        'periodo' => 'periodo',
        'personaContacto' => 'persona de contacto',
        'porcentajeForecast' => 'porcentaje del forecast',
        'propiedades' => 'propiedades',
        'propiedades.*.nota' => 'nota de la propiedad',
        'propiedades.*.ovpUsd' => 'pronóstico de venta (OVP)',
        'propiedades.*.propiedadId' => 'propiedad',
        'proposito' => 'propósito',
        'prospectoresIds' => 'personas asignadas',
        'prospectoresIds.*' => 'persona asignada',
        'rol' => 'rol',
        'sector' => 'sector',
        'sitioWeb' => 'sitio web',
        'telefono' => 'teléfono',
        'telefonoContacto' => 'teléfono del contacto',
        'tema' => 'tema',
        'titulo' => 'título',
        'urlAvatar' => 'foto de perfil',
        'usuario' => 'persona',
        'valorAnualUsd' => 'valor anual',
        'vendedorAsignadoId' => 'agente asignado',
        'viaAproximacion' => 'vía de aproximación',
        'viaProspeccion' => 'vía de prospección',
        'zona' => 'zona',
    ],

];
