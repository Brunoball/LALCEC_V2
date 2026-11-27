import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faIdCard, faPenToSquare, faPills, faPlus, faXmark, faCommentDots, faHandHoldingMedical, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import Toast from '../../Global/Toast';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import MedicamentosTabs from '../modales/MedicamentosTabs';
import MedModalInfo from '../modales/MedModalInfo';
import { fecha, dinero, num, vigenteParaEntrega, unidadStockPlural } from '../utils/medicamentosUtils';
import { PRESENTACIONES_SECTOR } from '../utils/medicamentosSelectores';
import '../Medicamentos.css';

const nuevaFila = () => ({ id_medicamento: '', cantidad: '' });
const nuevo = () => ({
  paciente_nombre: '', paciente_dni: '',
  nombre_receptor: '', apellido_receptor: '', dni_receptor: '', celular_receptor: '',
  observaciones: '', motivo_correccion: '', stock_confirmado: false, items: [nuevaFila()],
});
// Mismas reglas de texto que Préstamos y que el backend.
const normalizarDni = v => String(v || '').replace(/[\s.]+/g, '').toUpperCase();
const dniValido = v => /^[A-Z0-9-]{5,20}$/.test(normalizarDni(v));
const celularValido = v => {
  const t = String(v || '').trim();
  const digitos = t.replace(/\D/g, '').length;
  return t.length <= 30 && /^\+?[0-9()\s-]+$/.test(t) && digitos >= 6 && digitos <= 20;
};

// Mide el espacio real de la columna, incluso al cambiar el ancho del menú lateral.
function ObservacionEntrega({ detalle, onVer }) {
  const texto = String(detalle ?? '').trim();
  const contenedor = useRef(null);
  const contenido = useRef(null);
  const [recortado, setRecortado] = useState(false);

  useLayoutEffect(() => {
    const caja = contenedor.current;
    const linea = contenido.current;
    if (!caja || !linea) return;
    // Comparar con el ancho total evita que el propio botón mantenga el recorte.
    const medir = () => setRecortado(Boolean(texto) && linea.scrollWidth > caja.clientWidth);
    medir();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observer?.observe(caja);
    window.addEventListener('resize', medir);
    document.fonts?.addEventListener?.('loadingdone', medir);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', medir);
      document.fonts?.removeEventListener?.('loadingdone', medir);
    };
  }, [texto]);

  return <div className="med-entrega-observacion" ref={contenedor}>
    <span ref={contenido} className="med-entrega-observacion__texto" title={recortado ? texto : undefined}>{texto || '—'}</span>
    {recortado && <button type="button" className="mov-iconBtn med-entrega-observacion__ver"
      title="Ver observación completa" aria-label="Ver observación completa"
      onClick={event => onVer(texto, event.currentTarget)}>
      <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
    </button>}
  </div>;
}

