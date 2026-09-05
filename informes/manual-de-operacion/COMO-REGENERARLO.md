# Cómo regenerar el manual de operación

El PDF sale de `manual.html` con el Chrome que ya está instalado.

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=15000 \
  --print-to-pdf="../TS-Sports-Manual-de-operacion.pdf" \
  "file:///C:/Users/LinZ/Desktop/tsports/informes/manual-de-operacion/manual.html"
```

Y después, siempre:

```bash
python ~/.claude/skills/pdf-documento/comprobar-fuentes.py ../TS-Sports-Manual-de-operacion.pdf
```

## De dónde sale el diseño

De la skill `pdf-documento`, en `~/.claude/skills/pdf-documento/`. Ahí
está la plantilla con el CSS, las fuentes y las trampas del renderizado
explicadas. Este manual es esa plantilla con el contenido puesto.

Si hay que arreglar algo del **aspecto** —un titular que se queda solo
al pie, un comando que se parte mal—, se arregla en la plantilla y se
trae aquí, no al revés. Así el siguiente documento nace ya corregido.

## Qué hay que revisar cuando el sistema cambie

El manual afirma cosas concretas sobre la instalación. Si alguna deja de
ser cierta, el documento pasa de ayudar a estorbar:

- **La dirección del servidor y la ruta del proyecto**, en el apartado 1.
- **Los puertos de local**, 8000 y 5173, en el apartado 2.
- **Los pasos del guion de despliegue**, en el apartado 3: la tabla
  reproduce lo que imprime `deploy/desplegar.sh`. Si se le añade o quita
  un paso, la tabla se queda mintiendo.
- **El aviso de las siete cuentas** del apartado 5. En cuanto se cambien
  esas contraseñas, hay que quitarlo: un aviso rojo que ya no aplica
  entrena a la gente a ignorar los avisos rojos.
