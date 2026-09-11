const { test, expect } = require('./fixtures/auth.fixture');
const { companyData, familyData, personData } = require('./fixtures/socios.fixture');
const {
  apiCall,
  apiResult,
  cleanupCategoriesByPrefix,
  cleanupDiscountsByThresholds,
  cleanupFamilyByPrefix,
  cleanupSocioByDocument,
  cleanupSocioById,
  e2eStatus,
  expectApiError,
} = require('./helpers/api.helper');
const { createCompany, createFamily, createPerson } = require('./helpers/entities.helper');
const { todayIso, uniqueSuffix } = require('./helpers/data.helper');

const normalPerson = personData();
const customCompany = companyData();
const familyPersonOne = personData();
const familyPersonTwo = personData();
const racePerson = personData();
const family = familyData();

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;
const secondaryMonth = currentMonth === 12 ? 11 : currentMonth + 1;
const startOfYear = `${currentYear}-01-01`;

function discountAppliesToday(rule, memberCount) {
  const today = todayIso();
  return Boolean(
    rule.activo &&
      String(rule.vigencia_desde || '') <= today &&
      (!rule.vigencia_hasta || String(rule.vigencia_hasta) >= today) &&
      Number(rule.cantidad_integrantes_desde) <= memberCount &&
      (rule.cantidad_integrantes_hasta === null ||
        Number(rule.cantidad_integrantes_hasta) >= memberCount),
  );
}

async function ensureTwoMemberDiscount(request) {
  const listed = await apiCall(request, 'descuentos_familiares_listar', {
    params: { estado: 'todos' },
  });
  const existing = (listed.items || []).find((item) => discountAppliesToday(item, 2));
  if (existing) return existing;

  const response = await apiCall(request, 'descuentos_familiares_guardar', {
    method: 'POST',
    data: {
      cantidad_integrantes_desde: 2,
      cantidad_integrantes_hasta: 2,
      porcentaje_descuento: '12.50',
      vigencia_desde: todayIso(),
      vigencia_hasta: todayIso(),
      descripcion: 'PW E2E DESCUENTO ARCHIVO SOCIOS',
    },
  });
  return response.item;
}

async function createCategory(request, label) {
  const name = `PW EE CAT ${label} ${uniqueSuffix()}`;
  const response = await apiCall(request, 'categorias_guardar', {
    method: 'POST',
    data: {
      nombre: name,
      descripcion: 'PW E2E CATEGORIA PARA TRAZABILIDAD DE SOCIOS ELIMINADOS',
      monto_actual: '2500.00',
      vigente_desde: todayIso(),
    },
  });
  return { ...response.item, prefix: name };
}

async function activeMedium(request) {
  const catalogs = await apiCall(request, 'cuotas_catalogos');
  const medium = catalogs.catalogos?.medios_pago?.find((item) => item.activo !== false)
    || catalogs.catalogos?.medios_pago?.[0];
  expect(medium).toBeTruthy();
  return medium;
}

async function paymentContext(request, idSocio, month) {
  return apiCall(request, 'cuotas_contexto_pago', {
    params: {
      id_socio: idSocio,
      anio: currentYear,
      mes: month,
      fecha_pago: todayIso(),
    },
  });
}

async function registerNormalPayment(request, idSocio, month, medium) {
  const context = await paymentContext(request, idSocio, month);
  expect(context.principal.puede_pagar).toBe(true);
  const response = await apiCall(request, 'cuotas_registrar_pago', {
    method: 'POST',
    data: {
      id_socio: idSocio,
      anio: currentYear,
      mes: month,
      fecha_pago: todayIso(),
      monto: context.principal.monto_sugerido,
      id_medio_pago: medium.id_medio_pago,
    },
  });
  expect(response.item.tipo_pago).toBe('NORMAL');
  expect(response.item.porcentaje_descuento_familiar).toBeNull();
  return response.item;
}

async function accountingPayment(request, paymentId, document) {
  // Contabilidad filtra por la fecha real de cobro (fecha_pago), no por el
  // período de la cuota. Todos los pagos de este spec se cobran hoy, por eso
  // deben consultarse en el mes contable actual aunque la cuota corresponda
  // a otro mes.
  const accounting = await apiCall(request, 'contable_ingresos_socios', {
    params: {
      anio: currentYear,
      mes: currentMonth,
      buscar: document,
    },
  });
  return (accounting.items || []).find((item) => Number(item.id_pago) === Number(paymentId)) || null;
}

