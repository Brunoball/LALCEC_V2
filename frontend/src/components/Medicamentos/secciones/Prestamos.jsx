import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faRotateLeft, faFlagCheckered, faMoneyBillTransfer, faPills, faInbox, faXmark, faPlus, faClipboardList, faCommentDots, faUser, faIdCard, faCheckDouble, faMoneyBill } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import { fecha, fechaHoy, dinero, num, mostrarDosis, unidadStockPlural } from '../utils/medicamentosUtils';
import { medioEfectivo, sectorDePresentacion } from '../utils/medicamentosSelectores';
import MedicamentosTabs, { MedSection } from '../modales/MedicamentosTabs';
import MedModalInfo from '../modales/MedModalInfo';
import AlertasVencimientos from '../alertas/AlertasVencimientos';
import '../Medicamentos.css';

const newLoan = () => ({
  paciente_nombre: '', paciente_dni: '',
  nombre_receptor: '', apellido_receptor: '', dni_receptor: '', celular_receptor: '',
  fecha_devolucion_prevista: '', sena: '', observaciones: '', items: [{ id_medicamento: '', cantidad: '' }],
});
const nuevaFilaDevolucion = (idDetalle = '') => ({ id_detalle_prestamo: idDetalle === '' ? '' : String(idDetalle), cantidad: '' });
const newReturn = (idDetalle = '') => ({ items: [nuevaFilaDevolucion(idDetalle)], observaciones: '' });
const newMoney = (saldo = 0) => ({ monto: saldo > 0 ? saldo.toFixed(2) : '', destino: 'EFECTIVO', observaciones: '' });
const centavos = v => Math.round(num(v) * 100);
// DNI y celular son texto: se conservan ceros y documentos extranjeros. Mismas reglas que el backend.
const normalizarDni = v => String(v || '').replace(/[\s.]+/g, '').toUpperCase();
const dniValido = v => /^[A-Z0-9-]{5,20}$/.test(normalizarDni(v));
const celularValido = v => {
  const t = String(v || '').trim();
  const digitos = t.replace(/\D/g, '').length;
  return t.length <= 30 && /^\+?[0-9()\s-]+$/.test(t) && digitos >= 6 && digitos <= 20;
};
const pendienteDe = d => Math.max(0, num(d?.cantidad_entregada) - num(d?.cantidad_recibida));
const cantidadEntera = v => /^\d+$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN;
/** Encabezado legible: «Apellido, Nombre» de quien retiró; fallback para préstamos históricos. */
const nombrePrestamo = p => {
  if (!p) return '';
  const apellido = String(p.apellido_receptor || '').trim();
  const nombre = String(p.nombre_receptor || '').trim();
  if (apellido && nombre) return `${apellido}, ${nombre}`;
  if (apellido || nombre) return apellido || nombre;
  return String(p.socio || '').trim() || `Préstamo N.º ${p.id_prestamo ?? ''}`.trim();
};
const tituloAccion = (icon, text, info) => <MedModalInfo icon={icon} info={info}>{text}</MedModalInfo>;

function IconAction({ icon, label, onClick, danger = false, disabled = false }) {
  return <button type="button" className={`med-mini med-icon-action${danger ? ' med-mini--danger' : ''}`}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <FontAwesomeIcon icon={icon} aria-hidden="true" />
  </button>;
}
// Seña: cobrado − reintegrado − donado. Mismo cálculo que el backend (sena_pendiente),
// que se prioriza cuando está disponible; el estado de los medicamentos no interviene.
const redondear = n => Math.max(0, Math.round(n * 100) / 100);
const totalSena = (items, tipo) => redondear((items || []).filter(item => item.tipo === tipo).reduce((n, item) => n + num(item.monto), 0));
const resumenSena = items => {
  const cobrada = totalSena(items, 'COBRO_SENA');
  const reintegrada = totalSena(items, 'DEVOLUCION_SENA');
  const donada = totalSena(items, 'SENA_DONADA');
  return { cobrada, reintegrada, donada, pendiente: redondear(cobrada - reintegrada - donada) };
};
const saldoSena = items => resumenSena(items).pendiente;
const saldoFila = p => p.sena_pendiente !== undefined && p.sena_pendiente !== null
  ? redondear(num(p.sena_pendiente))
  : redondear(num(p.sena_cobrada) - num(p.sena_devuelta) - num(p.sena_donada));
const ALERTA_DEVOLUCION = {
  AMARILLA: { clase: 'amarilla', texto: '1 mes sin devolver' },
  ROJA: { clase: 'roja', texto: '3 meses sin devolver' },
};
// Los movimientos válidos de devolución se suman en el backend al listar préstamos.
const progresoMedicamentos = p => {
  const entregadas = Math.max(0, num(p.unidades_entregadas));
  const devueltas = Math.min(entregadas, Math.max(0, num(p.unidades_devueltas)));
  return { entregadas, devueltas, sinDevolver: entregadas - devueltas };
};
const faltanDevolver = items => (items || []).reduce((n, item) => n + Math.max(0, num(item.cantidad_entregada) - num(item.cantidad_recibida)), 0);

