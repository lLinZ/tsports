# -*- coding: utf-8 -*-
"""
Genera los dos informes de TS Sports en PDF:

  · TS-Sports-Informe-Ejecutivo-2026-08-27.pdf  (para el dueño del proyecto)
  · TS-Sports-Informe-Tecnico-2026-08-27.pdf    (para el equipo de desarrollo)

Todo el contenido sale de datos comprobados en el propio sistema el
2026-08-27: pruebas automatizadas, consultas a la base de datos y
revisión de las pantallas en el navegador.
"""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# Los PDF se escriben junto a este guion, sea cual sea la ruta del
# proyecto en la máquina donde se ejecute.
CARPETA_DE_SALIDA = Path(__file__).resolve().parent
CARPETA_DE_SALIDA.mkdir(parents=True, exist_ok=True)

FECHA = "27 de agosto de 2026"

# --- Paleta ----------------------------------------------------------
TURQUESA = colors.HexColor("#1b9aaa")
TURQUESA_SUAVE = colors.HexColor("#e6f4f6")
TINTA = colors.HexColor("#1f2937")
GRIS = colors.HexColor("#6b7280")
GRIS_LINEA = colors.HexColor("#d1d5db")
FILA_ALTERNA = colors.HexColor("#f7f9fa")
AMBAR = colors.HexColor("#b45309")
VERDE = colors.HexColor("#15803d")

# --- Estilos ---------------------------------------------------------
base = getSampleStyleSheet()

ESTILO_TITULO_PORTADA = ParagraphStyle(
    "TituloPortada", parent=base["Title"], fontName="Helvetica-Bold",
    fontSize=26, leading=31, textColor=TINTA, alignment=TA_LEFT, spaceAfter=6,
)
ESTILO_SUBTITULO_PORTADA = ParagraphStyle(
    "SubtituloPortada", parent=base["Normal"], fontName="Helvetica",
    fontSize=13, leading=18, textColor=GRIS, alignment=TA_LEFT, spaceAfter=2,
)
ESTILO_SECCION = ParagraphStyle(
    "Seccion", parent=base["Heading1"], fontName="Helvetica-Bold",
    fontSize=15, leading=19, textColor=TURQUESA, spaceBefore=20, spaceAfter=8,
    keepWithNext=1,
)
ESTILO_SUBSECCION = ParagraphStyle(
    "Subseccion", parent=base["Heading2"], fontName="Helvetica-Bold",
    fontSize=11.5, leading=15, textColor=TINTA, spaceBefore=13, spaceAfter=5,
    keepWithNext=1,
)
ESTILO_TEXTO = ParagraphStyle(
    "Texto", parent=base["Normal"], fontName="Helvetica",
    fontSize=10.5, leading=15.5, textColor=TINTA, spaceAfter=7,
)
ESTILO_PREGUNTA = ParagraphStyle(
    "Pregunta", parent=ESTILO_TEXTO, fontName="Helvetica-Bold",
    fontSize=11, leading=15, textColor=TINTA, spaceBefore=12, spaceAfter=4,
    keepWithNext=1,
)
ESTILO_LISTA = ParagraphStyle(
    "Lista", parent=ESTILO_TEXTO, spaceAfter=4,
)
ESTILO_TABLA = ParagraphStyle(
    "Tabla", parent=base["Normal"], fontName="Helvetica",
    fontSize=9.8, leading=13.5, textColor=TINTA,
)
ESTILO_TABLA_CABECERA = ParagraphStyle(
    "TablaCabecera", parent=ESTILO_TABLA, fontName="Helvetica-Bold",
    textColor=TINTA,
)
ESTILO_CODIGO = ParagraphStyle(
    "Codigo", parent=base["Normal"], fontName="Courier",
    fontSize=9.5, leading=14, textColor=TINTA,
    backColor=colors.HexColor("#f3f4f6"),
    borderPadding=(6, 8, 6, 8), spaceBefore=4, spaceAfter=10,
    leftIndent=2, rightIndent=2,
)


def texto(contenido, estilo=ESTILO_TEXTO):
    return Paragraph(contenido, estilo)


def lista(elementos, estilo=ESTILO_LISTA, numerada=False):
    """Lista con viñetas o numerada, con sangría cómoda."""
    return ListFlowable(
        [ListItem(Paragraph(e, estilo), leftIndent=16) for e in elementos],
        bulletType="1" if numerada else "bullet",
        bulletFontName="Helvetica-Bold" if numerada else "Helvetica",
        bulletColor=TURQUESA,
        bulletFontSize=10 if numerada else 8,
        leftIndent=16,
        spaceAfter=8,
    )


def tabla(filas, anchos, alinear_derecha=None):
    """Tabla con cabecera en turquesa y filas alternas."""
    datos = [[Paragraph(str(c), ESTILO_TABLA_CABECERA) for c in filas[0]]]
    datos += [[Paragraph(str(c), ESTILO_TABLA) for c in fila] for fila in filas[1:]]

    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), TURQUESA_SUAVE),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, TURQUESA),
        ("GRID", (0, 0), (-1, -1), 0.4, GRIS_LINEA),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]

    for indice in range(2, len(datos), 2):
        estilo.append(("BACKGROUND", (0, indice), (-1, indice), FILA_ALTERNA))

    if alinear_derecha:
        for columna in alinear_derecha:
            estilo.append(("ALIGN", (columna, 1), (columna, -1), "RIGHT"))

    t = Table(datos, colWidths=anchos, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle(estilo))

    return t


