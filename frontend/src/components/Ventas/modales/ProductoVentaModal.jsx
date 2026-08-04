import React from "react";
import CrudModal from "../../Global/Modales/CrudModal";
import { FloatingField } from "../../Global/Formularios/TabbedForm";
import SalesSwitchField from "./SalesSwitchField";
import { toUpperText } from "../utils/textCase";

export default function ProductoVentaModal({
  form,
  setForm,
  saving,
  onSubmit,
}) {
  const productForm = form;
  const setProductForm = setForm;
  const submitProduct = onSubmit;
  const SwitchField = SalesSwitchField;

  return (
      <CrudModal
        open={Boolean(productForm)}
        title={productForm?.id_producto ? "Editar producto" : "Nuevo producto"}
        subtitle="Puede ser un artículo con stock o un servicio sin existencias."
        onClose={() => setProductForm(null)}
        onSubmit={submitProduct}
        saving={saving}
        wide
      >
        {productForm ? (
          <div className="sales-formGrid">
            <FloatingField
              label="Código / SKU"
              active={Boolean(productForm.codigo)}
            >
              <input
                value={productForm.codigo || ""}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    codigo: toUpperText(event.target.value),
                  })
                }
              />
            </FloatingField>
            <FloatingField
              label="Nombre *"
              active={Boolean(productForm.nombre)}
            >
              <input
                required
                value={productForm.nombre}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    nombre: toUpperText(event.target.value),
                  })
                }
              />
            </FloatingField>
            <FloatingField label="Precio *" active>
              <input
                required
                min="0"
                step="0.01"
                type="number"
                value={productForm.precio}
                onChange={(event) =>
                  setProductForm({ ...productForm, precio: event.target.value })
                }
              />
            </FloatingField>
            <div className="sales-inlineSwitch">
              <SwitchField
                checked={productForm.controla_stock}
                onChange={(value) =>
                  setProductForm({ ...productForm, controla_stock: value })
                }
                label="Controlar stock"
                hint="Desactivado para servicios o intangibles."
              />
            </div>
            {productForm.controla_stock ? (
              <>
                <FloatingField label="Stock actual *" active>
                  <input
                    required
                    min="0"
                    step="0.001"
                    type="number"
                    value={productForm.stock_actual}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        stock_actual: event.target.value,
                      })
                    }
                  />
                </FloatingField>
                <FloatingField label="Avisar desde *" active>
                  <input
                    required
                    min="0"
                    step="0.001"
                    type="number"
                    value={productForm.stock_minimo}
                    onChange={(event) =>
                      setProductForm({
                        ...productForm,
                        stock_minimo: event.target.value,
                      })
                    }
                  />
                </FloatingField>
              </>
            ) : null}
            <FloatingField
              label="Descripción"
              active={Boolean(productForm.descripcion)}
              wide
              textarea
            >
              <textarea
                rows="3"
                value={productForm.descripcion || ""}
                onChange={(event) =>
                  setProductForm({
                    ...productForm,
                    descripcion: toUpperText(event.target.value),
                  })
                }
              />
            </FloatingField>
          </div>
        ) : null}
      </CrudModal>
  );
}
