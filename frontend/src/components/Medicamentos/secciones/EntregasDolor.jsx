import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faIdCard, faMoneyBill, faPills, faPlus, faXmark, faCommentDots, faHandHoldingMedical } from '@fortawesome/free-solid-svg-icons';
import { ModulePage } from '../../Global/ModulePage';
import GlobalDivTable from '../../Global/GlobalDivTable';
import GlobalPagination from '../../Global/GlobalPagination';
import CrudModal from '../../Global/Modales/CrudModal';
import ModuleFeedback from '../../Global/ModuleFeedback';
import { canWrite } from '../../_shared/auth/session';
import { medicamentosApi as api } from '../api/medicamentosApi';
import { useMedicamentos } from '../hooks/useMedicamentos';
import { Campos, Campo, op } from '../modales/CamposMedicamentos';
import MedicamentosTabs from '../modales/MedicamentosTabs';
import MedModalInfo from '../modales/MedModalInfo';
import { fecha, dinero, num, vigenteParaEntrega, unidadStockPlural } from '../utils/medicamentosUtils';
import { PRESENTACIONES_SECTOR, normalizarMedio } from '../utils/medicamentosSelectores';
import '../Medicamentos.css';

// Trello: "Entrega: igual que préstamos, pero sí se cobra; medio de pago transferencia o efectivo".
const MEDIOS_ENTREGA = ['EFECTIVO', 'TRANSFERENCIA'];
const nuevaFila = () => ({ id_medicamento: '', cantidad: '' });
const nuevo = () => ({
  paciente_nombre: '', paciente_dni: '',
  nombre_receptor: '', apellido_receptor: '', dni_receptor: '', celular_receptor: '',
  importe: '', id_medio_pago: '', observaciones: '', items: [nuevaFila()],
});
// Mismas reglas de texto que Préstamos y que el backend.
const normalizarDni = v => String(v || '').replace(/[\s.]+/g, '').toUpperCase();
const dniValido = v => /^[A-Z0-9-]{5,20}$/.test(normalizarDni(v));
const celularValido = v => {
  const t = String(v || '').trim();
  const digitos = t.replace(/\D/g, '').length;
  return t.length <= 30 && /^\+?[0-9()\s-]+$/.test(t) && digitos >= 6 && digitos <= 20;
};
const importeValido = v => /^\d{1,10}(?:\.\d{1,2})?$/.test(String(v ?? '').trim()) && num(v) > 0;

