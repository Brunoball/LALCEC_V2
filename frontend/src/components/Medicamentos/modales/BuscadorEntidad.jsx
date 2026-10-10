import React, { useEffect, useId, useRef, useState } from 'react';

/** Buscador en un solo campo: buscar, desplegar y seleccionar sin un segundo <select>. */
export default function BuscadorEntidad({
  label, value, selectedLabel = '', onSelect, buscar,
  manual = false, required = false, disabled = false, wide = false,
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const [texto, setTexto] = useState(selectedLabel);
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [activo, setActivo] = useState(-1);
  const externo = texto.trim();
  const mostrarManual = manual && externo.length >= 2;
  const totalOpciones = opciones.length + (mostrarManual ? 1 : 0);

  useEffect(() => {
    if (inputRef.current) inputRef.current.setCustomValidity(
      required && !value ? 'Seleccioná una opción de la lista.' : ''
    );
  }, [required, value]);

  useEffect(() => {
    if (!abierto) return undefined;
    let vigente = true;
    setCargando(true);
    setError('');
    const temporizador = setTimeout(async () => {
      try {
        const encontrados = await buscar(texto.trim().slice(0, 70));
        if (vigente) {
          setOpciones(Array.isArray(encontrados) ? encontrados : []);
          setActivo(-1);
        }
      } catch (e) {
        if (vigente) {
          setOpciones([]);
          setError(e.message || 'No se pudieron cargar las opciones.');
        }
      } finally {
        if (vigente) setCargando(false);
      }
    }, texto.trim() ? 250 : 0);
    return () => { vigente = false; clearTimeout(temporizador); };
  }, [abierto, texto, buscar]);

  const elegir = (opcion) => {
    onSelect(opcion);
    setTexto(opcion?.nombre || '');
    setAbierto(false);
    setActivo(-1);
  };
  const elegirManual = () => {
    if (mostrarManual) elegir({ clave: `EXTERNO:${externo}`, nombre: externo, tipo: 'EXTERNO' });
  };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setAbierto(true);
      setActivo(i => totalOpciones === 0 ? -1 : (event.key === 'ArrowDown'
        ? Math.min(i + 1, totalOpciones - 1) : Math.max(i - 1, 0)));
    } else if (event.key === 'Enter' && abierto) {
      event.preventDefault();
      if (activo >= 0 && activo < opciones.length) elegir(opciones[activo]);
      else if (mostrarManual && activo === opciones.length) elegirManual();
      else if (opciones.length === 1) elegir(opciones[0]);
      else if (!opciones.length && mostrarManual) elegirManual();
    }
  };

  return <div className={`entity-field med-buscador${wide ? ' entity-field--wide' : ''}`}
    onBlur={event => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      setAbierto(false);
      // Una búsqueda escrita pero no elegida no reemplaza la selección previa.
      setTexto(selectedLabel || '');
    }}>
    <div className={`med-buscador__wrapper entity-floating-field ${texto ? 'is-active' : ''}`}>
      <span>{label}{required ? ' *' : ''}</span>
      <input ref={inputRef} type="text" role="combobox" aria-autocomplete="list"
        aria-expanded={abierto} aria-controls={listId}
        aria-activedescendant={activo >= 0 && abierto ? `${listId}-option-${activo}` : undefined}
        placeholder=" " aria-label={label} autoComplete="off" maxLength={180} value={texto} disabled={disabled} required={required}
        onFocus={() => setAbierto(true)}
        onClick={() => setAbierto(true)}
        onKeyDown={onKeyDown}
        onChange={event => {
          setTexto(event.target.value);
          setOpciones([]);
          setAbierto(true);
          setActivo(-1);
          if (value) onSelect(null); // Nunca enviar una selección antigua tras modificar la búsqueda.
        }} />
      {abierto && <div id={listId} className="med-buscador__resultados" role="listbox">
        {cargando ? <div className="med-buscador__mensaje">Buscando...</div> : null}
        {error ? <div className="med-buscador__mensaje med-buscador__error">{error}</div> : null}
        {!cargando && !opciones.length && !error ?
          <div className="med-buscador__mensaje">No se encontraron registros{manual ? '. Podés agregarlo de forma manual.' : '.'}</div> : null}
        {!cargando && opciones.map((item, index) => <button type="button" role="option"
          aria-selected={index === activo} id={`${listId}-option-${index}`}
          className={`med-buscador__opcion${index === activo ? ' is-active' : ''}`}
          key={item.clave} onMouseDown={event => event.preventDefault()}
          onClick={() => elegir(item)}>
          <span className="med-buscador__nombre">{item.nombre}</span>
          <small>{item.tipo}{item.detalle ? ` · ${item.detalle}` : ''}</small>
        </button>)}
        {mostrarManual && !cargando ? <button type="button" role="option"
          aria-selected={activo === opciones.length}
          id={`${listId}-option-${opciones.length}`}
          className={`med-buscador__opcion med-buscador__manual${activo === opciones.length ? ' is-active' : ''}`}
          onMouseDown={event => event.preventDefault()} onClick={elegirManual}>
          <span className="med-buscador__nombre">+ USAR COMO DONANTE / PROVEEDOR EXTERNO</span>
          <small>{externo}</small>
        </button> : null}
      </div>}
    </div>
    {manual && <small className="med-buscador__ayuda">Buscá en Contable o Socios, o escribí un nombre y elegí la opción de proveedor externo.</small>}
  </div>;
}
