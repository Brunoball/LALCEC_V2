import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCashRegister,
  faSliders,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import CrudModal from "../../../Global/components/CrudModal";
import { FloatingField } from "../../../Global/components/TabbedForm";
import SalesSwitchField from "../../../Ventas/modales/SalesSwitchField";
import { toUpperText } from "../../../Ventas/utils/textCase";

export default function ConfiguracionVentaModal({
  form,
  setForm,
  catalogs,
  saving,
  onSubmit,
}) {
  return (
    <CrudModal
      open={Boolean(form)}
      title={form?.id_configuracion ? "Editar configuración" : "Nueva configuración"}
      subtitle="Definí el comportamiento de una caja, sede, punto o canal de venta."
      onClose={() => setForm(null)}
      onSubmit={onSubmit}
      saving={saving}
      wide
      modalClassName="sales-configModal"
    >
      {form ? (
        <div className="sales-configModal__layout">
          <section className="sales-configModal__section">
            <header className="sales-configModal__sectionHead">
              <span aria-hidden="true"><FontAwesomeIcon icon={faCashRegister} /></span>
              <div>
                <strong>Datos de la configuración</strong>
                <small>Identificá la caja, sede, punto o canal de venta.</small>
              </div>
            </header>
            <div className="sales-configModal__identityGrid">
              <FloatingField label="Nombre *" active={Boolean(form.nombre)}>
                <input
                  required
                  value={form.nombre}
                  onChange={(event) =>
                    setForm({ ...form, nombre: toUpperText(event.target.value) })
                  }
                />
              </FloatingField>

              <FloatingField
                label="Descripción"
                active={Boolean(form.descripcion)}
                textarea
              >
                <textarea
                  rows="2"
                  value={form.descripcion || ""}
                  onChange={(event) =>
                    setForm({ ...form, descripcion: toUpperText(event.target.value) })
                  }
                />
              </FloatingField>
            </div>
          </section>

          <section className="sales-configModal__section">
            <header className="sales-configModal__sectionHead">
              <span aria-hidden="true"><FontAwesomeIcon icon={faSliders} /></span>
              <div>
                <strong>Comportamiento de la venta</strong>
                <small>Activá solamente las opciones necesarias para este canal.</small>
              </div>
            </header>
            <div className="sales-configModal__switchGrid">
              <SalesSwitchField
                checked={form.impacta_contable}
                onChange={(value) => setForm({ ...form, impacta_contable: value })}
                label="Generar ingreso contable"
                hint="Solo al confirmar la venta."
              />
              <SalesSwitchField
                checked={form.permite_precio_manual}
                onChange={(value) => setForm({ ...form, permite_precio_manual: value })}
                label="Permitir cambiar precios"
                hint="Habilita precios especiales por venta."
              />
              <SalesSwitchField
                checked={form.solicita_comprador}
                onChange={(value) => setForm({ ...form, solicita_comprador: value })}
                label="Exigir comprador"
                hint="Impide registrar ventas anónimas."
              />
            </div>
          </section>

          {form.impacta_contable ? (
            <section className="sales-accountingBox sales-configModal__accounting">
              <header>
                <span aria-hidden="true"><FontAwesomeIcon icon={faWallet} /></span>
                <div>
                  <strong>Imputación contable</strong>
                  <small>
                    El ingreso usa estos valores y el medio de pago elegido en cada venta.
                  </small>
                </div>
              </header>
              <div className="sales-formGrid sales-formGrid--three">
                {[
                  ["id_proveedor_contable", "Origen / fuente *", "PROVEEDOR"],
                  ["id_categoria_contable", "Categoría de ingreso *", "CATEGORIA_INGRESO"],
                  ["id_concepto_contable", "Concepto de ingreso *", "CONCEPTO_INGRESO"],
                ].map(([field, label, type]) => (
                  <FloatingField label={label} active key={field}>
                    <select
                      required
                      value={form[field]}
                      onChange={(event) =>
                        setForm({ ...form, [field]: event.target.value })
                      }
                    >
                      <option value="">SELECCIONE...</option>
                      {(catalogs.opciones_contables[type] || []).map((item) => (
                        <option key={item.id_opcion} value={item.id_opcion}>
                          {item.nombre}
                        </option>
                      ))}
                    </select>
                  </FloatingField>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </CrudModal>
  );
}
