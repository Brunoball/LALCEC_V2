<?php
declare(strict_types=1);

trait DescuentosFamiliaresGestion
{
    private static function listarDescuentosDatos(PDO $db): array
    {
        $items = $db->query(
            'SELECT id_descuento_familiar, cantidad_integrantes, porcentaje_descuento, created_at, updated_at
             FROM descuentos_familiares ORDER BY cantidad_integrantes ASC'
        )->fetchAll();
        foreach ($items as &$item) $item = self::castDescuento($item);
        unset($item);
        return $items;
    }

    private static function guardarDescuentoDatos(array $auth, array $body): array
    {
        $db = $auth['db'];
        $id = isset($body['id_descuento_familiar']) && $body['id_descuento_familiar'] !== ''
            ? positive_id($body['id_descuento_familiar'], 'descuento familiar')
            : null;
        $quantity = filter_var($body['cantidad_integrantes'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 2, 'max_range' => 50]]);
        if ($quantity === false) api_error('La cantidad de integrantes debe estar entre 2 y 50.', 'VALIDATION_ERROR');
        $percentage = decimal_amount($body['porcentaje_descuento'] ?? null, 'porcentaje de descuento', 0.01, 100);

        try {
            $saved = transaction($db, static function () use ($db, $auth, $id, $quantity, $percentage): array {
                $duplicate = $db->prepare(
                    'SELECT id_descuento_familiar FROM descuentos_familiares
                     WHERE cantidad_integrantes = ? AND id_descuento_familiar <> ? LIMIT 1'
                );
                $duplicate->execute([(int)$quantity, $id ?? 0]);
                if ($duplicate->fetch()) api_error('Ya existe una regla para esa cantidad de integrantes.', 'DESCUENTO_FAMILIAR_DUPLICADO');

                if ($id === null) {
                    $db->prepare(
                        'INSERT INTO descuentos_familiares (cantidad_integrantes, porcentaje_descuento) VALUES (?, ?)'
                    )->execute([(int)$quantity, $percentage]);
                    $discountId = (int)$db->lastInsertId();
                    $before = null;
                    $action = 'CREAR_DESCUENTO_FAMILIAR';
                } else {
                    $lock = $db->prepare('SELECT * FROM descuentos_familiares WHERE id_descuento_familiar = ? FOR UPDATE');
                    $lock->execute([$id]);
                    $before = $lock->fetch();
                    if (!$before) api_error('El descuento familiar no existe.', 'DESCUENTO_FAMILIAR_NO_ENCONTRADO', 404);
                    $discountId = $id;
                    $action = 'MODIFICAR_DESCUENTO_FAMILIAR';
                    $db->prepare(
                        'UPDATE descuentos_familiares SET cantidad_integrantes = ?, porcentaje_descuento = ? WHERE id_descuento_familiar = ?'
                    )->execute([(int)$quantity, $percentage, $discountId]);
                }

                $statement = $db->prepare(
                    'SELECT id_descuento_familiar, cantidad_integrantes, porcentaje_descuento, created_at, updated_at
                     FROM descuentos_familiares WHERE id_descuento_familiar = ?'
                );
                $statement->execute([$discountId]);
                $after = self::castDescuento($statement->fetch() ?: []);
                audit_change($db, $auth, 'CATEGORIAS', $action, 'descuentos_familiares', $discountId, 'Se guardó una regla de descuento familiar.', $before, $after);
                return $after;
            });
        } catch (Throwable $error) {
            if (duplicate_key($error)) api_error('Ya existe una regla para esa cantidad de integrantes.', 'DESCUENTO_FAMILIAR_DUPLICADO');
            throw $error;
        }
        return ['item' => $saved, 'creado' => $id === null];
    }

    private static function eliminarDescuentoDatos(array $auth, int $id): void
    {
        $db = $auth['db'];
        transaction($db, static function () use ($db, $auth, $id): void {
            $statement = $db->prepare('SELECT * FROM descuentos_familiares WHERE id_descuento_familiar = ? FOR UPDATE');
            $statement->execute([$id]);
            $before = $statement->fetch();
            if (!$before) api_error('El descuento familiar no existe.', 'DESCUENTO_FAMILIAR_NO_ENCONTRADO', 404);
            $db->prepare('DELETE FROM descuentos_familiares WHERE id_descuento_familiar = ?')->execute([$id]);
            audit_change($db, $auth, 'CATEGORIAS', 'ELIMINAR_DESCUENTO_FAMILIAR', 'descuentos_familiares', $id, 'Se eliminó una regla de descuento familiar.', $before, null);
        });
    }

    private static function castDescuento(array $item): array
    {
        if ($item === []) return [];
        $item['id_descuento_familiar'] = (int)$item['id_descuento_familiar'];
        $item['cantidad_integrantes'] = (int)$item['cantidad_integrantes'];
        $item['porcentaje_descuento'] = (string)$item['porcentaje_descuento'];
        return $item;
    }
}
