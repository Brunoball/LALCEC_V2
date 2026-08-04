<?php
declare(strict_types=1);

function configuracion_listas_definiciones(): array
{
    return [
        'medios_pago' => [
            'lista' => 'medios_pago',
            'tabla' => 'medios_pago',
            'id_campo' => 'id_medio_pago',
            'etiqueta' => 'medio de pago',
            'max_nombre' => 100,
            'entidad' => 'MEDIO_PAGO',
        ],
        'condiciones_iva' => [
            'lista' => 'condiciones_iva',
            'tabla' => 'condiciones_iva',
            'id_campo' => 'id_condicion_iva',
            'etiqueta' => 'condición frente al IVA',
            'max_nombre' => 100,
            'entidad' => 'CONDICION_IVA',
        ],
    ];
}

function configuracion_lista_definicion(mixed $value): array
{
    $key = strtolower(trim((string)$value));
    $definitions = configuracion_listas_definiciones();
    if (!isset($definitions[$key])) {
        api_error('La lista solicitada no es válida.', 'LISTA_CONFIGURACION_INVALIDA');
    }
    return $definitions[$key];
}

function configuracion_item(PDO $db, array $definition, int $id, bool $lock = false): ?array
{
    $table = $definition['tabla'];
    $idField = $definition['id_campo'];
    $suffix = $lock ? ' FOR UPDATE' : '';

    $statement = $db->prepare(
        "SELECT {$idField}, nombre, activo, creado_en, actualizado_en
         FROM {$table}
         WHERE {$idField} = ?{$suffix}"
    );
    $statement->execute([$id]);
    $row = $statement->fetch();
    if (!$row) return null;

    $row[$idField] = (int)$row[$idField];
    $row['activo'] = (bool)$row['activo'];
    $row['cantidad_usos'] = configuracion_cantidad_usos($db, $definition, $id);
    return $row;
}

function configuracion_cantidad_usos(PDO $db, array $definition, int $id): int
{
    if ($definition['lista'] === 'medios_pago') {
        $statement = $db->prepare(
            'SELECT
                (SELECT COUNT(*) FROM socios WHERE id_medio_pago = ?)
                + (SELECT COUNT(*) FROM pagos WHERE id_medio_pago = ?)'
        );
        $statement->execute([$id, $id]);
        return (int)$statement->fetchColumn();
    }

    if ($definition['lista'] === 'condiciones_iva') {
        $statement = $db->prepare(
            'SELECT COUNT(*) FROM socios_empresas WHERE id_condicion_iva = ?'
        );
        $statement->execute([$id]);
        return (int)$statement->fetchColumn();
    }

    return 0;
}