/** Entregas definitivas y cobradas de Tratamiento del dolor: no crean préstamos ni señas. */
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
  const [medicamentos, setMedicamentos] = useState([]);
  const [medios, setMedios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [form, setForm] = useState(nuevo);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const solicitud = useRef(0);
  const guardando = useRef(false);
  const write = canWrite();

  // Mismo catálogo que Tratamiento del dolor → Stock: activos, con stock y vencimiento vigente.
  const disponibles = medicamentos.filter(m => Number(m.activo) === 1 && Number(m.stock_actual) > 0 &&
    vigenteParaEntrega(m.fecha_vencimiento) && PRESENTACIONES_SECTOR.DOLOR.includes(m.presentacion));
  const mediosEntrega = medios.filter(m => MEDIOS_ENTREGA.includes(normalizarMedio(m.nombre)));
  const cambiar = (campo, valor) => setForm(actual => ({ ...actual, [campo]: valor }));
  const cambiarFila = (i, cambios) => setForm(f => ({ ...f, items: f.items.map((r, k) => k === i ? { ...r, ...cambios } : r) }));

  const abrir = async () => {
    const token = ++solicitud.current;
    setForm(nuevo()); setMedicamentos([]); setCargando(true); setModal(true);
    try {
      const [datos, mediosPago] = await Promise.all([api.catalogo(), api.medios()]);
      if (token !== solicitud.current) return;
      setMedicamentos(datos.registros || []);
      const lista = mediosPago.registros || [];
      setMedios(lista);
      const efectivo = lista.find(m => normalizarMedio(m.nombre) === 'EFECTIVO');
      if (efectivo) setForm(f => (f.id_medio_pago ? f : { ...f, id_medio_pago: String(efectivo.id_medio_pago) }));
    } catch (e) {
      if (token === solicitud.current) setFeedback({ type: 'error', message: e.message || 'No se pudo consultar el stock.' });
    } finally { if (token === solicitud.current) setCargando(false); }
  };
  const cerrar = () => {
    if (guardando.current) return;
    ++solicitud.current;
    setModal(false);
  };

  const opciones = [op('', 'Seleccionar tratamiento'), ...disponibles.map(m => op(m.id_medicamento,
    `${m.nombre_comercial} · ${m.presentacion} · ${m.stock_actual} ${unidadStockPlural(m.unidad_stock, m.stock_actual)} disponibles`))];
  const filasValidas = form.items.every(item => {
    const seleccionado = disponibles.find(m => String(m.id_medicamento) === String(item.id_medicamento));
    const cantidad = Number(item.cantidad);
    return seleccionado && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= num(seleccionado.stock_actual);
  });
  const sinDuplicados = new Set(form.items.map(item => String(item.id_medicamento))).size === form.items.length;
  const excedidos = form.items.filter(item => {
    const seleccionado = disponibles.find(m => String(m.id_medicamento) === String(item.id_medicamento));
    return seleccionado && Number(item.cantidad) > num(seleccionado.stock_actual);
  });
  const erroresPersona = [
    form.paciente_dni.trim() && !dniValido(form.paciente_dni) ? 'El DNI del paciente debe tener entre 5 y 20 caracteres (números, letras o guiones).' : null,
    form.dni_receptor.trim() && !dniValido(form.dni_receptor) ? 'El DNI de quien retira debe tener entre 5 y 20 caracteres (números, letras o guiones).' : null,
    form.celular_receptor.trim() && !celularValido(form.celular_receptor) ? 'El celular debe tener entre 6 y 20 números (se admiten +, espacios, guiones y paréntesis).' : null,
    String(form.importe).trim() && !importeValido(form.importe) ? 'Ingresá un importe mayor que cero, con hasta dos decimales.' : null,
  ].filter(Boolean);
  const personasValidas = form.paciente_nombre.trim().length >= 3 && dniValido(form.paciente_dni)
    && form.nombre_receptor.trim().length >= 2 && form.apellido_receptor.trim().length >= 2
    && dniValido(form.dni_receptor) && celularValido(form.celular_receptor);
  const cobroValido = importeValido(form.importe) && mediosEntrega.some(m => String(m.id_medio_pago) === String(form.id_medio_pago));

  const registrar = async event => {
    event.preventDefault();
    if (guardando.current || !personasValidas || !cobroValido || !filasValidas || !sinDuplicados) return;
    guardando.current = true; setSaving(true);
    try {
      // Una sola solicitud y una sola transacción para todos los tratamientos.
      await api.entregar({
        paciente_nombre: form.paciente_nombre.trim(), paciente_dni: normalizarDni(form.paciente_dni),
        nombre_receptor: form.nombre_receptor.trim(), apellido_receptor: form.apellido_receptor.trim(),
        dni_receptor: normalizarDni(form.dni_receptor), celular_receptor: form.celular_receptor.trim(),
        importe: String(form.importe).trim(), id_medio_pago: Number(form.id_medio_pago),
        observaciones: form.observaciones.trim(),
        items: form.items.map(item => ({ id_medicamento: Number(item.id_medicamento), cantidad: Number(item.cantidad) })),
      });
      ++solicitud.current; setModal(false);
      setFeedback({ type: 'success', message: 'Entrega registrada: cobro contabilizado y stock actualizado.' });
      await cargar({ silencioso: true });
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'No se pudo registrar la entrega.' });
    } finally { guardando.current = false; setSaving(false); }
  };

  return <>
    <ModulePage title="Tratamiento del dolor · Entregas"
      description="Entregas cobradas, registradas directamente contra el stock de Tratamiento del dolor. No son préstamos."
      filters={[{ type: 'search', label: 'Búsqueda', value: query, onChange: setQuery, placeholder: ' ' }]}
      primaryActionLabel="Registrar entrega" onPrimaryAction={abrir} canCreate={write}>
      {error ? <p className="med-inline-danger" role="alert">{error}</p> : null}
      <GlobalDivTable ariaLabel="Entregas de Tratamiento del dolor" className="med-table"
        gridClassName="med-grid--entregas" loading={loading} empty={!loading && !error && !registros.length}
        skeletonActionColumn={false} columns={['Fecha', 'Tratamientos', 'Persona que retira', 'Cobro', 'Observaciones']}>
        {registros.map(entrega => <div role="row" key={`${entrega.tipo_registro}-${entrega.id_registro}`}
          className="mov-gridTable mov-gridTable--row global-divTable__row med-grid--entregas">
          <div role="cell" className="mov-gridCell">{fecha(entrega.fecha_movimiento)}</div>
          <div role="cell" className="mov-gridCell entity-main-cell med-entrega-items">
            {(entrega.items || []).map((item, i) => <span key={item.id_movimiento || i}>
              <strong>{item.nombre_comercial}</strong>
              <span className="med-cell-secondary"> · {item.presentacion} · {item.cantidad} {unidadStockPlural(item.unidad_stock, item.cantidad)}</span>
            </span>)}
          </div>
          <div role="cell" className="mov-gridCell med-entrega-persona">
            <span>{entrega.receptor || 'No informado (histórico)'}</span>
            {entrega.paciente_nombre ? <span className="med-cell-secondary">Paciente: {entrega.paciente_nombre}</span> : null}
          </div>
          <div role="cell" className="mov-gridCell">
            {entrega.tipo_registro === 'COBRADA'
              ? <><strong>{dinero(entrega.importe)}</strong><span className="med-cell-secondary"> · {entrega.medio_pago || '—'}</span></>
              : <span className="med-cell-secondary">Sin cargo (histórico)</span>}
          </div>
          <div role="cell" className="mov-gridCell">{entrega.detalle || '—'}</div>
        </div>)}
      </GlobalDivTable>
      {!loading && !error && !registros.length ? <p className="med-empty">Todavía no hay entregas registradas para este sector.</p> : null}
      <GlobalPagination page={pagina} total={total} perPage={por_pagina} onPageChange={setPage} loading={loading} label="entregas" />
    </ModulePage>

    <CrudModal open={modal} wide title={<MedModalInfo icon={faHandHoldingMedical} info={[
        'La entrega descuenta los tratamientos del stock y registra un solo cobro por el importe total.',
        'Los datos del paciente y de quien retira se cargan a mano: no necesitan ser socios.',
      ]}>Registrar entrega · Tratamiento del dolor</MedModalInfo>} submitLabel="Confirmar entrega"
      modalClassName="med-modal med-loan-create-modal" saving={saving} loading={cargando} closeOnBackdrop={false}
      submitDisabled={cargando || !personasValidas || !cobroValido || !filasValidas || !sinDuplicados}
      onSubmit={registrar} onClose={cerrar}>
      <MedicamentosTabs disabled={saving} tabs={[{ label: 'Personas y pago', icon: faUser }, { label: 'Tratamientos', icon: faPills }]}>
        <div className="med-loan-create__content">
          <section className="med-loan-create__card" aria-label="Datos del paciente">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faUser} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text"><h3>Datos del paciente</h3><p>No necesita ser socio.</p></div>
              <span className="med-loan-create__step">01 / 03</span>
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
              <span className="med-loan-create__step">02 / 03</span>
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
          <section className="med-loan-create__card" aria-label="Datos del cobro">
            <div className="med-loan-create__card-heading">
              <span className="med-loan-create__heading-icon"><FontAwesomeIcon icon={faMoneyBill} aria-hidden="true" /></span>
              <div className="med-loan-create__heading-text"><h3>Cobro</h3><p>Importe total de la entrega, en efectivo o por transferencia.</p></div>
              <span className="med-loan-create__step">03 / 03</span>
            </div>
            <div className="med-loan-create__card-body">
              <div className="med-loan-form-grid"><Campos>
                <Campo label="Importe total ($)" type="number" money required min="0.01" step="0.01" value={form.importe} onChange={v => cambiar('importe', v)} />
                <Campo label="Medio de pago" required value={form.id_medio_pago}
                  options={[op('', 'Seleccionar medio'), ...mediosEntrega.map(m => op(m.id_medio_pago, m.nombre))]}
                  onChange={v => cambiar('id_medio_pago', v)} />
              </Campos></div>
              {!cargando && mediosEntrega.length < MEDIOS_ENTREGA.length ? <p className="med-inline-danger" role="alert">
                Falta el medio {MEDIOS_ENTREGA.filter(n => !mediosEntrega.some(m => normalizarMedio(m.nombre) === n)).join(' y ')} activo. Revisá Configuración o ejecutá el SQL incluido en el ZIP.</p> : null}
              {erroresPersona.map(mensaje => <p className="med-inline-danger med-loan-field-error" role="alert" key={mensaje}>{mensaje}</p>)}
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
              {!cargando && !disponibles.length ? <p className="med-inline-danger" role="alert">No hay tratamientos activos con stock y vencimiento vigente. Revisá Tratamiento del dolor → Stock.</p> : null}
              <div className="med-loan-create__items">
                {form.items.map((item, i) => <div className={`med-loan-create__medicine-row${form.items.length > 1 ? ' has-remove' : ''}`} key={i}>
                  <span className="med-loan-create__medicine-number" aria-hidden="true">{i + 1}</span>
                  <Campo className="med-med-editor__select" label={`Tratamiento ${i + 1}`} required value={item.id_medicamento} options={opciones}
                    onChange={v => cambiarFila(i, { id_medicamento: v })} />
                  <Campo className="med-med-editor__quantity" label="Cantidad" quantity required type="number" min="1" step="1" value={item.cantidad}
                    onChange={v => cambiarFila(i, { cantidad: v })} />
                  {form.items.length > 1 ? <button className="med-med-editor__remove" type="button" title={`Quitar tratamiento ${i + 1}`} aria-label={`Quitar tratamiento ${i + 1}`}
                    onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, k) => k !== i) }))}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></button> : null}
                </div>)}
              </div>
              {!sinDuplicados && form.items.every(item => item.id_medicamento) ? <p className="med-inline-danger" role="status">No repitas el mismo tratamiento en la entrega.</p> : null}
              {excedidos.length ? <p className="med-inline-danger" role="status">La cantidad supera el stock disponible.</p> : null}
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
          </section>
        </div>
      </MedicamentosTabs>
    </CrudModal>
    {feedback ? <ModuleFeedback {...feedback} onClose={() => setFeedback(null)} /> : null}
  </>;
}