def aviso(titulo_del_aviso, cuerpo, color=AMBAR):
    """Bloque destacado, del ancho de la caja de texto."""
    contenido = Paragraph(
        f'<font color="{color.hexval()}"><b>{titulo_del_aviso}</b></font><br/>{cuerpo}',
        ESTILO_TABLA,
    )
    t = Table([[contenido]], colWidths=[17 * cm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf6e7") if color == AMBAR else TURQUESA_SUAVE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, color),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))

    return t


def portada(titulo_del_documento, para_quien, descripcion):
    barra = Table([[""]], colWidths=[17 * cm], rowHeights=[5])
    barra.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TURQUESA)]))

    return [
        Spacer(1, 1.2 * cm),
        Paragraph("TS SPORTS", ParagraphStyle(
            "Marca", parent=ESTILO_TEXTO, fontName="Helvetica-Bold",
            fontSize=11, textColor=TURQUESA, spaceAfter=10,
        )),
        barra,
        Spacer(1, 0.8 * cm),
        Paragraph(titulo_del_documento, ESTILO_TITULO_PORTADA),
        Paragraph(descripcion, ESTILO_SUBTITULO_PORTADA),
        Spacer(1, 0.5 * cm),
        Paragraph(
            f"{para_quien}<br/>{FECHA}",
            ParagraphStyle("Meta", parent=ESTILO_TEXTO, fontSize=10.5,
                           textColor=GRIS, leading=16),
        ),
        Spacer(1, 0.7 * cm),
    ]


def construir(nombre_del_fichero, titulo_del_documento, historia):
    """Monta el PDF con su pie de página numerado."""
    ruta = CARPETA_DE_SALIDA / nombre_del_fichero

    documento = BaseDocTemplate(
        str(ruta), pagesize=A4,
        leftMargin=2.2 * cm, rightMargin=2.2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title=titulo_del_documento, author="TS Sports",
    )

    marco = Frame(
        documento.leftMargin, documento.bottomMargin,
        documento.width, documento.height, id="cuerpo",
    )

    def pie(lienzo, doc):
        lienzo.saveState()
        lienzo.setFont("Helvetica", 8.5)
        lienzo.setFillColor(GRIS)
        lienzo.drawString(documento.leftMargin, 1.25 * cm,
                          f"TS Sports · {titulo_del_documento} · {FECHA}")
        lienzo.drawRightString(A4[0] - documento.rightMargin, 1.25 * cm,
                               f"Página {doc.page}")
        lienzo.setStrokeColor(GRIS_LINEA)
        lienzo.setLineWidth(0.4)
        lienzo.line(documento.leftMargin, 1.6 * cm,
                    A4[0] - documento.rightMargin, 1.6 * cm)
        lienzo.restoreState()

    documento.addPageTemplates([PageTemplate(id="normal", frames=[marco], onPage=pie)])
    documento.build(historia)

    return ruta


# =====================================================================
#  Datos comunes a los dos informes
# =====================================================================

USUARIOS = [
    ["Nombre", "Correo de acceso", "Rol", "Contraseña"],
    ["Antonio Linares", "tssports@gmail.com", "Administrador", "CambiaEstaClave2026"],
    ["Jose Linares", "linz.webdev@gmail.com", "Administrador", "CambiaEstaClave2026"],
    ["Comercial", "comercial1@tsportve.online", "Comercial", "CambiaEstaClave2026"],
    ["Daymar Marcano", "dayvamar@gmail.com", "Vendedor", "CambiaEstaClave2026"],
    ["Elianna Nodas", "eliproducciones16@gmail.com", "Vendedor", "CambiaEstaClave2026"],
    ["Adnny Daniela", "adraactivaciones@gmail.com", "Vendedor", "CambiaEstaClave2026"],
    ["Homero Perozo", "homeroperozo1@gmail.com", "Vendedor", "CambiaEstaClave2026"],
    ["Dayrene Marcano", "dayrene.remax.galaxy@gmail.com", "Vendedor", "CambiaEstaClave2026"],
]

ANCHOS_USUARIOS = [3.9 * cm, 6.1 * cm, 2.9 * cm, 4.1 * cm]

ROLES = [
    ["Rol", "Qué puede hacer"],
    ["Administrador", "Todo: cuentas del equipo, contenido de la web, marcas, productos y campañas."],
    ["Comercial", "Todas las marcas y su asignación a vendedores. Crea productos y campañas. No crea cuentas."],
    ["Vendedor", "Ve todas las marcas, edita solo las que tiene asignadas. No borra marcas ni crea productos."],
]

ANCHOS_ROLES = [3.4 * cm, 13.6 * cm]

ESTADO_DE_LOS_DATOS = [
    ["Dato", "Situación hoy"],
    ["Marcas cargadas", "71"],
    ["Marcas con vendedor asignado", "0 de 71"],
    ["Marcas con sector indicado", "0 de 71"],
    ["Marcas con el dato de si ya invierten en marketing deportivo", "0 de 71"],
    ["Marcas con propuesta enviada", "0 de 71"],
    ["Productos (propiedades) cargados", "7"],
    ["Productos con su monto total cargado", "1 de 7 (Comité Olímpico: 162.000 USD)"],
    ["Campañas creadas", "0"],
    ["Comentarios en las bitácoras", "0"],
    ["Cuentas de usuario", "8"],
]

ANCHOS_ESTADO = [10.4 * cm, 6.6 * cm]


# =====================================================================
#  INFORME EJECUTIVO
# =====================================================================

