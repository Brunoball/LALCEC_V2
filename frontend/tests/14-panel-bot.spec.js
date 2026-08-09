const { test, expect } = require('./fixtures/auth.fixture');
const {
  botApiCall,
  botApiResult,
  botApiUrl,
  botTestWaId,
  endpointMatcher,
  getBotContact,
  normalizeBotWaId,
  openBotTestChat,
  openChatOptions,
} = require('./helpers/bot.helper');

const WA_ID = botTestWaId();
const TEST_LABEL_PREFIX = 'PW E2E BOT';

function contactName(contact) {
  return String(
    contact?.nombre ||
      contact?.nombre_contacto ||
      contact?.contacto_nombre ||
      contact?.nombre_db ||
      contact?.name ||
      '',
  ).trim();
}

function contactMode(contact) {
  return String(contact?.modo || '').trim().toLowerCase() === 'manual'
    ? 'manual'
    : 'bot';
}

async function cleanupTestLabels(request) {
  const data = await botApiCall(request, 'management', 'etiquetas_list');
  const labels = (data.etiquetas || []).filter((item) =>
    String(item?.nombre || '').toUpperCase().startsWith(TEST_LABEL_PREFIX),
  );
  for (const label of labels) {
    await botApiCall(request, 'management', 'etiquetas_delete', {
      method: 'POST',
      data: { id_etiqueta: Number(label.id_etiqueta) },
    }).catch(() => undefined);
  }
}

async function restoreContact(request, snapshot) {
  if (!snapshot) return;

  const originalName = contactName(snapshot);
  await botApiCall(request, 'management', 'editar_nombre', {
    method: 'POST',
    data: { wa_id: WA_ID, nombre: originalName },
  }).catch(() => undefined);

  await botApiCall(request, 'management', 'etiquetas_set', {
    method: 'POST',
    data: {
      wa_id: WA_ID,
      etiqueta_id: snapshot?.etiqueta_id ?? null,
    },
  }).catch(() => undefined);

  await botApiCall(request, 'panel', 'panel_set_modo', {
    method: 'POST',
    data: { wa_id: WA_ID, modo: contactMode(snapshot) },
  }).catch(() => undefined);
}

async function mockEndpoint(page, endpoint, handler) {
  await page.route(
    (url) => endpointMatcher(endpoint)(url.toString()),
    async (route) => {
      const request = route.request();
      const result = await handler(request);
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(result ?? { success: true }),
      });
    },
  );
}

function mockReportFor(request) {
  const url = new URL(request.url());
  const now = new Date();
  const anio = Number(url.searchParams.get('anio') || now.getFullYear());
  const mes = Number(url.searchParams.get('mes') || now.getMonth() + 1);
  const clave = `${anio}-${String(mes).padStart(2, '0')}`;

  return {
    success: true,
    periodo: {
      anio,
      mes,
      clave,
      inicio: `${clave}-01`,
      fin_exclusivo: `${clave}-28`,
      es_mes_actual: true,
    },
    resumen: {
      contactos_total_fin_mes: 76,
      contactos_nuevos: 4,
      contactos_con_actividad: 21,
      personas_que_escribieron: 18,
      mensajes_recibidos: 64,
      mensajes_enviados_bot: 71,
      socios_pagaron_bot: 6,
    },
    actividad: {
      mensajes_total: 135,
      mensajes_recibidos: 64,
      mensajes_enviados_bot: 71,
      prioridad_alta: 5,
      consultas: 4,
      consultas_atendidas: 3,
      contactos_con_actividad: 21,
      personas_que_escribieron: 18,
    },
    pagos: {
      socios_pagaron: 6,
      cuotas_registradas: 11,
      monto_total: 55000,
      operaciones: 6,
      directos_medio_bot: 4,
      recuperados_historial: 2,
      vinculados_exactos: 6,
      sin_fila_actual: 0,
      medio_pago: 'BOT + historial confirmado del chat',
      detalle: [],
    },
    recordatorios: {
      dia_01: 10,
      dia_15: 7,
      aceptados: 17,
      entregados: 16,
      leidos: 12,
      fallidos: 1,
      pendientes_estado: 0,
      entregados_no_cobrables: 0,
      seguimiento_entrega_disponible: true,
      historico_conciliado_meta: false,
      historico_no_cobrados: 0,
      plantillas: {
        dia_01: { nombre: 'beneficio_pago', categoria: 'marketing', tarifa_usd: 0.0618 },
        dia_15: { nombre: 'cuota_pendiente', categoria: 'marketing', tarifa_usd: 0.0618 },
      },
    },
    costos: {
      moneda_meta: 'USD',
      tarifa_marketing_usd: 0.0618,
      tarifa_utility_usd: 0,
      costo_confirmado_usd: 0.9888,
      costo_estimado_usd: 0.9888,
      costo_por_tarifa_usd: 0.9888,
      costo_mostrado_usd: 0.9888,
      mensajes_para_calculo: 16,
      modo_calculo: 'confirmado_por_entrega',
      tipo_cambio: { valor: 1400, fuente: 'PW E2E', es_historico: false },
      base_ars: 1384.32,
      impuesto_pct: 0,
      impuesto_configurado: false,
      impuesto_ars_calculado: 0,
      impuesto_ars: 0,
      impuesto_importe_real: false,
      base_percepcion_ars: null,
      total_ars: 1384.32,
      conciliado_meta: false,
      fuente_conciliacion: 'PW E2E',
      nota: 'Mock controlado de Playwright.',
    },
    periodos_disponibles: [clave],
    generado_en: new Date().toISOString(),
  };
}

