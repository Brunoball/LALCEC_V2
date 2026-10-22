import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faBan, faRotateLeft, faClockRotateLeft, faInbox, faPills, faBoxesStacked } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import ModalEliminarGlobal from '../../Global/Modales/ModalEliminarGlobal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import BuscadorEntidad from '../modales/BuscadorEntidad';
import AlertasVencimientos from '../alertas/AlertasVencimientos';
import { fecha, fechaHoy, dinero, num, MED_TIPOS, estadoVencimiento, vigenteParaEntrega } from '../utils/medicamentosUtils';
import '../Medicamentos.css';

const newMedicine = () => ({ droga: '', nombre_comercial: '', laboratorio: '', presentacion: 'COMPRIMIDOS', dosis: '', unidad_stock: 'UNIDAD', fecha_vencimiento: '', observaciones: '' });
const newMovement = () => ({ direccion: 'INGRESO', origen: '', fecha_ingreso: fechaHoy(), fecha_vencimiento: '', cantidad: '1', procedencia: '', costo_unitario: '', id_medio_pago: '', tipo: 'ENTREGA_DONACION', importe: '', detalle: '' });
// Todos los orígenes salen de la tabla medicamentos_opciones (Configuración >
// Medicamentos > Orígenes de ingreso). Los del sistema traen codigo_sistema, que
// es el valor que se envía y guarda (define su regla: COMPRA genera egreso, etc.);
// los adicionales se identifican por su nombre.
const valorOrigen = o => o.codigo_sistema || o.nombre;
// Stock inicial solo se ofrece en el alta; Ajuste positivo solo en Editar > Stock.
const EXCLUIDO_EN = { ALTA: 'AJUSTE', STOCK: 'INICIAL' };
const origenesDisponibles = (catalogos, contexto) => catalogos
  .filter(o => o.tipo === 'ORIGEN_INGRESO' && Number(o.activo) === 1 && o.codigo_sistema !== EXCLUIDO_EN[contexto])
  .map(o => op(valorOrigen(o), o.nombre));
const origenInicial = (catalogos, contexto) => {
  const lista = origenesDisponibles(catalogos, contexto);
  return (lista.find(o => o.value === 'DONACION') || lista[0])?.value || '';
};
const nombreOrigen = (catalogos, valor) => {
  if (!valor) return '—';
  const opcion = catalogos.find(o => o.tipo === 'ORIGEN_INGRESO' && (o.codigo_sistema === valor || (!o.codigo_sistema && o.nombre === valor)));
  return opcion?.nombre || valor;
};
const OPCION_RAPIDA = {
  PRESENTACION: { titulo: 'Agregar presentación', max: 100 },
  UNIDAD_STOCK: { titulo: 'Agregar unidad de stock', max: 40 },
  ORIGEN_INGRESO: { titulo: 'Agregar origen de ingreso', max: 60 },
};
const buscarProcedencias = async buscar => (await api.procedencias(buscar)).registros || [];
const textoVencimiento = fechaVence => {
  if (!fechaVence) return 'Sin fecha';
  if (fechaVence === fechaHoy()) return 'Vence hoy';
  const estado = estadoVencimiento(fechaVence);
  return estado === 'is-danger' ? 'Vencido' : estado === 'is-warning' ? 'Próximo a vencer' : 'Vigente';
};

function ActionButton({ icon, label, onClick, danger = false, disabled = false }) {
  return <button type="button" className={`med-mini med-icon-action${danger ? ' med-mini--danger' : ''}`}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}><FontAwesomeIcon icon={icon} /><span className="med-action-label">{label}</span></button>;
}