test.describe.configure({ mode: 'serial' });

test.describe('Eliminación definitiva con trazabilidad histórica', () => {
  const trackedSocioIds = new Set();
  const trackedCategoryPrefixes = new Set();

  test.afterEach(async ({ request }) => {
    await cleanupFamilyByPrefix(request, family.prefix).catch(() => false);

    for (const id of [...trackedSocioIds]) {
      await cleanupSocioById(request, id).catch(() => false);
      trackedSocioIds.delete(id);
    }

    for (const target of [
      { tipo: 'PERSONA', documento: normalPerson.dni },
      { tipo: 'EMPRESA', documento: customCompany.cuit },
      { tipo: 'PERSONA', documento: familyPersonOne.dni },
      { tipo: 'PERSONA', documento: familyPersonTwo.dni },
      { tipo: 'PERSONA', documento: racePerson.dni },
    ]) {
      await cleanupSocioByDocument(request, target).catch(() => false);
    }

    for (const prefix of [...trackedCategoryPrefixes]) {
      await cleanupCategoriesByPrefix(request, prefix).catch(() => false);
      trackedCategoryPrefixes.delete(prefix);
    }

    await cleanupDiscountsByThresholds(request, [2]).catch(() => false);
  });

  test('archiva PERSONA, preserva varios pagos normales, libera DNI y el cleanup reconoce el tombstone', async ({ request }) => {
    const baseline = await e2eStatus(request);
    const archivedBefore = Number(baseline.residuos?.socios_eliminados || 0);

    const category = await createCategory(request, 'ARCH PERSONA');
    trackedCategoryPrefixes.add(category.prefix);
    const medium = await activeMedium(request);

    const saved = await createPerson(request, normalPerson, {
      fecha_alta: startOfYear,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const partnerId = Number(saved.id_socio);
    trackedSocioIds.add(partnerId);

    const categoryWithPartner = await apiCall(request, 'categorias_obtener', {
      params: { id: category.id_categoria },
    });
    expect(Number(categoryWithPartner.item.cantidad_socios)).toBe(1);

    const firstPayment = await registerNormalPayment(request, partnerId, currentMonth, medium);
    const secondPayment = await registerNormalPayment(request, partnerId, secondaryMonth, medium);

    const beforeDelete = await apiCall(request, 'socios_historial', {
      params: { id: partnerId },
    });
    expect(beforeDelete.item.id_socio).toBe(partnerId);
    expect(String(beforeDelete.item.dni)).toBe(String(normalPerson.dni));
    expect(beforeDelete.pagos.map((item) => Number(item.id_pago))).toEqual(
      expect.arrayContaining([Number(firstPayment.id_pago), Number(secondPayment.id_pago)]),
    );
    expect(Number(beforeDelete.impacto_eliminacion.pagos)).toBe(2);

    const archived = await apiCall(request, 'socios_eliminar_definitivo', {
      method: 'POST',
      data: { id: partnerId, confirmacion: 'ELIMINAR' },
    });

    expect(archived.id_socio).toBe(partnerId);
    expect(archived.tipo_socio).toBe('PERSONA');
    expect(archived.denominacion).toContain(normalPerson.apellido);
    expect(archived.fecha_eliminacion).toBeTruthy();
    expect(archived.auditoria_registrada).toBe(true);
    expect(Number(archived.preservados?.pagos || 0)).toBe(2);
    expect(Number(archived.preservados?.historial_estados || 0)).toBeGreaterThanOrEqual(1);
    expect(Number(archived.impacto_eliminacion?.pagos || 0)).toBe(2);
    expect(Number(archived.impacto_eliminacion?.total_relaciones || 0)).toBe(
      Number(archived.impacto_eliminacion?.pagos || 0)
        + Number(archived.impacto_eliminacion?.pagos_inscripciones || 0)
        + Number(archived.impacto_eliminacion?.historial_estados || 0)
        + Number(archived.impacto_eliminacion?.vinculos_familiares || 0),
    );

    const statusArchived = await e2eStatus(request);
    expect(Number(statusArchived.residuos?.socios_eliminados || 0)).toBe(archivedBefore + 1);

    await expectApiError(
      request,
      'socios_obtener',
      { params: { id: partnerId } },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );
    await expectApiError(
      request,
      'socios_historial',
      { params: { id: partnerId } },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );
    await expectApiError(
      request,
      'socios_reactivar',
      { method: 'POST', data: { id: partnerId, fecha_reactivacion: todayIso() } },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );
    await expectApiError(
      request,
      'cuotas_contexto_pago',
      {
        params: {
          id_socio: partnerId,
          anio: currentYear,
          mes: currentMonth,
          fecha_pago: todayIso(),
        },
      },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );

    const operational = await apiCall(request, 'socios_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'ACTIVO',
        buscar: normalPerson.dni,
        pagina: 1,
        por_pagina: 100,
      },
    });
    expect((operational.items || []).some((item) => Number(item.id_socio) === partnerId)).toBe(false);

    const paidOperational = await apiCall(request, 'cuotas_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'PAGADOS',
        anio: currentYear,
        mes: currentMonth,
        buscar: normalPerson.dni,
      },
    });
    expect((paidOperational.items || []).some((item) => Number(item.id_socio) === partnerId)).toBe(false);

    const categoryAfterDelete = await apiCall(request, 'categorias_obtener', {
      params: { id: category.id_categoria },
    });
    expect(Number(categoryAfterDelete.item.cantidad_socios)).toBe(0);

    for (const [payment, month] of [
      [firstPayment, currentMonth],
      [secondPayment, secondaryMonth],
    ]) {
      const accountingItem = await accountingPayment(
        request,
        payment.id_pago,
        normalPerson.dni,
      );
      expect(accountingItem).toBeTruthy();
      expect(Number(accountingItem.id_socio)).toBe(partnerId);
      expect(String(accountingItem.documento)).toBe(String(normalPerson.dni));
      expect(accountingItem.socio).toContain(normalPerson.apellido);
      expect(accountingItem.tipo_pago).toBe('NORMAL');
      expect(accountingItem.porcentaje_descuento_familiar).toBeNull();
      expect(Number(accountingItem.anio)).toBe(currentYear);
      expect(Number(accountingItem.mes)).toBe(month);
      expect(Number(accountingItem.monto)).toBeGreaterThan(0);
    }

    await expectApiError(
      request,
      'cuotas_eliminar_pago',
      { method: 'POST', data: { id_pago: firstPayment.id_pago } },
      { status: 409, code: 'PAGO_SOCIO_ELIMINADO_PROTEGIDO' },
    );

    // El DNI se libera del detalle operativo, pero queda recuperable desde el
    // archivo histórico. Una nueva alta con el mismo documento debe funcionar.
    const replacement = await createPerson(request, normalPerson, {
      nombre: `${normalPerson.nombre} REEMPLAZO`,
      id_categoria: null,
      id_medio_pago: medium.id_medio_pago,
    });
    const replacementId = Number(replacement.id_socio);
    trackedSocioIds.add(replacementId);
    expect(replacementId).not.toBe(partnerId);
    expect(String(replacement.dni)).toBe(String(normalPerson.dni));

    const reusedDocumentList = await apiCall(request, 'socios_listar', {
      params: {
        tipo: 'PERSONA',
        estado: 'ACTIVO',
        buscar: normalPerson.dni,
        pagina: 1,
        por_pagina: 100,
      },
    });
    expect(reusedDocumentList.items.map((item) => Number(item.id_socio))).toContain(replacementId);
    expect(reusedDocumentList.items.map((item) => Number(item.id_socio))).not.toContain(partnerId);

    await expectApiError(
      request,
      'socios_eliminar_definitivo',
      { method: 'POST', data: { id: partnerId, confirmacion: 'ELIMINAR' } },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );

    // También cubre que el harness de testing quedó actualizado para limpiar
    // socios archivados y no dejar residuos en local ni en Hostinger.
    await cleanupSocioById(request, partnerId);
    trackedSocioIds.delete(partnerId);
    const statusCleaned = await e2eStatus(request);
    expect(Number(statusCleaned.residuos?.socios_eliminados || 0)).toBe(archivedBefore);
  });

  test('archiva EMPRESA con MONTO_PERSONALIZADO, conserva CUIT en Contabilidad y permite reutilizarlo', async ({ request }) => {
    const category = await createCategory(request, 'ARCH EMPRESA');
    trackedCategoryPrefixes.add(category.prefix);
    const medium = await activeMedium(request);

    const saved = await createCompany(request, customCompany, {
      fecha_alta: startOfYear,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const companyId = Number(saved.id_socio);
    trackedSocioIds.add(companyId);

    const context = await paymentContext(request, companyId, currentMonth);
    expect(context.principal.puede_pagar).toBe(true);
    const customAmount = Number(context.principal.monto_sugerido) + 137.31;

    const paid = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: companyId,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
        monto: customAmount,
        monto_personalizado: true,
        id_medio_pago: medium.id_medio_pago,
      },
    });
    expect(paid.item.tipo_pago).toBe('MONTO_PERSONALIZADO');
    expect(paid.item.porcentaje_descuento_familiar).toBeNull();
    expect(Number(paid.item.monto)).toBeCloseTo(customAmount, 2);

    const archived = await apiCall(request, 'socios_eliminar_definitivo', {
      method: 'POST',
      data: { id: companyId, confirmacion: 'ELIMINAR' },
    });
    expect(archived.tipo_socio).toBe('EMPRESA');
    expect(archived.denominacion).toContain(customCompany.razonSocial);
    expect(Number(archived.preservados?.pagos || 0)).toBe(1);
    expect(archived.auditoria_registrada).toBe(true);

    const accountingItem = await accountingPayment(
      request,
      paid.item.id_pago,
      customCompany.cuit,
    );
    expect(accountingItem).toBeTruthy();
    expect(Number(accountingItem.id_socio)).toBe(companyId);
    expect(accountingItem.tipo_socio).toBe('EMPRESA');
    expect(accountingItem.socio).toContain(customCompany.razonSocial);
    expect(String(accountingItem.documento)).toBe(String(customCompany.cuit));
    expect(accountingItem.tipo_pago).toBe('MONTO_PERSONALIZADO');
    expect(accountingItem.porcentaje_descuento_familiar).toBeNull();
    expect(Number(accountingItem.monto)).toBeCloseTo(customAmount, 2);

    const categoryAfterDelete = await apiCall(request, 'categorias_obtener', {
      params: { id: category.id_categoria },
    });
    expect(Number(categoryAfterDelete.item.cantidad_socios)).toBe(0);

    await expectApiError(
      request,
      'cuotas_eliminar_pago',
      { method: 'POST', data: { id_pago: paid.item.id_pago } },
      { status: 409, code: 'PAGO_SOCIO_ELIMINADO_PROTEGIDO' },
    );

    const replacement = await createCompany(request, customCompany, {
      razon_social: `${customCompany.razonSocial} REEMPLAZO`,
      id_categoria: null,
      id_medio_pago: medium.id_medio_pago,
    });
    const replacementId = Number(replacement.id_socio);
    trackedSocioIds.add(replacementId);
    expect(replacementId).not.toBe(companyId);
    expect(String(replacement.cuit)).toBe(String(customCompany.cuit));

    const companies = await apiCall(request, 'socios_listar', {
      params: {
        tipo: 'EMPRESA',
        estado: 'ACTIVO',
        buscar: customCompany.cuit,
        pagina: 1,
        por_pagina: 100,
      },
    });
    expect(companies.items.map((item) => Number(item.id_socio))).toContain(replacementId);
    expect(companies.items.map((item) => Number(item.id_socio))).not.toContain(companyId);
  });


  test('serializa la carrera eliminar socio vs eliminar pago y nunca deja una trazabilidad intermedia', async ({ request }) => {
    const category = await createCategory(request, 'ARCH CARRERA');
    trackedCategoryPrefixes.add(category.prefix);
    const medium = await activeMedium(request);

    const saved = await createPerson(request, racePerson, {
      fecha_alta: startOfYear,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const partnerId = Number(saved.id_socio);
    trackedSocioIds.add(partnerId);

    const payment = await registerNormalPayment(request, partnerId, currentMonth, medium);

    const [deletePartner, deletePayment] = await Promise.all([
      apiResult(request, 'socios_eliminar_definitivo', {
        method: 'POST',
        data: { id: partnerId, confirmacion: 'ELIMINAR' },
      }),
      apiResult(request, 'cuotas_eliminar_pago', {
        method: 'POST',
        data: { id_pago: payment.id_pago },
      }),
    ]);

    expect(deletePartner.ok).toBe(true);
    expect(deletePartner.status).toBe(200);
    expect(deletePartner.body?.auditoria_registrada).toBe(true);

    const preservedPayments = Number(deletePartner.body?.preservados?.pagos || 0);
    if (deletePayment.ok) {
      // El borrado del pago ganó el lock del socio: el archivo se crea después
      // y registra correctamente que ya no había pagos que preservar.
      expect(deletePayment.status).toBe(200);
      expect(Number(deletePayment.body?.item?.id_pago)).toBe(Number(payment.id_pago));
      expect(preservedPayments).toBe(0);

      const accounting = await accountingPayment(
        request,
        payment.id_pago,
        racePerson.dni,
      );
      expect(accounting).toBeNull();
    } else {
      // La eliminación definitiva ganó primero: el pago queda dentro del
      // archivo histórico y la segunda transacción debe respetar el tombstone.
      expect(deletePayment.status).toBe(409);
      expect(deletePayment.body?.codigo).toBe('PAGO_SOCIO_ELIMINADO_PROTEGIDO');
      expect(preservedPayments).toBe(1);

      const accounting = await accountingPayment(
        request,
        payment.id_pago,
        racePerson.dni,
      );
      expect(accounting).toBeTruthy();
      expect(accounting.tipo_pago).toBe('NORMAL');
      expect(String(accounting.documento)).toBe(String(racePerson.dni));
    }

    await expectApiError(
      request,
      'socios_obtener',
      { params: { id: partnerId } },
      { status: 404, code: 'SOCIO_NO_ENCONTRADO' },
    );

    const categoryAfter = await apiCall(request, 'categorias_obtener', {
      params: { id: category.id_categoria },
    });
    expect(Number(categoryAfter.item.cantidad_socios)).toBe(0);
  });

  test('preserva DESCUENTO_FAMILIAR al eliminar un integrante, cierra sólo su vínculo y mantiene operativa la familia restante', async ({ request }) => {
    await cleanupFamilyByPrefix(request, family.prefix).catch(() => false);
    const discount = await ensureTwoMemberDiscount(request);
    const category = await createCategory(request, 'ARCH FAMILIA');
    trackedCategoryPrefixes.add(category.prefix);
    const medium = await activeMedium(request);

    const first = await createPerson(request, familyPersonOne, {
      fecha_alta: startOfYear,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    const second = await createPerson(request, familyPersonTwo, {
      fecha_alta: startOfYear,
      id_categoria: category.id_categoria,
      id_medio_pago: medium.id_medio_pago,
    });
    trackedSocioIds.add(Number(first.id_socio));
    trackedSocioIds.add(Number(second.id_socio));

    const createdFamily = await createFamily(request, family, [first, second]);
    expect(createdFamily.integrante_ids.map(Number)).toEqual(
      expect.arrayContaining([Number(first.id_socio), Number(second.id_socio)]),
    );

    const familyContext = await paymentContext(request, first.id_socio, currentMonth);
    expect(familyContext.familia).toBeTruthy();
    expect(familyContext.familia.integrantes).toHaveLength(2);
    expect(Number(familyContext.familia.porcentaje_descuento)).toBeCloseTo(
      Number(discount.porcentaje_descuento),
      2,
    );

    const paid = await apiCall(request, 'cuotas_registrar_pago', {
      method: 'POST',
      data: {
        id_socio: first.id_socio,
        anio: currentYear,
        mes: currentMonth,
        fecha_pago: todayIso(),
        id_medio_pago: medium.id_medio_pago,
        aplicar_familia: true,
      },
    });
    expect(paid.aplico_familia).toBe(true);
    expect(paid.items).toHaveLength(2);
    for (const item of paid.items) {
      expect(item.tipo_pago).toBe('DESCUENTO_FAMILIAR');
      expect(Number(item.porcentaje_descuento_familiar)).toBeCloseTo(
        Number(discount.porcentaje_descuento),
        2,
      );
    }

    const firstPayment = paid.items.find(
      (item) => Number(item.id_socio) === Number(first.id_socio),
    );
    const secondPayment = paid.items.find(
      (item) => Number(item.id_socio) === Number(second.id_socio),
    );
    expect(firstPayment).toBeTruthy();
    expect(secondPayment).toBeTruthy();

    const archived = await apiCall(request, 'socios_eliminar_definitivo', {
      method: 'POST',
      data: { id: first.id_socio, confirmacion: 'ELIMINAR' },
    });
    expect(archived.tipo_socio).toBe('PERSONA');
    expect(Number(archived.preservados?.pagos || 0)).toBe(1);
    expect(Number(archived.preservados?.vinculos_familiares_historicos || 0)).toBe(1);
    expect(Number(archived.vinculos_familiares_cerrados || 0)).toBe(1);
    expect(archived.auditoria_registrada).toBe(true);

    const familyDetail = await apiCall(request, 'familias_obtener', {
      params: { id: createdFamily.id_familia },
    });
    expect(familyDetail.item.integrantes.map((item) => Number(item.id_socio))).toEqual([
      Number(second.id_socio),
    ]);
    const historicalMember = familyDetail.item.historial_integrantes.find(
      (item) => Number(item.id_socio) === Number(first.id_socio),
    );
    expect(historicalMember).toBeTruthy();
    expect(historicalMember.socio_eliminado).toBe(true);
    expect(String(historicalMember.dni)).toBe(String(familyPersonOne.dni));
    expect(historicalMember.fecha_desvinculacion).toBeTruthy();
    expect(historicalMember.motivo_desvinculacion).toMatch(/SOCIO ELIMINADO DEFINITIVAMENTE/i);

    await expectApiError(
      request,
      'familias_guardar',
      {
        method: 'POST',
        data: {
          nombre: `${family.nombre} ARCHIVADO`,
          descripcion: 'NO DEBE ACEPTAR UN SOCIO ELIMINADO',
          integrantes: [
            {
              id_socio: first.id_socio,
              parentesco: 'TITULAR',
              es_titular: true,
              fecha_incorporacion: todayIso(),
            },
          ],
        },
      },
      { code: 'SOCIO_INVALIDO' },
    );

    const categoryAfterDelete = await apiCall(request, 'categorias_obtener', {
      params: { id: category.id_categoria },
    });
    expect(Number(categoryAfterDelete.item.cantidad_socios)).toBe(1);

    const archivedAccounting = await accountingPayment(
      request,
      firstPayment.id_pago,
      familyPersonOne.dni,
    );
    expect(archivedAccounting).toBeTruthy();
    expect(archivedAccounting.tipo_pago).toBe('DESCUENTO_FAMILIAR');
    expect(Number(archivedAccounting.porcentaje_descuento_familiar)).toBeCloseTo(
      Number(discount.porcentaje_descuento),
      2,
    );
    expect(String(archivedAccounting.documento)).toBe(String(familyPersonOne.dni));

    await expectApiError(
      request,
      'cuotas_eliminar_pago',
      { method: 'POST', data: { id_pago: firstPayment.id_pago } },
      { status: 409, code: 'PAGO_SOCIO_ELIMINADO_PROTEGIDO' },
    );

    // El pago del integrante que sigue activo no queda bloqueado por la baja
    // histórica del otro miembro de la familia.
    const removedSecond = await apiCall(request, 'cuotas_eliminar_pago', {
      method: 'POST',
      data: { id_pago: secondPayment.id_pago },
    });
    expect(Number(removedSecond.item.id_pago)).toBe(Number(secondPayment.id_pago));

    const secondContext = await paymentContext(request, second.id_socio, currentMonth);
    expect(secondContext.principal.puede_pagar).toBe(true);
    expect(secondContext.principal.pagado).toBe(false);
  });
});