async function installSafeBotMock(page, options = {}) {
  const state = {
    mode: options.mode || 'manual',
    name: 'PW BOT TEST',
    unread: Number(options.unread || 0),
    labelId: null,
    consultasPendientes: Number(options.consultasPendientes || 0),
    prioridad: options.prioridad || 'normal',
    windowExpired: !!options.windowExpired,
    requests: [],
  };

  const remember = (endpoint, request, body = undefined) => {
    state.requests.push({ endpoint, method: request.method(), body, url: request.url() });
  };

  await mockEndpoint(page, 'panel_chats', async (request) => {
    remember('panel_chats', request);
    return {
      success: true,
      chats: [
        {
          wa_id: WA_ID,
          nombre: state.name,
          etiqueta: state.labelId ? 'PW MOCK' : '',
          etiqueta_id: state.labelId,
          ventana_24h: new Date(
            Date.now() - (state.windowExpired ? 30 : 0) * 60 * 60 * 1000,
          ).toISOString(),
          ultima_ts: Date.now(),
          ultimo_mensaje: 'Mensaje controlado de Playwright',
          total: 2,
          unread: state.unread,
          modo: state.mode,
          prioridad: state.prioridad,
          consultas_pendientes: state.consultasPendientes,
        },
      ],
    };
  });

  await mockEndpoint(page, 'panel_mensajes', async (request) => {
    remember('panel_mensajes', request);
    return {
      success: true,
      mensajes: [
        {
          id: 1,
          wa_id: WA_ID,
          mensaje: 'Mensaje entrante de prueba',
          emisor: 'Usuario',
          prioridad: state.prioridad,
          es_consulta: state.consultasPendientes > 0 ? 1 : 0,
          consulta_atendida: 0,
          fecha: new Date().toISOString(),
        },
        {
          id: 2,
          wa_id: WA_ID,
          mensaje: 'Imagen controlada',
          emisor: 'Usuario',
          prioridad: 'normal',
          fecha: new Date().toISOString(),
          tipo: 'image',
          media_url: 'https://example.test/pw-e2e-bot.png',
          media_mime: 'image/png',
          media_name: 'pw-e2e-bot.png',
          media_size: 68,
        },
      ],
    };
  });

  await mockEndpoint(page, 'panel_mark_seen', async (request) => {
    state.unread = 0;
    remember('panel_mark_seen', request);
    return { success: true, unread: 0 };
  });
  await mockEndpoint(page, 'panel_mark_unread', async (request) => {
    state.unread = 1;
    remember('panel_mark_unread', request);
    return { success: true, unread: 1 };
  });
  await mockEndpoint(page, 'panel_hash', async (request) => {
    remember('panel_hash', request);
    return { success: true, hash: 'pw-chat-hash' };
  });
  await mockEndpoint(page, 'panel_global_hash', async (request) => {
    remember('panel_global_hash', request);
    return { success: true, hash: 'pw-global-hash' };
  });
  await mockEndpoint(page, 'panel_set_modo', async (request) => {
    const body = request.postDataJSON();
    state.mode = body.modo;
    remember('panel_set_modo', request, body);
    return { success: true, modo: state.mode };
  });
  await mockEndpoint(page, 'panel_send', async (request) => {
    const body = request.postDataJSON();
    remember('panel_send', request, body);
    return { success: true, id: 99901 };
  });
  await mockEndpoint(page, 'panel_send_media', async (request) => {
    remember('panel_send_media', request, request.postData());
    return { success: true, id: 99902 };
  });
  await mockEndpoint(page, 'panel_reportes', async (request) => {
    remember('panel_reportes', request);
    return mockReportFor(request);
  });

  await mockEndpoint(page, 'etiquetas_list', async (request) => {
    remember('etiquetas_list', request);
    return {
      success: true,
      etiquetas: [{ id_etiqueta: 91, nombre: 'PW MOCK', orden: 1, color: '#25d366' }],
    };
  });
  await mockEndpoint(page, 'editar_nombre', async (request) => {
    const body = request.postDataJSON();
    state.name = body.nombre;
    remember('editar_nombre', request, body);
    return { success: true };
  });
  await mockEndpoint(page, 'etiquetas_set', async (request) => {
    const body = request.postDataJSON();
    state.labelId = body.etiqueta_id ?? null;
    remember('etiquetas_set', request, body);
    return { success: true };
  });
  await mockEndpoint(page, 'etiquetas_create', async (request) => {
    remember('etiquetas_create', request, request.postDataJSON());
    return { success: true, id_etiqueta: 92 };
  });
  await mockEndpoint(page, 'etiquetas_update', async (request) => {
    remember('etiquetas_update', request, request.postDataJSON());
    return { success: true };
  });
  await mockEndpoint(page, 'etiquetas_delete', async (request) => {
    remember('etiquetas_delete', request, request.postDataJSON());
    return { success: true };
  });
  await mockEndpoint(page, 'vaciar_chat', async (request) => {
    remember('vaciar_chat', request, request.postDataJSON());
    return { success: true };
  });
  await mockEndpoint(page, 'eliminar_contacto', async (request) => {
    remember('eliminar_contacto', request, request.postDataJSON());
    return { success: true };
  });

  return state;
}