export default function Prestamos() {
  const [query, setQuery] = useState('');
  // Por defecto, los préstamos abiertos; los finalizados se consultan con el filtro CERRADOS.
  const [status, setStatus] = useState('ABIERTO');
  const [queryAplicada, setQueryAplicada] = useState('');
  useEffect(() => {
    const timeout = window.setTimeout(() => { setPage(1); setQueryAplicada(query); }, 350);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const [page, setPage] = useState(1);
  const loader = useCallback(() => api.prestamos({ buscar: queryAplicada, estado: status, pagina: page }), [queryAplicada, status, page]);
  const { registros, loading, error, cargar, total, pagina, por_pagina } = useMedicamentos(loader);
  const [medios, setMedios] = useState([]);
  const [medicamentos, setMedicamentos] = useState([]);
  const [modal, setModal] = useState('');
  const [form, setForm] = useState(newLoan);
  const [returnForm, setReturnForm] = useState(newReturn);
  const [moneyForm, setMoneyForm] = useState(newMoney);
  const [detail, setDetail] = useState(null);
  const [fetchingId, setFetchingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const guardandoRef = useRef(false);
  const consultaEnCurso = useRef(false);
  const solicitudMedicamentos = useRef(0);
  const [cargandoMedicamentos, setCargandoMedicamentos] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [alertRevision, setAlertRevision] = useState(0);
  const write = canWrite();
  const notify = (type, message) => setFeedback({ type, message });

  useEffect(() => {
    let active = true;
    api.medios().then(m => { if (active) setMedios(m.registros || []); })
      .catch(e => { if (active) setFeedback({ type: 'error', message: e.message }); });
    return () => { active = false; };
  }, []);

  const openLoan = async () => {
    const token = ++solicitudMedicamentos.current;
    setForm(newLoan()); setMedicamentos([]); setModal('prestamo');
    setCargandoMedicamentos(true);
    try {
      const response = await api.catalogo();
      if (token === solicitudMedicamentos.current) setMedicamentos((response.registros || []).filter(m => sectorDePresentacion(m.presentacion) === 'MEDICAMENTOS'));
    } catch (e) {
      if (token === solicitudMedicamentos.current) notify('error', e.message || 'No se pudieron consultar los medicamentos disponibles.');
    } finally {
      if (token === solicitudMedicamentos.current) setCargandoMedicamentos(false);
    }
  };
  const cerrarPrestamoNuevo = () => {
    if (guardandoRef.current) return;
    ++solicitudMedicamentos.current;
    setCargandoMedicamentos(false);
    setModal('');
  };

  // Cada acción está directamente en la tabla y abre un solo modal.
  // Reconsultamos el préstamo antes de abrir para no usar saldos o cantidades antiguos.
  const openAction = async (id, action) => {
    if (consultaEnCurso.current || guardandoRef.current) return;
    consultaEnCurso.current = true;
    setFetchingId(id);
    try {
      const data = await api.prestamoDetalle(id);
      const isOpen = data.prestamo.estado === 'ABIERTO';
      const remaining = (data.detalle || []).filter(d => num(d.cantidad_entregada) > num(d.cantidad_recibida));
      const balance = saldoSena(data.senas);
      if (action !== 'detalle' && !isOpen) throw new Error('Este préstamo ya está cerrado.');
      if (action === 'devolucion' && remaining.length === 0) throw new Error('Este préstamo no tiene medicamentos pendientes de devolución.');
      setDetail(data);
      if (action === 'devolucion') setReturnForm(newReturn(remaining[0].id_detalle_prestamo));
      if (action === 'finalizar') setMoneyForm(newMoney(balance));
      setModal(action);
    } catch (e) { notify('error', e.message || 'No se pudo abrir la operación.'); }
    finally { consultaEnCurso.current = false; setFetchingId(null); }
  };

  const run = async (event, method, payload) => {
    event.preventDefault();
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setSaving(true);
    try {
      const resultado = await method(payload);
      // Cerrar primero: una falla en la recarga no debe ofrecer repetir una escritura exitosa.
      setModal(''); setDetail(null);
      notify('success', 'Operación registrada correctamente.');
      await cargar({ silencioso: true });
      setAlertRevision(v => v + 1);
    } catch (e) { notify('error', e.message || 'No se pudo registrar la operación.'); }
    finally { guardandoRef.current = false; setSaving(false); }
  };

  // Fecha única del catálogo, nunca solicitada dentro del formulario de préstamo.
  // El servidor valida otra vez al guardar para evitar cambios concurrentes.
  const hoy = fechaHoy();
  const conStock = medicamentos.filter(m => num(m.activo) === 1 && num(m.stock_actual) > 0);
  const available = conStock.filter(m => m.fecha_vencimiento && m.fecha_vencimiento >= hoy);
  const noDisponibles = conStock.filter(m => !m.fecha_vencimiento || m.fecha_vencimiento < hoy);
  const opts = [op('', 'Seleccionar medicamento'), ...available.map(m => op(m.id_medicamento, `${m.nombre_comercial} · ${m.stock_actual} ${unidadStockPlural(m.unidad_stock, m.stock_actual)} disponibles`.replace(/\s+/g, ' ')))];
  const cantidadesValidas = form.items.every(item => {
    const seleccionado = available.find(m => String(m.id_medicamento) === String(item.id_medicamento));
    const cantidad = Number(item.cantidad);
    return seleccionado && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= num(seleccionado.stock_actual);
  });
  const sinDuplicados = new Set(form.items.map(item => String(item.id_medicamento))).size === form.items.length;
  // La seña se cobra solo en EFECTIVO: el backend lo asigna automáticamente y rechaza otros medios.
  const efectivoId = medioEfectivo(medios)?.id_medio_pago || '';
  const haySena = num(form.sena) > 0;

  // Datos manuales del paciente y de quien retira (sin vínculo con el padrón de socios).
  const actualizarReceptor = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const actualizarPaciente = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
  const erroresPersona = [
    form.paciente_dni.trim() && !dniValido(form.paciente_dni) ? 'El DNI del paciente debe tener entre 5 y 20 caracteres (números, letras o guiones).' : null,
    form.dni_receptor.trim() && !dniValido(form.dni_receptor) ? 'El DNI de quien retira debe tener entre 5 y 20 caracteres (números, letras o guiones).' : null,
    form.celular_receptor.trim() && !celularValido(form.celular_receptor) ? 'El celular debe tener entre 6 y 20 números (se admiten +, espacios, guiones y paréntesis).' : null,
  ].filter(Boolean);
  const personasValidas = form.paciente_nombre.trim().length >= 3 && dniValido(form.paciente_dni)
    && form.nombre_receptor.trim().length >= 2 && form.apellido_receptor.trim().length >= 2
    && dniValido(form.dni_receptor) && celularValido(form.celular_receptor);
  const payloadPrestamo = () => {
    return {
      ...form,
      paciente_dni: normalizarDni(form.paciente_dni),
      dni_receptor: normalizarDni(form.dni_receptor),
      celular_receptor: form.celular_receptor.trim(),
      sena: String(form.sena ?? '').trim() === '' ? '0' : form.sena,
    };
  };

  const shown = registros;
  const pages = Math.max(1, Math.ceil((total || 0) / (por_pagina || 20)));
  useEffect(() => {
    if (!loading && !error && page > pages) setPage(pages);
  }, [loading, error, page, pages]);
  const details = detail?.detalle || [];
  const senaDetalle = resumenSena(detail?.senas);
  const balance = senaDetalle.pendiente;
  const remaining = faltanDevolver(details);
  const loanId = detail?.prestamo?.id_prestamo;
  const persona = nombrePrestamo(detail?.prestamo);
  const referencia = loanId ? `Préstamo N.º ${loanId}` : '';

  // Devolución múltiple: una fila por renglón pendiente del préstamo seleccionado.
  const returnable = details.filter(d => pendienteDe(d) > 0);
  const filasDevolucion = returnForm.items || [];
  const detallePorId = id => returnable.find(d => String(d.id_detalle_prestamo) === String(id));
  const seleccionadosDevolucion = filasDevolucion.map(r => String(r.id_detalle_prestamo)).filter(Boolean);
  const devolucionSinDuplicados = new Set(seleccionadosDevolucion).size === seleccionadosDevolucion.length;
  const errorFila = fila => {
    const d = detallePorId(fila.id_detalle_prestamo);
    if (!d) return fila.id_detalle_prestamo ? 'Medicamento no disponible para devolver.' : null;
    if (String(fila.cantidad ?? '').trim() === '') return null;
    const cantidad = cantidadEntera(fila.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) return 'Ingresá una cantidad entera mayor que cero.';
    if (cantidad > pendienteDe(d)) return `Supera las unidades pendientes (${pendienteDe(d)}).`;
    return null;
  };
  const filaValida = fila => {
    const d = detallePorId(fila.id_detalle_prestamo);
    const cantidad = cantidadEntera(fila.cantidad);
    return Boolean(d) && Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= pendienteDe(d);
  };
  const devolucionValida = filasDevolucion.length > 0 && devolucionSinDuplicados && filasDevolucion.every(filaValida);
  const unidadesADevolver = filasDevolucion.reduce((n, fila) => n + (filaValida(fila) ? cantidadEntera(fila.cantidad) : 0), 0);
  const opcionesFila = indice => [op('', 'Seleccionar medicamento'), ...returnable
    .filter(d => String(d.id_detalle_prestamo) === String(filasDevolucion[indice]?.id_detalle_prestamo)
      || !seleccionadosDevolucion.includes(String(d.id_detalle_prestamo)))
    .map(d => op(d.id_detalle_prestamo, `${d.nombre_comercial} · ${mostrarDosis(d.dosis, d.unidad_dosis)} · ${pendienteDe(d)} ${pendienteDe(d) === 1 ? 'pendiente' : 'pendientes'}`.replace(/\s+/g, ' ')))];
  const actualizarFila = (indice, cambios) => setReturnForm(f => ({ ...f, items: f.items.map((fila, k) => k === indice ? { ...fila, ...cambios } : fila) }));
  const agregarFila = () => setReturnForm(f => {
    const usados = new Set(f.items.map(r => String(r.id_detalle_prestamo)));
    const siguiente = returnable.find(d => !usados.has(String(d.id_detalle_prestamo)));
    return { ...f, items: [...f.items, nuevaFilaDevolucion(siguiente ? siguiente.id_detalle_prestamo : '')] };
  });
  const quitarFila = indice => setReturnForm(f => ({ ...f, items: f.items.filter((_, k) => k !== indice) }));
  // Completa filas y cantidades; no registra nada hasta que el operador confirme.
  const devolverTodos = () => setReturnForm(f => ({ ...f, items: returnable.map(d => ({ id_detalle_prestamo: String(d.id_detalle_prestamo), cantidad: String(pendienteDe(d)) })) }));
  const payloadDevolucion = () => ({
    id_prestamo: loanId,
    items: filasDevolucion.map(fila => ({ id_detalle_prestamo: Number(fila.id_detalle_prestamo), cantidad: cantidadEntera(fila.cantidad) })),
    observaciones: returnForm.observaciones,
  });

  // Finalizar: decide la operación según la seña pendiente y el destino elegido.
  const montoReintegro = centavos(moneyForm.monto);
  const reintegroTotal = balance >= 0.01 && moneyForm.destino === 'EFECTIVO' && montoReintegro === centavos(balance);
  const reintegroParcial = balance >= 0.01 && moneyForm.destino === 'EFECTIVO' && montoReintegro > 0 && montoReintegro < centavos(balance);
  const finalizacion = balance < 0.01
    ? { metodo: api.cerrar, payload: { id_prestamo: loanId } }
    : moneyForm.destino === 'DONACION'
      ? { metodo: api.cerrar, payload: { id_prestamo: loanId, resolucion_sena: 'DONACION' } }
      : reintegroTotal
        ? { metodo: api.cerrar, payload: { id_prestamo: loanId, resolucion_sena: 'EFECTIVO', monto_reintegro: balance.toFixed(2), observaciones: moneyForm.observaciones } }
        : { metodo: api.sena, payload: { id_prestamo: loanId, tipo: 'DEVOLUCION_SENA', monto: moneyForm.monto, observaciones: moneyForm.observaciones } };
  const finalizacionValida = Boolean(loanId) && (balance < 0.01 || moneyForm.destino === 'DONACION'
    || (Boolean(efectivoId) && (reintegroTotal || reintegroParcial)));
  const etiquetaFinalizar = balance < 0.01 ? 'Finalizar préstamo'
    : moneyForm.destino === 'DONACION' ? 'Donar seña y finalizar'
      : reintegroParcial ? 'Registrar reintegro parcial' : 'Reintegrar y finalizar';

  const celdaSena = p => {
    const pendiente = saldoFila(p);
    if (pendiente >= 0.01) return <strong>{dinero(pendiente)}</strong>;
    if (num(p.sena_cobrada) < 0.01) return <span className="med-cell-secondary med-sena-estado">Sin seña</span>;
    return <span className="med-cell-secondary med-sena-estado">Resuelta</span>;
  };

  return <>
    <ModulePage title="Medicamentos · Préstamos"
      description="Control de préstamos y devoluciones."
      headFiltersClassName="med-loans-filters"
      filters={[{ type: 'search', label: 'Búsqueda', value: query, onChange: setQuery, placeholder: ' ' },
        { type: 'select', label: 'Estado', className: 'med-filter--estado', value: status, onChange: v => { setStatus(v); setPage(1); }, options: [op('TODOS', 'TODOS'), op('ABIERTO', 'ABIERTOS'), op('CERRADO', 'CERRADOS')] }]}
      primaryActionLabel="Nuevo préstamo" onPrimaryAction={openLoan} canCreate={write}>
      {error ? <div className="med-inline-danger">{error}</div> : null}
      <GlobalDivTable ariaLabel="Préstamos de medicamentos" className={`med-table ${total > 0 ? 'has-bottom-pagination' : ''}`} empty={!loading && !error && !registros.length} gridClassName="med-grid--loans" loading={loading} columns={['Persona que retira', { label: 'Entrega / devolución', align: 'center' }, { label: 'Estado', align: 'center' }, 'Medicamentos', { label: 'Seña pendiente', align: 'right' }, { label: 'Acciones', align: 'center' }]}>
        {shown.map(p => {
          const { entregadas, devueltas, sinDevolver } = progresoMedicamentos(p);
          const alerta = ALERTA_DEVOLUCION[p.alerta_devolucion];
          const documento = p.dni_receptor ? `DNI: ${p.dni_receptor}` : p.documento ? `Documento: ${p.documento}` : (p.id_socio ? 'Socio registrado' : 'Registrado manualmente');
          return <div className={`mov-gridTable mov-gridTable--row global-divTable__row med-grid--loans${alerta ? ` med-loan-row--${alerta.clase}` : ''}`} key={p.id_prestamo} role="row">
          <div className="mov-gridCell med-loan-person" role="cell"><div className="med-loan-cell-content" style={{ display: 'grid', gap: 3, minWidth: 0, width: '100%' }}>
            <span className="med-loan-person__name" title={p.socio || undefined}>{p.socio || '—'}</span>
            <span className="med-cell-secondary" title={documento}>{documento}</span>
            {p.paciente_nombre ? <span className="med-cell-secondary" title={`Paciente: ${p.paciente_nombre}`}>Paciente: {p.paciente_nombre}</span> : null}
          </div></div>
          <div className="mov-gridCell is-center med-loan-dates" role="cell">
            <strong>{fecha(p.fecha_entrega)}</strong>
            {p.fecha_devolucion_prevista ? <span className="med-cell-secondary">Prev.: {fecha(p.fecha_devolucion_prevista)}</span> : null}
            {alerta ? <span className={`med-status-chip med-status-chip--alerta-${alerta.clase}`} title={`Entregado el ${fecha(p.fecha_entrega)}: ${alerta.texto}`}>{alerta.texto}</span> : null}
          </div>
          <div className="mov-gridCell is-center" role="cell"><span className={`med-status-chip med-status-chip--${p.estado === 'ABIERTO' ? 'abierto' : p.estado === 'CERRADO' ? 'cerrado' : 'neutral'}`}>{p.estado}</span></div>
          <div className={`mov-gridCell med-loan-units${entregadas > 0 && sinDevolver === 0 ? ' med-loan-units--complete' : ''}`} role="cell">
            {entregadas > 0 ? <div className="med-loan-cell-content" style={{ display: 'grid', gap: 3, minWidth: 0, width: '100%' }}>
              <strong className="med-loan-units__returned">{devueltas} / {entregadas} devueltas</strong>
              <span>{sinDevolver === 0 ? 'Todo devuelto' : `${sinDevolver} ${p.estado === 'ABIERTO' ? 'por devolver' : 'sin devolver'}`}</span>
            </div> : '—'}
          </div>
          <div className="mov-gridCell is-right" role="cell">{celdaSena(p)}</div>
          <div className="mov-gridCell med-actions" role="cell">
            <IconAction icon={faCircleInfo} label="Ver información del préstamo" onClick={() => openAction(p.id_prestamo, 'detalle')} disabled={fetchingId !== null || saving} />
            {write && p.estado === 'ABIERTO' ? <>
              {sinDevolver > 0 || entregadas === 0 ? <IconAction icon={faRotateLeft} label="Registrar devolución de medicamentos" onClick={() => openAction(p.id_prestamo, 'devolucion')} disabled={fetchingId !== null || saving} /> : null}
              {/* Único flujo de cierre: resuelve la seña (efectivo o donación) y finaliza. */}
              <IconAction icon={faFlagCheckered} label="Finalizar préstamo" onClick={() => openAction(p.id_prestamo, 'finalizar')} disabled={fetchingId !== null || saving} />
            </> : null}
          </div>
        </div>;
        })}
        {!loading && !error && !registros.length ? <div className="module-empty">
          <FontAwesomeIcon icon={faInbox} />
          <strong>Sin préstamos para mostrar</strong>
          <span>No hay préstamos que coincidan.</span>
        </div> : null}
      </GlobalDivTable>
      <GlobalPagination page={pagina} total={total} perPage={por_pagina} onPageChange={setPage} loading={loading} label="préstamos" />
    </ModulePage>
    <AlertasVencimientos tipo="PRESTAMO" actualizacion={alertRevision}
      onSelect={aviso => openAction(aviso.id_referencia, 'detalle')} />

    <CrudModal modalClassName="med-modal med-loan-create-modal" closeOnBackdrop={false} open={modal === 'prestamo'} wide saving={saving} loading={cargandoMedicamentos} submitLabel="Registrar préstamo" title={tituloAccion(faPills, 'Registrar préstamo de medicamentos', [
        'El préstamo descuenta los medicamentos del stock y cobra la seña una sola vez, únicamente en efectivo.',
        'Los datos del paciente y de quien retira se cargan a mano: no necesitan ser socios.',
        noDisponibles.length > 0 ? <>No se pueden prestar: {noDisponibles.map(m => `${m.nombre_comercial} (${!m.fecha_vencimiento ? 'sin fecha de vencimiento' : `vencido el ${fecha(m.fecha_vencimiento)}`})`).join('; ')}. Para corregir la fecha, andá a Medicamentos → Stock → Editar → Datos. La fecha no se carga en este préstamo.</> : null,
      ])}
      onClose={cerrarPrestamoNuevo} submitDisabled={cargandoMedicamentos || !personasValidas || !cantidadesValidas || !sinDuplicados || (haySena && !efectivoId)}
      onSubmit={e => run(e, api.prestar, payloadPrestamo())}>
      <MedicamentosTabs disabled={saving} tabs={[{ label: 'Personas y seña', icon: faUser }, { label: 'Medicamentos', icon: faPills }]}>
        <div className="med-loan-create__content">
          <section className="med-loan-create__card" aria-label="Datos del paciente">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faUser} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text">
                <h3>Datos del paciente</h3>
                <p>Nombre y DNI de la persona que usará los medicamentos. No necesita ser socio.</p>
              </div>
              <span className="med-loan-create__step">01 / 03</span>
            </div>
            <div className="med-loan-create__card-body">
              <div className="med-loan-form-grid"><Campos>
                <Campo label="Nombre y apellido del paciente" required maxLength={160} value={form.paciente_nombre}
                  onChange={v => actualizarPaciente('paciente_nombre', v)} />
                <Campo label="DNI del paciente" required maxLength={20} value={form.paciente_dni}
                  onChange={v => actualizarPaciente('paciente_dni', v)} />
              </Campos></div>
            </div>
          </section>
          <section className="med-loan-create__card" aria-label="Datos de quien retira">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faIdCard} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text">
                <h3>Persona que retira</h3>
                <p>Datos de contacto de quien se lleva los medicamentos. Puede ser distinta del paciente.</p>
              </div>
              <span className="med-loan-create__step">02 / 03</span>
            </div>
            <div className="med-loan-create__card-body">
              <div className="med-loan-form-grid"><Campos>
                <Campo label="Nombre de quien retira" required maxLength={160} value={form.nombre_receptor}
                  onChange={v => actualizarReceptor('nombre_receptor', v)} />
                <Campo label="Apellido de quien retira" required maxLength={160} value={form.apellido_receptor}
                  onChange={v => actualizarReceptor('apellido_receptor', v)} />
                <Campo label="DNI de quien retira" required maxLength={20} value={form.dni_receptor}
                  onChange={v => actualizarReceptor('dni_receptor', v)} />
                <Campo label="Celular de contacto" type="tel" required maxLength={30} value={form.celular_receptor}
                  onChange={v => actualizarReceptor('celular_receptor', v)} />
              </Campos></div>
              {erroresPersona.map(mensaje => <p className="med-inline-danger med-loan-field-error" role="alert" key={mensaje}>{mensaje}</p>)}
            </div>
          </section>
          <section className="med-loan-create__card" aria-label="Seña y devolución prevista">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faClipboardList} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text">
                <h3>Seña y devolución</h3>
                <p>Los avisos de devolución aparecen al mes (amarillo) y a los tres meses (rojo) de la entrega.</p>
              </div>
              <span className="med-loan-create__step">03 / 03</span>
            </div>
            <div className="med-loan-create__card-body">
              <div className="med-loan-form-grid"><Campos>
                <Campo label="Fecha prevista de devolución (opcional)" type="date" min={fechaHoy()} value={form.fecha_devolucion_prevista} onChange={v => setForm(f => ({ ...f, fecha_devolucion_prevista: v }))} />
                <Campo label="Seña cobrada ($)" type="number" money min="0" step="0.01" value={form.sena}
                  onChange={v => setForm(f => ({ ...f, sena: v }))} />
              </Campos></div>
              <p className="med-loan-cash-note" role="note"><FontAwesomeIcon icon={faMoneyBill} aria-hidden="true" /> Seña: únicamente en efectivo</p>
              {haySena && !efectivoId ? <p className="med-inline-danger" role="alert">Falta el medio EFECTIVO. Ejecutá el SQL incluido en el ZIP.</p> : null}
            </div>
          </section>
        </div>
        <div className="med-loan-create__content">
          <section className="med-loan-create__card med-loan-create__card--medicines">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faPills} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text">
                <h3>Medicamentos entregados</h3>
                <p>Elegí cada medicamento e indicá la cantidad.</p>
              </div>
              <span className="med-loan-create__count">{form.items.length} {form.items.length === 1 ? 'medicamento' : 'medicamentos'}</span>
            </div>
            <div className="med-loan-create__card-body med-loan-create__card-body--medicines">
              {!cargandoMedicamentos && available.length === 0 ? <p className="med-inline-danger" role="status">No hay medicamentos con stock y fecha de vencimiento vigente disponibles para prestar.</p> : null}
              <div className="med-loan-create__items">
                {form.items.map((item, i) => <div className={`med-loan-create__medicine-row${form.items.length > 1 ? ' has-remove' : ''}`} key={i}>
                  <span className="med-loan-create__medicine-number" aria-hidden="true">{i + 1}</span>
                  <Campo className="med-med-editor__select" label={`Medicamento ${i + 1}`} required value={item.id_medicamento} options={opts} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, id_medicamento: v } : r) }))} />
                  <Campo className="med-med-editor__quantity" label="Cantidad" quantity required type="number" min="1" step="1" value={item.cantidad} onChange={v => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, cantidad: v } : r) }))} />
                  {form.items.length > 1 ? <button className="med-med-editor__remove" type="button" title={`Quitar medicamento ${i + 1}`} aria-label={`Quitar medicamento ${i + 1}`} onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, k) => k !== i) }))}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button> : null}
                </div>)}
              </div>
              {!sinDuplicados && form.items.every(item => item.id_medicamento) ? <p className="med-inline-danger" role="status">No repitas el mismo medicamento en el préstamo.</p> : null}
              <button type="button" className="med-loan-create__add" disabled={form.items.length >= 30} onClick={() => setForm(f => ({ ...f, items: [...f.items, { id_medicamento: '', cantidad: '' }] }))}>
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Agregar otro medicamento
              </button>
            </div>
          </section>
          <section className="med-loan-create__notes">
            <div className="med-loan-create__notes-heading">
              <span><FontAwesomeIcon icon={faCommentDots} aria-hidden="true" /> Información adicional</span>
              <small>Opcional</small>
            </div>
            <Campo label="Observaciones" wide textarea maxLength={3000} value={form.observaciones} onChange={v => setForm(f => ({ ...f, observaciones: v }))} />
          </section>
        </div>
      </MedicamentosTabs>
    </CrudModal>

    {/* Detalle de solo lectura; estilos propios sin alterar el resto de modales. */}
    <CrudModal modalClassName="med-modal med-loan-detail-modal" closeOnBackdrop={false} open={modal === 'detalle'} wide hideSubmit title={tituloAccion(faCircleInfo, persona || 'Préstamo')}
      subtitle={referencia ? `${referencia} · Entregado el ${fecha(detail?.prestamo?.fecha_entrega)}` : ''} onClose={() => setModal('')}>
      {detail ? <MedicamentosTabs tabs={[{ label: 'Medicamentos', icon: faPills }, { label: 'Seña', icon: faMoneyBillTransfer }]}><div className="med-loan-detail-content">
        <div className="med-loan-summary med-loan-detail-summary">
          <div className="med-loan-detail-stat med-loan-detail-stat--status">
            <span>Estado del préstamo</span>
            <strong><span className={`med-status-chip med-status-chip--${detail.prestamo.estado === 'ABIERTO' ? 'abierto' : 'cerrado'}`}>{detail.prestamo.estado}</span></strong>
          </div>
          <div className="med-loan-detail-stat med-loan-detail-stat--date">
            <span>Fecha de entrega</span><strong>{fecha(detail.prestamo.fecha_entrega)}</strong>
            {ALERTA_DEVOLUCION[detail.prestamo.alerta_devolucion] ? <span className={`med-status-chip med-status-chip--alerta-${ALERTA_DEVOLUCION[detail.prestamo.alerta_devolucion].clase}`}>{ALERTA_DEVOLUCION[detail.prestamo.alerta_devolucion].texto}</span> : null}
          </div>
          <div className="med-loan-detail-stat med-loan-detail-stat--balance">
            <span>Seña pendiente</span><strong>{senaDetalle.cobrada < 0.01 ? 'Sin seña' : dinero(balance)}</strong>
          </div>
        </div>
        <section className="med-box med-loan-detail-card med-loan-detail-card--people">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faIdCard}>Personas</MedSection>
          </div>
          <div className="med-loan-detail-card__content med-loan-people">
            <div className="med-loan-person-block">
              <span className="med-loan-person-block__role">Persona que retiró</span>
              <strong>{persona || '—'}</strong>
              <span>{detail.prestamo.dni_receptor ? `DNI: ${detail.prestamo.dni_receptor}` : detail.prestamo.documento ? `Documento: ${detail.prestamo.documento}` : 'DNI no registrado'}</span>
              <span>{detail.prestamo.celular_receptor ? `Celular: ${detail.prestamo.celular_receptor}` : 'Celular no registrado'}</span>
            </div>
            <div className="med-loan-person-block">
              <span className="med-loan-person-block__role">Paciente</span>
              <strong>{detail.prestamo.paciente_nombre || 'Sin datos (préstamo anterior al registro de pacientes)'}</strong>
              {detail.prestamo.paciente_nombre ? <span>{detail.prestamo.paciente_dni ? `DNI: ${detail.prestamo.paciente_dni}` : 'DNI no registrado'}</span> : null}
            </div>
          </div>
        </section>
        <section className="med-box med-loan-detail-card med-loan-detail-card--meds">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faPills}>Medicamentos entregados</MedSection>
            <span className="med-loan-detail-count">{details.length} {details.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {details.map(d => <div className="med-detail-row med-loan-detail-item" key={d.id_detalle_prestamo}>
              <strong className="med-loan-detail-item__name">{d.nombre_comercial} · {mostrarDosis(d.dosis, d.unidad_dosis)}</strong>
              <div className="med-loan-detail-quantities">
                <span className="med-loan-detail-quantity med-loan-detail-quantity--delivered">Entregado <strong>{d.cantidad_entregada}</strong></span>
                <span className="med-loan-detail-quantity med-loan-detail-quantity--returned">Devuelto <strong>{d.cantidad_recibida}</strong></span>
                <span className="med-loan-detail-quantity med-loan-detail-quantity--pending">Pendiente <strong>{pendienteDe(d)}</strong></span>
              </div>
            </div>)}
          </div>
        </section>
        {detail.devoluciones.length > 0 ? <section className="med-box med-loan-detail-card med-loan-detail-card--returns">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faRotateLeft}>Devoluciones registradas</MedSection>
            <span className="med-loan-detail-count">{detail.devoluciones.length} {detail.devoluciones.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {detail.devoluciones.map(r => <div className="med-detail-row med-loan-detail-item med-loan-detail-return" key={r.id_devolucion}>
              <div className="med-loan-detail-return-heading">
                <strong>{r.nombre_comercial ? `${r.nombre_comercial}${r.dosis ? ` · ${mostrarDosis(r.dosis, r.unidad_dosis)}` : ''}` : 'Medicamento'}</strong>
                <span className="med-loan-detail-date">{fecha(r.fecha_recepcion)}</span>
              </div>
              <div className="med-loan-detail-description"><strong>{r.cantidad} {num(r.cantidad) === 1 ? 'unidad devuelta' : 'unidades devueltas'}</strong>{r.observaciones ? ` · ${r.observaciones}` : ''}</div>
            </div>)}
          </div>
        </section> : null}
      </div><div className="med-loan-detail-content">
        <div className="med-loan-summary med-loan-detail-summary med-loan-sena-summary">
          <div className="med-loan-detail-stat"><span>Seña cobrada</span><strong>{dinero(senaDetalle.cobrada)}</strong></div>
          <div className="med-loan-detail-stat"><span>Seña reintegrada</span><strong>{dinero(senaDetalle.reintegrada)}</strong></div>
          <div className="med-loan-detail-stat"><span>Seña donada</span><strong>{dinero(senaDetalle.donada)}</strong></div>
          <div className="med-loan-detail-stat med-loan-detail-stat--balance"><span>Seña pendiente</span><strong>{senaDetalle.cobrada < 0.01 ? 'Sin seña' : balance < 0.01 ? 'Resuelta' : dinero(balance)}</strong></div>
        </div>
        <section className="med-box med-loan-detail-card med-loan-detail-card--deposit">
          <div className="med-loan-detail-card__heading">
            <MedSection icon={faMoneyBillTransfer}>Movimientos de seña</MedSection>
            <span className="med-loan-detail-count">{detail.senas.length} {detail.senas.length === 1 ? 'movimiento' : 'movimientos'}</span>
          </div>
          <div className="med-loan-detail-card__content">
            {detail.senas.length ? detail.senas.map(m => <div className="med-detail-row med-loan-detail-payment" key={m.id_movimiento_sena}>
              <div className="med-loan-detail-payment__info">
                <strong>{m.tipo === 'COBRO_SENA' ? 'Cobro' : m.tipo === 'DEVOLUCION_SENA' ? 'Reintegro' : 'Donación'}</strong>
                <span>{fecha(m.fecha_movimiento)}{m.medio_pago ? ` · ${m.medio_pago}` : ''}</span>
              </div>
              <strong className="med-loan-detail-payment__amount">{dinero(m.monto)}</strong>
            </div>) : <div className="med-empty med-empty--compact"><FontAwesomeIcon icon={faInbox} /><span>Sin movimientos de seña.</span></div>}
          </div>
        </section>
      </div></MedicamentosTabs> : null}
    </CrudModal>

    <CrudModal modalClassName="med-modal med-loan-create-modal med-loan-return-modal" closeOnBackdrop={false} open={modal === 'devolucion'} wide saving={saving}
      title={tituloAccion(faRotateLeft, 'Registrar devolución de medicamentos', 'Podés devolver varios medicamentos juntos, en forma total o parcial. La devolución de medicamentos no devuelve dinero: la seña tiene sus propias acciones.')}
      subtitle={persona ? `${persona}${referencia ? ` · ${referencia}` : ''}` : ''}
      onClose={() => setModal('')} submitLabel="Registrar devolución"
      submitDisabled={!devolucionValida}
      onSubmit={e => run(e, api.devolver, payloadDevolucion())}>
      <section className="med-loan-create__card med-loan-create__card--medicines">
        <div className="med-loan-create__card-heading">
          <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" /></span>
          <div className="med-loan-create__heading-text">
            <h3>Medicamentos recibidos</h3>
            <p>Elegí cada medicamento pendiente e indicá cuántas unidades devuelve. El stock se actualiza al guardar.</p>
          </div>
          <span className="med-loan-create__count">{unidadesADevolver} {unidadesADevolver === 1 ? 'unidad' : 'unidades'}</span>
        </div>
        <div className="med-loan-create__card-body med-loan-create__card-body--medicines">
          {returnable.length > 1 ? <button type="button" className="med-loan-create__add med-loan-return__all" onClick={devolverTodos} disabled={saving}>
            <FontAwesomeIcon icon={faCheckDouble} aria-hidden="true" /> Devolver todos los pendientes
          </button> : null}
          <div className="med-loan-create__items">
            {filasDevolucion.map((fila, i) => {
              const d = detallePorId(fila.id_detalle_prestamo);
              const mensaje = errorFila(fila);
              return <div className="med-loan-return__row" key={i}>
                <div className={`med-loan-create__medicine-row${filasDevolucion.length > 1 ? ' has-remove' : ''}${mensaje ? ' is-invalid' : ''}`}>
                  <span className="med-loan-create__medicine-number" aria-hidden="true">{i + 1}</span>
                  <Campo className="med-med-editor__select" label={`Medicamento devuelto ${i + 1}`} required value={fila.id_detalle_prestamo}
                    options={opcionesFila(i)} onChange={v => actualizarFila(i, { id_detalle_prestamo: v, cantidad: '' })} />
                  <Campo className="med-med-editor__quantity" label={d ? `Cantidad (máx. ${pendienteDe(d)})` : 'Cantidad'} quantity required type="number" min="1" max={d ? pendienteDe(d) : undefined} step="1"
                    value={fila.cantidad} onChange={v => actualizarFila(i, { cantidad: v })} />
                  {filasDevolucion.length > 1 ? <button className="med-med-editor__remove" type="button" title={`Quitar medicamento ${i + 1}`} aria-label={`Quitar medicamento ${i + 1}`} onClick={() => quitarFila(i)} disabled={saving}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button> : null}
                </div>
                {mensaje ? <p className="med-inline-danger med-loan-field-error" role="alert">{mensaje}</p> : null}
              </div>;
            })}
          </div>
          {!devolucionSinDuplicados ? <p className="med-inline-danger" role="status">No repitas el mismo medicamento en la devolución.</p> : null}
          {filasDevolucion.length === 0 ? <p className="med-inline-danger" role="status">Agregá al menos un medicamento para registrar la devolución.</p> : null}
          <button type="button" className="med-loan-create__add" disabled={saving || filasDevolucion.length >= returnable.length} onClick={agregarFila}>
            <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Agregar otro medicamento
          </button>
        </div>
      </section>
      <section className="med-loan-create__notes">
        <div className="med-loan-create__notes-heading">
          <span><FontAwesomeIcon icon={faCommentDots} aria-hidden="true" /> Información adicional</span>
          <small>Opcional</small>
        </div>
        <Campo label="Observaciones" wide textarea maxLength={450} value={returnForm.observaciones}
          onChange={v => setReturnForm(f => ({ ...f, observaciones: v }))} />
      </section>
    </CrudModal>

    {/* Único flujo de cierre (Trello: "quitaría lo del candado"). */}
    <CrudModal modalClassName="med-modal" closeOnBackdrop={false} open={modal === 'finalizar'} saving={saving}
      title={tituloAccion(faFlagCheckered, 'Finalizar préstamo', [
        'Con seña pendiente, elegí si se reintegra en efectivo o queda como donación.',
        'Un reintegro parcial deja el préstamo abierto con el resto de la seña pendiente.',
        'Finalizar no devuelve medicamentos al stock: las unidades sin devolver quedan registradas en el historial.',
      ])}
      subtitle={persona ? `${persona}${referencia ? ` · ${referencia}` : ''}` : ''}
      onClose={() => setModal('')} submitLabel={etiquetaFinalizar}
      submitDisabled={!finalizacionValida}
      onSubmit={e => run(e, finalizacion.metodo, finalizacion.payload)}>
      <MedSection icon={faFlagCheckered}>Resumen</MedSection>
      <div className="med-loan-finalizar">
        <p className="med-loan-muted">Unidades sin devolver: <strong>{remaining}</strong>{remaining > 0 ? ' · quedan registradas como no devueltas' : ''}</p>
        <p className="med-loan-muted">Seña pendiente: <strong>{balance >= 0.01 ? dinero(balance) : 'Sin seña pendiente'}</strong></p>
      </div>
      {balance >= 0.01 ? <Campos>
        <Campo label="Destino de la seña" required value={moneyForm.destino}
          options={[op('EFECTIVO', 'EFECTIVO'), op('DONACION', 'DONACIÓN')]}
          onChange={v => setMoneyForm(f => ({ ...f, destino: v }))} />
        {moneyForm.destino === 'EFECTIVO' ? <>
          <Campo label="Monto a reintegrar ($)" type="number" money min="0.01" step="0.01" max={balance.toFixed(2)} required value={moneyForm.monto}
            onChange={v => setMoneyForm(f => ({ ...f, monto: v }))} />
          <p className="med-loan-cash-note" role="note"><FontAwesomeIcon icon={faMoneyBill} aria-hidden="true" /> Reintegro: únicamente en efectivo</p>
          {!efectivoId ? <p className="med-inline-danger" role="alert">Falta el medio EFECTIVO. Ejecutá el SQL incluido en el ZIP.</p> : null}
          {reintegroParcial ? <p className="med-loan-muted" role="status">Reintegro parcial: el préstamo sigue abierto con {dinero(balance - num(moneyForm.monto))} de seña pendiente.</p> : null}
          {num(moneyForm.monto) > balance ? <p className="med-inline-danger" role="alert">El monto supera la seña pendiente.</p> : null}
          <Campo label="Observaciones" wide textarea maxLength={500} value={moneyForm.observaciones}
            onChange={v => setMoneyForm(f => ({ ...f, observaciones: v }))} />
        </> : <p className="med-loan-muted">La seña pendiente queda como donación, sin egreso de caja, y el préstamo se finaliza.</p>}
      </Campos> : null}
    </CrudModal>

    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
