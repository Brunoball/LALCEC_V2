import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faAddressBook,
  faCalendarDays,
  faCircleInfo,
  faClockRotateLeft,
  faHouse,
  faPen,
  faRotateLeft,
  faUser,
  faUserSlash,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { ModulePage } from "../../Global/ModulePage";
import GlobalDivTable from "../../Global/GlobalDivTable";
import CrudModal from "../../Global/Modales/CrudModal";
import InfoModal, {
  InfoEmpty,
  InfoRow,
  InfoSection,
  InfoSummary,
} from "../../Global/Modales/InfoModal";
import ModalEliminarGlobal from "../../Global/Modales/ModalEliminarGlobal";
import ModuleFeedback from "../../Global/ModuleFeedback";
import {
  EntityFormPanel,
  EntityTabs,
  FloatingField,
} from "../../Global/Formularios/TabbedForm";
import { canWrite } from "../../_shared/auth/session";
import { familiasApi } from "../api/sociosApi";
import { useFamilias } from "../hooks/useFamilias";
import "./Familias.css";
import "../modales/FamiliasModal.css";

const FORM_TAB_DETAILS = "datos";
const FORM_TAB_MEMBERS = "integrantes";
const INFO_TAB_CURRENT = "actual";
const INFO_TAB_HISTORY = "historial";
const PARTNER_STATUS_STORAGE_KEY = "lalcec_socios_estado_seleccionado";

function readSharedFamilyStatus() {
  if (typeof window === "undefined") return "activo";
  try {
    return window.sessionStorage.getItem(PARTNER_STATUS_STORAGE_KEY) ===
      "INACTIVO"
      ? "inactivo"
      : "activo";
  } catch (_error) {
    return "activo";
  }
}

function saveSharedFamilyStatus(value) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PARTNER_STATUS_STORAGE_KEY,
      value === "inactivo" ? "INACTIVO" : "ACTIVO",
    );
  } catch (_error) {
    // La navegación sigue funcionando aunque el almacenamiento esté bloqueado.
  }
}

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
const upper = (value) => String(value || "").toLocaleUpperCase("es-AR");
const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";

function emptyForm() {
  return {
    id_familia: "",
    nombre: "",
    descripcion: "",
    integrantes: [],
    integrantes_originales: [],
    fecha_desvinculacion: today(),
    motivo_desvinculacion: "",
  };
}

function memberFromCatalog(person) {
  return {
    id_socio: Number(person.id_socio),
    apellido: person.apellido || "",
    nombre: person.nombre || "",
    dni: person.dni || "",
    categoria: person.categoria || "",
    parentesco: person.parentesco || "",
    es_titular: Boolean(person.es_titular),
    observaciones: person.observaciones || "",
    fecha_incorporacion: person.fecha_incorporacion || today(),
    activo: person.activo !== false,
  };
}