def informe_ejecutivo():
    h = portada(
        "Informe de avance",
        "Preparado para la dirección del proyecto",
        "Sistema TS Sports: web pública, CRM de patrocinios y catálogo comercial",
    )

    h += [
        texto(
            "Este documento repasa los avances del proyecto, lo que falta y cómo se pondrá "
            "el sistema en el servidor. Está escrito sin lenguaje técnico."
        ),

        Paragraph("1. Avances hasta hoy", ESTILO_SECCION),
        texto(
            "El sistema funciona en el equipo de desarrollo con los datos reales ya migrados "
            "desde el sistema anterior: las 71 marcas y las 8 cuentas del equipo están dentro."
        ),
        texto(
            "En esta entrega se levantó la <b>segunda etapa</b>: el catálogo de productos con "
            "sus montos, el checklist de productos dentro de cada marca, las campañas y los "
            "informes que se pidieron. También se cerró lo que había quedado pendiente de la "
            "primera etapa."
        ),
        texto(
            "Quedan por delante dos cosas: <b>cargar la información que solo tiene el equipo "
            "comercial</b> (montos de los productos, reparto entre vendedores, campañas del "
            "año) y <b>subir el sistema al servidor</b>."
        ),

        Paragraph("2. Qué hace el sistema hoy", ESTILO_SECCION),
        tabla([
            ["Parte", "Para qué sirve"],
            ["Página web pública",
             "La página de la agencia, en español e inglés, con su formulario de contacto. "
             "Quien escribe por ahí entra directo al CRM como una marca nueva."],
            ["Administrador de la web",
             "Cambiar textos, fotos, colores y secciones de la página sin tocar programación."],
            ["CRM de marcas",
             "El tablero donde el equipo trabaja cada empresa: ficha, contacto, avance en las "
             "tres fases, valor de la propuesta, responsable y bitácora de conversaciones."],
            ["Catálogo de productos",
             "Las propiedades que la agencia vende (Comité Olímpico, Dvo. Lara, Dvo. Táchira, "
             "Kombat Challenge, Megafitness, Movewireless y Sportbiz Venezuela), cada una con "
             "su monto total, su meta de venta y a qué vendedores se les asigna."],
            ["Pronóstico de ventas",
             "Dentro de cada marca se marca qué productos se le están ofreciendo y cuánto se "
             "estima venderle de cada uno. El sistema muestra qué porcentaje representa esa "
             "estimación sobre el valor del producto."],
            ["Campañas",
             "Agrupan el trabajo comercial del año. Cada marca se asigna a una campaña y "
             "después se puede filtrar y medir por campaña."],
            ["Tablero de indicadores",
             "Las cifras del negocio en una sola pantalla: marcas por fase y por zona, meta de "
             "venta del catálogo, pronóstico de cada vendedor, empresas que ya invierten en "
             "marketing deportivo y reparto por campaña."],
            ["Cuentas y permisos",
             "Tres perfiles de acceso, con lo que cada uno puede ver y tocar."],
        ], [4.3 * cm, 12.7 * cm]),

        Paragraph("3. Cómo se lee la cifra que se pidió", ESTILO_SECCION),
        texto(
            "Cada producto tiene tres montos. Con el ejemplo real del Comité Olímpico:"
        ),
        tabla([
            ["Monto", "Qué significa", "Ejemplo"],
            ["Monto total del producto",
             "Lo que vale la propiedad completa. Lo carga la dirección.", "162.000 USD"],
            ["Meta de venta",
             "El 20 % del monto total. La calcula el sistema solo.", "32.400 USD"],
            ["Pronóstico del vendedor",
             "Lo que el vendedor estima venderle a una marca concreta dentro de ese producto.",
             "12.000 USD"],
        ], [4.6 * cm, 8.4 * cm, 4 * cm]),
        Spacer(1, 4),
        texto(
            "Con esos números el sistema dibuja una barra que dice, de un vistazo, que esos "
            "12.000 son el <b>7,4 %</b> del valor del Comité Olímpico, y marca en la misma "
            "barra dónde está la meta del 20 %. La suma de todos los pronósticos de un "
            "vendedor aparece en el tablero de indicadores."
        ),
        Paragraph("4. Cómo se usa lo nuevo", ESTILO_SECCION),

        Paragraph("Cargar un producto", ESTILO_SUBSECCION),
        lista([
            "Entrar en <b>Propiedades</b> y pulsar <b>Nueva propiedad</b>.",
            "Poner el nombre, subir el logo y, si hace falta, una descripción.",
            "Escribir el <b>monto total</b>. Justo debajo aparece la meta de venta "
            "calculada; sirve para comprobar de un vistazo que el monto se escribió bien.",
            "Elegir si la puede ofrecer todo el equipo o solo algunas personas.",
            "Guardar. El producto aparece al momento en la ficha de todas las marcas.",
        ], numerada=True),

        Paragraph("Anotar cuánto se estima venderle a una marca", ESTILO_SUBSECCION),
        lista([
            "Abrir la marca en el tablero y entrar en el paso <b>Avance</b>.",
            "En <b>Propiedades a ofrecer</b>, marcar la casilla del producto.",
            "Escribir el importe que se estima venderle. La barra de debajo muestra al "
            "instante qué porcentaje representa sobre el valor del producto.",
            "Guardar. Para corregirlo basta con volver a entrar y cambiar el importe, o "
            "desmarcar la casilla si el producto se puso por error.",
        ], numerada=True),

        Paragraph("5. Decisiones tomadas sobre puntos que no estaban definidos",
                  ESTILO_SECCION),
        texto("Estos puntos no venían definidos en las indicaciones. Quedaron así."),
        tabla([
            ["Punto", "Cómo quedó"],
            ["El 20 % de la meta",
             "Viene puesto por defecto en cada producto nuevo, pero es editable producto por "
             "producto. La meta se recalcula sola al cambiarlo."],
            ["Qué muestra la barra",
             "El porcentaje del pronóstico sobre el monto total del producto, que es el "
             "ejemplo que se pidió. Encima se dibuja una marca fina en la meta del 20 %, "
             "para saber si va bien o mal."],
            ["Qué suma el tablero",
             "Se muestran las dos cifras por separado: la meta del catálogo (la suma de los "
             "20 %) y el pronóstico del equipo (la suma de lo que anotan los vendedores). "
             "Por vendedor se suma su pronóstico."],
            ["Marcar productos y la prospección",
             "Marcar productos no da por completada la fase de prospección. Esa fase sigue "
             "dependiendo solo de tener nombre, logo, contacto, cargo y correo, como antes."],
            ["Pronósticos imposibles",
             "No se deja anotar un pronóstico mayor que el valor del producto. Si el producto "
             "todavía no tiene monto cargado, se permite cualquier importe."],
            ["Productos ajenos",
             "Un vendedor ve todo el catálogo, pero solo puede añadir a sus marcas los "
             "productos que tiene asignados. Los demás aparecen apagados."],
            ["Productos retirados",
             "Al retirar un producto de la venta deja de ofrecerse en las fichas nuevas, "
             "pero sigue viéndose en las marcas donde ya se había ofrecido, para no perder "
             "el histórico."],
            ["A quién se le cuenta el pronóstico",
             "Al vendedor asignado de la marca, no a quien escribió la cifra. Si la marca "
             "cambia de manos, su pronóstico se va con ella."],
            ["Campañas",
             "Cada campaña lleva un color, que es como se distinguen en el tablero, y unas "
             "fechas opcionales. Fuera de esas fechas la campaña deja de contar como "
             "«en marcha», pero no se pierde nada."],
        ], [4.6 * cm, 12.4 * cm]),

        Paragraph("6. Preguntas frecuentes", ESTILO_SECCION),

        Paragraph("¿El tablero de indicadores que se pidió está listo?", ESTILO_PREGUNTA),
        texto(
            "Sí. En una sola pantalla se ven las marcas por fase y por zona, la meta de venta "
            "del catálogo, el pronóstico de cada vendedor, cuánto se está pronosticando de "
            "cada producto, qué empresas de cada zona ya invierten en marketing deportivo, el "
            "reparto por campaña y la actividad reciente del equipo."
        ),

        Paragraph("¿Se puede asignar una campaña a cada marca?", ESTILO_PREGUNTA),
        texto(
            "Sí. Dentro de la ficha de la marca hay un selector de campaña. Después se puede "
            "filtrar el tablero por campaña y ver su reparto en los indicadores."
        ),

        Paragraph("¿Cada vendedor ve todas las marcas pero edita solo las suyas?",
                  ESTILO_PREGUNTA),
        texto(
            "Sí. Un vendedor consulta las 71 marcas y solo puede modificar las que tiene "
            "asignadas; las demás se le abren en modo lectura. Tampoco puede borrar marcas. "
            "Las que llegan por el formulario de la web nacen sin responsable y quedan a "
            "nombre del primero que las trabaja."
        ),

        Paragraph("¿Quién puede asignarle un vendedor a una marca?", ESTILO_PREGUNTA),
        texto(
            "El administrador y el comercial. El selector de vendedor solo les aparece a "
            "ellos dentro de la ficha."
        ),

        Paragraph("¿Se pueden dejar comentarios en cada marca?", ESTILO_PREGUNTA),
        texto(
            "Sí. Cada marca tiene su hilo de conversación: se escribe, se lee en orden y cada "
            "quien puede borrar lo suyo (un administrador puede borrar cualquiera). Quien ve "
            "una marca puede comentarla aunque no la trabaje, para avisar al compañero. La "
            "única limitación es de pantalla: en un teléfono la ficha se abre sin esa columna."
        ),

        Paragraph("¿Se pueden registrar los productos que vende la agencia?", ESTILO_PREGUNTA),
        texto(
            "Sí, desde la pantalla de Propiedades: nombre, logo, descripción, monto total, "
            "porcentaje de la meta, a qué vendedores se asigna y si sigue en venta. Los siete "
            "productos actuales ya están cargados."
        ),

        Paragraph("¿Una marca puede llevar varios productos, y un producto estar en varias "
                  "marcas?", ESTILO_PREGUNTA),
        texto(
            "Sí, en las dos direcciones y sin límite. Cada combinación de marca y producto "
            "guarda su propio pronóstico de venta, y una misma pareja no se puede repetir."
        ),

        Paragraph("¿Se puede filtrar por fase, zona y campaña, y ver qué productos tiene "
                  "cada marca?", ESTILO_PREGUNTA),
        texto(
            "Sí. Los filtros se combinan entre sí: texto, fase, zona, sector, campaña, "
            "producto ofrecido, inversión en marketing deportivo y vendedor. La tarjeta de "
            "cada marca muestra sus productos y el pronóstico acumulado sin necesidad de "
            "abrirla. Lo que no existe es un filtro por rango de importe estimado; sí se "
            "puede ordenar de mayor a menor valor."
        ),

        Paragraph("Si me equivoco al añadir un producto a una marca, ¿se puede corregir?",
                  ESTILO_PREGUNTA),
        texto(
            "Sí. Se desmarca el producto o se cambia el importe y se guarda. Lo mismo con la "
            "campaña, los datos de la marca, los productos del catálogo y las cuentas del "
            "equipo. Antes de borrar un producto o una campaña, el sistema avisa a cuántas "
            "marcas afecta."
        ),

        Paragraph("¿Cómo se instala en el servidor?", ESTILO_PREGUNTA),
        texto(
            "En un servidor Linux propio, sin Docker. La instalación está automatizada en dos "
            "guiones: uno deja el servidor listo la primera vez y otro se usa para cada "
            "actualización posterior."
        ),

        Paragraph("7. Lo que falta antes de usarlo a diario", ESTILO_SECCION),
        texto("Nada de esto es programación: es información que solo tiene el equipo."),
        lista([
            "<b>Cargar el monto total de seis productos.</b> Solo el Comité Olímpico tiene "
            "monto (162.000 USD). Los otros seis están en cero porque no se informó su valor.",
            "<b>Repartir los productos entre los vendedores.</b> Hoy los siete están abiertos "
            "a todo el equipo. Se indicó de palabra que el Comité Olímpico es de dirección, "
            "Dvo. Táchira de Daniela y Dvo. Lara de Marcanos, pero hace falta hacerlo dentro "
            "del sistema.",
            "<b>Crear las campañas del año.</b> No hay ninguna cargada.",
            "<b>Asignar cada marca a un vendedor.</b> Las 71 marcas están sin responsable.",
            "<b>Completar el sector de cada marca y si ya invierte en marketing deportivo.</b> "
            "Ese dato no venía del sistema anterior, y sin él dos de los informes se ven vacíos.",
            "<b>Indicar la zona de cada cuenta de usuario.</b> Las ocho están sin zona.",
            "<b>Cambiar las contraseñas temporales.</b> Las ocho cuentas siguen con la clave "
            "provisional de la migración.",
            "<b>Repasar cinco textos de la página web</b> que quedaron marcados como "
            "importados del sitio anterior.",
        ], numerada=True),

        Paragraph("8. Cómo será la puesta en el servidor", ESTILO_SECCION),
        texto(
            "El sistema se instala en un servidor Linux propio (un VPS). No usa Docker: se "
            "instala directamente, y la instalación está automatizada en dos guiones que ya "
            "están escritos."
        ),
        lista([
            "<b>Preparar el servidor.</b> Un guion instala todo lo necesario, crea la base de "
            "datos, publica el sistema y deja el dominio configurado.",
            "<b>Trasladar los datos actuales.</b> Las 71 marcas, las 8 cuentas y el contenido "
            "de la web se copian desde la base de datos que ya está montada.",
            "<b>Activar el candado de seguridad (HTTPS)</b> para que el sitio abra con "
            "conexión cifrada.",
            "<b>Comprobar y entregar.</b> Entrar con cada cuenta, cambiar las contraseñas "
            "temporales y empezar a cargar la información del punto 7.",
        ], numerada=True),
        texto(
            "A partir de ahí, cada actualización futura se hace con un solo guion: pone el "
            "sitio en mantenimiento, actualiza y lo devuelve solo. Si algo falla durante la "
            "actualización, se detiene y el sitio anterior sigue en pie."
        ),

        Paragraph("9. Accesos al sistema", ESTILO_SECCION),
        texto(
            "Estas son las ocho cuentas que existen hoy. Todas mantienen la contraseña "
            "provisional que se puso al migrar los datos, comprobada el día de este informe."
        ),
        tabla(USUARIOS, ANCHOS_USUARIOS),
        Spacer(1, 6),
        texto(
            "Cada persona puede cambiar su contraseña desde <b>Mi perfil</b>, dentro del "
            "sistema. Nadie puede cambiarse su propio rol ni su propia zona: eso lo hace un "
            "administrador desde la pantalla de Equipo."
        ),
        Spacer(1, 4),
        tabla(ROLES, ANCHOS_ROLES),

        Paragraph("10. Situación de la información cargada", ESTILO_SECCION),
        tabla(ESTADO_DE_LOS_DATOS, ANCHOS_ESTADO),
    ]

    return construir(
        "TS-Sports-Informe-Ejecutivo-2026-08-27.pdf",
        "Informe de avance",
        h,
    )


