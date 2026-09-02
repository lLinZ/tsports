# Cómo regenerar la guía de uso

El PDF sale de `guia.html` con el Chrome que ya está instalado. No hace
falta ninguna herramienta más.

```bash
"C:/Program Files/Google/Chrome/Application/chrome.exe" \
  --headless --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=15000 \
  --print-to-pdf="../TS-Sports-Guia-de-uso.pdf" \
  "file:///C:/Users/LinZ/Desktop/tsports/informes/guia-de-uso/guia.html"
```

## Por qué las fuentes están aquí dentro

Inter va incrustada desde `fuentes/`, no pedida a Google Fonts. Dos
motivos, los dos aprendidos a base de rehacer el PDF:

1. **Al imprimir no se espera a la red.** Si la fuente llega tarde, la
   página ya se ha impreso con la de reserva.

2. **Google Fonts trocea la fuente por alfabetos.** Su CSS devuelve
   varios `@font-face` con distinto `unicode-range`, y el latino es el
   ÚLTIMO, no el primero. Descargando el primero se obtiene el cirílico:
   Chrome encuentra la "a" en Inter pero no la "á", y cae a Segoe UI en
   cuanto aparece una tilde. El documento acaba con dos tipografías
   mezcladas dentro de la misma palabra.

Por eso hay dos ficheros por peso: `latin` y `latin-ext`.

## Dos trampas más del renderizado

- **Los números de página** se pintan en la caja `@bottom-center` de
  `@page`, y Chrome las dibuja con SU fuente por defecto (Times) aunque
  el `body` diga otra cosa. Hay que declararle la tipografía también ahí.

- **Cursivas y símbolos.** No se carga Inter cursiva, así que `<em>` caía
  a Times; se resuelve marcando el énfasis con peso y color. Y los
  símbolos fuera del latino (✔, →) los sacaba de Segoe UI Symbol: se
  sustituyeron por texto.

Para comprobar que no ha vuelto a colarse ninguna fuente ajena:

```python
import pdfplumber
with pdfplumber.open("TS-Sports-Guia-de-uso.pdf") as pdf:
    ajenas = {c["fontname"] for p in pdf.pages for c in p.chars
              if "Inter" not in c["fontname"]}
    print(ajenas or "todo Inter")
```