/** Entregas gratuitas de Tratamiento del dolor: no crean préstamos ni señas. */
export default function EntregasDolor() {
  const [query, setQuery] = useState('');
  const [queryAplicada, setQueryAplicada] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setQueryAplicada(query); }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);
  const loader = useCallback(() => api.entregas({ pagina: page, buscar: queryAplicada }), [page, queryAplicada]);
  const { registros, loading, error, cargar, total, pagina, por_pagina } = useMedicamentos(loader);
  const [modal, setModal] = useState(false);
  const [observacion, setObservacion] = useState(null);
  const botonObservacion = useRef(null);
  const cerrarObservacion = () => {
    setObservacion(null);
    botonObservacion.current?.focus();
  };
  const [medicamentos, setMedicamentos] = useState([]);
  const [editando, setEditando] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState(nuevo);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const feedbackId = useRef(0);
  const notificar = (type, message) => setFeedback({ type, message, id: ++feedbackId.current });
  const solicitud = useRef(0);
  const guardando = useRef(false);
  const write = canWrite();

  // En edición se conserva la cantidad original incluso si el stock libre es cero.
  const previos = new Map((editando?.items || []).map(i => [String(i.id_medicamento), Number(i.cantidad)]));
  const elegible = m => Number(m.activo) === 1 && vigenteParaEntrega(m.fecha_vencimiento) && PRESENTACIONES_SECTOR.DOLOR.includes(m.presentacion);
  const disponibles = medicamentos.filter(m => previos.has(String(m.id_medicamento)) || (elegible(m) && Number(m.stock_actual) > 0));
  const maximo = m => (previos.get(String(m.id_medicamento)) || 0) + (elegible(m) ? num(m.stock_actual) : 0);
  const reduceStock = [...previos].some(([id, cantidad]) => cantidad > (Number(form.items.find(i => String(i.id_medicamento) === id)?.cantidad) || 0));
  const cambiar = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));
  const cambiarFila = (i, cambios) => setForm(f => ({ ...f, stock_confirmado: false, items: f.items.map((r, k) => k === i ? { ...r, ...cambios } : r) }));

  const abrir = async (entrega = null) => {
    const token = ++solicitud.current;
    setFeedback(null); setEditando(entrega); setForm(entrega ? {
      ...nuevo(), paciente_nombre: entrega.paciente_nombre || '', paciente_dni: entrega.paciente_dni || '',
      nombre_receptor: entrega.nombre_receptor || '', apellido_receptor: entrega.apellido_receptor || '',
      dni_receptor: entrega.dni_receptor || '', celular_receptor: entrega.celular_receptor || '', observaciones: entrega.detalle || '',
      items: entrega.items.map(i => ({ id_medicamento: String(i.id_medicamento), cantidad: String(i.cantidad) })),
    } : nuevo()); setMedicamentos([]); setCargando(true); setModal(true);
    try {
      const datos = await api.catalogo();
      if (token !== solicitud.current) return;
      setMedicamentos(datos.registros || []);
    } catch (e) {
      if (token === solicitud.current) notificar('error', e.message || 'No se pudo consultar el stock.');
    } finally { if (token === solicitud.current) setCargando(false); }
  };
  const cerrar = () => {
    if (guardando.current) return;
    ++solicitud.current;
    setModal(false); setFeedback(null);
  };

  const opciones = [op('', 'Seleccionar tratamiento'), ...disponibles.map(m => op(m.id_medicamento,
    `${m.nombre_comercial} · ${m.presentacion} · ${maximo(m)} ${unidadStockPlural(m.unidad_stock, maximo(m))} ${editando ? 'máximo para corregir' : 'disponibles'}`))];
  const filasValidas = form.items.every(item => {
    const seleccionado = disponibles.find(m => String(m.id_medicamento) === String(item.id_medicamento));
    const cantidad = Number(item.cantidad);
    return seleccionado && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= maximo(seleccionado);
  });
  const sinDuplicados = new Set(form.items.map(item => String(item.id_medicamento))).size === form.items.length;
  const excedidos = form.items.filter(item => {
    const seleccionado = disponibles.find(m => String(m.id_medicamento) === String(item.id_medicamento));
    return seleccionado && Number(item.cantidad) > maximo(seleccionado);
  });
  // La validación de ambas pestañas se ejecuta únicamente al confirmar.
  const validarEntrega = () => {
    if (form.paciente_nombre.trim().length < 3) return 'Ingresá el nombre y apellido del paciente (mínimo 3 caracteres).';
    if (!dniValido(form.paciente_dni)) return 'Ingresá un DNI del paciente válido (5 a 20 caracteres).';
    if (form.nombre_receptor.trim().length < 2) return 'Ingresá el nombre de quien retira.';
    if (form.apellido_receptor.trim().length < 2) return 'Ingresá el apellido de quien retira.';
    if (!dniValido(form.dni_receptor)) return 'Ingresá un DNI de quien retira válido (5 a 20 caracteres).';
    if (!celularValido(form.celular_receptor)) return 'Ingresá un celular válido (6 a 20 números).';
    if (!disponibles.length) return 'No hay tratamientos activos con stock y vencimiento vigente.';
    if (!form.items.length || form.items.some(item => !item.id_medicamento)) return 'Seleccioná todos los tratamientos de la entrega.';
    if (!sinDuplicados) return 'No repitas el mismo tratamiento en la entrega.';
    if (excedidos.length) return 'La cantidad supera el stock disponible.';
    if (!filasValidas) return 'Ingresá una cantidad entera mayor a cero para cada tratamiento disponible.';
    if (editando && form.motivo_correccion.trim().length < 10) return 'Ingresá un motivo de corrección de al menos 10 caracteres.';
    if (reduceStock && !form.stock_confirmado) return 'Confirmá que las unidades que se reincorporan nunca salieron del stock físico.';
    return null;
  };

  const registrar = async event => {
    event.preventDefault();
    if (guardando.current || cargando) return;
    const mensaje = validarEntrega();
    if (mensaje) { notificar('warning', mensaje); return; }
    guardando.current = true; setSaving(true);
    try {
      // Una sola solicitud y una sola transacción para todos los tratamientos.
      await api.entregar({
        paciente_nombre: form.paciente_nombre.trim(), paciente_dni: normalizarDni(form.paciente_dni),
        nombre_receptor: form.nombre_receptor.trim(), apellido_receptor: form.apellido_receptor.trim(),
        dni_receptor: normalizarDni(form.dni_receptor), celular_receptor: form.celular_receptor.trim(),
        ...(editando ? { id_entrega: Number(editando.id_entrega), revision: Number(editando.revision), motivo_correccion: form.motivo_correccion.trim(), stock_confirmado: form.stock_confirmado } : {}),
        observaciones: form.observaciones.trim(),
        items: form.items.map(item => ({ id_medicamento: Number(item.id_medicamento), cantidad: Number(item.cantidad) })),
      });
      ++solicitud.current; setModal(false);
      notificar('success', editando ? 'Entrega corregida y stock actualizado.' : 'Entrega sin cargo registrada y stock actualizado.');
      await cargar({ silencioso: true });
    } catch (e) {
      notificar('error', e.message || 'No se pudo registrar la entrega.');
    } finally { guardando.current = false; setSaving(false); }
  };

  return <>
    <ModulePage className="med-entregas-page" title="Tratamiento del dolor · Entregas"
      description="Registro de entregas sin cargo y control de stock."
      filters={[{ type: 'search', label: 'Búsqueda', value: query, onChange: setQuery, placeholder: ' ' }]}
      primaryActionLabel="Registrar entrega" onPrimaryAction={() => abrir()} canCreate={write}>
      {error ? <p className="med-inline-danger" role="alert">{error}</p> : null}
      <GlobalDivTable ariaLabel="Entregas de Tratamiento del dolor" className="med-table"
        gridClassName="med-grid--entregas" loading={loading} empty={!loading && !error && !registros.length}
        skeletonActionColumn={write} columns={[{ label: 'Fecha', align: 'center' }, 'Tratamientos', 'Persona que retira', 'Modalidad', 'Observaciones', { label: 'Acciones', align: 'center' }]}>
        {registros.map(entrega => <div role="row" key={`${entrega.tipo_registro}-${entrega.id_registro}`}
          className="mov-gridTable mov-gridTable--row global-divTable__row med-grid--entregas">
          <div role="cell" className="mov-gridCell is-center">{fecha(entrega.fecha_movimiento)}</div>
          <div role="cell" className="mov-gridCell entity-main-cell med-entrega-items">
            {(entrega.items || []).map((item, i) => <span key={item.id_movimiento || i}>
              <strong>{item.nombre_comercial}</strong>
              <span className="med-cell-secondary">{[String(item.presentacion ?? '').trim(), `${item.cantidad} ${unidadStockPlural(item.unidad_stock, item.cantidad)}`].filter(Boolean).join(' · ')}</span>
            </span>)}
          </div>
          <div role="cell" className="mov-gridCell med-entrega-persona">
            <span>{entrega.receptor || 'No informado (histórico)'}</span>
            {entrega.paciente_nombre ? <span className="med-cell-secondary">Paciente: {entrega.paciente_nombre}</span> : null}
          </div>
          <div role="cell" className="mov-gridCell med-entrega-cobro is-right">
            {entrega.tipo_registro === 'COBRADA'
              ? <><strong>Cobro histórico: {dinero(entrega.importe)}</strong><span className="med-cell-secondary"> {entrega.medio_pago || '—'}</span></>
              : <span className="med-cell-secondary">{entrega.tipo_registro === 'GRATUITA' ? 'Sin cargo' : 'Sin cargo (histórico)'}</span>}
          </div>
          <div role="cell" className="mov-gridCell">
            <ObservacionEntrega detalle={entrega.detalle} onVer={(texto, boton) => {
              botonObservacion.current = boton;
              setObservacion(texto);
            }} />
          </div>
          <div role="cell" className="mov-gridCell is-center">
            {write && entrega.tipo_registro === 'GRATUITA' && entrega.revision ? <button type="button" className="mov-iconBtn" title="Editar entrega" aria-label="Editar entrega" onClick={() => abrir(entrega)}><FontAwesomeIcon icon={faPenToSquare} aria-hidden="true" /></button> : <span className="med-cell-secondary">—</span>}
          </div>
        </div>)}
      </GlobalDivTable>
      {!loading && !error && !registros.length ? <p className="med-empty">Todavía no hay entregas registradas para este sector.</p> : null}
      <GlobalPagination page={pagina} total={total} perPage={por_pagina} onPageChange={setPage} loading={loading} label="entregas" />
    </ModulePage>

    <CrudModal open={modal} wide title={<MedModalInfo icon={faHandHoldingMedical} info={[
        'La entrega descuenta los tratamientos del stock sin registrar ningún movimiento de dinero.',
        'Los datos del paciente y de quien retira se cargan a mano: no necesitan ser socios.',
      ]}>{editando ? 'Editar entrega · Tratamiento del dolor' : 'Registrar entrega · Tratamiento del dolor'}</MedModalInfo>} submitLabel={editando ? 'Guardar corrección' : 'Confirmar entrega'}
      modalClassName="med-modal med-loan-create-modal" saving={saving} loading={cargando} closeOnBackdrop={false}
      noValidate submitDisabled={cargando}
      onSubmit={registrar} onClose={cerrar}>
      <MedicamentosTabs disabled={saving} tabs={[{ label: 'Personas', icon: faUser }, { label: 'Tratamientos', icon: faPills }]}>
        <div className="med-loan-create__content">
          <section className="med-loan-create__card" aria-label="Datos del paciente">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faUser} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text"><h3>Datos del paciente</h3><p>No necesita ser socio.</p></div>
              <span className="med-loan-create__step">01 / 02</span>
            </div>
            <div className="med-loan-create__card-body"><div className="med-loan-form-grid"><Campos>
              <Campo label="Nombre y apellido del paciente" required maxLength={160} value={form.paciente_nombre} onChange={v => cambiar('paciente_nombre', v)} />
              <Campo label="DNI del paciente" required maxLength={20} value={form.paciente_dni} onChange={v => cambiar('paciente_dni', v)} />
            </Campos></div></div>
          </section>
          <section className="med-loan-create__card" aria-label="Datos de quien retira">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faIdCard} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text"><h3>Persona que retira</h3><p>Puede ser distinta del paciente.</p></div>
              <span className="med-loan-create__step">02 / 02</span>
            </div>
            <div className="med-loan-create__card-body">
              <div className="med-loan-form-grid"><Campos>
                <Campo label="Nombre de quien retira" required maxLength={160} value={form.nombre_receptor} onChange={v => cambiar('nombre_receptor', v)} />
                <Campo label="Apellido de quien retira" required maxLength={160} value={form.apellido_receptor} onChange={v => cambiar('apellido_receptor', v)} />
                <Campo label="DNI de quien retira" required maxLength={20} value={form.dni_receptor} onChange={v => cambiar('dni_receptor', v)} />
                <Campo label="Celular de contacto" type="tel" required maxLength={30} value={form.celular_receptor} onChange={v => cambiar('celular_receptor', v)} />
              </Campos></div>
            </div>
          </section>
        </div>
        <div className="med-loan-create__content">
          <section className="med-loan-create__card med-loan-create__card--medicines">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faPills} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text"><h3>Tratamientos entregados</h3><p>Elegí cada tratamiento e indicá la cantidad.</p></div>
              <span className="med-loan-create__count">{form.items.length} {form.items.length === 1 ? 'tratamiento' : 'tratamientos'}</span>
            </div>
            <div className="med-loan-create__card-body med-loan-create__card-body--medicines">
              <div className="med-loan-create__items">
                {form.items.map((item, i) => <div className={`med-loan-create__medicine-row${form.items.length > 1 ? ' has-remove' : ''}`} key={i}>
                  <span className="med-loan-create__medicine-number" aria-hidden="true">{i + 1}</span>
                  <Campo className="med-med-editor__select" label={`Tratamiento ${i + 1}`} required value={item.id_medicamento} options={opciones}
                    onChange={v => cambiarFila(i, { id_medicamento: v })} />
                  <Campo className="med-med-editor__quantity" label="Cantidad" quantity required type="number" min="1" step="1" value={item.cantidad}
                    onChange={v => cambiarFila(i, { cantidad: v })} />
                  {form.items.length > 1 ? <button className="med-med-editor__remove" type="button" title={`Quitar tratamiento ${i + 1}`} aria-label={`Quitar tratamiento ${i + 1}`}
                    onClick={() => setForm(f => ({ ...f, stock_confirmado: false, items: f.items.filter((_, k) => k !== i) }))}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button> : null}
                </div>)}
              </div>
              <button type="button" className="med-loan-create__add" disabled={form.items.length >= 30 || form.items.length >= disponibles.length}
                onClick={() => setForm(f => ({ ...f, items: [...f.items, nuevaFila()] }))}>
                <FontAwesomeIcon icon={faPlus} aria-hidden="true" /> Agregar otro tratamiento
              </button>
            </div>
          </section>
          <section className="med-loan-create__notes">
            <div className="med-loan-create__notes-heading">
              <span><FontAwesomeIcon icon={faCommentDots} aria-hidden="true" /> Información adicional</span>
              <small>Opcional</small>
            </div>
            <Campo label="Observaciones" wide textarea maxLength={450} value={form.observaciones} onChange={v => cambiar('observaciones', v)} />
            {editando && <>
              <Campo label="Motivo de corrección" required wide textarea maxLength={300} value={form.motivo_correccion} onChange={v => cambiar('motivo_correccion', v)} />
              {reduceStock && <label className="med-inline-note"><input type="checkbox" checked={form.stock_confirmado} onChange={e => cambiar('stock_confirmado', e.target.checked)} /> Confirmo que las unidades que se reincorporan nunca salieron del stock físico. No es una devolución de medicamentos usados.</label>}
            </>}
          </section>
        </div>
      </MedicamentosTabs>
    </CrudModal>
    <CrudModal open={observacion !== null} title="Observación de la entrega"
      modalClassName="med-modal med-entrega-observacion-modal" hideSubmit cancelLabel="Cerrar"
      closeOnBackdrop={false} onClose={cerrarObservacion}>
      <p className="med-entrega-observacion__completa">{observacion}</p>
    </CrudModal>
    {feedback ? <Toast key={feedback.id} tipo={feedback.type} mensaje={feedback.message}
      duracion={2800} cerrarConInteraccion={false} onClose={() => setFeedback(actual => actual?.id === feedback.id ? null : actual)} /> : null}
  </>;
}
