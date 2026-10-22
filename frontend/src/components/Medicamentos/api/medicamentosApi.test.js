import { medicamentosApi, VENTANA_REINTENTO_MS } from './medicamentosApi';
import { apiGet, apiPost } from '../../_shared/api/apiClient';

jest.mock('../../_shared/api/apiClient', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

describe('Medicamentos: protección de escrituras ante reintentos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPost.mockResolvedValue({ exito: true });
  });

  test.each([
    ['guardar', 'medicamentos_guardar'],
    ['cambiarEstado', 'medicamentos_cambiar_estado'],
    ['ingresar', 'medicamentos_ingresar'],
    ['salida', 'medicamentos_salida'],
    ['anular', 'medicamentos_anular'],
    ['prestar', 'medicamentos_prestar'],
    ['devolver', 'medicamentos_devolver'],
    ['cerrar', 'medicamentos_cerrar'],
    ['sena', 'medicamentos_sena'],
  ])('%s usa una clave nueva válida en cada operación confirmada', async (nombre, accion) => {
    const data = { campo: 'dato', cantidad: 5 };
    await medicamentosApi[nombre](data);
    const [accionEnviada, cuerpo] = apiPost.mock.calls[0];
    expect(accionEnviada).toBe(accion);
    expect(cuerpo).toEqual({ ...data, _idempotency_key: expect.stringMatching(/^med-[a-zA-Z0-9-]{20,100}$/) });
    expect(data).not.toHaveProperty('_idempotency_key');
    await medicamentosApi[nombre](data);
    expect(apiPost.mock.calls[1][1]._idempotency_key).not.toBe(cuerpo._idempotency_key);
  });

  test('si se pierde la respuesta, conserva la misma clave al reintentar', async () => {
    apiPost.mockRejectedValueOnce(new Error('Se perdió la conexión')).mockResolvedValueOnce({ exito: true });
    await expect(medicamentosApi.prestar({ id_socio: 10, sena: '500.00' })).rejects.toThrow('Se perdió la conexión');
    await medicamentosApi.prestar({ id_socio: 10, sena: '500.00' });
    expect(apiPost.mock.calls[0][1]._idempotency_key).toBe(apiPost.mock.calls[1][1]._idempotency_key);
    await medicamentosApi.prestar({ id_socio: 10, sena: '500.00' });
    expect(apiPost.mock.calls[2][1]._idempotency_key).not.toBe(apiPost.mock.calls[1][1]._idempotency_key);
  });

  test('pasada la ventana de reintento, una operación idéntica usa una clave nueva', async () => {
    const ahora = jest.spyOn(Date, 'now');
    try {
      ahora.mockReturnValue(1_000_000);
      apiPost.mockRejectedValueOnce(new Error('Se perdió la conexión')).mockResolvedValue({ exito: true });
      await expect(medicamentosApi.salida({ id_medicamento: 7, cantidad: 1 })).rejects.toThrow();
      ahora.mockReturnValue(1_000_000 + VENTANA_REINTENTO_MS + 1);
      await medicamentosApi.salida({ id_medicamento: 7, cantidad: 1 });
      expect(apiPost.mock.calls[1][1]._idempotency_key).not.toBe(apiPost.mock.calls[0][1]._idempotency_key);
    } finally {
      ahora.mockRestore();
    }
  });

  test('si cambian los datos, la clave cambia también', async () => {
    apiPost.mockRejectedValueOnce(new Error('Error de red')).mockResolvedValueOnce({ exito: true });
    await expect(medicamentosApi.ingresar({ cantidad: 1 })).rejects.toThrow();
    await medicamentosApi.ingresar({ cantidad: 2 });
    expect(apiPost.mock.calls[0][1]._idempotency_key).not.toBe(apiPost.mock.calls[1][1]._idempotency_key);
  });

  test('respeta las claves explícitas de los formularios de Stock', async () => {
    const data = { cantidad: 1, _idempotency_key: 'med-11111111-2222-3333-4444-555555555555' };
    await medicamentosApi.salida(data);
    expect(apiPost).toHaveBeenCalledWith('medicamentos_salida', data);
  });

  test('descartar alertas mantiene su API y los GET no escriben', async () => {
    await medicamentosApi.descartarAlerta({ tipo: 'PRESTAMO', id_referencia: 10 });
    expect(apiPost).toHaveBeenCalledWith('medicamentos_descartar_alerta', { tipo: 'PRESTAMO', id_referencia: 10 });
    await medicamentosApi.alertas({ tipo: 'PRESTAMO' });
    expect(apiGet).toHaveBeenCalledWith('medicamentos_alertas', { tipo: 'PRESTAMO' });
  });
});
