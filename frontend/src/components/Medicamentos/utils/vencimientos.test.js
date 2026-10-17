import { diasRestantes, tonoVencimiento } from './vencimientos';

describe('Medicamentos: semáforo de vencimientos, por día calendario', () => {
  const hoy = '2026-10-17';
  test.each([
    [null, 'neutral'],
    ['', 'neutral'],
    ['2026-10-16', 'danger'],
    ['2026-10-17', 'warning'],
    ['2026-10-18', 'warning'],
    ['2026-11-16', 'warning'],
    ['2026-11-17', 'safe'],
  ])('%s -> %s', (fecha, expected) => {
    expect(tonoVencimiento(fecha, hoy)).toBe(expected);
  });
  test('calcula días atravesando un cambio de mes y el 29/02', () => {
    expect(diasRestantes('2028-03-01', '2028-02-28')).toBe(2);
    expect(diasRestantes('2026-10-16', hoy)).toBe(-1);
    expect(diasRestantes(null, hoy)).toBeNull();
  });
});