function FamilyForm({ form, setForm, catalog, activeTab, onTabChange }) {
  const [memberSearch, setMemberSearch] = useState("");
  const selectedIds = useMemo(
    () => new Set(form.integrantes.map((member) => Number(member.id_socio))),
    [form.integrantes],
  );
  const visible = useMemo(() => {
    const term = memberSearch.trim().toLocaleLowerCase("es-AR");
    return (catalog || []).filter((person) => {
      if (!term) return true;
      return [person.apellido, person.nombre, person.dni, person.categoria]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("es-AR")
        .includes(term);
    });
  }, [catalog, memberSearch]);

  const toggleMember = (person) => {
    const id = Number(person.id_socio);
    setForm((current) => {
      const exists = current.integrantes.some(
        (member) => Number(member.id_socio) === id,
      );
      if (exists) {
        return {
          ...current,
          integrantes: current.integrantes.filter(
            (member) => Number(member.id_socio) !== id,
          ),
        };
      }
      return {
        ...current,
        integrantes: [...current.integrantes, memberFromCatalog(person)],
      };
    });
  };

  const updateMember = (id, key, value) => {
    setForm((current) => ({
      ...current,
      integrantes: current.integrantes.map((member) =>
        Number(member.id_socio) === Number(id)
          ? { ...member, [key]: value }
          : key === "es_titular" && value
            ? { ...member, es_titular: false }
            : member,
      ),
    }));
  };

  const removedCount = form.integrantes_originales.filter(
    (id) => !selectedIds.has(Number(id)),
  ).length;

  return (
    <div className="entity-form familias-modal__form">
      <EntityTabs
        tabs={[
          {
            value: FORM_TAB_DETAILS,
            label: "Datos de la familia",
            icon: faHouse,
          },
          {
            value: FORM_TAB_MEMBERS,
            label: "Integrantes",
            icon: faUsers,
            badge: form.integrantes.length || null,
          },
        ]}
        value={activeTab}
        onChange={onTabChange}
        idPrefix="familia-form-tab"
        ariaLabel="Secciones de la familia"
      />

      {activeTab === FORM_TAB_DETAILS ? (
        <EntityFormPanel
          tabValue={FORM_TAB_DETAILS}
          idPrefix="familia-form-tab"
          eyebrow="Ficha principal"
          title="Identificación del grupo"
          icon={faAddressBook}
          tag="Nombre obligatorio"
          bodyClassName="familias-form-panel__body--details"
        >
          <FloatingField
            label="Nombre de la familia *"
            active={Boolean(form.nombre)}
          >
            <input
              value={form.nombre}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  nombre: upper(event.target.value),
                }))
              }
              maxLength={150}
              placeholder=" "
              autoFocus
            />
          </FloatingField>
          <FloatingField
            label="Descripción"
            active={Boolean(form.descripcion)}
            textarea
          >
            <textarea
              value={form.descripcion}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  descripcion: upper(event.target.value),
                }))
              }
              rows={3}
              maxLength={500}
              placeholder=" "
            />
          </FloatingField>
          <div className="familias-form-note">
            <FontAwesomeIcon icon={faCircleInfo} />
            <span>
              Las empresas no pueden integrar familias. Cada persona puede tener
              un solo vínculo familiar activo.
            </span>
          </div>
        </EntityFormPanel>
      ) : (
        <EntityFormPanel
          tabValue={FORM_TAB_MEMBERS}
          idPrefix="familia-form-tab"
          eyebrow="Composición del grupo"
          title="Integrantes activos"
          icon={faUsers}
          tag={`${form.integrantes.length} integrante${form.integrantes.length === 1 ? "" : "s"}`}
          bodyClassName="familias-form-panel__body--members"
        >
          <FloatingField
            label="Buscar socio por nombre, DNI o categoría"
            active={Boolean(memberSearch)}
            className="familias-modal__member-search"
          >
            <input
              type="search"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder=" "
            />
          </FloatingField>

          <fieldset className="entity-checks familias-modal__members">
            <legend>
              <FontAwesomeIcon icon={faUsers} /> Socios disponibles
            </legend>
            <div className="familias-modal__member-list">
              {visible.map((person) => {
                const selected = selectedIds.has(Number(person.id_socio));
                const belongsElsewhere =
                  person.familia_activa &&
                  person.id_familia &&
                  Number(person.id_familia) !== Number(form.id_familia || 0);
                const disabled = Boolean(
                  belongsElsewhere || (!person.activo && !selected),
                );
                return (
                  <label
                    className={`entity-check-option familias-modal__member ${selected ? "is-selected" : ""}`.trim()}
                    key={person.id_socio}
                    title={
                      belongsElsewhere
                        ? `Pertenece a ${person.familia}`
                        : !person.activo
                          ? "Socio dado de baja"
                          : ""
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleMember(person)}
                    />
                    <span className="familias-modal__member-copy">
                      <strong>
                        {person.apellido}, {person.nombre}
                      </strong>
                      <small>
                        DNI {person.dni || "—"}
                        {person.categoria ? ` · ${person.categoria}` : ""}
                        {belongsElsewhere ? ` · ${person.familia}` : ""}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!visible.length ? (
                <div className="familias-modal__empty">
                  <strong>Sin resultados</strong>
                  <span>No hay socios que coincidan con la búsqueda.</span>
                </div>
              ) : null}
            </div>
          </fieldset>

          {form.integrantes.length ? (
            <div className="familias-selected-members">
              <header>
                <strong>Configuración de integrantes</strong>
                <span>Elegí parentesco, titular y fecha de incorporación.</span>
              </header>
              <div className="familias-selected-members__list">
                {form.integrantes.map((member) => (
                  <article
                    className={`familias-selected-member ${member.es_titular ? "is-holder" : ""}`}
                    key={member.id_socio}
                  >
                    <div className="familias-selected-member__identity">
                      <strong>
                        {member.apellido}, {member.nombre}
                      </strong>
                      <small>DNI {member.dni || "—"}</small>
                    </div>
                    <label className="familias-holder-toggle">
                      <input
                        type="radio"
                        name="titular-familia"
                        checked={Boolean(member.es_titular)}
                        onChange={() =>
                          updateMember(member.id_socio, "es_titular", true)
                        }
                      />
                      <span>Titular</span>
                    </label>
                    <input
                      className="familias-member-input"
                      value={member.parentesco || ""}
                      onChange={(event) =>
                        updateMember(
                          member.id_socio,
                          "parentesco",
                          upper(event.target.value),
                        )
                      }
                      maxLength={50}
                      placeholder="Parentesco"
                    />
                    <input
                      className="familias-member-input"
                      type="date"
                      value={member.fecha_incorporacion || today()}
                      max={today()}
                      onChange={(event) =>
                        updateMember(
                          member.id_socio,
                          "fecha_incorporacion",
                          event.target.value,
                        )
                      }
                    />
                    <input
                      className="familias-member-input familias-member-input--observation"
                      value={member.observaciones || ""}
                      onChange={(event) =>
                        updateMember(
                          member.id_socio,
                          "observaciones",
                          upper(event.target.value),
                        )
                      }
                      maxLength={500}
                      placeholder="Observaciones"
                    />
                    <button
                      type="button"
                      className="familias-member-remove"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          integrantes: current.integrantes.filter(
                            (entry) =>
                              Number(entry.id_socio) !==
                              Number(member.id_socio),
                          ),
                        }))
                      }
                    >
                      Quitar
                    </button>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {removedCount > 0 ? (
            <div className="familias-unlink-panel">
              <strong>
                {removedCount} integrante
                {removedCount === 1 ? " será" : "s serán"} desvinculado
                {removedCount === 1 ? "" : "s"}
              </strong>
              <p>
                La relación no se elimina: se cierra el período y queda
                disponible en el historial.
              </p>
              <div className="entity-form__grid">
                <FloatingField label="Fecha de desvinculación *" active>
                  <input
                    type="date"
                    value={form.fecha_desvinculacion}
                    max={today()}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        fecha_desvinculacion: event.target.value,
                      }))
                    }
                  />
                </FloatingField>
                <FloatingField
                  label="Motivo de desvinculación *"
                  active={Boolean(form.motivo_desvinculacion)}
                >
                  <input
                    value={form.motivo_desvinculacion}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        motivo_desvinculacion: upper(event.target.value),
                      }))
                    }
                    maxLength={500}
                    placeholder=" "
                  />
                </FloatingField>
              </div>
            </div>
          ) : null}
        </EntityFormPanel>
      )}
    </div>
  );
}

