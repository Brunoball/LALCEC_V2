import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPlus, faTrashCan, faUser } from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../../Global/components/CrudModal";
import { FloatingField } from "../../Global/components/TabbedForm";
import { toUpperText } from "../utils/textCase";

const money = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const number = (value, digits = 3) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));

function ActionButton({ icon, label, onClick, tone = "" }) {
  return (
    <button
      type="button"
      className={`sales-iconButton ${tone ? `sales-iconButton--${tone}` : ""}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

export default function VentaModal({
  form,
  setForm,
  catalogs,
  saving,
  onSubmit,
  partnerSearch,
  setPartnerSearch,
  partnerLoading,
  partners,
  setPartners,
  updateSaleItem,
  activeConfig,
  subtotal,
  total,
}) {
  const saleForm = form;
  const setSaleForm = setForm;
  const submitSale = onSubmit;
  const saleSubtotal = subtotal;
  const saleTotal = total;

  return (
      <CrudModal
        open={Boolean(saleForm)}
        title={
          saleForm?.id_venta ? `Editar ${saleForm.codigo}` : "Registrar venta"
        }
        subtitle="La confirmación sincroniza stock e ingreso contable en una sola operación."
        onClose={() => setSaleForm(null)}
        onSubmit={submitSale}
        saving={saving}
        wide
        modalClassName="sales-saleModal"
        submitLabel={
          saleForm?.estado === "CONFIRMADA"
            ? "Guardar y confirmar"
            : "Guardar venta"
        }
      >
        {saleForm ? (
          <div className="sales-saleForm">
            <section className="sales-formSection">
              <header>
                <span>1</span>
                <div>
                  <strong>Datos de la operación</strong>
                  <small>Canal, fecha, estado y cobro.</small>
                </div>
              </header>
              <div className="sales-formGrid sales-formGrid--four">
                <FloatingField label="Caja, sede o canal *" active>
                  <select
                    required
                    value={saleForm.id_configuracion}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        id_configuracion: event.target.value,
                      })
                    }
                  >
                    <option value="">SELECCIONE...</option>
                    {catalogs.configuraciones
                      .filter(
                        (item) =>
                          item.activo ||
                          String(item.id_configuracion) ===
                            String(saleForm.id_configuracion),
                      )
                      .map((item) => (
                        <option
                          key={item.id_configuracion}
                          value={item.id_configuracion}
                        >
                          {item.nombre}
                        </option>
                      ))}
                  </select>
                </FloatingField>
                <FloatingField label="Fecha *" active>
                  <input
                    required
                    type="date"
                    value={saleForm.fecha}
                    onChange={(event) =>
                      setSaleForm({ ...saleForm, fecha: event.target.value })
                    }
                  />
                </FloatingField>
                <FloatingField label="Estado *" active>
                  <select
                    value={saleForm.estado}
                    onChange={(event) =>
                      setSaleForm({ ...saleForm, estado: event.target.value })
                    }
                  >
                    <option value="CONFIRMADA">CONFIRMADA</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="ANULADA">ANULADA</option>
                  </select>
                </FloatingField>
                <FloatingField label="Medio de pago *" active>
                  <select
                    required
                    value={saleForm.id_medio_pago}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        id_medio_pago: event.target.value,
                      })
                    }
                  >
                    <option value="">SELECCIONE...</option>
                    {catalogs.medios_pago.map((item) => (
                      <option
                        key={item.id_medio_pago}
                        value={item.id_medio_pago}
                      >
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </FloatingField>
              </div>
            </section>

            <section className="sales-formSection">
              <header>
                <span>2</span>
                <div>
                  <strong>Comprador</strong>
                  <small>Socio, persona externa o venta anónima.</small>
                </div>
              </header>
              <div className="sales-buyerTypes">
                {[
                  ["ANONIMO", "Anónimo"],
                  ["SOCIO", "Socio"],
                  ["EXTERNO", "Externo"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    className={
                      saleForm.comprador_tipo === value ? "is-active" : ""
                    }
                    key={value}
                    onClick={() =>
                      setSaleForm({
                        ...saleForm,
                        comprador_tipo: value,
                        id_socio: "",
                      })
                    }
                  >
                    <FontAwesomeIcon icon={faUser} /> {label}
                  </button>
                ))}
              </div>
              {saleForm.comprador_tipo === "SOCIO" ? (
                <div className="sales-partnerSearch">
                  <FloatingField
                    label="Buscar por apellido, nombre o DNI *"
                    active={Boolean(partnerSearch)}
                    wide
                  >
                    <input
                      required
                      value={partnerSearch}
                      onChange={(event) => {
                        setPartnerSearch(toUpperText(event.target.value));
                        setSaleForm({ ...saleForm, id_socio: "" });
                      }}
                    />
                  </FloatingField>
                  {partnerLoading ? <small>Buscando...</small> : null}
                  {partners.length ? (
                    <div className="sales-partnerResults">
                      {partners.map((item) => (
                        <button
                          type="button"
                          className={
                            String(saleForm.id_socio) === String(item.id_socio)
                              ? "is-selected"
                              : ""
                          }
                          key={item.id_socio}
                          onClick={() => {
                            setSaleForm({
                              ...saleForm,
                              id_socio: String(item.id_socio),
                            });
                            setPartnerSearch(toUpperText(item.nombre_completo));
                            setPartners([]);
                          }}
                        >
                          <strong>{item.nombre_completo}</strong>
                          <span>
                            DNI {item.dni}
                            {!item.activo ? " · INACTIVO" : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!saleForm.id_socio ? (
                    <p className="sales-fieldHint">
                      Seleccioná un resultado para vincular la venta.
                    </p>
                  ) : (
                    <p className="sales-fieldSuccess">
                      <FontAwesomeIcon icon={faCheck} /> Socio seleccionado
                    </p>
                  )}
                </div>
              ) : null}
              {saleForm.comprador_tipo === "EXTERNO" ? (
                <div className="sales-formGrid sales-formGrid--three">
                  <FloatingField
                    label="Nombre *"
                    active={Boolean(saleForm.comprador_nombre)}
                  >
                    <input
                      required
                      value={saleForm.comprador_nombre}
                      onChange={(event) =>
                        setSaleForm({
                          ...saleForm,
                          comprador_nombre: toUpperText(event.target.value),
                        })
                      }
                    />
                  </FloatingField>
                  <FloatingField
                    label="Documento"
                    active={Boolean(saleForm.comprador_documento)}
                  >
                    <input
                      value={saleForm.comprador_documento || ""}
                      onChange={(event) =>
                        setSaleForm({
                          ...saleForm,
                          comprador_documento: toUpperText(event.target.value),
                        })
                      }
                    />
                  </FloatingField>
                  <FloatingField
                    label="Contacto"
                    active={Boolean(saleForm.comprador_contacto)}
                  >
                    <input
                      value={saleForm.comprador_contacto || ""}
                      onChange={(event) =>
                        setSaleForm({
                          ...saleForm,
                          comprador_contacto: toUpperText(event.target.value),
                        })
                      }
                    />
                  </FloatingField>
                </div>
              ) : null}
            </section>

            <section className="sales-formSection">
              <header>
                <span>3</span>
                <div>
                  <strong>Productos</strong>
                  <small>
                    El total se recalcula en el servidor para evitar
                    manipulaciones.
                  </small>
                </div>
                <button
                  type="button"
                  className="mov-btn mov-btn--ghost"
                  onClick={() =>
                    setSaleForm({
                      ...saleForm,
                      items: [
                        ...saleForm.items,
                        { id_producto: "", cantidad: "1", precio_unitario: "" },
                      ],
                    })
                  }
                >
                  <FontAwesomeIcon icon={faPlus} /> Agregar línea
                </button>
              </header>
              <div className="sales-lines">
                {saleForm.items.map((item, index) => {
                  const product = catalogs.productos.find(
                    (entry) =>
                      String(entry.id_producto) === String(item.id_producto),
                  );
                  return (
                    <div
                      className="sales-line"
                      key={`${index}-${item.id_producto}`}
                    >
                      <FloatingField label="Producto *" active>
                        <select
                          required
                          value={item.id_producto}
                          onChange={(event) =>
                            updateSaleItem(
                              index,
                              "id_producto",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">SELECCIONE...</option>
                          {catalogs.productos
                            .filter(
                              (entry) =>
                                entry.activo ||
                                String(entry.id_producto) ===
                                  String(item.id_producto),
                            )
                            .map((entry) => (
                              <option
                                key={entry.id_producto}
                                value={entry.id_producto}
                              >
                                {entry.codigo ? `${entry.codigo} · ` : ""}
                                {entry.nombre}
                              </option>
                            ))}
                        </select>
                      </FloatingField>
                      <FloatingField label="Cantidad *" active>
                        <input
                          required
                          min="0.001"
                          step="0.001"
                          type="number"
                          value={item.cantidad}
                          onChange={(event) =>
                            updateSaleItem(
                              index,
                              "cantidad",
                              event.target.value,
                            )
                          }
                        />
                      </FloatingField>
                      <FloatingField label="Precio unitario *" active>
                        <input
                          required
                          min="0"
                          step="0.01"
                          type="number"
                          disabled={!activeConfig?.permite_precio_manual}
                          value={item.precio_unitario}
                          onChange={(event) =>
                            updateSaleItem(
                              index,
                              "precio_unitario",
                              event.target.value,
                            )
                          }
                        />
                      </FloatingField>
                      <div className="sales-lineTotal">
                        <small>Subtotal</small>
                        <strong>
                          {money(
                            Number(item.cantidad || 0) *
                              Number(item.precio_unitario || 0),
                          )}
                        </strong>
                        {product?.controla_stock ? (
                          <span>Stock: {number(product.stock_actual)}</span>
                        ) : (
                          <span>Sin control de stock</span>
                        )}
                      </div>
                      <ActionButton
                        icon={faTrashCan}
                        label="Quitar línea"
                        tone="danger"
                        onClick={() =>
                          setSaleForm({
                            ...saleForm,
                            items: saleForm.items.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          })
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="sales-formSection sales-formSection--totals">
              <div className="sales-formGrid">
                <FloatingField label="Descuento total" active>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={saleForm.descuento}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        descuento: event.target.value,
                      })
                    }
                  />
                </FloatingField>
                <FloatingField
                  label="Observaciones"
                  active={Boolean(saleForm.observaciones)}
                  textarea
                >
                  <textarea
                    rows="2"
                    value={saleForm.observaciones || ""}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        observaciones: toUpperText(event.target.value),
                      })
                    }
                  />
                </FloatingField>
              </div>
              <div className="sales-totalBox">
                <span>
                  Subtotal <b>{money(saleSubtotal)}</b>
                </span>
                <span>
                  Descuento <b>- {money(saleForm.descuento)}</b>
                </span>
                <strong>
                  Total <b>{money(saleTotal)}</b>
                </strong>
                <small>
                  {saleForm.estado === "CONFIRMADA"
                    ? "Impactará stock y Contable al guardar."
                    : "Sin impacto hasta confirmar."}
                </small>
              </div>
            </section>
          </div>
        ) : null}
      </CrudModal>
  );
}