# =====================================================================
#  INFORME TÉCNICO
# =====================================================================

def informe_tecnico():
    h = portada(
        "Informe técnico",
        "Preparado para el equipo del proyecto",
        "Segunda etapa: productos IOP, campañas e informes",
    )

    h += [
        texto(
            "Detalle de lo entregado, respuesta a las preguntas planteadas, estado real de "
            "los datos y el procedimiento de despliegue en el VPS."
        ),

        Paragraph("1. Qué se entregó en esta etapa", ESTILO_SECCION),

        Paragraph("Base de datos", ESTILO_SUBSECCION),
        tabla([
            ["Tabla", "Contenido"],
            ["propiedades",
             "Los productos IOP: nombre, logo, descripción, monto total (MTP), porcentaje del "
             "forecast, si está abierta a todo el equipo, orden y si sigue en venta."],
            ["propiedades_de_marca",
             "Tabla intermedia entre marcas y productos. Guarda el pronóstico de venta (OVP) y "
             "una nota por cada combinación de marca y producto."],
            ["prospectores_de_propiedad",
             "Tabla intermedia entre productos y usuarios: a qué vendedores está asignado cada "
             "producto cuando no está abierto a todo el equipo."],
            ["campanas",
             "Campañas comerciales: nombre, descripción, color, fechas, orden y si está abierta."],
            ["marcas.campana_id",
             "Columna nueva en marcas: la campaña a la que pertenece cada una."],
        ], [4.9 * cm, 12.1 * cm]),

        Paragraph("API", ESTILO_SUBSECCION),
        tabla([
            ["Ruta", "Para qué"],
            ["GET /api/propiedades", "Catálogo de productos. Admite soloActivas y conTotales."],
            ["GET /api/propiedades/{id}", "Ficha de un producto."],
            ["POST /api/propiedades", "Alta de un producto."],
            ["PUT /api/propiedades/{id}", "Edición de un producto."],
            ["DELETE /api/propiedades/{id}", "Baja de un producto."],
            ["GET /api/campanas", "Listado de campañas. Admite soloActivas."],
            ["POST /api/campanas", "Alta de campaña."],
            ["PUT /api/campanas/{id}", "Edición de campaña."],
            ["DELETE /api/campanas/{id}", "Baja de campaña."],
            ["GET /api/marcas",
             "Filtros nuevos: campana, propiedad e invierte, además de los que ya había."],
            ["POST y PUT /api/marcas",
             "Campos nuevos: campanaId y el checklist de productos con su pronóstico."],
            ["GET /api/panel/resumen",
             "Bloques nuevos: propiedades, forecastPorProspector, inversionPorZona y porCampana."],
        ], [6.2 * cm, 10.8 * cm]),

        Paragraph("Pantallas", ESTILO_SUBSECCION),
        tabla([
            ["Pantalla", "Qué se añadió"],
            ["Propiedades (nueva)",
             "Catálogo completo. Alta y edición con logo, monto total, porcentaje del forecast "
             "(con la meta calculándose en vivo), asignación a todo el equipo o a personas "
             "concretas, orden y estado. Cada tarjeta muestra los tres montos y su barra."],
            ["Campañas (nueva)",
             "Alta y edición de campañas con color, fechas y estado."],
            ["Ficha de la marca",
             "Selector de campaña asignada en el paso 1 y el checklist de productos en el paso 3, "
             "con el campo del pronóstico y la barra de porcentaje por producto."],
            ["Tablero de marcas",
             "Filtros por campaña, por producto ofrecido y por inversión en marketing deportivo. "
             "Cada tarjeta muestra la campaña y el pronóstico acumulado con sus productos."],
            ["Resumen",
             "Meta del catálogo y pronóstico total del equipo, informe por producto, forecast por "
             "prospector, inversión por zona y reparto por campaña."],
        ], [4.3 * cm, 12.7 * cm]),

        Paragraph("2. Cómo se calculan los tres montos", ESTILO_SECCION),
        tabla([
            ["Monto", "Dónde vive", "Quién lo escribe"],
            ["MTP (monto total del producto)", "Columna propiedades.monto_total_usd",
             "Administrador o comercial"],
            ["Forecast (meta de venta)",
             "No es columna: se calcula al leer, como el porcentaje sobre el MTP",
             "Nadie: se deriva"],
            ["OVP (pronóstico del vendedor)",
             "Columna propiedades_de_marca.ovp_usd, una fila por marca y producto",
             "El vendedor, desde la ficha"],
        ], [5 * cm, 7.6 * cm, 4.4 * cm]),
        Spacer(1, 6),
        texto(
            "El porcentaje que se pinta en la barra (pronóstico dividido entre el monto total) "
            "tampoco se guarda: se calcula en el servidor cada vez que se lee. De esta forma, "
            "corregir el monto de un producto actualiza al instante su meta y todos los "
            "porcentajes de las marcas que lo ofrecen, sin ningún proceso de recálculo."
        ),
        texto(
            "El servidor rechaza un pronóstico mayor que el monto total del producto, salvo "
            "cuando el producto todavía no tiene monto cargado."
        ),

        Paragraph("3. Respuestas a las preguntas planteadas", ESTILO_SECCION),

        Paragraph("¿El dashboard que pidieron está listo?", ESTILO_PREGUNTA),
        texto(
            "Sí. El resumen muestra: marcas registradas, en aproximación, con prospección "
            "completa y con propuesta; valor propuesto anual; meta de venta del catálogo; "
            "pronóstico total del equipo; el informe por producto con su barra; el forecast de "
            "cada prospector; el avance por zona; <b>el informe de empresas por zona según si "
            "ya invierten o no en marketing deportivo</b>; el reparto por campaña; el reparto "
            "por sector; la carga por vendedor y la actividad reciente del equipo. Los tramos "
            "del informe de inversión son pulsables y abren el tablero ya filtrado."
        ),

        Paragraph("¿Lo de las campañas en el formulario de marcas está listo?", ESTILO_PREGUNTA),
        texto(
            "Sí. En el paso 1 de la ficha hay un selector <b>Campaña asignada</b> que ofrece "
            "las campañas abiertas, con su color. Además se puede filtrar el tablero por "
            "campaña y cada tarjeta muestra a cuál pertenece."
        ),

        Paragraph(
            "¿Cada vendedor puede ver todas las marcas pero solo editar las asignadas?",
            ESTILO_PREGUNTA,
        ),
        texto(
            "Sí. Un vendedor ve las 71 marcas y solo puede editar las que tiene asignadas. "
            "Si intenta editar una ajena, el servidor responde con un error de permisos "
            "explícito y la interfaz muestra la ficha como solo lectura, con un candado en la "
            "tarjeta. Hay una excepción prevista: las marcas que entran por el formulario de la "
            "web nacen sin dueño y el primero que las trabaja se las queda. Además, un vendedor "
            "no puede borrar marcas."
        ),

        Paragraph("¿El comercial o el administrador puede asignar vendedores a una marca?",
                  ESTILO_PREGUNTA),
        texto(
            "Sí. En el paso 2 de la ficha aparece el selector <b>Vendedor asignado</b>, visible "
            "solo para administradores y comerciales. Un vendedor no ve ese selector."
        ),

        Paragraph("¿La función de dejar comentarios está funcional al 100 %?", ESTILO_PREGUNTA),
        texto(
            "Sí, con una limitación de pantalla. Funciona: escribir comentarios, leer el hilo en "
            "orden cronológico, borrar los propios y, en el caso de un administrador, borrar "
            "cualquiera. Quien puede ver una marca puede comentarla aunque no pueda editarla, "
            "para poder avisar al compañero que la trabaja. Al borrar una marca desaparece su "
            "bitácora. Todo esto está cubierto por pruebas automatizadas."
        ),
        texto(
            "La limitación: la bitácora se muestra en la columna derecha de la ficha y esa "
            "columna <b>solo aparece en pantallas de 1024 píxeles o más</b>. En un teléfono la "
            "ficha se abre sin la bitácora. Queda anotado como pendiente."
        ),

        Paragraph("¿Los productos (los servicios que se venden) se pueden registrar?",
                  ESTILO_PREGUNTA),
        texto(
            "Sí, desde la pantalla <b>Propiedades</b>. Se registran con nombre, logo (subiendo "
            "el archivo o pegando una dirección), descripción, monto total, porcentaje del "
            "forecast, asignación de vendedores, orden en el catálogo y estado. Los siete "
            "productos actuales ya están cargados en el orden indicado."
        ),

        Paragraph(
            "¿Una marca puede tener varios productos y un producto pertenecer a varias marcas? "
            "¿Existe una tabla intermedia?",
            ESTILO_PREGUNTA,
        ),
        texto(
            "Sí a las dos cosas. La relación es de muchos a muchos y la resuelve la tabla "
            "intermedia <b>propiedades_de_marca</b>, que además guarda el pronóstico de venta y "
            "una nota de cada combinación. Una misma pareja de marca y producto no se puede "
            "repetir, para que el pronóstico no se cuente dos veces. Hay una segunda tabla "
            "intermedia, <b>prospectores_de_propiedad</b>, que relaciona productos con "
            "vendedores."
        ),

        Paragraph(
            "¿Se podrá filtrar por fase, zona y campaña, y saber qué productos tiene ligados "
            "esa marca?",
            ESTILO_PREGUNTA,
        ),
        texto(
            "Sí. Los filtros se combinan entre sí y son: búsqueda por texto, fase o avance, "
            "zona, sector, campaña, producto ofrecido, inversión en marketing deportivo y "
            "vendedor. Se puede ordenar por más recientes, más antiguas, mayor valor, menor "
            "valor y nombre. Cada combinación queda guardada en la dirección del navegador, "
            "así que esa vista se puede guardar en favoritos o pasarle el enlace a un compañero."
        ),
        texto(
            "Los productos ligados a cada marca se ven sin abrir la ficha: la tarjeta muestra el "
            "pronóstico acumulado y el nombre de los productos. Y desde el informe del resumen "
            "se puede pulsar un producto para ver todas las marcas que lo tienen."
        ),
        texto(
            "Lo que <b>no</b> existe es un filtro por rango de importe estimado, del tipo "
            "«marcas con estimado entre 5.000 y 20.000». Se puede ordenar por mayor o menor "
            "valor, pero no acotar por cantidad. Queda anotado como pendiente."
        ),

        Paragraph("¿Se puede editar todo? Si agrego un producto a una marca y me equivoco, "
                  "¿puedo corregirlo?", ESTILO_PREGUNTA),
        texto(
            "Sí. Dentro de la ficha se puede desmarcar el producto equivocado, corregir el "
            "importe del pronóstico, cambiar la campaña o cualquier otro dato, y guardar. "
            "También se editan los productos del catálogo (incluido su monto, lo que actualiza "
            "al instante todas las marcas que lo ofrecen), las campañas, las cuentas del equipo "
            "y el contenido de la web. Los borrados avisan antes: al eliminar un producto se "
            "indica de cuántas marcas va a desaparecer, y al eliminar una campaña se indica "
            "cuántas marcas se quedarán sin ella. Las marcas nunca se borran por arrastre."
        ),
        texto(
            "La ficha guarda la marca y su checklist en una sola operación: si el servidor "
            "rechaza algo, no queda nada guardado a medias."
        ),

        Paragraph("¿Cómo se despliega en el VPS? ¿Con Docker?", ESTILO_PREGUNTA),
        texto(
            "No se usa Docker. Es una instalación directa sobre Ubuntu 22.04 o 24.04 con nginx, "
            "PHP 8.2, MySQL y Node 22, automatizada en dos guiones incluidos en el proyecto. "
            "El detalle está en el punto 6 de este informe."
        ),

        Paragraph("4. Decisiones tomadas e instrucciones de uso", ESTILO_SECCION),
        texto(
            "Estos puntos no estaban cerrados en las indicaciones recibidas. Se resolvieron "
            "como sigue, y todos son reversibles."
        ),

        Paragraph("El porcentaje del forecast", ESTILO_SUBSECCION),
        texto(
            "Se guarda por producto, con 20 % puesto por defecto en cada producto nuevo, en "
            "lugar de estar fijo en el sistema. Se cambia desde la ficha del producto, en el "
            "campo <b>Forecast (% del MTP)</b>, y la meta se recalcula sola en el momento, "
            "también en las marcas que ya lo ofrecían."
        ),

        Paragraph("Qué muestra la barra", ESTILO_SUBSECCION),
        texto(
            "El relleno es el pronóstico sobre el monto total del producto, que es la "
            "relación del ejemplo recibido (de 7.400, un pronóstico de 500 se ve como "
            "6,8 %). Sobre ese relleno se dibuja una marca fina en la meta, para que el "
            "porcentaje se pueda interpretar. El color cambia solo: color de acento mientras "
            "está por debajo de la meta, verde al alcanzarla y ámbar si el pronóstico supera "
            "el valor del producto."
        ),

        Paragraph("Qué suma el tablero", ESTILO_SUBSECCION),
        texto(
            "Se muestran las dos cifras por separado, para no forzar una interpretación: la "
            "<b>meta del catálogo</b> (la suma del porcentaje acordado de cada producto "
            "activo) y el <b>pronóstico del equipo</b> (la suma de lo anotado por los "
            "vendedores). En el bloque de forecast por prospector se suma el pronóstico de "
            "cada persona. Si lo que se quiere sumar por vendedor es el 20 % de su "
            "pronóstico en lugar del pronóstico completo, es un cambio de una línea."
        ),

        Paragraph("El checklist y la fase de prospección", ESTILO_SUBSECCION),
        texto(
            "El checklist se colocó dentro del paso de prospección, pero no cuenta para "
            "darla por completada: esa fase sigue calculándose sola con nombre, logo, "
            "contacto, cargo y correo. Mezclarlas habría cambiado el significado del "
            "indicador que ya usa el equipo."
        ),

        Paragraph("Límite del pronóstico", ESTILO_SUBSECCION),
        texto(
            "El servidor no acepta un pronóstico mayor que el monto total del producto, "
            "porque haría que la barra pasara del 100 %. La única excepción es un producto "
            "sin monto cargado todavía: ahí se admite cualquier importe, para no bloquear el "
            "trabajo por un dato que aún no ha puesto nadie."
        ),

        Paragraph("Productos ajenos y productos retirados", ESTILO_SUBSECCION),
        texto(
            "Todo el equipo ve el catálogo completo, pero un vendedor solo puede añadir a "
            "sus marcas los productos que tiene asignados o los que están abiertos a todos; "
            "los demás aparecen apagados y el servidor rechaza el intento. Quitar o corregir "
            "un producto que ya estaba puesto sí lo puede hacer cualquiera que edite la "
            "marca, para que reasignar un producto no deje fichas bloqueadas. Un producto "
            "retirado del catálogo deja de ofrecerse, pero sigue apareciendo, marcado como "
            "retirado, en las marcas donde ya se había anotado."
        ),

        Paragraph("Guardado del checklist", ESTILO_SUBSECCION),
        texto(
            "La ficha envía siempre el checklist completo, así que desmarcar un producto y "
            "guardar lo quita de verdad. Una petición que no incluya el checklist deja el "
            "que hubiera intacto, para que ningún cliente que desconozca los productos borre "
            "el trabajo de prospección."
        ),

        Paragraph("A quién se le cuenta el pronóstico", ESTILO_SUBSECCION),
        texto(
            "Al vendedor asignado de la marca, no a quien escribió la cifra. Así, al "
            "reasignar una marca, su pronóstico viaja con ella. Los pronósticos de marcas "
            "sin vendedor aparecen agrupados como «Sin asignar» para que el total cuadre."
        ),

        Paragraph("Campañas", ESTILO_SUBSECCION),
        texto(
            "Cada campaña lleva color (con la paleta del propio sistema) y fechas "
            "opcionales. Una campaña activa fuera de sus fechas deja de contar como vigente "
            "y no se ofrece en la ficha, pero conserva sus marcas. El nombre de la campaña "
            "no se copia dentro de la marca: se lee siempre de la campaña, de forma que "
            "renombrarla actualiza todo."
        ),

        Paragraph("5. Verificación realizada", ESTILO_SECCION),
        lista([
            "<b>54 pruebas automatizadas en verde</b> (121 comprobaciones). Cubren las reglas "
            "de negocio: el cálculo de la meta sobre el monto total, el porcentaje del "
            "pronóstico, los permisos por rol y por asignación de producto, que marcar "
            "productos no completa la fase de prospección, que guardar sin enviar el checklist "
            "no lo borra, la bitácora y el borrado en cascada. Se ejecutan con "
            "<font face=\"Courier\">php artisan test</font> sobre una base de datos en memoria, "
            "sin tocar los datos de trabajo.",
            "<b>Compilación del frontend sin errores</b>, con la comprobación de tipos incluida.",
            "<b>Revisión en el navegador contra los datos reales</b>: catálogo de productos, "
            "checklist dentro de una ficha, filtros del tablero y todas las tarjetas del "
            "resumen. La revisión fue de solo lectura: no se creó, modificó ni borró ningún "
            "dato de la base de trabajo.",
        ]),

        Paragraph("6. Despliegue en el VPS", ESTILO_SECCION),

        Paragraph("Requisitos del servidor", ESTILO_SUBSECCION),
        texto(
            "Ubuntu 22.04 o 24.04 con nginx, PHP 8.2 (fpm, cli, mysql, mbstring, xml, curl, "
            "zip, gd, bcmath, intl), MySQL, Node 22 y Composer. El guion de instalación los "
            "instala si faltan. El sitio, la API y la base de datos viven en la misma máquina."
        ),

        Paragraph("Instalación por primera vez", ESTILO_SUBSECCION),
        lista([
            "Subir el proyecto a <font face=\"Courier\">/var/www/tsports</font>. El guion está "
            "pensado para un <font face=\"Courier\">git clone</font>; como el proyecto todavía "
            "no está en un repositorio, hoy habría que crear uno o copiar la carpeta al "
            "servidor por SFTP o rsync.",
            "Ejecutar <font face=\"Courier\">./deploy/instalar-vps.sh</font>. Instala los "
            "paquetes, crea la base de datos y su usuario, prepara "
            "<font face=\"Courier\">backend/.env</font>, instala dependencias, genera la clave "
            "de la aplicación, crea las tablas, siembra la cuenta de administrador, el "
            "contenido de la web y los siete productos, enlaza la carpeta de imágenes, "
            "construye el frontend, ajusta permisos y configura nginx. Al terminar muestra las "
            "contraseñas generadas.",
            "Activar HTTPS: <font face=\"Courier\">sudo apt install -y certbot "
            "python3-certbot-nginx</font> y "
            "<font face=\"Courier\">sudo certbot --nginx -d DOMINIO -d www.DOMINIO</font>.",
            "Trasladar los datos que ya están cargados en local (8 usuarios, 71 marcas y el "
            "contenido de la web): volcado de la base local e importación en el servidor, o "
            "repetir la importación desde Supabase con el comando "
            "<font face=\"Courier\">tsports:importar-supabase</font>.",
        ], numerada=True),

        Paragraph("Actualizaciones posteriores", ESTILO_SUBSECCION),
        Paragraph("cd /var/www/tsports<br/>./deploy/desplegar.sh", ESTILO_CODIGO),
        texto(
            "Ese guion pone el sitio en mantenimiento, baja los cambios si hay repositorio, "
            "instala dependencias, aplica las migraciones, regenera la caché de configuración, "
            "reconstruye el frontend, ajusta permisos, reinicia PHP y nginx y quita el "
            "mantenimiento. Si la construcción falla, se detiene y el sitio anterior sigue "
            "publicado."
        ),

        Paragraph("Paso propio de esta entrega", ESTILO_SUBSECCION),
        texto(
            "En una instalación nueva los siete productos se crean solos. En un sistema que ya "
            "estuviera instalado antes de esta entrega, después de actualizar hay que ejecutar "
            "una vez:"
        ),
        Paragraph("php artisan db:seed --class=PropiedadesIopSeeder", ESTILO_CODIGO),
        texto(
            "Crea los siete productos en su orden. Se puede ejecutar varias veces sin duplicar "
            "nada. Solo el Comité Olímpico se crea con monto (162.000 USD); el resto se "
            "completan desde el panel."
        ),

        Paragraph("7. Pendientes", ESTILO_SECCION),

        Paragraph("Información que debe cargar el equipo", ESTILO_SUBSECCION),
        lista([
            "Monto total de seis de los siete productos.",
            "Reparto de los productos entre prospectores (hoy los siete están abiertos a todo "
            "el equipo).",
            "Crear las campañas del año.",
            "Asignar vendedor a las 71 marcas.",
            "Sector e inversión en marketing deportivo de las 71 marcas.",
            "Zona de las 8 cuentas de usuario.",
            "Cambiar las 8 contraseñas temporales.",
            "Repasar los 5 textos de la web marcados como importados sin traducir.",
        ]),

        Paragraph("Funcionalidad no incluida", ESTILO_SUBSECCION),
        lista([
            "Filtro por rango de importe estimado en el tablero de marcas.",
            "La bitácora de comentarios en pantallas menores de 1024 píxeles.",
        ]),

        Paragraph("Infraestructura", ESTILO_SUBSECCION),
        lista([
            "El proyecto no está en un repositorio de código (git).",
            "El sistema no está instalado todavía en el VPS.",
        ]),

        Paragraph("8. Estado real de los datos", ESTILO_SECCION),
        tabla(ESTADO_DE_LOS_DATOS, ANCHOS_ESTADO),

        Paragraph("9. Usuarios y contraseñas", ESTILO_SECCION),
        texto(
            "Las ocho cuentas del sistema. Todas conservan la contraseña provisional puesta al "
            "migrar los datos desde Supabase, comprobada el día de este informe."
        ),
        tabla(USUARIOS, ANCHOS_USUARIOS),
        Spacer(1, 8),
        tabla(ROLES, ANCHOS_ROLES),
        Spacer(1, 8),
        texto(
            "Cada persona cambia su contraseña desde <b>Mi perfil</b>. Nadie puede cambiarse su "
            "propio rol ni su propia zona, ni siquiera un administrador: si el único "
            "administrador se rebajara, no quedaría nadie capaz de dar permisos."
        ),
    ]

    return construir(
        "TS-Sports-Informe-Tecnico-2026-08-27.pdf",
        "Informe técnico",
        h,
    )


if __name__ == "__main__":
    for ruta in (informe_ejecutivo(), informe_tecnico()):
        print(f"generado: {ruta}")