export default function Stock() {
  const loader = useCallback(() => api.catalogo(), []);
  const { registros, loading, error, cargar } = useMedicamentos(loader);
  const [medios, setMedios] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [quickOption, setQuickOption] = useState(null);
  const [quickName, setQuickName] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState('ACTIVOS');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState('');
  const [tab, setTab] = useState('DATOS');
  const [confirmation, setConfirmation] = useState('');
  const [selected, setSelected] = useState(null);
  const [med, setMed] = useState(newMedicine);
  const [movement, setMovement] = useState(newMovement);
  const [stockInicial, setStockInicial] = useState('0');
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [anular, setAnular] = useState(null);
  const [reintegroMedio, setReintegroMedio] = useState('');
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [confirmarDevolucion, setConfirmarDevolucion] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alertRevision, setAlertRevision] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const requestRef = useRef(0);
  const guardandoRef = useRef(false);
  const write = canWrite();
  const notify = (type, message) => setFeedback({ type, message });

  useEffect(() => {
    let active = true;
    api.medios().then(r => { if (active) setMedios(r.registros || []); })
      .catch(e => { if (active) setFeedback({ type: 'error', message: e.message }); });
    return () => { active = false; };
  }, []);

  const cargarOpciones = useCallback(async () => {
    const resultado = await api.opciones();
    setCatalogos(resultado.registros || []);
    return resultado.registros || [];
  }, []);

  useEffect(() => {
    let active = true;
    api.opciones().then(r => { if (active) setCatalogos(r.registros || []); })
      .catch(e => { if (active) notify('error', e.message); });
    return () => { active = false; };
  }, []);

  const openMed = (medicine = null) => {
    ++requestRef.current;
    setSelected(medicine);
    const inicial = newMedicine();
    for (const [tipo, campo] of [['PRESENTACION','presentacion'], ['UNIDAD_STOCK','unidad_stock']]) {
      const existentes = catalogos.filter(item => item.tipo === tipo && Number(item.activo) === 1);
      if (existentes.length && !existentes.some(item => item.nombre === inicial[campo])) inicial[campo] = existentes[0].nombre;
    }
    // fecha_vencimiento_original permite al backend detectar si otra operación
    // cambió la fecha única mientras este formulario estaba abierto.
    setMed(medicine ? { ...inicial, ...Object.fromEntries(Object.keys(inicial).map(k => [k, medicine[k] ?? ''])),
      id_medicamento: medicine.id_medicamento, fecha_vencimiento_original: medicine.fecha_vencimiento || '' } : inicial);
    setMovement({ ...newMovement(), fecha_vencimiento: medicine?.fecha_vencimiento || '',
      origen: origenInicial(catalogos, medicine ? 'STOCK' : 'ALTA'),
      tipo: medicine && !vigenteParaEntrega(medicine.fecha_vencimiento) ? 'BAJA_DESCARTE' : 'ENTREGA_DONACION' });
    setStockInicial('0');
    setTab('DATOS');
    setModal('editar');
  };
  const fetchHistory = async (medicine, pagina) => {
    const request = ++requestRef.current;
    setDetailLoading(true);
    try {
      const data = await api.historial({ id_medicamento: medicine.id_medicamento, pagina });
      if (request !== requestRef.current) return;
      setHistory(data.registros || []);
      setHistoryPage(num(data.pagina) || pagina);
      setHistoryTotal(num(data.total));
    } catch (e) { if (request === requestRef.current) notify('error', e.message || 'No se pudo cargar el historial.'); }
    finally { if (request === requestRef.current) setDetailLoading(false); }
  };
  const openHistory = medicine => {
    setSelected(medicine);setHistory([]);setHistoryTotal(0);setHistoryPage(1);setModal('historial');fetchHistory(medicine, 1);
  };
  const close = () => { if (saving) return; ++requestRef.current;setModal('');setSelected(null); };
  const closeConfirmation = () => { setConfirmation('');setAnular(null);if (!modal) setSelected(null); };
  const refresh = async () => { await cargar({ silencioso: true }); setAlertRevision(v => v+1); };
  const run = async (event) => {
    event.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;setSaving(true);
    try {
      let resultado;
      if (tab === 'DATOS') {
        const inicial = !med.id_medicamento && Number(stockInicial) > 0
          ? { ...movement, fecha_vencimiento: med.fecha_vencimiento, cantidad: stockInicial } : undefined;
        resultado = await api.guardar(inicial ? { ...med, ingreso_inicial: inicial } : med);
      } else if (movement.direccion === 'INGRESO') {
        resultado = await api.ingresar({ id_medicamento: selected.id_medicamento, origen: movement.origen, fecha_ingreso: movement.fecha_ingreso, fecha_vencimiento: movement.fecha_vencimiento,
          cantidad: movement.cantidad, procedencia: movement.procedencia, costo_unitario: movement.costo_unitario,
          id_medio_pago: movement.id_medio_pago, observaciones: movement.detalle });
      } else {
        resultado = await api.salida({ id_medicamento: selected.id_medicamento, tipo: movement.tipo, cantidad: movement.cantidad,
          importe: movement.importe, id_medio_pago: movement.id_medio_pago, detalle: movement.detalle });
      }
      if (resultado?.ok === false) throw new Error(resultado.mensaje || 'No se pudo guardar.');
      ++requestRef.current;setModal('');setSelected(null);
      notify('success', tab === 'DATOS' ? 'Medicamento guardado correctamente.' : 'Stock actualizado correctamente.');
      await refresh();
    } catch (e) { notify('error', e.message || 'No se pudo guardar.'); }
    finally { guardandoRef.current = false;setSaving(false); }
  };
  const confirmarOperacion = async (handler, payload) => {
    if (guardandoRef.current) return { ok: false, mensaje: 'Ya se está procesando una operación.' };
    guardandoRef.current = true;setSaving(true);
    try {
      const resultado = await handler(payload);
      // Evitar reintento de escritura si falla la actualización de la pantalla.
      void refresh().catch(e => notify('error', `Se registró la operación pero falló la actualización: ${e.message}`));
      if (modal === 'historial' && selected) void fetchHistory(selected, historyPage);
      return resultado;
    } finally { guardandoRef.current = false;setSaving(false); }
  };
  const active = useMemo(() => registros.filter(m => num(m.activo) === 1), [registros]);
  const bajas = useMemo(() => registros.filter(m => num(m.activo) !== 1), [registros]);
  const filtered = useMemo(() => (section === 'ACTIVOS' ? active : bajas).filter(m =>
    [m.nombre_comercial, m.droga, m.laboratorio, m.presentacion, m.dosis, m.motivo_baja].some(x => String(x || '').toUpperCase().includes(query.trim().toUpperCase()))
  ), [active, bajas, section, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const shown = filtered.slice((Math.min(page, pages) - 1) * 20, Math.min(page, pages) * 20);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const updateMed = (key, value) => setMed(v => ({ ...v, [key]: value }));
  const opcionesSelector = (tipo, actual) => {
    const activas = catalogos.filter(o => o.tipo === tipo && Number(o.activo) === 1).map(o => o.nombre);
    return [...new Set([actual, ...activas].filter(Boolean))].map(v => op(v, v));
  };
  // Solo opciones activas de la base; si el valor elegido ya no está disponible,
  // el backend lo rechaza con un mensaje claro.
  const opcionesOrigen = contexto => origenesDisponibles(catalogos, contexto);
  // Si el catálogo llega (o cambia) con el formulario abierto, el origen elegido
  // debe ser siempre una opción real del selector, nunca un valor vacío.
  const contextoOrigen = med.id_medicamento ? 'STOCK' : 'ALTA';
  useEffect(() => {
    if (modal !== 'editar') return;
    const valores = origenesDisponibles(catalogos, contextoOrigen).map(o => o.value);
    setMovement(v => (valores.includes(v.origen) ? v : { ...v, origen: origenInicial(catalogos, contextoOrigen) }));
  }, [catalogos, modal, contextoOrigen]);
  const nuevaOpcion = tipo => { setQuickOption(tipo); setQuickName(''); setQuickError(''); };
  const guardarOpcionRapida = async event => {
    event.preventDefault();
    if (quickSaving || !quickOption) return;
    setQuickSaving(true); setQuickError('');
    try {
      const result = await api.guardarOpcion({ tipo: quickOption, nombre: quickName.trim().toLocaleUpperCase('es-AR') });
      const lista = await cargarOpciones();
      const nueva = lista.find(item => Number(item.id_opcion) === Number(result.id_opcion));
      if (!nueva) throw new Error('La opción se guardó, pero no se pudo actualizar el selector.');
      if (quickOption === 'ORIGEN_INGRESO') updateMovement('origen', nueva.nombre);
      else updateMed(quickOption === 'PRESENTACION' ? 'presentacion' : 'unidad_stock', nueva.nombre);
      setQuickOption(null); setQuickName('');
      notify('success', 'Opción agregada y seleccionada.');
    } catch (e) { setQuickError(e.message || 'No se pudo agregar la opción.'); }
    finally { setQuickSaving(false); }
  };
  const updateMovement = (key, value) => setMovement(v => ({ ...v, [key]: value }));
  const payments = [op('', 'Seleccionar medio'), ...medios.map(m => op(m.id_medio_pago, m.nombre))];
  const entrada = movement.direccion === 'INGRESO';
  // Venta y entrega exigen vencimiento vigente (misma regla que el backend);
  // ajuste negativo y descarte siempre están disponibles.
  const entregable = vigenteParaEntrega(selected?.fecha_vencimiento);
  const tiposSalida = entregable
    ? [op('ENTREGA_DONACION','Entrega sin cargo'),op('SALIDA_VENTA','Venta'),op('AJUSTE_SALIDA','Ajuste negativo'),op('BAJA_DESCARTE','Descarte')]
    : [op('AJUSTE_SALIDA','Ajuste negativo'),op('BAJA_DESCARTE','Descarte')];
  const fieldsMovement = <Campos>
    <Campo label="Cantidad" type="number" min="1" step="1" required value={movement.cantidad} onChange={v => updateMovement('cantidad', v)} />
    {entrada ? <>
      <Campo label="Motivo del ingreso" required options={opcionesOrigen('STOCK')}
        onAddOption={write ? () => nuevaOpcion('ORIGEN_INGRESO') : undefined} value={movement.origen} onChange={v => updateMovement('origen',v)} />
      <Campo label="Fecha de ingreso" required type="date" max={fechaHoy()} value={movement.fecha_ingreso} onChange={v => updateMovement('fecha_ingreso',v)} />
      <Campo label="Vencimiento del medicamento" required type="date" value={movement.fecha_vencimiento} onChange={v => updateMovement('fecha_vencimiento',v)} />
      <p className="med-inline-note entity-field--wide">Una sola fecha para todo el stock: si la cambiás, también aplica a las unidades que ya estaban cargadas.</p>
      <BuscadorEntidad label="Donante / proveedor (opcional)" manual maxLength={160} value={movement.procedencia} selectedLabel={movement.procedencia}
        buscar={buscarProcedencias} onSelect={item => updateMovement('procedencia', item?.nombre || '')} />
      {movement.origen === 'COMPRA' ? <>
        <Campo label="Costo por unidad ($)" type="number" required min="0.01" step="0.01" value={movement.costo_unitario} onChange={v => updateMovement('costo_unitario',v)} />
        <Campo label="Medio de pago de la compra" required value={movement.id_medio_pago} options={payments} onChange={v => updateMovement('id_medio_pago',v)} />
        <div className="entity-field entity-field--wide med-inline-note">La compra registrará un egreso de {dinero(num(movement.cantidad) * num(movement.costo_unitario))} en Contabilidad.</div>
      </> : null}
    </> : <>
      <Campo label="Motivo de salida" required value={movement.tipo} options={tiposSalida}
        onChange={v => updateMovement('tipo',v)} />
      {!entregable ? <p className="med-inline-note entity-field--wide" role="status">
        {selected?.fecha_vencimiento ? `Vencido el ${fecha(selected.fecha_vencimiento)}` : 'Sin fecha de vencimiento'}: solo se puede descartar o ajustar. Para vender, entregar o prestar, corregí la fecha en la pestaña Datos.
      </p> : null}
      {movement.tipo === 'SALIDA_VENTA' ? <>
        <Campo label="Importe total de venta ($)" required type="number" min="0.01" step="0.01" value={movement.importe} onChange={v => updateMovement('importe',v)} />
        <Campo label="Medio de pago" required value={movement.id_medio_pago} options={payments} onChange={v => updateMovement('id_medio_pago',v)} />
      </> : null}
    </>}
    <Campo label="Observaciones / motivo" wide textarea maxLength={500} value={movement.detalle} onChange={v => updateMovement('detalle',v)} />
  </Campos>;

  return <>
    <ModulePage title="Medicamentos · Stock" tabsInTitle filters={[
      { type: 'tabs', label: 'Estado', value: section, onChange: v => { setSection(v);setPage(1); }, options: [
        { value: 'ACTIVOS', label: 'Activos', count: active.length },{ value: 'BAJAS', label: 'Bajas', count: bajas.length },
      ] },
      { type: 'search', label: 'Búsqueda', value: query, onChange: v => { setQuery(v);setPage(1); }, placeholder: ' ' },
    ]} primaryActionLabel="Nuevo medicamento" onPrimaryAction={() => openMed()} canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Stock de medicamentos" loading={loading} empty={!loading && !error && !filtered.length}
        className={`med-table ${filtered.length ? 'has-bottom-pagination' : ''}`} gridClassName={section === 'ACTIVOS' ? 'med-grid--stock-simple med-grid--stock-expiry' : 'med-grid--stock-simple'}
        columns={section === 'ACTIVOS' ? ['Medicamento / droga','Laboratorio','Presentación / dosis','Stock actual','Vencimiento','Último ingreso / origen',{ label: 'Acciones', align: 'center' }]
          : ['Medicamento / droga','Laboratorio','Presentación / dosis','Stock actual','Motivo de baja',{ label: 'Acciones', align: 'center' }]}>
        {shown.map(m => <div key={m.id_medicamento} role="row" className={`mov-gridTable mov-gridTable--row global-divTable__row med-grid--stock-simple ${section === 'ACTIVOS' ? `med-grid--stock-expiry med-expiry-row ${estadoVencimiento(m.fecha_vencimiento)}` : ''}`}>
          <div role="cell" className="mov-gridCell entity-main-cell"><strong>{m.nombre_comercial}</strong><span className="med-cell-secondary">{m.droga}</span></div>
          <div role="cell" className="mov-gridCell">{m.laboratorio || '—'}</div>
          <div role="cell" className="mov-gridCell entity-main-cell"><span>{m.presentacion}</span><span className="med-cell-secondary">Dosis: {m.dosis}</span></div>
          <div role="cell" className="mov-gridCell entity-main-cell"><strong>{m.stock_actual}</strong><span className="med-cell-secondary">{m.unidad_stock}</span></div>
          {section === 'ACTIVOS' ? <div role="cell" className="mov-gridCell entity-main-cell med-expiry-cell"><strong className="med-expiry-date">{fecha(m.fecha_vencimiento)}</strong><span className="med-cell-secondary">{textoVencimiento(m.fecha_vencimiento)}</span></div> : null}
          {section === 'ACTIVOS' ? <div role="cell" className="mov-gridCell entity-main-cell">{fecha(m.ultimo_ingreso)}<span className="med-cell-secondary">{nombreOrigen(catalogos, m.ultimo_origen)}</span></div>
            : <div role="cell" className="mov-gridCell entity-main-cell med-reason-cell">{m.motivo_baja || '—'}<span className="med-cell-secondary">{fecha(m.fecha_baja)}</span></div>}
          <div role="cell" className="mov-gridCell med-actions">
            <ActionButton icon={faClockRotateLeft} label="Historial" onClick={() => openHistory(m)} disabled={saving} />
            {write ? <>
              <ActionButton icon={faPen} label="Editar" onClick={() => openMed(m)} disabled={saving} />
              <ActionButton icon={num(m.activo) ? faBan : faRotateLeft} label={num(m.activo) ? 'Dar de baja' : 'Reactivar'} danger={num(m.activo)===1}
                onClick={() => { setSelected(m);setConfirmation('estado'); }} disabled={saving} />
            </> : null}
          </div>
        </div>)}
        {!loading && !error && !filtered.length ? <div className="module-empty"><FontAwesomeIcon icon={faInbox} /><strong>Sin medicamentos para mostrar</strong><span>No hay registros que coincidan.</span></div> : null}
      </GlobalDivTable>
      <div className="med-stock-footer">
        {section === 'ACTIVOS' ? <div className="med-expiry-legend"><strong>Vencimientos:</strong><span><i className="is-danger"/> Vencido</span><span><i className="is-warning"/> Vence hoy o en 30 días o menos</span><span><i className="is-safe"/> Más de 30 días</span><span><i className="is-neutral"/> Sin fecha</span></div> : null}
        <GlobalPagination page={page} onPageChange={setPage} total={filtered.length} loading={loading} label="medicamentos" />
      </div>
    </ModulePage>

    <CrudModal modalClassName={`med-modal ${med.id_medicamento ? 'med-stock-edit-modal' : ''}`} open={modal==='editar'} wide closeOnBackdrop={false} saving={saving}
      title={med.id_medicamento ? `Editar medicamento · ${selected?.nombre_comercial || ''}` : 'Nuevo medicamento'}
      subtitle={med.id_medicamento ? 'Los datos y los movimientos de stock se gestionan desde Editar.' : 'Completá los datos. El stock inicial es opcional.'}
      onClose={close} submitLabel={tab==='DATOS' ? 'Guardar medicamento' : 'Registrar movimiento'}
      onSubmit={run} submitDisabled={tab === 'STOCK' && (!Number.isInteger(Number(movement.cantidad)) || num(movement.cantidad) < 1 || (!entrada && num(movement.cantidad) > num(selected?.stock_actual)))}>
      <div className={med.id_medicamento ? 'med-tabbed-form' : undefined}>
      {med.id_medicamento ? <div className="entity-form-tabs med-simple-tabs" role="tablist" aria-label="Editar medicamento">
        <button type="button" className={`entity-form-tab ${tab==='DATOS'?'is-active':''}`} role="tab" aria-selected={tab==='DATOS'} disabled={saving} onClick={() => setTab('DATOS')}><FontAwesomeIcon icon={faPills} /> Datos</button>
        <button type="button" className={`entity-form-tab ${tab==='STOCK'?'is-active':''}`} role="tab" aria-selected={tab==='STOCK'} disabled={saving || num(selected?.activo) !== 1} onClick={() => setTab('STOCK')}><FontAwesomeIcon icon={faBoxesStacked} /> Stock</button>
      </div> : null}
      <div className={med.id_medicamento ? 'med-tab-panel' : undefined}>
      {tab === 'DATOS' ? <>
        <Campos>
          <Campo label="Nombre comercial" required value={med.nombre_comercial} onChange={v => updateMed('nombre_comercial',v)} />
          <Campo label="Droga" required disabled={Boolean(med.id_medicamento && num(selected?.tiene_movimientos) === 1)} value={med.droga} onChange={v => updateMed('droga',v)} />
          <Campo label="Laboratorio" value={med.laboratorio} onChange={v => updateMed('laboratorio',v)} />
          <Campo label="Presentación" required disabled={Boolean(med.id_medicamento && num(selected?.tiene_movimientos) === 1)} options={opcionesSelector('PRESENTACION', med.presentacion)} onAddOption={write ? () => nuevaOpcion('PRESENTACION') : undefined}
            value={med.presentacion} onChange={v => updateMed('presentacion',v)} />
          <Campo label="Dosis" required disabled={Boolean(med.id_medicamento && num(selected?.tiene_movimientos) === 1)} value={med.dosis} onChange={v => updateMed('dosis',v)} />
          <Campo label="Unidad de stock" required disabled={Boolean(med.id_medicamento && num(selected?.tiene_movimientos) === 1)} value={med.unidad_stock} options={opcionesSelector('UNIDAD_STOCK', med.unidad_stock)} onAddOption={write ? () => nuevaOpcion('UNIDAD_STOCK') : undefined} onChange={v => updateMed('unidad_stock',v)} />
          <Campo label="Fecha de vencimiento" type="date" required={Boolean(num(med.id_medicamento ? selected?.stock_actual : stockInicial) > 0)} value={med.fecha_vencimiento} onChange={v => { updateMed('fecha_vencimiento',v); if(!med.id_medicamento) updateMovement('fecha_vencimiento',v); }} />
          <Campo label="Observaciones del medicamento" wide textarea maxLength={3000} value={med.observaciones} onChange={v => updateMed('observaciones',v)} />
          {!med.id_medicamento ? <>
            <Campo label="Stock inicial (opcional)" type="number" min="0" step="1" value={stockInicial} onChange={setStockInicial} />
            {num(stockInicial)>0 ? <>
              <Campo label="Origen" options={opcionesOrigen('ALTA')}
                onAddOption={write ? () => nuevaOpcion('ORIGEN_INGRESO') : undefined} value={movement.origen} onChange={v => updateMovement('origen',v)} />
              <Campo label="Fecha de ingreso" required type="date" max={fechaHoy()} value={movement.fecha_ingreso} onChange={v => updateMovement('fecha_ingreso',v)} />
              <BuscadorEntidad label="Donante / proveedor (opcional)" manual maxLength={160} value={movement.procedencia} selectedLabel={movement.procedencia}
                buscar={buscarProcedencias} onSelect={item => updateMovement('procedencia', item?.nombre || '')} />
              {movement.origen === 'COMPRA' ? <>
                <Campo label="Costo unitario ($)" required type="number" min="0.01" step="0.01" value={movement.costo_unitario} onChange={v=>updateMovement('costo_unitario',v)} />
                <Campo label="Medio de pago" required options={payments} value={movement.id_medio_pago} onChange={v=>updateMovement('id_medio_pago',v)} />
              </> : null}
            </> : null}
          </> : null}
        </Campos>
        {med.id_medicamento ? <p className="med-inline-note">Si el medicamento tiene movimientos registrados, no se puede cambiar su presentación, dosis, droga ni unidad de stock. Podés actualizar el nombre, laboratorio y observaciones.</p> : null}
      </> : <>
        <p className="med-inline-note">Stock disponible: <strong>{selected?.stock_actual} {selected?.unidad_stock}</strong>. Vencimiento actual: <strong>{fecha(selected?.fecha_vencimiento)}</strong>. No se usan lotes; hay una única fecha de vencimiento por medicamento.</p>
        <div className="med-direction-switch">
          <button type="button" className={`med-mini ${entrada ? 'is-active' : ''}`} onClick={() => updateMovement('direccion','INGRESO')} disabled={saving}>Agregar stock</button>
          <button type="button" className={`med-mini ${!entrada ? 'is-active' : ''}`} onClick={() => updateMovement('direccion','SALIDA')} disabled={saving}>Restar stock</button>
        </div>
        {fieldsMovement}
        {!entrada && num(movement.cantidad)>num(selected?.stock_actual) ? <p className="med-inline-danger">No hay stock suficiente.</p> : null}
      </>}
      </div>
      </div>
    </CrudModal>

    <CrudModal open={Boolean(quickOption)} modalClassName="med-quick-option-modal" title={OPCION_RAPIDA[quickOption]?.titulo || 'Agregar opción'}
      subtitle="La nueva opción estará disponible también para los demás medicamentos." saving={quickSaving}
      onClose={() => { if (!quickSaving) setQuickOption(null); }} onSubmit={guardarOpcionRapida} submitLabel="Agregar" closeOnBackdrop={false}>
      <Campos><Campo label="Nombre de la opción" required maxLength={OPCION_RAPIDA[quickOption]?.max} value={quickName} onChange={v => setQuickName(v.toLocaleUpperCase('es-AR'))} /></Campos>
      {quickError ? <p className="med-inline-danger" role="alert">{quickError}</p> : null}
    </CrudModal>

    <CrudModal modalClassName="med-modal med-history-modal" open={modal==='historial'} wide hideSubmit closeOnBackdrop={false} loading={detailLoading}
      title={`Historial · ${selected?.nombre_comercial || ''}`} subtitle="Movimientos de stock del medicamento"
      footerStart={<GlobalPagination page={historyPage} total={historyTotal} perPage={50} onPageChange={p=>fetchHistory(selected,p)} loading={detailLoading} label="movimientos" />} onClose={close}>
      {history.length ? <div className="med-history-list">{history.map(h => <div className="med-history-row" key={h.id_movimiento}>
        <div className="med-history-details"><strong>{MED_TIPOS[h.tipo] || h.tipo}{h.tipo === 'INGRESO_OTRO' && h.origen ? ` · ${h.origen}` : ''}</strong>
          <span>{String(h.fecha_movimiento || '').slice(0,16)}{h.procedencia ? ` · ${h.procedencia}` : ''}{h.costo_unitario ? ` · ${dinero(h.costo_unitario)} por unidad` : ''}</span>
          {h.detalle ? <span>{h.detalle}</span> : null}
          {num(h.anulada)===1 ? <span>Operación anulada con contramovimiento.</span> : null}
        </div>
        <div className="med-history-quantity"><strong>{h.cantidad} unidades</strong><small>Variación: {num(h.variacion_disponible)>0?'+':''}{h.variacion_disponible}</small>
          {write && ['INGRESO_COMPRA','SALIDA_VENTA'].includes(h.tipo) ? <button type="button" className="med-anular-link"
            title={h.motivo_no_anulable === undefined ? 'Actualizá el backend para comprobar si la anulación es posible.' : (h.motivo_no_anulable || 'Anular operación')}
            onClick={()=>{
              if (h.motivo_no_anulable !== null) return;
              setAnular(h);setReintegroMedio('');setMotivoAnulacion('');setConfirmarDevolucion(false);setConfirmation('anular');
            }} disabled={saving || h.motivo_no_anulable !== null}>Anular operación</button> : null}
        </div>
      </div>)}</div> : <div className="med-empty"><FontAwesomeIcon icon={faInbox} /><span>No hay movimientos registrados.</span></div>}
    </CrudModal>

    <ModalEliminarGlobal modalClassName="med-stock-status-modal" open={confirmation==='estado'} operacion={num(selected?.activo)===1?'baja':'alta'} row={selected}
      title={num(selected?.activo)===1?'Dar de baja medicamento':'Reactivar medicamento'}
      message={num(selected?.activo)===1?'Este medicamento no podrá utilizarse en nuevos movimientos ni préstamos hasta reactivarlo.':'El medicamento volverá a estar disponible.'}
      warning={num(selected?.activo)===1 && num(selected?.stock_actual)>0
        ? `Tiene ${selected?.stock_actual} ${selected?.unidad_stock || ''} en stock. Antes de darlo de baja registrá el descarte o ajuste en Editar > Stock > Restar stock. Tampoco puede tener unidades prestadas sin devolver.`
        : undefined}
      confirmDisabled={num(selected?.activo)===1 && num(selected?.stock_actual)>0}
      details={selected ? [{label:'Medicamento',value:selected.nombre_comercial},{label:'Stock actual',value:selected.stock_actual}] : []}
      showReason={num(selected?.activo)===1} reasonRequired={num(selected?.activo)===1} reasonLabel="Motivo de baja" reasonPlaceholder=" " reasonMaxLength={500}
      confirmLabel={num(selected?.activo)===1?'Dar de baja':'Reactivar'} loading={saving}
      onClose={closeConfirmation}
      onConfirm={({ motivo }) => confirmarOperacion(api.cambiarEstado, { id_medicamento:selected?.id_medicamento, activo:num(selected?.activo)===1?0:1, motivo_baja:motivo })}
      onToast={(type,message,duration)=>setFeedback({type,message,duration})} />

    <ModalEliminarGlobal open={confirmation==='anular'} operacion="advertencia" tone="danger" icon={faBan} row={anular}
      title={anular?.tipo==='INGRESO_COMPRA'?'Anular compra de medicamentos':'Anular venta de medicamentos'}
      message="La anulación generará un contramovimiento de stock y otro asiento contable, conservando el original."
      warning="Confirmá la devolución física y monetaria. Las compras con consumo posterior no se pueden anular automáticamente."
      details={anular ? [{label:'Movimiento',value:`#${anular.id_movimiento}`},{label:'Tipo',value:MED_TIPOS[anular.tipo]},{label:'Unidades',value:anular.cantidad}] : []}
      confirmLabel="Registrar anulación" loading={saving}
      confirmDisabled={!reintegroMedio || motivoAnulacion.trim().length<10 || !confirmarDevolucion}
      onClose={closeConfirmation}
      onConfirm={()=>confirmarOperacion(api.anular,{id_movimiento:anular?.id_movimiento,motivo:motivoAnulacion.trim(),id_medio_pago:reintegroMedio,devolucion_confirmada:confirmarDevolucion})}
      onToast={(type,message,duration)=>setFeedback({type,message,duration})}
      extraContent={<div className="med-global-confirm-fields"><Campos>
        <Campo label="Medio de pago del reintegro" required options={payments} value={reintegroMedio} onChange={setReintegroMedio} disabled={saving} />
        <Campo label="Motivo documentado de anulación (10 a 450 caracteres)" wide textarea required maxLength={450} value={motivoAnulacion} onChange={setMotivoAnulacion} disabled={saving} />
      </Campos><label className="med-anular-confirmacion"><input type="checkbox" checked={confirmarDevolucion} onChange={e=>setConfirmarDevolucion(e.target.checked)} disabled={saving} /> Confirmo la devolución física de las unidades y el reintegro del dinero.</label></div>}
    />

    <AlertasVencimientos tipo="MEDICAMENTO" actualizacion={alertRevision}
      onSelect={alerta => {
        const registro = registros.find(m => Number(m.id_medicamento) === Number(alerta.id_referencia));
        if (registro) openMed(registro);
        else notify('error','El medicamento no está disponible. Actualizá la lista.');
      }} />

    {feedback ? <ModuleFeedback {...feedback} onClose={()=>setFeedback(null)} /> : null}
  </>;
}
