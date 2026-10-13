import { medicamentosApi } from './medicamentosApi';
import { apiGet, apiPost } from '../../_shared/api/apiClient';

jest.mock('../../_shared/api/apiClient', () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

describe('Medicamentos: escrituras sin tabla auxiliar de solicitudes', () => {
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
    ['revisarLote', 'medicamentos_revisar_lote'],
    ['prestar', 'medicamentos_prestar'],
    ['devolver', 'medicamentos_devolver'],
    ['cerrar', 'medicamentos_cerrar'],
    ['sena', 'medicamentos_sena'],
  ])('%s conserva su accion y envia solamente el cuerpo original', async (name, action) => {
    const data = { campo: 'dato', cantidad: 5 };
    await medicamentosApi[name](data);
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost).toHaveBeenCalledWith(action, data);
    expect(data).toEqual({ campo: 'dato', cantidad: 5 });
    expect(data).not.toHaveProperty('_idempotency_key');
    expect(apiGet).not.toHaveBeenCalled();
  });
});