function formFromFamily(item) {
  const members = (item.integrantes || []).map((member) => ({
    ...memberFromCatalog(member),
    observaciones: member.observaciones || "",
  }));
  return {
    id_familia: item.id_familia,
    nombre: item.nombre || "",
    descripcion: item.descripcion || "",
    integrantes: members,
    integrantes_originales: members.map((member) => member.id_socio),
    fecha_desvinculacion: today(),
    motivo_desvinculacion: "",
  };
}

export default function Familias() {
  const writable = canWrite();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(readSharedFamilyStatus);
  const filters = useMemo(
    () => ({ buscar: search, estado: status }),
    [search, status],
  );
  const { items, catalogos, loading, error, cargar } = useFamilias(filters);
  const [form, setForm] = useState(emptyForm);
  const [formTab, setFormTab] = useState(FORM_TAB_DETAILS);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stateModal, setStateModal] = useState(null);
  const [stateDate, setStateDate] = useState(today());
  const [detailModal, setDetailModal] = useState(null);
  const [detailTab, setDetailTab] = useState(INFO_TAB_CURRENT);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const openNew = () => {
    setForm(emptyForm());
    setFormTab(FORM_TAB_DETAILS);
    setModalOpen(true);
  };
  const openEdit = async (item) => {
    try {
      const response = await familiasApi.obtener(item.id_familia);
      setForm(formFromFamily(response.item || item));
      setFormTab(FORM_TAB_DETAILS);
      setModalOpen(true);
    } catch (requestError) {
      setFeedback({ type: "error", message: requestError.message });
    }
  };
  const save = async (event) => {
    event.preventDefault();
    if (!form.nombre.trim()) {
      setFormTab(FORM_TAB_DETAILS);
      setFeedback({
        type: "error",
        message: "Completá el nombre de la familia.",
      });
      return;
    }
    if (!form.integrantes.length) {
      setFormTab(FORM_TAB_MEMBERS);
      setFeedback({
        type: "error",
        message: "Seleccioná al menos un integrante para la familia.",
      });
      return;
    }
    const selected = new Set(
      form.integrantes.map((member) => Number(member.id_socio)),
    );
    const removed = form.integrantes_originales.filter(
      (id) => !selected.has(Number(id)),
    );
    if (removed.length && !form.motivo_desvinculacion.trim()) {
      setFormTab(FORM_TAB_MEMBERS);
      setFeedback({
        type: "error",
        message:
          "Indicá el motivo de desvinculación de los integrantes quitados.",
      });
      return;
    }

    setSaving(true);
    try {
      const response = await familiasApi.guardar({
        id_familia: form.id_familia || null,
        nombre: form.nombre,
        descripcion: form.descripcion,
        integrantes: form.integrantes.map((member) => ({
          id_socio: member.id_socio,
          parentesco: member.parentesco,
          es_titular: member.es_titular,
          observaciones: member.observaciones,
          fecha_incorporacion: member.fecha_incorporacion,
        })),
        fecha_desvinculacion: form.fecha_desvinculacion,
        motivo_desvinculacion: form.motivo_desvinculacion,
      });
      setModalOpen(false);
      setFeedback({ type: "success", message: response.mensaje });
      await cargar();
    } catch (requestError) {
      setFeedback({ type: "error", message: requestError.message });
    } finally {
      setSaving(false);
    }
  };
  const openDetail = async (item) => {
    setDetailModal({ item, data: null, error: "" });
    setDetailTab(INFO_TAB_CURRENT);
    setDetailLoading(true);
    try {
      const response = await familiasApi.obtener(item.id_familia);
      setDetailModal({ item, data: response.item, error: "" });
    } catch (requestError) {
      setDetailModal({ item, data: null, error: requestError.message });
    } finally {
      setDetailLoading(false);
    }
  };
  const changeState = async ({ motivo }) => {
    if (!stateModal) return null;
    const response = stateModal.activo
      ? await familiasApi.darBaja({
          id: stateModal.id_familia,
          fecha_baja: stateDate,
          motivo_baja: motivo,
        })
      : await familiasApi.reactivar(stateModal.id_familia);
    await cargar();
    return response;
  };

  const filtersUi = [
    {
      key: "estado",
      label: "Estado",
      type: "tabs",
      ariaLabel: "Estado de las familias",
      value: status,
      onChange: (value) => {
        saveSharedFamilyStatus(value);
        setStatus(value);
      },
      options: [
        { value: "activo", label: "Activas" },
        { value: "inactivo", label: "Bajas" },
      ],
    },
    {
      key: "buscar",
      label: "Búsqueda",
      type: "search",
      placeholder: " ",
      value: search,
      onChange: setSearch,
    },
  ];

  return (
    <>
      <ModulePage
        title="Familias"
        filters={filtersUi}
        tabsInTitle
        primaryActionLabel="Nueva familia"
        onPrimaryAction={openNew}
        canCreate={writable}
        notice={
          !writable
            ? "Tu usuario tiene permiso de consulta. Las modificaciones están deshabilitadas."
            : null
        }
      >
        <ModuleFeedback
          type={feedback?.type || "error"}
          message={feedback?.message || error}
          duration={feedback?.duration}
          onClose={() => setFeedback(null)}
        />
        <GlobalDivTable
          className="familias-table"
          bodyClassName="entity-table-wrap"
          gridClassName="familias-grid"
          ariaLabel="Listado de familias"
          loading={loading}
          loadingLabel="Cargando familias..."
          skeletonRows={6}
          columns={[
            "Familia",
            "Descripción",
            "Titular",
            "Integrantes",
            "Estado",
            "Acciones",
          ]}
        >
          {!loading && !error && !items.length ? (
            <div className="module-empty">
              <strong>Sin familias para mostrar</strong>
              <span>Creá la primera familia o cambiá los filtros.</span>
            </div>
          ) : null}
          {items.map((item) => (
            <div
              className="mov-gridTable mov-gridTable--row global-divTable__row entity-table-row familias-grid"
              role="row"
              key={item.id_familia}
            >
              <div className="mov-gridCell entity-main-cell">
                <strong>{item.nombre}</strong>
                <small>ID {item.id_familia}</small>
              </div>
              <div className="mov-gridCell">
                <span className="entity-wrap-text">
                  {item.descripcion || "—"}
                </span>
              </div>
              <div className="mov-gridCell">
                {item.titular || "SIN TITULAR"}
              </div>
              <div className="mov-gridCell is-strong">
                {Number(item.cantidad_integrantes || 0)}
              </div>
              <div className="mov-gridCell">
                <span
                  className={`mov-chip ${item.activo ? "mov-chip--ok" : "mov-chip--danger"}`}
                >
                  {item.activo ? "ACTIVA" : "BAJA"}
                </span>
              </div>
              <div className="mov-gridCell mov-gridCell--actions">
                <div className="mov-actionsInline">
                  <button
                    className="mov-iconBtn"
                    type="button"
                    title="Ver integrantes e historial"
                    onClick={() => openDetail(item)}
                  >
                    <FontAwesomeIcon icon={faCircleInfo} />
                  </button>
                  {writable ? (
                    <>
                      {item.activo ? (
                        <button
                          className="mov-iconBtn"
                          type="button"
                          title="Editar"
                          onClick={() => openEdit(item)}
                        >
                          <FontAwesomeIcon icon={faPen} />
                        </button>
                      ) : null}
                      <button
                        className={`mov-iconBtn ${item.activo ? "mov-iconBtn--danger" : ""}`}
                        type="button"
                        title={item.activo ? "Dar de baja" : "Reactivar"}
                        onClick={() => {
                          setStateDate(today());
                          setStateModal(item);
                        }}
                      >
                        <FontAwesomeIcon
                          icon={item.activo ? faUserSlash : faRotateLeft}
                        />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </GlobalDivTable>
      </ModulePage>

      <CrudModal
        open={modalOpen}
        title={form.id_familia ? "Editar familia" : "Nueva familia"}
        subtitle="Los integrantes se vinculan de forma histórica; quitar uno cierra su período sin borrar datos."
        onClose={() => setModalOpen(false)}
        onSubmit={save}
        saving={saving}
        submitLabel={form.id_familia ? "Guardar cambios" : "Crear familia"}
        modalClassName="familias-modal familias-modal--form"
        wide
      >
        <FamilyForm
          form={form}
          setForm={setForm}
          catalog={catalogos.socios || []}
          activeTab={formTab}
          onTabChange={setFormTab}
        />
      </CrudModal>

      <InfoModal
        open={Boolean(detailModal)}
        title="Ficha de la familia"
        subtitle={detailModal?.item?.nombre || ""}
        onClose={() => setDetailModal(null)}
        tabs={[
          {
            value: INFO_TAB_CURRENT,
            label: "Integrantes actuales",
            icon: faUsers,
            badge: detailModal?.data?.integrantes?.length || null,
          },
          {
            value: INFO_TAB_HISTORY,
            label: "Historial",
            icon: faClockRotateLeft,
            badge: detailModal?.data?.historial_integrantes?.length || null,
          },
        ]}
        activeTab={detailTab}
        onTabChange={setDetailTab}
        loading={detailLoading}
        loadingTitle="Cargando familia..."
        loadingText="Consultando integrantes activos e históricos."
        modalClassName="familias-info-modal"
      >
        {detailModal?.error ? (
          <ModuleFeedback type="error" message={detailModal.error} />
        ) : detailModal?.data ? (
          detailTab === INFO_TAB_CURRENT ? (
            <div className="socios-info-content">
              <InfoSummary
                items={[
                  {
                    label: "Estado",
                    value: detailModal.data.activo ? "ACTIVA" : "BAJA",
                    icon: detailModal.data.activo ? faHouse : faUserSlash,
                    tone: detailModal.data.activo ? "success" : "danger",
                  },
                  {
                    label: "Integrantes",
                    value: detailModal.data.integrantes.length,
                    icon: faUsers,
                  },
                  {
                    label: "Titular",
                    value: detailModal.data.titular || "SIN TITULAR",
                    icon: faUser,
                  },
                  {
                    label: "Creación",
                    value: formatDate(
                      String(detailModal.data.creado_en || "").slice(0, 10),
                    ),
                    icon: faCalendarDays,
                  },
                ]}
              />
              <InfoSection
                title="Integrantes activos"
                icon={faUsers}
                badge={detailModal.data.integrantes.length}
              >
                {detailModal.data.integrantes.length ? (
                  detailModal.data.integrantes.map((member) => (
                    <InfoRow
                      key={member.id_familia_socio}
                      title={member.denominacion}
                      detail={[
                        `DNI ${member.dni || "—"}`,
                        member.parentesco,
                        member.es_titular ? "TITULAR" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      meta={`DESDE ${formatDate(member.fecha_incorporacion)}`}
                      tone={member.activo ? "success" : ""}
                    />
                  ))
                ) : (
                  <InfoEmpty>
                    La familia no tiene integrantes activos.
                  </InfoEmpty>
                )}
              </InfoSection>
              {detailModal.data.descripcion ? (
                <InfoSection title="Descripción" icon={faAddressBook}>
                  <InfoRow title={detailModal.data.descripcion} />
                </InfoSection>
              ) : null}
            </div>
          ) : (
            <InfoSection
              title="Períodos familiares"
              icon={faClockRotateLeft}
              badge={detailModal.data.historial_integrantes.length}
            >
              {detailModal.data.historial_integrantes.length ? (
                detailModal.data.historial_integrantes.map((member) => (
                  <InfoRow
                    key={member.id_familia_socio}
                    title={member.denominacion}
                    detail={[
                      member.parentesco,
                      member.es_titular ? "TITULAR" : null,
                      member.motivo_desvinculacion,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    meta={`${formatDate(member.fecha_incorporacion)} → ${member.fecha_desvinculacion ? formatDate(member.fecha_desvinculacion) : "ACTUALIDAD"}`}
                    tone={member.activo ? "success" : ""}
                  />
                ))
              ) : (
                <InfoEmpty>Sin períodos familiares registrados.</InfoEmpty>
              )}
            </InfoSection>
          )
        ) : null}
      </InfoModal>

      <ModalEliminarGlobal
        open={Boolean(stateModal)}
        operacion={stateModal?.activo ? "baja" : "alta"}
        row={stateModal}
        title={
          stateModal?.activo ? "Dar de baja la familia" : "Reactivar familia"
        }
        message={
          stateModal?.activo
            ? "Se cerrarán los vínculos activos de todos sus integrantes. La familia y su historial se conservarán."
            : "La familia volverá a estar activa, pero los vínculos anteriores no se restauran automáticamente."
        }
        warning={
          stateModal?.activo
            ? "Los integrantes quedarán disponibles para incorporarse a otra familia."
            : "Agregá nuevamente los integrantes desde Editar familia."
        }
        details={
          stateModal
            ? [
                { label: "Familia", value: stateModal.nombre },
                {
                  label: "Integrantes activos",
                  value: stateModal.cantidad_integrantes,
                },
                {
                  label: "Estado actual",
                  value: stateModal.activo ? "ACTIVA" : "BAJA",
                },
              ]
            : []
        }
        showReason={Boolean(stateModal?.activo)}
        reasonRequired={Boolean(stateModal?.activo)}
        reasonLabel="Motivo de baja *"
        reasonPlaceholder="Indicá por qué se da de baja la familia..."
        extraContent={
          stateModal?.activo ? (
            <label className="entity-field gdel-date-field">
              <span>Fecha de baja *</span>
              <input
                type="date"
                value={stateDate}
                max={today()}
                onChange={(event) => setStateDate(event.target.value)}
                required
              />
            </label>
          ) : null
        }
        confirmDisabled={Boolean(stateModal?.activo && !stateDate)}
        onClose={() => setStateModal(null)}
        onConfirm={changeState}
        onToast={(typeFeedback, message, duration) =>
          setFeedback({ type: typeFeedback, message, duration })
        }
        confirmLabel={stateModal?.activo ? "Dar de baja" : "Reactivar"}
      />
    </>
  );
}