function hasRequest(state, endpoint, predicate = () => true) {
  return state.requests.some(
    (item) => item.endpoint === endpoint && predicate(item),
  );
}

async function expectEndpointExists(result, endpoint) {
  expect(result.status, `${endpoint} no debe responder 404.`).not.toBe(404);
  expect(result.body, `${endpoint} debe devolver JSON.`).toBeTruthy();
}

test.describe('Panel Bot WhatsApp', () => {
  test.describe.configure({ mode: 'serial' });

  test('normaliza el número autorizado 3492253860 igual que el chatbot', async () => {
    expect(normalizeBotWaId('3492253860')).toBe('5493492253860');
    expect(normalizeBotWaId('+54 9 3492-253860')).toBe('5493492253860');
    expect(WA_ID).toBe('5493492253860');
  });

  test('Hostinger expone health, chats, unread, reportes y lectura del contacto real', async ({ request }) => {
    const health = await botApiCall(request, 'panel', 'panel_health', {
      params: { db: 1 },
    });
    expect(health.status).toBe('ok');
    expect(health.db).toBe(true);

    const contact = await getBotContact(request, WA_ID);
    expect(contact, `No existe ${WA_ID} en panel_chats del backend del bot.`).toBeTruthy();

    const messages = await botApiCall(request, 'panel', 'panel_mensajes', {
      params: { wa_id: WA_ID, limit: 25 },
    });
    expect(Array.isArray(messages.mensajes)).toBe(true);

    const hash = await botApiCall(request, 'panel', 'panel_hash', {
      params: { wa_id: WA_ID },
    });
    expect(typeof hash.hash).toBe('string');

    const globalHash = await botApiCall(request, 'panel', 'panel_global_hash');
    expect(typeof globalHash.hash).toBe('string');

    const unread = await botApiCall(request, 'panel', 'panel_unread_total');
    expect(Number(unread.total_normal)).toBeGreaterThanOrEqual(0);
    expect(Number(unread.total_urgent)).toBeGreaterThanOrEqual(0);

    const labels = await botApiCall(request, 'management', 'etiquetas_list');
    expect(Array.isArray(labels.etiquetas)).toBe(true);

    const now = new Date();
    const report = await botApiCall(request, 'panel', 'panel_reportes', {
      params: { anio: now.getFullYear(), mes: now.getMonth() + 1 },
    });
    expect(report).toHaveProperty('resumen');
    expect(report).toHaveProperty('actividad');
    expect(report).toHaveProperty('pagos');
    expect(report).toHaveProperty('costos');
  });

  test('los endpoints de escritura delicados existen sin ejecutar una mutación válida', async ({ request }) => {
    const probes = [
      ['panel', 'panel_send', { wa_id: '', texto: '' }],
      ['panel', 'panel_set_modo', { wa_id: '', modo: 'invalido' }],
      ['management', 'vaciar_chat', { wa_id: 'PW_E2E_INVALID' }],
      ['management', 'eliminar_contacto', { wa_id: 'PW_E2E_INVALID' }],
    ];

    for (const [section, endpoint, data] of probes) {
      const result = await botApiResult(request, section, endpoint, {
        method: 'POST',
        data,
      });
      await expectEndpointExists(result, endpoint);
    }

    const mediaProbe = await request.get(botApiUrl('panel', 'panel_send_media'), {
      failOnStatusCode: false,
      headers: { Accept: 'application/json' },
    });
    expect(mediaProbe.status(), 'panel_send_media no debe responder 404.').not.toBe(404);
    expect(String(mediaProbe.headers()['content-type'] || '')).toContain('application/json');
  });

  test('recorre lectura, búsqueda, filtros, hashes, tema y Reportes del Bot con backend real', async ({ page }) => {
    const observed = new Set();
    const botHttpErrors = [];
    const tracked = [
      'panel_chats',
      'panel_mensajes',
      'panel_mark_seen',
      'panel_hash',
      'panel_global_hash',
      'panel_reportes',
      'etiquetas_list',
    ];

    page.on('response', (response) => {
      for (const endpoint of tracked) {
        if (endpointMatcher(endpoint)(response.url())) {
          observed.add(endpoint);
          if (response.status() >= 400) {
            botHttpErrors.push(`${endpoint}: HTTP ${response.status()}`);
          }
        }
      }
    });

    await openBotTestChat(page, WA_ID);
    await expect(page.locator('.wp-chat-top-name')).not.toHaveText('');

    const filterButton = page.getByRole('button', { name: /Filtrar por etiqueta/i });
    await filterButton.click();
    const filterMenu = page.getByRole('menu', { name: 'Filtrar chats por etiqueta' });
    await expect(filterMenu).toBeVisible();
    await filterMenu.getByRole('button', { name: /Todas/i }).click();

    const oldTheme = await page.locator('html').getAttribute('data-botpanel-theme');
    await page.getByRole('button', { name: 'Cambiar tema' }).click();
    await expect.poll(() => page.locator('html').getAttribute('data-botpanel-theme')).not.toBe(oldTheme);

    const reportResponse = page.waitForResponse((response) => endpointMatcher('panel_reportes')(response.url()));
    await page.getByRole('button', { name: 'Abrir reportes del bot' }).click();
    expect((await reportResponse).ok()).toBeTruthy();

    const report = page.getByRole('dialog', { name: 'Reportes del bot' });
    await expect(report).toBeVisible();
    await expect(report.getByRole('heading', { name: 'Reportes del Bot' })).toBeVisible();
    await expect(report.getByLabel('Período del reporte')).toBeVisible();
    await expect(report.getByText('Socios que pagaron por el bot')).toBeVisible();

    await report.getByRole('button', { name: 'Actividad', exact: true }).click();
    await expect(report.getByText('Mensajes de prioridad alta')).toBeVisible();
    await expect(report.getByText('Consultas atendidas')).toBeVisible();

    await report.getByRole('button', { name: 'Pagos', exact: true }).click();
    await expect(report.getByRole('heading', { name: 'Pagos gestionados por el bot' })).toBeVisible();

    await report.getByRole('button', { name: 'Costos WhatsApp', exact: true }).click();
    await expect(report.getByRole('heading', { name: 'Costos de recordatorios por WhatsApp' })).toBeVisible();
    await report.getByRole('button', { name: 'Cerrar reportes' }).click();

    await expect.poll(() => [...observed], { timeout: 15000 }).toEqual(
      expect.arrayContaining(tracked),
    );
    expect(botHttpErrors, `Errores HTTP del Panel Bot: ${botHttpErrors.join(', ')}`).toEqual([]);

    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page).toHaveURL(/\/panel(?:$|\?)/);
  });

  test('cambia Bot/Manual sobre el contacto real y restaura el modo original', async ({ page, request }) => {
    const snapshot = await getBotContact(request, WA_ID);
    expect(snapshot).toBeTruthy();

    try {
      await openBotTestChat(page, WA_ID);

      let responsePromise = page.waitForResponse((response) => endpointMatcher('panel_set_modo')(response.url()));
      await page.getByRole('button', { name: 'Modo Manual' }).click();
      expect((await responsePromise).ok()).toBeTruthy();
      await expect(page.getByText(/Manual activo|Conversación manual activa|Consulta pendiente/i).first()).toBeVisible();

      responsePromise = page.waitForResponse((response) => endpointMatcher('panel_set_modo')(response.url()));
      await page.getByRole('button', { name: 'Modo Bot' }).click();
      expect((await responsePromise).ok()).toBeTruthy();
    } finally {
      await restoreContact(request, snapshot);
    }
  });

  test('edita/restaura nombre y completa alta, asignación, edición y baja de etiquetas reales', async ({ page, request }) => {
    const snapshot = await getBotContact(request, WA_ID);
    expect(snapshot).toBeTruthy();
    await cleanupTestLabels(request);

    const suffix = String(Date.now()).slice(-6);
    const labelOne = `${TEST_LABEL_PREFIX} ${suffix}`;
    const labelTwo = `${TEST_LABEL_PREFIX} X${suffix}`;
    const temporaryName = `${TEST_LABEL_PREFIX} CONTACTO`;

    try {
      await openBotTestChat(page, WA_ID);

      let menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Editar nombre' }).click();
      let dialog = page.getByRole('dialog').filter({ hasText: 'Editar nombre' });
      await dialog.getByLabel('Nombre del contacto').fill(temporaryName);
      let responsePromise = page.waitForResponse((response) => endpointMatcher('editar_nombre')(response.url()));
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();
      await expect(page.locator('.wp-chat-top-name')).toHaveText(temporaryName);

      menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Cambiar etiqueta' }).click();
      dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar etiqueta' });
      await dialog.getByPlaceholder('Ej: Pagó / Urgente / Nuevo...').fill(labelOne);
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_create')(response.url()));
      await dialog.getByRole('button', { name: 'Agregar', exact: true }).click();
      const createdBody = await (await responsePromise).json();
      expect(Number(createdBody.id_etiqueta || 0)).toBeGreaterThan(0);

      const createdRow = dialog.locator('.bp-tag-row').filter({ hasText: labelOne });
      await expect(createdRow).toBeVisible();
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_set')(response.url()));
      await dialog.locator('.bp-tag-actions').getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();

      menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Cambiar etiqueta' }).click();
      dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar etiqueta' });
      const labelRow = dialog.locator('.bp-tag-row').filter({ hasText: labelOne });
      await labelRow.getByRole('button', { name: 'Editar', exact: true }).click();

      // Al entrar en edición el <b> con el nombre desaparece y la fila deja de
      // cumplir filter({ hasText: labelOne }). Tomamos el único editor activo,
      // que es estable mientras solo puede editarse una etiqueta a la vez.
      const editRow = dialog.locator('.bp-tag-edit-row');
      await expect(editRow).toBeVisible();
      await editRow.locator('input').fill(labelTwo);
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_update')(response.url()));
      await editRow.getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();
      await expect(dialog.locator('.bp-tag-row').filter({ hasText: labelTwo })).toBeVisible();

      await dialog.getByLabel('Etiqueta asignada').selectOption('');
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_set')(response.url()));
      await dialog.locator('.bp-tag-actions').getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();

      menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Cambiar etiqueta' }).click();
      dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar etiqueta' });
      const renamedRow = dialog.locator('.bp-tag-row').filter({ hasText: labelTwo });
      await renamedRow.getByRole('button', { name: 'Eliminar', exact: true }).click();
      const confirm = page.getByRole('dialog').filter({ hasText: 'Eliminar etiqueta' });
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_delete')(response.url()));
      await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();
    } finally {
      // Primero desasignar/restaurar el contacto; después eliminar etiquetas PW.
      // Así el cleanup también funciona cuando una aserción corta el flujo a mitad de prueba.
      await restoreContact(request, snapshot);
      await cleanupTestLabels(request).catch(() => undefined);
    }
  });

  test('recorre leído/no leído y prioridad de consulta sin alterar datos reales', async ({ page }) => {
    const state = await installSafeBotMock(page, {
      unread: 2,
      consultasPendientes: 1,
      prioridad: 'alta',
      mode: 'manual',
    });

    await openBotTestChat(page, WA_ID);
    const row = page.locator('.wp-chatitem').filter({ hasText: WA_ID }).first();
    await expect(row).toHaveClass(/wp-chatitem--consulta/);
    await expect(row).toContainText('CONSULTA');
    await expect(page.getByText('Consulta pendiente').first()).toBeVisible();

    // Al abrir un chat con unread > 0, el Panel actual lo marca como leído
    // automáticamente. Validamos primero ese comportamiento real.
    await expect.poll(
      () => state.requests.filter((item) => item.endpoint === 'panel_mark_seen').length,
    ).toBeGreaterThanOrEqual(1);

    // Ya leído, el menú debe ofrecer marcarlo como no leído.
    let menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Marcar como no leído' }).click();
    await expect.poll(() => hasRequest(state, 'panel_mark_unread')).toBeTruthy();

    // Y después de marcarlo como no leído debe permitir volver a leído
    // manualmente, generando una segunda llamada a panel_mark_seen.
    menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Marcar como leído' }).click();
    await expect.poll(
      () => state.requests.filter((item) => item.endpoint === 'panel_mark_seen').length,
    ).toBeGreaterThanOrEqual(2);
  });

  test('recorre composer, emojis, tipos de archivo, galería y envío image/PDF sin mandar WhatsApp real', async ({ page }) => {
    const state = await installSafeBotMock(page);
    await page.route('https://example.test/pw-e2e-bot.png', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+fWQAAAAASUVORK5CYII=', 'base64'),
      }),
    );

    await openBotTestChat(page, WA_ID);
    await expect(page.getByRole('button', { name: 'Adjuntar imagen/PDF' })).toBeEnabled();

    let menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Ver galería' }).click();
    const gallery = page.getByRole('dialog', { name: 'Galería del chat' });
    await expect(gallery).toBeVisible();
    await expect(gallery.locator('.wp-gal-count')).toHaveText('1');

    // En imágenes el nombre no se renderiza como texto visible de la tarjeta:
    // es el alt accesible de la miniatura. Validamos el elemento real y además
    // abrimos el visor para comprobar el recorrido completo de la galería.
    const galleryImage = gallery.getByRole('img', { name: 'pw-e2e-bot.png' });
    await expect(galleryImage).toBeVisible();
    await galleryImage.click();

    const mediaViewer = page.getByRole('dialog', { name: 'Visor de archivo' });
    await expect(mediaViewer).toBeVisible();
    await expect(mediaViewer).toContainText('pw-e2e-bot.png');
    await mediaViewer.getByRole('button', { name: 'Cerrar' }).click();

    await expect(gallery).toBeVisible();
    await gallery.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Emojis' }).click();
    const emojiPicker = page.getByRole('dialog', { name: 'Selector de emojis' });
    await emojiPicker.getByRole('button', { name: /Insertar emoji/i }).first().click();

    const composer = page.locator('textarea.wp-input');
    await composer.fill('PW E2E mensaje del Panel Bot');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_send',
      (item) => item.body?.wa_id === WA_ID && item.body?.texto === 'PW E2E mensaje del Panel Bot',
    )).toBeTruthy();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'no-valido.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('no valido'),
    });
    await expect(page.getByText(/Solo se permiten imágenes.*PDF/i)).toBeVisible();

    await fileInput.setInputFiles({
      name: 'demasiado-grande.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(12 * 1024 * 1024 + 1),
    });
    await expect(page.getByText(/Archivo demasiado grande/i)).toBeVisible();

    await fileInput.setInputFiles({
      name: 'pw-e2e-panel.png',
      mimeType: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
    });
    await expect(page.getByText('pw-e2e-panel.png')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect.poll(() => hasRequest(state, 'panel_send_media')).toBeTruthy();

    const mediaCount = () => state.requests.filter((item) => item.endpoint === 'panel_send_media').length;
    const beforePdf = mediaCount();
    await fileInput.setInputFiles({
      name: 'pw-e2e-panel.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% PW E2E\n'),
    });
    await expect(page.getByText('pw-e2e-panel.pdf')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect.poll(mediaCount).toBeGreaterThan(beforePdf);
  });

  test('fuera de 24 horas bloquea adjuntos y envía texto con la bandera de plantilla', async ({ page }) => {
    const state = await installSafeBotMock(page, {
      mode: 'manual',
      windowExpired: true,
    });
    await openBotTestChat(page, WA_ID);

    const windowStatus = page.getByLabel('Ventana 24 horas');
    await expect(windowStatus).toBeVisible();
    await expect(windowStatus).toHaveAttribute('title', /expirada/i);
    await expect(windowStatus).toHaveClass(/is-expired/);
    await expect(page.locator('.wp-window-expiredline')).toContainText(/Ventana de 24hs expirada/i);

    const attachButton = page.getByRole('button', { name: 'Adjuntar imagen/PDF' });
    await expect(attachButton).toBeDisabled();
    await expect(attachButton).toHaveAttribute('title', /solo se puede enviar plantilla de texto/i);
    await expect(page.getByText('Plantilla aprobada que se enviará')).toBeVisible();

    const composer = page.locator('textarea.wp-input');
    await composer.fill('Respuesta fuera de ventana');
    await page.getByRole('button', { name: 'Enviar plantilla' }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_send',
      (item) => item.body?.wa_id === WA_ID &&
        item.body?.texto === 'Respuesta fuera de ventana' &&
        item.body?.usar_plantilla_si_ventana_expirada === true,
    )).toBeTruthy();
  });

  test('confirma Vaciar chat y Eliminar contacto con mocks, sin borrar el número real', async ({ page }) => {
    const state = await installSafeBotMock(page);
    await openBotTestChat(page, WA_ID);

    let menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Vaciar chat' }).click();
    let confirm = page.getByRole('dialog').filter({ hasText: 'Vaciar chat' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Vaciar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'vaciar_chat',
      (item) => item.body?.wa_id === WA_ID,
    )).toBeTruthy();

    await openBotTestChat(page, WA_ID);
    menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Eliminar contacto' }).click();
    confirm = page.getByRole('dialog').filter({ hasText: 'Eliminar contacto' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'eliminar_contacto',
      (item) => item.body?.wa_id === WA_ID,
    )).toBeTruthy();
  });

  test('el botón global muestra badge normal/urgente y reproduce sonido cuando aumentan', async ({ page }) => {
    let notificationState = { total_normal: 2, total_urgent: 1 };
    const normalChatId = '5493492000001';
    const urgentChatId = '5493492000002';

    await page.addInitScript(() => {
      window.__pwBotAudioPlays = 0;
      Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value() {
          window.__pwBotAudioPlays += 1;
          return Promise.resolve();
        },
      });
    });

    await mockEndpoint(page, 'panel_chats', async () => ({
      success: true,
      chats: [
        {
          wa_id: normalChatId,
          unread: notificationState.total_normal,
          consultas_pendientes: 0,
          prioridad: 'normal',
          total: notificationState.total_normal,
          ultimo_mensaje: 'Mensaje normal de Playwright',
        },
        {
          wa_id: urgentChatId,
          unread: notificationState.total_urgent,
          consultas_pendientes: notificationState.total_urgent,
          prioridad: 'consulta',
          total: notificationState.total_urgent,
          ultimo_mensaje: 'Consulta pendiente de Playwright',
        },
      ],
    }));
    await mockEndpoint(page, 'panel_mensajes', async () => ({
      success: true,
      mensajes: [],
    }));

    await page.goto('/panel');
    await expect(page.locator('.pp-navBotBadge--normal')).toHaveText('2');
    await expect(page.locator('.pp-navBotBadge--urgent')).toHaveText('1');
    await expect(page.getByLabel('Notificaciones normales: 2')).toBeVisible();
    await expect(page.getByLabel('Notificaciones urgentes: 1')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__pwBotAudioPlays)).toBe(0);

    notificationState = { total_normal: 3, total_urgent: 2 };
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    await expect(page.locator('.pp-navBotBadge--normal')).toHaveText('3');
    await expect(page.locator('.pp-navBotBadge--urgent')).toHaveText('2');
    await expect(page.getByLabel('Notificaciones normales: 3')).toBeVisible();
    await expect(page.getByLabel('Notificaciones urgentes: 2')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__pwBotAudioPlays)).toBeGreaterThan(0);
  });
});
