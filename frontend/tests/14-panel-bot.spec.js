const { test, expect } = require('./fixtures/auth.fixture');
const {
  botApiCall,
  botApiResult,
  botApiUrl,
  botTestWaId,
  endpointMatcher,
  getBotContact,
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
  if (originalName) {
    await botApiCall(request, 'management', 'editar_nombre', {
      method: 'POST',
      data: { wa_id: WA_ID, nombre: originalName },
    }).catch(() => undefined);
  }

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

  if (Number(snapshot?.unread || 0) > 0) {
    await botApiCall(request, 'panel', 'panel_mark_unread', {
      params: { wa_id: WA_ID },
    }).catch(() => undefined);
  } else {
    await botApiCall(request, 'panel', 'panel_mark_seen', {
      params: { wa_id: WA_ID },
    }).catch(() => undefined);
  }
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

async function installSafeBotMock(page, { withEvents = false } = {}) {
  const state = {
    mode: 'manual',
    name: 'PW BOT TEST',
    unread: 0,
    labelId: null,
    requests: [],
  };

  const remember = (endpoint, request, body = undefined) => {
    state.requests.push({ endpoint, method: request.method(), body });
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
          ventana_24h: new Date().toISOString(),
          ultima_ts: Date.now(),
          ultimo_mensaje: 'Mensaje controlado de Playwright',
          total: 2,
          unread: state.unread,
          modo: state.mode,
          prioridad: 'normal',
          consultas_pendientes: 0,
          comprobantes_pendientes: 0,
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
          prioridad: 'normal',
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

  await mockEndpoint(page, 'panel_eventos', async (request) => {
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      remember('panel_eventos', request, body);
      return { success: true };
    }
    remember('panel_eventos', request);
    return {
      success: true,
      eventos: withEvents
        ? [
            {
              id_evento: 7001,
              tipo: 'warning',
              estado: 'pendiente',
              titulo: 'PW E2E alerta controlada',
              detalle: 'Evento sintético: no modifica el backend real.',
              wa_id: WA_ID,
              creado_en: new Date().toISOString(),
              modulo: 'testing',
              contexto: {},
            },
            {
              id_evento: 7002,
              tipo: 'warning',
              estado: 'pendiente',
              titulo: 'PW E2E comprobante controlado',
              wa_id: WA_ID,
              creado_en: new Date().toISOString(),
              modulo: 'ventas_comprobante',
              contexto: {
                id_comprobante: 8801,
                nombre: 'PW E2E',
                dni: '00000000',
                monto: 2000,
                cantidad: 2,
                precio_unitario: 1000,
                campania: 'PW TEST',
                producto: 'ENTRADA TEST',
              },
            },
          ]
        : [],
      resumen: {
        pendientes: withEvents ? 2 : 0,
        errores_pendientes: 0,
        warnings_pendientes: withEvents ? 2 : 0,
        total_ultimos_7_dias: withEvents ? 2 : 0,
      },
    };
  });

  await mockEndpoint(page, 'panel_ventas_comprobante_transferencia', async (request) => {
    const body = request.postDataJSON();
    remember('panel_ventas_comprobante_transferencia', request, body);
    if (body.accion === 'detalle_comprobante') {
      return {
        success: true,
        id_comprobante: 8801,
        campania_nombre: 'PW TEST',
        producto_nombre: 'ENTRADA TEST',
        nombre_apellido: 'PW E2E',
        dni: '00000000',
        precio_unitario: 1000,
        monto_detectado: 2000,
        cantidad_sugerida: 2,
      };
    }
    return { success: true };
  });

  return state;
}

function hasRequest(state, endpoint, predicate = () => true) {
  return state.requests.some(
    (item) => item.endpoint === endpoint && predicate(item),
  );
}

test.describe('Panel Bot WhatsApp', () => {
  test.describe.configure({ mode: 'serial' });

  test('Hostinger expone health y los endpoints delicados del panel sin ejecutar mutaciones reales', async ({ request }) => {
    const health = await botApiCall(request, 'panel', 'panel_health');
    expect(health.success).toBe(true);

    const harmlessChecks = [
      ['panel', 'panel_send', { wa_id: '', texto: '' }],
      ['panel', 'panel_ventas_comprobante_transferencia', {
        accion: 'detalle_comprobante',
        id_comprobante: 0,
        id_evento: 0,
      }],
      ['management', 'vaciar_chat', { wa_id: 'PW_E2E_INVALID' }],
      ['management', 'eliminar_contacto', { wa_id: 'PW_E2E_INVALID' }],
    ];

    for (const [section, endpoint, data] of harmlessChecks) {
      const result = await botApiResult(request, section, endpoint, {
        method: 'POST',
        data,
      });
      expect(result.status, `${endpoint} no debe responder 404.`).not.toBe(404);
      expect(result.body).toBeTruthy();
      expect(result.body.success, `${endpoint} debía rechazar el payload de prueba.`).toBe(false);
    }

    const mediaProbe = await request.get(botApiUrl('panel', 'panel_send_media'), {
      failOnStatusCode: false,
      headers: { Accept: 'application/json' },
    });
    expect(mediaProbe.status(), 'panel_send_media no debe responder 404.').not.toBe(404);
    expect(String(mediaProbe.headers()['content-type'] || '')).toContain('application/json');
  });

  test('carga el backend de Hostinger, encuentra el número de prueba y recorre lectura, búsqueda, filtros y hashes', async ({ page, request }) => {
    const contact = await getBotContact(request, WA_ID);
    expect(contact, `No existe ${WA_ID} en panel_chats del backend del bot.`).toBeTruthy();

    const observed = new Set();
    const botHttpErrors = [];
    page.on('response', (response) => {
      for (const endpoint of [
        'panel_chats',
        'panel_mensajes',
        'panel_mark_seen',
        'panel_hash',
        'panel_global_hash',
        'panel_eventos',
        'etiquetas_list',
      ]) {
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
    await expect(page.locator('.wp-messages')).toContainText('Mensajes');

    const filterButton = page.getByRole('button', { name: /Filtrar por etiqueta/i });
    await filterButton.click();
    const filterMenu = page.getByRole('menu', { name: 'Filtrar chats por etiqueta' });
    await expect(filterMenu).toBeVisible();
    await filterMenu.getByRole('button', { name: /Todas/i }).click();

    const oldTheme = await page.locator('html').getAttribute('data-botpanel-theme');
    await page.getByRole('button', { name: 'Cambiar tema' }).click();
    await expect.poll(() => page.locator('html').getAttribute('data-botpanel-theme')).not.toBe(oldTheme);

    await expect.poll(() => [...observed], { timeout: 15000 }).toEqual(
      expect.arrayContaining([
        'panel_chats',
        'panel_mensajes',
        'panel_mark_seen',
        'panel_hash',
        'panel_global_hash',
        'panel_eventos',
        'etiquetas_list',
      ]),
    );
    expect(botHttpErrors, `Errores HTTP del Panel Bot: ${botHttpErrors.join(', ')}`).toEqual([]);

    const alertsResponse = page.waitForResponse((response) => endpointMatcher('panel_eventos')(response.url()));
    await page.getByRole('button', { name: 'Ver alertas y errores del bot' }).click();
    await alertsResponse;
    const alerts = page.getByRole('dialog').filter({ hasText: 'Alertas del bot' });
    await expect(alerts).toBeVisible();
    await alerts.getByRole('button', { name: 'Actualizar' }).click();
    await alerts.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page).toHaveURL(/\/panel(?:$|\?)/);
  });

  test('cambia modo Bot/Manual y estado leído/no leído sobre el contacto real, restaurando el estado al terminar', async ({ page, request }) => {
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

      let menu = await openChatOptions(page);
      const markUnread = menu.getByRole('button', { name: 'Marcar como no leído' });
      await expect(markUnread).toBeVisible();
      responsePromise = page.waitForResponse((response) => endpointMatcher('panel_mark_unread')(response.url()));
      await markUnread.click();
      expect((await responsePromise).ok()).toBeTruthy();

      await expect.poll(async () => {
        const current = await getBotContact(request, WA_ID);
        return Number(current?.unread || 0);
      }).toBeGreaterThan(0);

      menu = await openChatOptions(page);
      const markRead = menu.getByRole('button', { name: 'Marcar como leído' });
      await expect(markRead).toBeVisible();
      responsePromise = page.waitForResponse((response) => endpointMatcher('panel_mark_seen')(response.url()));
      await markRead.click();
      expect((await responsePromise).ok()).toBeTruthy();
    } finally {
      await restoreContact(request, snapshot);
    }
  });

  test('edita y restaura el nombre y completa el ciclo real de etiquetas sobre el número de prueba', async ({ page, request }) => {
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
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Nombre del contacto').fill(temporaryName);
      let responsePromise = page.waitForResponse((response) => endpointMatcher('editar_nombre')(response.url()));
      await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();
      await expect(page.locator('.wp-chat-top-name')).toHaveText(temporaryName);

      menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Cambiar etiqueta' }).click();
      dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar etiqueta' });
      await expect(dialog).toBeVisible();

      await dialog.getByPlaceholder('Ej: Pagó / Urgente / Nuevo...').fill(labelOne);
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_create')(response.url()));
      await dialog.getByRole('button', { name: 'Agregar', exact: true }).click();
      const createdResponse = await responsePromise;
      expect(createdResponse.ok()).toBeTruthy();
      const createdBody = await createdResponse.json();
      const createdId = Number(createdBody.id_etiqueta || 0);
      expect(createdId).toBeGreaterThan(0);

      await expect(dialog.locator('.bp-tag-row').filter({ hasText: labelOne })).toBeVisible();
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_set')(response.url()));
      await dialog.locator('.bp-tag-actions').getByRole('button', { name: 'Guardar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();

      menu = await openChatOptions(page);
      await menu.getByRole('button', { name: 'Cambiar etiqueta' }).click();
      dialog = page.getByRole('dialog').filter({ hasText: 'Cambiar etiqueta' });
      const labelRow = dialog.locator('.bp-tag-row').filter({ hasText: labelOne });
      await expect(labelRow).toBeVisible();
      await labelRow.getByRole('button', { name: 'Editar', exact: true }).click();
      const editInput = labelRow.locator('input');
      await editInput.fill(labelTwo);
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_update')(response.url()));
      await labelRow.getByRole('button', { name: 'Guardar', exact: true }).click();
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
      await expect(confirm).toBeVisible();
      responsePromise = page.waitForResponse((response) => endpointMatcher('etiquetas_delete')(response.url()));
      await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();
      expect((await responsePromise).ok()).toBeTruthy();
      await expect(dialog.locator('.bp-tag-row').filter({ hasText: labelTwo })).toHaveCount(0);
    } finally {
      await cleanupTestLabels(request).catch(() => undefined);
      await restoreContact(request, snapshot);
    }
  });

  test('recorre composer, emojis, galería y confirma Vaciar chat/Eliminar contacto sin borrar datos reales', async ({ page }) => {
    const state = await installSafeBotMock(page);
    await page.route('https://example.test/pw-e2e-bot.png', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgo=', 'base64') }),
    );

    await openBotTestChat(page, WA_ID);
    await expect(page.getByRole('button', { name: 'Adjuntar imagen/PDF' })).toBeEnabled();

    let menu = await openChatOptions(page);
    await menu.getByRole('button', { name: 'Ver galería' }).click();
    const gallery = page.getByRole('dialog', { name: 'Galería del chat' });
    await expect(gallery).toBeVisible();
    await expect(gallery).toContainText('pw-e2e-bot.png');
    await gallery.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Emojis' }).click();
    const emojiPicker = page.getByRole('dialog', { name: 'Selector de emojis' });
    await expect(emojiPicker).toBeVisible();
    await emojiPicker.getByRole('button', { name: /Insertar emoji/i }).first().click();

    const composer = page.locator('textarea.wp-input');
    await composer.fill('PW E2E mensaje del Panel Bot');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_send',
      (item) => item.body?.wa_id === WA_ID && item.body?.texto === 'PW E2E mensaje del Panel Bot',
    )).toBeTruthy();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'pw-e2e-panel.png',
      mimeType: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
    });
    await expect(page.getByText('pw-e2e-panel.png')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect.poll(() => hasRequest(state, 'panel_send_media')).toBeTruthy();

    menu = await openChatOptions(page);
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

  test('recorre Alertas, Marcar revisado, Eliminar alerta y aprobar/rechazar comprobantes sin ejecutar acciones reales', async ({ page }) => {
    const state = await installSafeBotMock(page, { withEvents: true });
    await openBotTestChat(page, WA_ID);

    await page.getByRole('button', { name: 'Ver alertas y errores del bot' }).click();
    const alerts = page.getByRole('dialog').filter({ hasText: 'Alertas del bot' });
    await expect(alerts).toBeVisible();
    await expect(alerts).toContainText('PW E2E alerta controlada');
    await expect(alerts).toContainText('PW E2E comprobante controlado');

    await alerts.getByRole('button', { name: 'Marcar revisado', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_eventos',
      (item) => item.body?.accion === 'marcar_revisado' && Number(item.body?.id_evento) === 7001,
    )).toBeTruthy();

    await alerts.getByRole('button', { name: 'Eliminar', exact: true }).first().click();
    let confirm = page.getByRole('dialog').filter({ hasText: 'Eliminar alerta' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Eliminar alerta', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_eventos',
      (item) => item.body?.accion === 'eliminar_alerta',
    )).toBeTruthy();

    await alerts.getByRole('button', { name: 'Aprobar comprobante', exact: true }).click();
    let review = page.getByRole('dialog').filter({ hasText: 'Aprobar comprobante' });
    await expect(review).toBeVisible();
    await expect(review).toContainText('PW TEST');
    await review.getByRole('button', { name: 'Sí, aprobar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_ventas_comprobante_transferencia',
      (item) => item.body?.accion === 'aprobar_comprobante',
    )).toBeTruthy();

    await alerts.getByRole('button', { name: 'Rechazar', exact: true }).click();
    review = page.getByRole('dialog').filter({ hasText: 'Rechazar comprobante' });
    await expect(review).toBeVisible();
    await review.getByPlaceholder(/El importe no coincide/i).fill('PW E2E rechazo controlado');
    await review.getByRole('button', { name: 'Sí, rechazar', exact: true }).click();
    await expect.poll(() => hasRequest(
      state,
      'panel_ventas_comprobante_transferencia',
      (item) => item.body?.accion === 'rechazar_comprobante' && item.body?.motivo === 'PW E2E rechazo controlado',
    )).toBeTruthy();

    await alerts.getByRole('button', { name: `Abrir chat ${WA_ID}`, exact: true }).first().click();
    await expect(page.locator('.wp-chat-top-id')).toHaveText(WA_ID);
  });
});
